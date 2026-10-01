#!/usr/bin/env bash
# Saves the workflows from your running n8n into n8n/workflows/, ready to commit.
# Jira: DM42-42
#
#   ./n8n/export.sh
#
# Run it after changing a workflow in the editor, then look at git diff and
# commit. It checks every file first and writes nothing if a secret from .env
# turns up in one, or if a workflow calls a sub-workflow the repository does
# not have.
#
# It only adds and updates files. A workflow you do not have in your own n8n
# is left alone in the repository.
set -euo pipefail
export MSYS_NO_PATHCONV=1            # Git Bash on Windows would rewrite /tmp paths
cd "$(dirname "$0")/.."

[ -f .env ] || { echo ".env not found. Run this from the project folder."; exit 1; }
env_get() { grep -E "^$1=" .env | tail -1 | cut -d= -f2- || true; }
N8N="$(env_get CONTAINER_PREFIX)"; N8N="${N8N:-dfp}-n8n"
TMP=/tmp/dfp-export

# Everything in .env that is a password, key or token, to check the files against.
export DFP_SECRETS_B64="$(grep -E '^[A-Z0-9_]*(PASSWORD|KEY|TOKEN|SECRET)[A-Z0-9_]*=' .env | cut -d= -f2- | base64 | tr -d '\n\r')"

docker exec -u root "$N8N" rm -rf "$TMP"
docker exec "$N8N" mkdir -p "$TMP/exported" "$TMP/repo" "$TMP/out"
docker exec "$N8N" n8n export:workflow --all --separate --output="$TMP/exported/" >/dev/null 2>&1
docker cp n8n/workflows/. "$N8N:$TMP/repo/" >/dev/null
docker cp n8n/tidy.js "$N8N:$TMP/tidy.js" >/dev/null

status=0
if docker exec -e DFP_SECRETS_B64 "$N8N" node "$TMP/tidy.js" "$TMP/exported" "$TMP/repo" "$TMP/out"; then
  docker cp "$N8N:$TMP/out/." n8n/workflows/ >/dev/null
else
  status=1
fi
docker exec -u root "$N8N" rm -rf "$TMP"

if [ $status = 0 ]; then
  echo
  git status --short n8n/workflows/
  echo "Check the changes with: git diff n8n/workflows/"
fi
exit $status
