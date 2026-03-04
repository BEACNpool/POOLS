#!/usr/bin/env python3
"""Export pool relay locations as CSV.

Runs on opsbox. Queries relay db-sync (via ssh relay docker exec psql) and writes:
- public/cardano_pool_locations.csv

This is meant as a community-facing deep-dive artifact.
"""

import os
import subprocess

REPO_ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..'))
OUT_PATH = os.path.join(REPO_ROOT, 'frontend', 'public', 'downloads', 'cardano_pool_locations.csv')


def run(cmd, *, input_text=None):
    p = subprocess.run(cmd, input=input_text, stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True)
    if p.returncode != 0:
        raise RuntimeError(f"command failed ({p.returncode}): {' '.join(cmd)}\n{p.stderr}")
    return p.stdout


def main():
    os.makedirs(os.path.dirname(OUT_PATH), exist_ok=True)

    sql = r"""
with latest as (
  select distinct on (pu.hash_id)
    pu.hash_id,
    pu.id as pool_update_id,
    pu.active_epoch_no
  from pool_update pu
  where pu.active_epoch_no <= (select max(no) from epoch)
  order by pu.hash_id, pu.active_epoch_no desc, pu.id desc
),
latest_offchain as (
  select distinct on (opd.pool_id)
    opd.pool_id,
    opd.ticker_name,
    opd.json
  from off_chain_pool_data opd
  order by opd.pool_id, opd.id desc
),
stake as (
  select pool_id, sum(amount) as amount
  from epoch_stake
  where epoch_no = (select max(no) from epoch)
  group by pool_id
)
select
  ph.view as pool_id,
  coalesce(opd.ticker_name, '') as ticker,
  coalesce(opd.json->>'name', '') as name,
  coalesce(st.amount, 0) as stake_lovelace,
  (coalesce(st.amount, 0)::numeric / 1000000.0) as stake_ada,
  coalesce(pr.dns_name, pr.dns_srv_name, '') as relay_hostname,
  coalesce(pr.ipv4, pr.ipv6, '') as relay_ip,
  coalesce((opd.json->'relays'->0->>'latitude')::text, '') as latitude,
  coalesce((opd.json->'relays'->0->>'longitude')::text, '') as longitude,
  coalesce((opd.json->'relays'->0->>'city')::text, '') as city,
  coalesce((opd.json->'relays'->0->>'country')::text, '') as country
from pool_hash ph
join latest l on l.hash_id = ph.id
left join pool_relay pr on pr.update_id = l.pool_update_id
left join latest_offchain opd on opd.pool_id = ph.id
left join stake st on st.pool_id = ph.id
order by stake_lovelace desc;
"""

    # Use psql \copy to write CSV on relay, stream to opsbox file.
    # (docker exec writes to stdout, which we redirect to local OUT_PATH)
    # Feed the \copy command via stdin to avoid shell quoting issues.
    select_sql = ' '.join(sql.split()).strip().rstrip(';')
    copy_cmd = f"\\copy ({select_sql}) TO STDOUT WITH (FORMAT csv, HEADER);"
    cmd = [
        'ssh', 'relay',
        'docker', 'exec', '-i', 'dbsync-mainnet-postgres',
        'psql', '-U', 'postgres', '-d', 'cexplorer',
        '-v', 'ON_ERROR_STOP=1',
        '-q',
    ]

    out = run(cmd, input_text=copy_cmd + "\n")
    with open(OUT_PATH, 'w', encoding='utf-8', newline='') as f:
        f.write(out)

    print(f"Wrote {OUT_PATH} ({len(out)} bytes)")


if __name__ == '__main__':
    main()
