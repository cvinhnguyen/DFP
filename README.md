# Newsletter automation, development environment

Local setup for the DFP Mazhar 4 project. Runs n8n and PostgreSQL on your
own machine, so nobody waits for a shared server and we do not overwrite
each other's workflows.

Architecture: https://hamk-projects-jira.atlassian.net/wiki/spaces/DM4/pages/649199627

## Setup

You need Docker Desktop installed and running.

```bash
cp .env.example .env
openssl rand -hex 32          # paste the result into N8N_ENCRYPTION_KEY
docker compose up -d
```

Then open http://localhost:5678 and create your owner account. That account
is local to your machine.

Check it worked:

```bash
docker compose ps             # both services should be healthy
```

## What you get

| Service  | Address         | Notes                                   |
|----------|-----------------|-----------------------------------------|
| n8n      | localhost:5678  | workflow editor                         |
| Postgres | localhost:5432  | database `newsletter`, user from `.env` |

Both are bound to 127.0.0.1, so nothing is reachable from outside your
machine.

There are two databases on the same Postgres server. `n8n` holds n8n's own
workflows and credentials, and we do not touch it. `newsletter` holds the
project data.

## Connecting to the database

```bash
docker compose exec postgres psql -U dfp -d newsletter
```

Or from a GUI client: host `localhost`, port `5432`, database `newsletter`,
user and password from your `.env`.

## Tables

Defined in `db/init/02-schema.sql`, with the AI configuration tables in
`03-llm.sql` and the signal tables in `04-signals.sql`. Sprint 1 has `users`,
`sources`, `items`, `summaries`, `llm_usage`, `collection_runs`, `signals` and
`signal_items`. The newsletter tables come later.

The init scripts only run when the Postgres volume is first created, so if you
already have data, apply a new one by hand instead of wiping the volume:

```bash
docker compose exec -T postgres psql -U $POSTGRES_USER -d newsletter \
  < db/init/04-signals.sql
```

The shared LLM workflow caps how much a model may write, using
`llm_max_output_tokens` in `app_settings`. When a model stops because it ran
out of room rather than because it finished, the call comes back with
`truncated: true` and the answer is not cached, because caching half a
sentence would hand the same half sentence to every later caller. `llm_usage`
records it too, so we can see whether the cap is set too low instead of
guessing.

`workflows/signal-detection.json` fills `signals` and `signal_items`. It asks
the model, per article, whether the article points at something new or
growing, and keeps only the ones it says yes to. Articles that name the same
topic become one signal carrying all of them, which is what makes "this came
up in six articles" visible. How far back it reads is `signal_window_days` in
`app_settings`.

`signals` and `signal_items` hold what the trend detection finds. A signal
must link to at least one article, enforced by a trigger that runs at commit,
so write the signal and its links in one statement. There is a worked example
at the bottom of `db/init/04-signals.sql`. Re-running detection on the same day
updates the existing signal rather than adding a copy.

The important ones for the crawler:

- `sources` is what we monitor, and the crawler should read its URL from
  here rather than hardcoding one. Two rows are seeded: the Finnish
  `ajankohtaista` section and the English `en/news` section, which carry
  different articles. Each has a `language`, so nothing downstream has to
  guess from the URL. If the client decides against an English edition, set
  `active = false` on that row rather than deleting it.
- `items` is one row per article. `source_id` is where we found it,
  `publisher` is who wrote it, and both are needed because the publisher is
  the attribution printed in the newsletter.
- `author` is often empty. Nothing should depend on it.
- `excerpt` is the publisher's own short description.
- `raw_text` is deleted after the retention period. The link, title,
  publisher and summary are kept.

## Changing the schema

The scripts in `db/init/` only run when the Postgres volume is first
created. To pick up a change:

```bash
docker compose down -v        # deletes all local data
docker compose up -d
```

That is fine while we are developing. Once the API service exists it will
handle migrations properly.

## Writing data

For Sprint 1, write straight into Postgres from your n8n workflow using the
Postgres node.

From Sprint 2 this moves to an ingest API endpoint, so that a mistake in
one workflow cannot corrupt data for everyone. The item format stays the
same, so nothing you build now is wasted.

## Workflows

Export your workflows as JSON into this repo. Local instances drift apart
otherwise and there is no way to review what changed or rebuild a lost
instance.

## Notes

`.env` is gitignored and must never be committed. It will eventually hold
the client's real Mailchimp key, which reaches their actual member list.

`N8N_ENCRYPTION_KEY` encrypts saved credentials. Keep the same value. If
you change it, anything already saved in n8n has to be entered again.

The n8n image is pinned to 2.38.1, which is the version this setup was
tested against. n8n execution history is pruned after 30 days by default. It stores the
full payload of every run, including article text, so this is a retention
setting rather than only housekeeping.
