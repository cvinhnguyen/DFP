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
| `sources` | the sites, feeds, journals and archives we follow, how each is read, and what the pictures on its pages are (`picture_rights`: own, open, check or none) | `02-schema.sql`, `07`, `11`, `14`, `20`, `28` |
| `items` | one row per article or thesis, with what came of looking for the picture on its page | `02-schema.sql`, `10`, `11`, `20`, `25`, `28` |
| `summaries` | the Finnish summaries, each carrying its source link and publisher, a Finnish title and, for an event, its dates, time, place and deadline | `02-schema.sql`, `12`, `15`, `21` |
| `collection_runs` | one row each time a source is checked, with any error | `02-schema.sql` |
| `filter_runs` | what the filter skipped and the tokens that saved | `11-filter.sql` |
| `signals`, `signal_items` | topics that keep coming up, and the articles behind each | `04-signals.sql` |
| `tags`, `item_tags` | subject tags, terms from YSO, and which article has which, where each came from, and the ones an editor took off | `20-topics.sql` |
| `item_subjects`, `tag_labels` | the subject words a source sent with an article, and which YSO term each word means, so a word is looked up once | `20-topics.sql` |
| `item_tagging` | which summaries Finto AI has read | `20-topics.sql` |
| `topics`, `topic_tags` | what the editors read by: a name, its YSO terms, and whether its theses come to Uudet | `20-topics.sql` |
| `learning_tags` | the terms a thesis also needs before it joins a topic | `20-topics.sql` |
| `item_views` | which articles each editor has opened, so each sees what is new to them | `21-titles-events.sql` |
| `llm_usage` | every AI call: tokens, cost, time | `02-schema.sql`, `03`, `05` |
| `llm_cache` | answers kept so the same text is never paid for twice | `03-llm.sql` |
| `llm_pricing` | token prices per model | `03-llm.sql`, `06` |
| `app_settings` | every setting that is not a secret: the model, the filter, the check times, the Mailchimp data centre and audience, the banners and logo new emails start with (`27-brand.sql`) | `03-llm.sql` and later |
| `users` | the editors. Members never log in, so no member data lives here. | `02-schema.sql`, `15`, `16`, `22` |
| `sessions` | dashboard logins, as hashes of the cookie's token | `15-dashboard.sql` |
| `login_links` | the bot's one-time /login links, as hashes. `invites`, made by the same file, held codes for an /invite command the bot no longer has | `16-telegram-accounts.sql` |
| `password_links` | the one-time links from /adduser and /password, where someone chooses their password, and their email if they have only used Telegram, as hashes | `22-password-links.sql` |
| `alerts` | what the team was told on Telegram: sources that stopped working, workflows that failed, the AI budget, and when each was over | `23-alerts.sql` |
| `ai_budget` (view) | this month's AI spending against `monthly_budget_eur`: warn at 80 %, over when used up | `24-ai-budget.sql` |
| `retention_runs` | a line for each night's cleanup: the articles whose text went after `raw_text_retention_days`, the pictures from their pages that went with it, and the old ones kept because they are in use | `25-retention.sql`, `28` |
| `members` | the association's member organisations from its members page, with their websites, so their articles are suggested for Jäsenkuulumisia; organisations only | `29-members.sql` |
| `archive_issues`, `archive_entries` | the association's past newsletters and the links they chose, imported from their public archive to check the system against (`docs/evaluation.md`) | `26-archive.sql` |
| `issues` | newsletters: drafts and the ones sent, with the editor's design, the finished email, and its draft in Mailchimp | `17-newsletter.sql`, `18` |
| `item_picks` | what the editors decided about each article: picked (for which issue and which of the four sections), later, or not used | `17-newsletter.sql`, `19` |
| `images` | pictures uploaded in the newsletter editor, and each article's picture from its own page, kept with the article's id, whose it is and its credit | `17-newsletter.sql`, `28-article-pictures.sql` |
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
- `raw_text` is deleted after the retention period, with the link, title,
  publisher and summary kept, and so is the picture from the article's page
  (`25-retention.sql`, `28-article-pictures.sql`).
- `created_at` is when an article first arrived. `fetched_at` moves forward
  each time a source sends it again.
- `status` is `on_request` for items from a source whose `filter_mode` is
  `on_request`, Theseus so far: nothing goes to the AI until an editor picks
  the item or asks for its summary. `details` holds what such a source knows
  beyond the shared fields, for a thesis its level, programme and licence.
- Which topics an article is in comes from the `item_topics` view, never
  from code: one of its tags is a term of the topic, and an item from a
  source with `learning_tag_required` also has a learning tag.
- `summaries.version` says which instruction made the summary: 1 the summary
  alone, 2 with the Finnish title and the event details. The summarisation
  workflow makes version 1 summaries again when its queue leaves room.

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
