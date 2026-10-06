#!/usr/bin/env node
// Theseus, read from this computer for the server.
//
// Theseus, like Finna and the rest of the National Library's services, sits
// behind Cloudflare, which turns away the addresses of cloud servers with a
// bot check (403, "Just a moment..."). A computer on an ordinary connection
// reads it as before. So this reads the newest theses here, with the same
// code the server's Archive collector runs (n8n/workflows/archive-collector.json,
// "Read the archive"), and hands them to the server through SSH: the server
// decides which are new, sends them to its own ingest API and notes the run
// in collection_runs, so Theseus shows as working on Asetukset → Lähteet.
// The ingest token stays on the server: the dashboard container there makes
// the call. Nothing gets past the bot check; the theses come from where
// Theseus lets them be read.
//
//   node deploy/theseus-from-here.js <ssh host>
//
// <ssh host> is the server as ~/.ssh/config names it, with the project in
// ~/dfp. Run it after the server's own morning check, which still tries
// Theseus and is turned away, so the latest run is this one.
'use strict';
const { execFileSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const host = process.argv[2];
if (!host) {
  console.error('Usage: node deploy/theseus-from-here.js <ssh host>');
  process.exit(1);
}
const sshArgs = process.env.SSH_CONFIG ? ['-F', process.env.SSH_CONFIG] : [];
const ssh = (command, input) => execFileSync('ssh', [...sshArgs, host, command], { input, maxBuffer: 64 * 1024 * 1024 }).toString();
const psql = (sql) => ssh('cd ~/dfp && docker compose exec -T postgres sh -c \'psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" -qAt -v ON_ERROR_STOP=1\'', sql).trim();
const quote = (text) => `'${String(text).replace(/'/g, "''")}'`;
const shellQuote = (text) => `'${String(text).replace(/'/g, `'\\''`)}'`;

// The collector's own code, run here with what n8n would give it.
function readingCode() {
  const workflow = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'n8n', 'workflows', 'archive-collector.json'), 'utf8'));
  return workflow.nodes.find((n) => n.name === 'Read the archive').parameters.jsCode;
}

async function readTheseus(source, since) {
  const AsyncFunction = Object.getPrototypeOf(async () => {}).constructor;
  const run = new AsyncFunction('$', '$json', readingCode());
  const helpers = {
    async httpRequest({ url, timeout, headers }) {
      const response = await fetch(url, { headers, signal: AbortSignal.timeout(timeout || 30000) });
      if (!response.ok) throw new Error(`Request failed with status code ${response.status}`);
      return response.json();
    },
  };
  const start = { first: () => ({ json: { source_id: source.id, url: source.url, publisher: source.publisher } }) };
  const [out] = await run.call({ helpers }, () => start, { since });
  return out.json;
}

(async () => {
  const started = new Date().toISOString();
  const [id, url, publisher, since] = psql(`SELECT s.id, s.url, coalesce(s.publisher, ''),
      (SELECT coalesce(max(published_at) - interval '1 day', now() - interval '7 days') FROM items WHERE source_id = s.id)
    FROM sources s WHERE s.type = 'dspace' AND s.active AND s.url LIKE 'https://www.theseus.fi/%' LIMIT 1;`).split('|');
  if (!id) throw new Error('The server has no Theseus source switched on.');
  const source = { id: Number(id), url, publisher: publisher || null };
  console.log(`Theseus (source ${source.id}) on the server, read here from ${since}`);

  const read = await readTheseus(source, since);
  console.log(`read ${read.records.length} theses in ${read.pages} pages${read.error ? `; ${read.error}` : ''}`);

  // What the server does not have yet, as the collector's "Keep new" decides.
  const fresh = JSON.parse(psql(`SELECT coalesce(jsonb_agg(to_jsonb(x) ORDER BY x.published_at DESC NULLS LAST), '[]'::jsonb)
    FROM jsonb_to_recordset(${quote(JSON.stringify(read.records))}::jsonb) AS x(
      url text, title text, published_at timestamptz, publisher text, source_language text,
      excerpt text, raw_text text, subjects jsonb, details jsonb)
   WHERE x.url IS NOT NULL AND x.title IS NOT NULL
     AND NOT EXISTS (SELECT 1 FROM items i WHERE i.canonical_url = canonicalise_url(x.url));`) || '[]');

  // To the server's ingest API, 200 at a time, from the dashboard container,
  // which has the token.
  const post = `import json, os, sys, urllib.request
items = json.load(sys.stdin)
answers = []
for i in range(0, len(items), 200):
    request = urllib.request.Request("http://n8n:5678/webhook/ingest", data=json.dumps({"items": items[i:i + 200]}).encode(),
        method="POST", headers={"Content-Type": "application/json", "X-Ingest-Token": os.environ["INGEST_TOKEN"]})
    with urllib.request.urlopen(request, timeout=120) as response:
        answers += json.loads(response.read()).get("results", [])
print(json.dumps(answers))`;
  const items = fresh.map((a) => ({
    source_id: source.id, url: a.url, title: a.title, publisher: a.publisher || source.publisher, published_at: a.published_at,
    excerpt: a.excerpt || null, raw_text: a.raw_text || null, source_language: a.source_language || null,
    subjects: a.subjects || [], details: a.details || null,
  }));
  const results = items.length
    ? JSON.parse(ssh(`cd ~/dfp && docker compose exec -T dashboard python -c ${shellQuote(post)}`, JSON.stringify(items)).trim() || '[]')
    : [];
  const added = results.filter((r) => r.accepted && r.new).length;
  const rejected = results.filter((r) => !r.accepted);
  const problems = [read.error, rejected.length ? `${rejected.length} rejected` : null].filter(Boolean);

  psql(`INSERT INTO collection_runs (source_id, started_at, finished_at, items_found, items_new, error)
        VALUES (${source.id}, ${quote(started)}, now(), ${read.records.length}, ${added},
                ${problems.length ? quote(`${problems.join('; ')} (read from another computer)`) : 'NULL'});`);
  console.log(`${added} new on the server${rejected.length ? `, ${rejected.length} refused` : ''}`);
})().catch((e) => {
  console.error(e.message);
  process.exit(1);
});
