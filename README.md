# Newsletter automation for Suomen eOppimiskeskus

DFP Mazhar 4. The tool collects articles from the sources the association
follows, summarises them in Finnish, and shows them to the editors in a
dashboard. A Telegram bot takes the links they find themselves. The editors
put the newsletter together in the dashboard's editor, and send it from their
own Mailchimp. The tool never sends.

Architecture: https://hamk-projects-jira.atlassian.net/wiki/spaces/DM4/pages/649199627

## What is where

Each folder is one part of the system, with a README of its own.

| Folder | What it is |
|---|---|
| `dashboard/` | the editors' web app: a Python API and the pages it serves |
| `n8n/` | the workflows that collect, summarise, run the Telegram bot and make Mailchimp drafts, and the scripts that save and rebuild them |
| `db/` | the database: every table, as numbered changes, and the client's source list |
| `docs/` | documents for people: credentials, the ingest API, the AI cost comparison, the check against the association's own newsletters, the architecture diagram, the dashboard prototype |

The parts meet in the database. n8n collects articles and theses and writes
them in through the ingest API, then summarises them and gives them subject
tags. The dashboard reads what is
there, and when an editor presses "check now" it asks n8n to collect. Nothing
reaches the database except through these. Mailchimp is reached the same way:
the dashboard asks n8n, which holds the key.

## Setup

You need Docker Desktop installed and running.

```bash
cp .env.example .env
openssl rand -hex 32          # paste the result into N8N_ENCRYPTION_KEY
openssl rand -hex 24          # paste the result into INGEST_TOKEN
docker compose up -d          # the database builds itself from db/init/
./n8n/rebuild.sh              # credentials and every workflow, switched on
docker compose exec dashboard python -m app.cli.users add you@example.fi --name You --role admin
```

Then open http://localhost:5678 and create your n8n owner account, which is
local to your machine, and log in to the dashboard at http://localhost:8000.

To use the Telegram bot, message it once: it answers with your Telegram ID.
Put that on your account, and from then on `/login` in the bot gets you into
the dashboard and `/adduser` adds colleagues:

```bash
docker compose exec dashboard python -m app.cli.users telegram you@example.fi 123456789
```

The client's source list is not in this repository, because the repository is
public. `db/README.md` says how to get it and load it.

Mailchimp is optional. Put an API key in `MAILCHIMP_API_KEY` before running
`./n8n/rebuild.sh`, or type it into the "DFP Mailchimp" credential in n8n
afterwards. Then, as an admin, open Asetukset in the dashboard and enter the
data centre, the end of the key after the dash, like `us4`. Read
`docs/credentials.md` before asking anyone for a real key.

On Windows, run the scripts from Git Bash.

## What you get

| Service | Address | Notes |
|---|---|---|
| Dashboard | localhost:8000 | the editors' pages, and the API documentation at /api/docs |
| n8n | localhost:5678 | the workflow editor |
| Postgres | localhost:5432 | database `newsletter`, user from `.env` |

Every port is bound to 127.0.0.1, so nothing is reachable from outside your
machine. `docker compose ps` should show all three running.

## Keeping secrets out of git

`.env` is gitignored and must never be committed. It can hold a Mailchimp
key, which reaches a real member list. Where every password and token lives,
and how the client's credentials are handled, is in `docs/credentials.md`.

`N8N_ENCRYPTION_KEY` encrypts the credentials saved in n8n. Keep the same
value. If you change it, anything already saved in n8n has to be entered
again.
