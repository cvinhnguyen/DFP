# The database

PostgreSQL 16, with two databases on the same server. `newsletter` holds the
project's data. `n8n` holds n8n's own workflows and credentials, and nothing
of ours touches it.

| Folder | What it is |
|---|---|
| `init/` | every table and every change to one, as numbered SQL files |
| `client/` | the client's source list. Not in git. |

## Connecting

```bash
docker compose exec postgres psql -U dfp -d newsletter
```

Or from a GUI client: host `localhost`, port `5432`, database `newsletter`,
user and password from your `.env`.

## Changing the schema

Every change is a new numbered file in `init/`, with the Jira key at the top,
written so that running it twice does no harm. Never edit an old file to
change the schema: everyone else's database has already run it.

Postgres runs the files in order when its volume is first created, so a new
setup gets all of them. On a database that already has data, apply the new
file by hand:

```bash
docker compose exec -T postgres psql -U dfp -d newsletter < db/init/15-dashboard.sql
```

Or start again from nothing, which deletes all local data:

```bash
docker compose down -v
docker compose up -d
```

## Tables

| Table | What it holds | Defined in |
|---|---|---|
| `sources` | the sites, feeds and journals we follow, and how each is read | `02-schema.sql`, `07`, `11`, `14` |
| `items` | one row per article | `02-schema.sql`, `10`, `11` |
| `summaries` | the Finnish summaries, each carrying its source link and publisher | `02-schema.sql`, `12`, `15` |
| `collection_runs` | one row each time a source is checked, with any error | `02-schema.sql` |
| `filter_runs` | what the filter skipped and the tokens that saved | `11-filter.sql` |
| `signals`, `signal_items` | topics that keep coming up, and the articles behind each | `04-signals.sql` |
| `llm_usage` | every AI call: tokens, cost, time | `02-schema.sql`, `03`, `05` |
| `llm_cache` | answers kept so the same text is never paid for twice | `03-llm.sql` |
| `llm_pricing` | token prices per model | `03-llm.sql`, `06` |
| `app_settings` | every setting that is not a secret: the model, the filter, the check times, the Mailchimp data centre and audience | `03-llm.sql` and later |
| `users` | the editors. Members never log in, so no member data lives here. | `02-schema.sql`, `15`, `16` |
| `sessions` | dashboard logins, as hashes of the cookie's token | `15-dashboard.sql` |
| `login_links`, `invites` | the bot's one-time /login links and /invite codes, as hashes | `16-telegram-accounts.sql` |
| `issues` | newsletters: drafts and the ones sent, with the editor's design, the finished email, and its draft in Mailchimp | `17-newsletter.sql`, `18` |
| `item_picks` | what the editors decided about each article: picked (for which issue and section), later, or not used | `17-newsletter.sql` |
| `images` | pictures uploaded in the newsletter editor | `17-newsletter.sql` |
| `newsletter_templates` | templates and sections the editors saved, to start a newsletter from | `18-editor-mailchimp.sql` |
| `issue_comments` | the editors' comments on a newsletter, each on one block or on the whole email | `18-editor-mailchimp.sql` |
| `mailchimp_files` | which pictures are already in Mailchimp's Content Studio, so each is uploaded once | `18-editor-mailchimp.sql` |

The ones most code touches:

- `sources` is what we monitor. Read the address from here rather than writing
  one into a workflow.
- `items` is one row per article. `source_id` is where we found it and
  `publisher` is who wrote it. Both are needed, because the publisher is the
  attribution printed in the newsletter.
- `author` is often empty. Nothing should depend on it.
- `excerpt` is the publisher's own short description.
- `raw_text` is to be deleted after the retention period, with the link,
  title, publisher and summary kept. The cleanup is DM42-45 and is not built
  yet.
- `created_at` is when an article first arrived. `fetched_at` moves forward
  each time a source sends it again.

A signal must link to at least one article, which a trigger checks at commit,
so write the signal and its links in one statement. There is a worked example
at the bottom of `04-signals.sql`. Running detection again on the same day
updates the existing signal rather than adding a copy.

## Writing data

New articles go in through the ingest API in n8n, never straight into
`items`, so one workflow with a bug cannot fill the shared database. See
`n8n/README.md` and `docs/ingest-api.md`. After that, each workflow writes
only to what it owns, as the Confluence page "Workflow and data conventions"
sets out.

## The client's source list

It is not in this repository, because the repository is public. Ask the team
for `db/client/sources.sql` and load it with:

```bash
docker compose exec -T postgres psql -U dfp -d newsletter < db/client/sources.sql
```

`db/client/` is ignored by git. The client's spreadsheet the list came from
is kept there too.
