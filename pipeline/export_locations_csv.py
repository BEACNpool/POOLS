#!/usr/bin/env python3
"""Export pool relay locations as a community-facing CSV.

Source-of-truth for geo fields:
- https://global-api.cardano-visualisation.com/api/stakepools
  (includes relay resolvedIp + latitude/longitude + geoCountry/geoCity)

We publish it at:
- frontend/public/downloads/cardano_pool_locations.csv

Runs on opsbox. No API keys required.
"""

import csv
import json
import os
import subprocess

REPO_ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..'))
OUT_PATH = os.path.join(REPO_ROOT, 'frontend', 'public', 'downloads', 'cardano_pool_locations.csv')

API_URL = 'https://global-api.cardano-visualisation.com/api/stakepools'


def sh(cmd):
    p = subprocess.run(cmd, stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True)
    if p.returncode != 0:
        raise RuntimeError(f"command failed ({p.returncode}): {' '.join(cmd)}\n{p.stderr}")
    return p.stdout


def main():
    os.makedirs(os.path.dirname(OUT_PATH), exist_ok=True)

    # Cardano Visualisation API blocks some default user agents; set one explicitly.
    raw = sh(['curl', '-sS', '-H', 'User-Agent: Mozilla/5.0', API_URL])
    obj = json.loads(raw)

    rows = []
    for p in obj.get('data', []):
        pool_id = p.get('id') or ''
        ticker = ((p.get('parsedMetadata') or {}).get('ticker')) or ((p.get('metadata') or {}).get('ticker')) or ''
        name = ((p.get('parsedMetadata') or {}).get('name')) or ((p.get('metadata') or {}).get('name')) or ''

        # stake is nested
        stake_lovelace = (((p.get('stake') or {}).get('ada') or {}).get('lovelace'))
        try:
            stake_lovelace = int(stake_lovelace) if stake_lovelace is not None else 0
        except Exception:
            stake_lovelace = 0
        stake_ada = stake_lovelace / 1_000_000

        for r in p.get('relays') or []:
            if not isinstance(r, dict):
                continue
            relay_hostname = r.get('hostname') or ''
            relay_ip = r.get('resolvedIp') or r.get('ipv4') or r.get('ipv6') or ''
            lat = r.get('latitude') or ''
            lon = r.get('longitude') or ''
            city = r.get('geoCity') or ''
            country = r.get('geoCountry') or ''

            rows.append([
                pool_id,
                ticker,
                name,
                str(stake_lovelace),
                f"{stake_ada:.6f}",
                relay_hostname,
                relay_ip,
                str(lat),
                str(lon),
                city,
                country,
            ])

    # Write CSV
    with open(OUT_PATH, 'w', encoding='utf-8', newline='') as f:
        w = csv.writer(f)
        w.writerow(['pool_id', 'ticker', 'name', 'stake_lovelace', 'stake_ada', 'relay_hostname', 'relay_ip', 'latitude', 'longitude', 'city', 'country'])
        w.writerows(rows)

    print(f"Wrote {OUT_PATH} ({len(rows)} rows)")


if __name__ == '__main__':
    main()
