// Tidies workflows exported from n8n and checks them before they go into git.
// Jira: DM42-42
//
// Runs inside the n8n container, so nobody needs Node or Python on their own
// machine. scripts/n8n-export.sh copies it in and calls it:
//
//   node n8n-tidy.js <exported dir> <current repo workflows dir> <output dir>
//
// It refuses to write anything if a check fails.

const fs = require('fs');
const path = require('path');

const [exportedDir, repoDir, outDir] = process.argv.slice(2);
const problems = [];
const notes = [];

// Only what is needed to rebuild a workflow. pinData is test data pinned in
// the editor and can hold real article text or Telegram messages. staticData,
// versionId and the timestamps change on every save and would make every
// export look like a change.
const KEEP = ['id', 'name', 'active', 'nodes', 'connections', 'settings'];

// The existing file for each workflow id, so a workflow keeps its file name
// when someone renames it in the editor.
const fileFor = {};
for (const f of fs.readdirSync(repoDir).filter(f => f.endsWith('.json'))) {
  try {
    const w = JSON.parse(fs.readFileSync(path.join(repoDir, f), 'utf8'));
    if (w.id) fileFor[w.id] = f;
  } catch (e) { /* not a workflow file */ }
}
const slug = s => s.toLowerCase().normalize('NFKD').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

const out = {};
for (const f of fs.readdirSync(exportedDir).filter(f => f.endsWith('.json'))) {
  const w = JSON.parse(fs.readFileSync(path.join(exportedDir, f), 'utf8'));
  if (w.isArchived) continue;                       // deleted in the editor
  if (w.pinData && Object.keys(w.pinData).length) notes.push(`${w.name}: removed pinned test data`);
  const tidy = {};
  for (const k of KEEP) if (w[k] !== undefined) tidy[k] = w[k];
  tidy.active = w.active === true;
  out[fileFor[w.id] || `${slug(w.name)}.json`] = tidy;
}

// Every workflow in the repository after this export: the ones exported now
// and the ones already there that this instance does not have.
const known = new Set(Object.values(out).map(w => w.id));
for (const [id, f] of Object.entries(fileFor)) if (!out[f]) known.add(id);

for (const [file, w] of Object.entries(out)) {
  for (const n of w.nodes) {
    // A credential in a workflow is a reference, id and name. Values live in
    // n8n's own encrypted store and must never appear here.
    for (const [type, ref] of Object.entries(n.credentials || {})) {
      const extra = Object.keys(ref).filter(k => k !== 'id' && k !== 'name');
      if (extra.length) problems.push(`${file}: "${n.name}" credential ${type} carries ${extra.join(', ')}`);
    }
    // A sub-workflow is called by id. An id that is not in the repository
    // works on your machine and nowhere else.
    if (n.type === 'n8n-nodes-base.executeWorkflow') {
      const v = n.parameters.workflowId;
      const text = typeof v === 'object' && v ? String(v.value) : String(v);
      for (const id of text.match(/\b[A-Za-z0-9]{16}\b/g) || []) {
        if (!known.has(id)) problems.push(`${file}: "${n.name}" calls workflow ${id}, which is not in the repository`);
      }
    }
  }
}

// The real test: none of the secrets from .env may appear anywhere in the
// files. The caller passes them in base64, one per line.
const secrets = Buffer.from(process.env.DFP_SECRETS_B64 || '', 'base64').toString('utf8')
  .split('\n').map(s => s.trim()).filter(s => s.length >= 8);
if (!secrets.length) problems.push('no secrets were passed in to check against, is .env there?');
for (const [file, w] of Object.entries(out)) {
  const text = JSON.stringify(w);
  secrets.forEach((s, i) => {
    if (text.includes(s)) problems.push(`${file}: contains secret number ${i + 1} from .env`);
  });
}

for (const n of notes) console.log(`note: ${n}`);
if (problems.length) {
  for (const p of problems) console.error(`PROBLEM: ${p}`);
  console.error('Nothing was written.');
  process.exit(1);
}
fs.mkdirSync(outDir, { recursive: true });
for (const [file, w] of Object.entries(out)) {
  fs.writeFileSync(path.join(outDir, file), JSON.stringify(w, null, 2) + '\n');
}
console.log(`checked ${Object.keys(out).length} workflows against ${secrets.length} secrets: clean`);
