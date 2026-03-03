#!/usr/bin/env python3
"""Build frontend/public/data/latest.json from relay db-sync.

Runs on opsbox. Connects to relay postgres via docker exec on the relay.
Design goal: community utility, transparent evidence for MPO grouping.
"""

import json
import os
import re
import subprocess
import sys
from dataclasses import dataclass
from datetime import datetime, timezone
from typing import Dict, List, Set, Tuple
import csv
import io


REPO_ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..'))
OUT_PATH = os.path.join(REPO_ROOT, 'frontend', 'public', 'data', 'latest.json')


def sh(cmd: List[str], *, check=True) -> str:
    p = subprocess.run(cmd, stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True)
    if check and p.returncode != 0:
        raise RuntimeError(f"Command failed ({p.returncode}): {' '.join(cmd)}\n{p.stderr}")
    return p.stdout


def psql(query: str) -> str:
    """Run a SQL query against relay db-sync postgres via docker exec.

    We avoid shell-quoting issues by sending the query on stdin to psql.
    """
    cmd = [
        'ssh', 'relay',
        'docker', 'exec', '-i', 'dbsync-mainnet-postgres',
        'psql', '-U', 'postgres', '-d', 'cexplorer',
        '-v', 'ON_ERROR_STOP=1',
        '-qAt',
    ]
    p = subprocess.run(cmd, input=query + "\n", stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True)
    if p.returncode != 0:
        raise RuntimeError(f"psql failed ({p.returncode}): {p.stderr}")
    return p.stdout


def psql_csv(select_sql: str) -> List[List[str]]:
    """Run a SELECT and return parsed CSV rows.

    This is safer than splitting on | because pool names/fields can contain that character.
    """
    sql = ' '.join(select_sql.strip().rstrip(';').split())
    copy_cmd = f"\\copy ({sql}) TO STDOUT WITH (FORMAT csv)"
    out = psql(copy_cmd)
    f = io.StringIO(out)
    return list(csv.reader(f))


class UnionFind:
    def __init__(self, items: List[str]):
        self.parent = {x: x for x in items}
        self.rank = {x: 0 for x in items}

    def find(self, x: str) -> str:
        p = self.parent.get(x, x)
        if p != x:
            self.parent[x] = self.find(p)
        return self.parent.get(x, x)

    def union(self, a: str, b: str):
        ra, rb = self.find(a), self.find(b)
        if ra == rb:
            return
        if self.rank[ra] < self.rank[rb]:
            ra, rb = rb, ra
        self.parent[rb] = ra
        if self.rank[ra] == self.rank[rb]:
            self.rank[ra] += 1

    def groups(self) -> Dict[str, List[str]]:
        out: Dict[str, List[str]] = {}
        for x in list(self.parent.keys()):
            r = self.find(x)
            out.setdefault(r, []).append(x)
        return out


def extract_base_domain(host: str) -> str:
    host = (host or '').strip().lower().rstrip('.')
    if not host:
        return ''
    # drop srv prefix like _pool._tcp.example.com
    host = re.sub(r'^_[^\.]+\._(tcp|udp)\.', '', host)
    parts = host.split('.')
    if len(parts) < 2:
        return host
    return '.'.join(parts[-2:])


GENERIC_DDNS = {
    'duckdns.org', 'ddns.net', 'dynv6.net', 'noip.me', 'no-ip.org', 'hopto.org',
    'myddns.me', 'freeddns.org', 'zapto.org',
}


@dataclass
class Evidence:
    type: str
    value: str


def main() -> int:
    now = datetime.now(timezone.utc).isoformat(timespec='seconds')

    # Current epoch
    epoch_no = int(psql("select max(no) from epoch;").strip() or '0')

    # Latest pool update per pool (active as of current epoch)
    # NOTE: We pick the most recent pool_update with active_epoch_no <= current epoch.
    # Also: off_chain_pool_data can have multiple rows per pool_id; pick latest id.
    pool_rows = psql_csv(f"""
with latest as (
  select distinct on (pu.hash_id)
    pu.hash_id,
    pu.id as pool_update_id,
    pu.active_epoch_no,
    pu.pledge,
    pu.margin,
    pu.fixed_cost,
    pu.reward_addr_id,
    pu.meta_id
  from pool_update pu
  where pu.active_epoch_no <= {epoch_no}
  order by pu.hash_id, pu.active_epoch_no desc, pu.id desc
),
latest_offchain as (
  select distinct on (opd.pool_id)
    opd.pool_id,
    opd.ticker_name,
    opd.json
  from off_chain_pool_data opd
  order by opd.pool_id, opd.id desc
)
select
  ph.id as pool_hash_id,
  ph.view as pool_id_bech32,
  coalesce(opd.ticker_name, '') as ticker,
  coalesce(opd.json->>'name', '') as name,
  coalesce(opd.json->>'homepage', '') as homepage,
  coalesce(opd.json->>'description', '') as description,
  coalesce(es.amount, 0) as active_stake_lovelace,
  l.pledge,
  l.margin,
  l.fixed_cost,
  l.reward_addr_id,
  l.pool_update_id,
  coalesce(pmr.url, '') as metadata_url,
  encode(pmr.hash, 'hex') as metadata_hash
from pool_hash ph
join latest l on l.hash_id = ph.id
left join (
  select pool_id, sum(amount) as amount
  from epoch_stake
  where epoch_no = {epoch_no}
  group by pool_id
) es on es.pool_id = ph.id
left join latest_offchain opd on opd.pool_id = ph.id
left join pool_metadata_ref pmr on pmr.id = l.meta_id
""")

    pools: List[dict] = []
    pool_ids: List[str] = []
    pool_by_hash: Dict[int, dict] = {}

    for cols in pool_rows:
        if len(cols) < 14:
            continue
        pool_hash_id = int(cols[0])
        pool_id_bech32 = cols[1]
        pool = {
            'pool_hash_id': pool_hash_id,
            'pool_id_bech32': pool_id_bech32,
            'ticker': cols[2] or None,
            'name': cols[3] or None,
            'homepage': cols[4] or None,
            'description': cols[5] or None,
            'active_stake_lovelace': int(cols[6] or '0'),
            'pledge_lovelace': int(cols[7] or '0'),
            'margin': float(cols[8] or '0'),
            'fixed_cost_lovelace': int(cols[9] or '0'),
            'reward_addr_id': int(cols[10] or '0'),
            'pool_update_id': int(cols[11] or '0'),
            'metadata_url': cols[12] or None,
            'metadata_hash_hex': cols[13] or None,
            'mpo': None,
        }
        pools.append(pool)
        pool_ids.append(pool_id_bech32)
        pool_by_hash[pool_hash_id] = pool

    # Owners (high confidence) — only from the latest active pool_update per pool
    owner_rows = psql(f"""
with latest as (
  select distinct on (pu.hash_id)
    pu.hash_id,
    pu.id as pool_update_id,
    pu.active_epoch_no
  from pool_update pu
  where pu.active_epoch_no <= {epoch_no}
  order by pu.hash_id, pu.active_epoch_no desc, pu.id desc
)
select l.hash_id as pool_hash_id, po.addr_id
from latest l
join pool_owner po on po.pool_update_id = l.pool_update_id;
""")

    owners_by_pool: Dict[int, Set[int]] = {}
    pools_by_owner: Dict[int, List[int]] = {}
    for line in owner_rows.splitlines():
        if not line:
            continue
        phid_s, addrid_s = line.split('|')
        phid, addrid = int(phid_s), int(addrid_s)
        owners_by_pool.setdefault(phid, set()).add(addrid)
        pools_by_owner.setdefault(addrid, []).append(phid)

    # Relays (supporting evidence) — only from the latest active pool_update per pool
    relay_rows = psql(f"""
with latest as (
  select distinct on (pu.hash_id)
    pu.hash_id,
    pu.id as pool_update_id,
    pu.active_epoch_no
  from pool_update pu
  where pu.active_epoch_no <= {epoch_no}
  order by pu.hash_id, pu.active_epoch_no desc, pu.id desc
)
select l.hash_id as pool_hash_id, pr.ipv4, pr.ipv6, pr.dns_name, pr.dns_srv_name
from latest l
join pool_relay pr on pr.update_id = l.pool_update_id;
""")

    relays_by_pool: Dict[int, List[Tuple[str,str,str,str]]] = {}
    pools_by_ipv4: Dict[str, List[int]] = {}
    pools_by_domain: Dict[str, List[int]] = {}

    for line in relay_rows.splitlines():
        cols = line.split('|')
        if len(cols) < 5:
            continue
        phid = int(cols[0])
        ipv4, ipv6, dns, srv = cols[1], cols[2], cols[3], cols[4]
        relays_by_pool.setdefault(phid, []).append((ipv4, ipv6, dns, srv))
        if ipv4:
            pools_by_ipv4.setdefault(ipv4, []).append(phid)
        host = dns or srv or ''
        bd = extract_base_domain(host)
        if bd and bd not in GENERIC_DDNS:
            pools_by_domain.setdefault(bd, []).append(phid)

    # Union-Find MPO grouping
    uf = UnionFind([str(p['pool_hash_id']) for p in pools])

    evidence_by_root: Dict[str, List[Evidence]] = {}

    def add_evidence(root: str, ev: Evidence):
        evidence_by_root.setdefault(root, []).append(ev)

    # Merge by shared owner address
    for addrid, phids in pools_by_owner.items():
        phids = list(set(phids))
        if len(phids) < 2:
            continue
        base = str(phids[0])
        for other in phids[1:]:
            uf.union(base, str(other))
        # store evidence on the (eventual) root after unions later

    # Merge by shared reward address id (strong)
    pools_by_reward: Dict[int, List[int]] = {}
    for p in pools:
        rid = int(p.get('reward_addr_id') or 0)
        if rid:
            pools_by_reward.setdefault(rid, []).append(int(p['pool_hash_id']))

    for rid, phids in pools_by_reward.items():
        phids = list(set(phids))
        if len(phids) < 2:
            continue
        base = str(phids[0])
        for other in phids[1:]:
            uf.union(base, str(other))

    # Merge by relay domain (medium)
    for dom, phids in pools_by_domain.items():
        phids = list(set(phids))
        if len(phids) < 2:
            continue
        base = str(phids[0])
        for other in phids[1:]:
            uf.union(base, str(other))

    # Merge by relay ipv4 (medium; can be noisy)
    for ip, phids in pools_by_ipv4.items():
        phids = list(set(phids))
        if len(phids) < 2:
            continue
        base = str(phids[0])
        for other in phids[1:]:
            uf.union(base, str(other))

    groups = uf.groups()

    mpo_groups: List[dict] = []

    # Post-process: assign evidence + confidence, attach to pools
    for root, members in groups.items():
        if len(members) < 2:
            continue
        member_ids = [int(x) for x in members]

        # Evidence collection
        ev: List[Evidence] = []

        # shared owners
        shared_owner_ids: Set[int] = set.intersection(*(owners_by_pool.get(mid, set()) for mid in member_ids)) if member_ids else set()
        for oid in list(shared_owner_ids)[:3]:
            ev.append(Evidence('shared_owner_addr_id', str(oid)))

        # shared reward addr
        reward_ids = {pool_by_hash[mid].get('reward_addr_id') for mid in member_ids if mid in pool_by_hash}
        if len(reward_ids) == 1:
            rid = list(reward_ids)[0]
            ev.append(Evidence('shared_reward_addr_id', str(rid)))

        # shared relay domains
        all_domains = []
        for mid in member_ids:
            for (ipv4, ipv6, dns, srv) in relays_by_pool.get(mid, []):
                bd = extract_base_domain(dns or srv or '')
                if bd and bd not in GENERIC_DDNS:
                    all_domains.append(bd)
        for d in sorted(set(all_domains))[:3]:
            ev.append(Evidence('shared_relay_domain', d))

        # shared relay ipv4
        all_ips = []
        for mid in member_ids:
            for (ipv4, ipv6, dns, srv) in relays_by_pool.get(mid, []):
                if ipv4:
                    all_ips.append(ipv4)
        for ip in sorted(set(all_ips))[:2]:
            ev.append(Evidence('shared_relay_ipv4', ip))

        # Confidence scoring (simple, explainable)
        score = 0.2
        types = {e.type for e in ev}
        if 'shared_reward_addr_id' in types:
            score = max(score, 0.95)
        if 'shared_owner_addr_id' in types:
            score = max(score, 0.9)
        if 'shared_reward_addr_id' not in types and 'shared_owner_addr_id' not in types:
            if 'shared_relay_domain' in types:
                score = max(score, 0.7)
            if 'shared_relay_ipv4' in types:
                score = max(score, 0.6)
        score = min(score, 0.99)

        # Group id stable-ish: root pool_hash_id
        group_id = f"mpo_{root}"

        total_stake = sum(pool_by_hash[mid]['active_stake_lovelace'] for mid in member_ids if mid in pool_by_hash)
        members_sorted = sorted(
            [pool_by_hash[mid] for mid in member_ids if mid in pool_by_hash],
            key=lambda p: p.get('active_stake_lovelace', 0),
            reverse=True,
        )

        mpo_groups.append({
            'group_id': group_id,
            'pool_count': len(member_ids),
            'total_stake_lovelace': total_stake,
            'confidence': round(score, 3),
            'evidence': [e.__dict__ for e in ev],
            'members': [
                {
                    'pool_id_bech32': p['pool_id_bech32'],
                    'ticker': p.get('ticker'),
                    'name': p.get('name'),
                    'active_stake_lovelace': p.get('active_stake_lovelace', 0),
                } for p in members_sorted
            ]
        })

        # Attach mpo to each member pool
        for p in members_sorted:
            p['mpo'] = {
                'group_id': group_id,
                'confidence': round(score, 3),
                'evidence': [e.__dict__ for e in ev],
            }

    mpo_groups.sort(key=lambda g: g['total_stake_lovelace'], reverse=True)

    total_stake = sum(p.get('active_stake_lovelace', 0) for p in pools)
    mpo_stake = 0
    for p in pools:
        if p.get('mpo'):
            mpo_stake += p.get('active_stake_lovelace', 0)
    mpo_pct = (100.0 * mpo_stake / total_stake) if total_stake else 0.0

    network_summary = {
        'epoch_no': epoch_no,
        'active_pools': len(pools),
        'total_active_stake_lovelace': total_stake,
        'mpo_stake_pct': round(mpo_pct, 2),
    }

    out = {
        'generated_at': now,
        'network_summary': network_summary,
        'mpo_groups': mpo_groups[:500],
        'pools': [
            {
                'pool_id_bech32': p['pool_id_bech32'],
                'ticker': p.get('ticker'),
                'name': p.get('name'),
                'active_stake_lovelace': p.get('active_stake_lovelace', 0),
                'pledge_lovelace': p.get('pledge_lovelace', 0),
                'margin': p.get('margin'),
                'fixed_cost_lovelace': p.get('fixed_cost_lovelace', 0),
                'metadata_url': p.get('metadata_url'),
                'metadata_hash_hex': p.get('metadata_hash_hex'),
                'homepage': p.get('homepage'),
                'description': p.get('description'),
                'mpo': p.get('mpo'),
            } for p in sorted(pools, key=lambda x: x.get('active_stake_lovelace', 0), reverse=True)
        ]
    }

    os.makedirs(os.path.dirname(OUT_PATH), exist_ok=True)
    with open(OUT_PATH, 'w', encoding='utf-8') as f:
        json.dump(out, f, ensure_ascii=False, indent=2)
        f.write('\n')

    print(f"Wrote {OUT_PATH} (epoch {epoch_no}, pools {len(pools)})")
    return 0


if __name__ == '__main__':
    raise SystemExit(main())
