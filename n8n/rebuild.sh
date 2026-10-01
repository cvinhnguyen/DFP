#!/usr/bin/env bash
# Builds the n8n side of a new instance from the repository.
# Jira: DM42-42
#
#   cp .env.example .env        and fill it in
#   docker compose up -d        the database builds itself from db/init/
#   ./n8n/rebuild.sh
#
# It creates the credentials from .env, imports every workflow in
# n8n/workflows/ and switches on the ones that were on when they were exported. Then open
# http://localhost:5678 and create your owner account.
#
# Meant for a new, empty n8n. On one that already has these workflows it
# overwrites them with the repository's copy.
set -euo pipefail
export MSYS_NO_PATHCONV=1            # Git Bash on Windows would rewrite /tmp paths
cd "$(dirname "$0")/.."

[ -f .env ] || { echo ".env not found. Copy .env.example to .env and fill it in."; exit 1; }
env_get() { grep -E "^$1=" .env | tail -1 | cut -d= -f2- || true; }
for k in POSTGRES_PASSWORD INGEST_TOKEN; do
  [ -n "$(env_get $k)" ] || { echo "$k is empty in .env"; exit 1; }
done
N8N="$(env_get CONTAINER_PREFIX)"; N8N="${N8N:-dfp}-n8n"
TMP=/tmp/dfp-rebuild

echo "Waiting for n8n..."
until docker exec "$N8N" node -e "fetch('http://localhost:5678/healthz').then(r => process.exit(r.ok ? 0 : 1)).catch(() => process.exit(1))" 2>/dev/null; do
  sleep 2
done

docker exec -u root "$N8N" rm -rf "$TMP"
docker exec "$N8N" mkdir -p "$TMP/wf"
docker cp n8n/workflows/. "$N8N:$TMP/wf/" >/dev/null

# The credentials, with the ids the workflow files refer to, so every node
# finds its credential without anyone clicking through the editor. The values
# come from .env through the environment, never on a command line, and the
# file holding them is deleted straight after the import.
#
# The Mailchimp key is optional (docs/credentials.md). Without one in .env, a
# "DFP Mailchimp" credential already in n8n is left as it is, so a key an admin
# typed into n8n survives a rebuild, and a new n8n gets an empty one, so the
# dashboard says the key is missing instead of n8n failing.
export DB_USER_="$(env_get POSTGRES_USER)" DB_PASS_="$(env_get POSTGRES_PASSWORD)" INGEST_TOKEN_="$(env_get INGEST_TOKEN)"
export MAILCHIMP_KEY_="$(env_get MAILCHIMP_API_KEY)" KEEP_MAILCHIMP_=""
MAILCHIMP_ID=$(docker exec "$N8N" node -e '
  const fs = require("fs"), dir = process.argv[1];
  for (const f of fs.readdirSync(dir))
    for (const n of JSON.parse(fs.readFileSync(dir + "/" + f, "utf8")).nodes)
      for (const ref of Object.values(n.credentials || {}))
        if (ref.name === "DFP Mailchimp") { console.log(ref.id); process.exit(0); }
' "$TMP/wf" | tr -d '\r')
if [ -n "$MAILCHIMP_ID" ] && [ -z "$MAILCHIMP_KEY_" ] &&
   docker exec "$N8N" n8n export:credentials --id="$MAILCHIMP_ID" --output="$TMP/mailchimp-check.json" >/dev/null 2>&1; then
  KEEP_MAILCHIMP_=1
fi
docker exec -u root "$N8N" rm -f "$TMP/mailchimp-check.json"
docker exec -e DB_USER_ -e DB_PASS_ -e INGEST_TOKEN_ -e MAILCHIMP_KEY_ -e KEEP_MAILCHIMP_ "$N8N" node -e '
  const fs = require("fs"), dir = process.argv[1];
  const ids = {};
  for (const f of fs.readdirSync(dir)) {
    for (const n of JSON.parse(fs.readFileSync(dir + "/" + f, "utf8")).nodes)
      for (const ref of Object.values(n.credentials || {})) ids[ref.name] = ref.id;
  }
  const need = ["DFP Postgres", "DFP ingest token"].filter(n => !ids[n]);
  if (need.length) { console.error("No workflow refers to: " + need.join(", ")); process.exit(1); }
  const creds = [
    { id: ids["DFP Postgres"], name: "DFP Postgres", type: "postgres",
      data: { host: "postgres", port: 5432, database: "newsletter",
              user: process.env.DB_USER_ || "dfp", password: process.env.DB_PASS_,
              ssl: "disable", allowUnauthorizedCerts: false, maxConnections: 100 } },
    { id: ids["DFP ingest token"], name: "DFP ingest token", type: "httpHeaderAuth",
      data: { name: "X-Ingest-Token", value: process.env.INGEST_TOKEN_ } },
  ];
  if (ids["DFP Mailchimp"] && !process.env.KEEP_MAILCHIMP_)
    creds.push({ id: ids["DFP Mailchimp"], name: "DFP Mailchimp", type: "mailchimpApi",
                 data: { apiKey: process.env.MAILCHIMP_KEY_ || "" } });
  fs.writeFileSync(dir + "/../creds.json", JSON.stringify(creds));
' "$TMP/wf"
status=0
docker exec "$N8N" n8n import:credentials --input="$TMP/creds.json" 2>&1 | grep -i "import" || status=1
docker exec -u root "$N8N" rm -f "$TMP/creds.json"

if [ $status = 0 ]; then
  docker exec "$N8N" n8n import:workflow --separate --input="$TMP/wf" 2>&1 | grep -i "import" || status=1
fi

# The importer cannot switch workflows on in a normal single n8n, so each one
# that was on when it was exported is published here instead.
if [ $status = 0 ]; then
  for id in $(docker exec "$N8N" node -e '
      const fs = require("fs"), dir = process.argv[1];
      for (const f of fs.readdirSync(dir)) {
        const w = JSON.parse(fs.readFileSync(dir + "/" + f, "utf8"));
        if (w.active) console.log(w.id);
      }' "$TMP/wf" | tr -d '\r'); do
    docker exec "$N8N" n8n publish:workflow --id="$id" >/dev/null 2>&1 || { echo "Could not switch on $id"; status=1; }
  done
fi
docker exec -u root "$N8N" rm -rf "$TMP"
[ $status = 0 ] || { echo "Import failed, see above."; exit 1; }

# n8n reads which workflows are active when it starts.
docker compose restart n8n >/dev/null
echo "Done. Open http://localhost:$(env_get N8N_PORT | grep . || echo 5678) and create your owner account."
