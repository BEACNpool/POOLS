#!/usr/bin/env bash
set -euo pipefail

REPO_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$REPO_DIR"

# Safety: ensure we're in the right repo
if [[ ! -d .git ]]; then
  echo "Not a git repo: $REPO_DIR" >&2
  exit 1
fi

python3 -V >/dev/null

# Build latest.json
python3 pipeline/build_latest.py

# Commit only if latest.json changed
if git diff --quiet -- frontend/public/data/latest.json; then
  echo "No data change; nothing to commit."
  exit 0
fi

# Basic identity (repo-local)
git config user.name "BEACNpool Bot"
git config user.email "bot@beacnpool.com"

# Commit + push
STAMP="$(date -u +'%Y-%m-%dT%H:%M:%SZ')"
EPOCH="$(python3 -c 'import json; print(json.load(open("frontend/public/data/latest.json"))["network_summary"]["epoch_no"])')"

git add frontend/public/data/latest.json

git commit -m "data: refresh epoch ${EPOCH} (${STAMP})"

git push origin main
