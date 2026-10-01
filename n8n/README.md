# n8n: collecting, summarising, the Telegram bot and Mailchimp

The automation runs in n8n. Every workflow is a JSON file in `workflows/`, so
changes are reviewed in git like code and a new instance is rebuilt from these
files.

Who owns each workflow, how they are named and which tables each one may write
to is on the Confluence page "Workflow and data conventions" (DM42-41).

| File | What it is |
|---|---|
| `workflows/` | one JSON file per workflow |
| `export.sh` | saves your n8n's workflows into `workflows/`, after checking them |
| `tidy.js` | the checks `export.sh` runs, inside the n8n container |
| `rebuild.sh` | builds a new n8n from `workflows/` |

## The workflows

| Workflow | What it does |
|---|---|
| `collection-schedule.json` | checks the sources at the times the editors set with /schedule, or straight away with /check or the dashboard's "check now" |
| `eoppimiskeskus-crawler.json` | reads the association's own website |
| `feed-collector.json` | reads RSS feeds and Crossref for the other sources |
| `ingest-api.json` | the only way new articles enter the database |
| `summarisation.json` | runs the filter every 15 minutes, then summarises what passed |
| `llm-call.json` | the only workflow that talks to an AI model |
| `mailchimp.json` | the only workflow that talks to Mailchimp: creates and updates the dashboard's draft campaigns, and never sends |
| `signal-detection.json` | finds topics that keep coming up. Run by hand for now. |
| `telegram-capture.json` | the editors' bot: saves links, answers /check, /schedule and /help, and passes /login, /invite, /people and /remove to the dashboard |

`ingest-api.json` is the write path for collected items: `POST
/webhook/ingest` with a batch, and it answers accepted or rejected for each
item. Workflows post there rather than writing to `items` directly, so one
workflow with a bug cannot fill the shared database. See
`docs/ingest-api.md`.

`llm-call.json` caps how much a model may write, using
`llm_max_output_tokens` in `app_settings`. When a model stops because it ran
out of room rather than because it finished, the call comes back with
`truncated: true` and the answer is not cached, because caching half a
sentence would hand the same half sentence to every later caller.
`llm_usage` records it too, so we can see whether the cap is set too low
instead of guessing.

`telegram-capture.json` lets an editor send a link to @DFP_Mazhar4_bot and
have it join the same pipeline as crawled content. It asks Telegram for new
messages once a minute rather than Telegram calling us, so no tunnel and no
public address are needed. Only Telegram ids listed in
`users.telegram_user_id` are accepted; anyone else is refused and told their
own id, which is how a new editor gets added. Where the page cannot be read,
and LinkedIn almost never can, the bot uses the words the editor typed as the
title. Set `TELEGRAM_BOT_TOKEN` in `.env`.

Accounts live in the dashboard, so the bot only passes the account commands
on: /login, /invite, /people, /remove, and the /start that opening an invite
link sends. The dashboard decides who may do what and says what to answer,
and the bot sends that back. See `dashboard/README.md`.

`mailchimp.json` is how the dashboard reaches Mailchimp, through `POST
/webhook/mailchimp` with the ingest token. It knows five requests:

| Request | What it does in Mailchimp |
|---|---|
| `account` | checks the key, and lists the account's audiences |
| `upload` | puts one picture into Content Studio, so the email can show it |
| `draft` | creates the newsletter's draft campaign, or updates the one made before: subject line, preview text, sender, audience and the email's HTML |
| `status` | reads whether a draft is still a draft, scheduled or sent |
| `test` | sends a test of a draft to the addresses an editor typed |

There is no request that sends or schedules a campaign, and any other request
is refused. A draft that has been sent or scheduled is not changed again; one
deleted in Mailchimp is made again on the next export. The key is the
credential "DFP Mailchimp". Without it, every request answers that the key is
missing, and the dashboard says so. See `docs/credentials.md` for why the key
cannot be limited to drafts inside Mailchimp, and what limits it instead.

`signal-detection.json` fills `signals` and `signal_items`. It asks the model,
per article, whether the article points at something new or growing, and
keeps only the ones it says yes to. Articles that name the same topic become
one signal carrying all of them, which is what makes "this came up in six
articles" visible. How far back it reads is `signal_window_days` in
`app_settings`.

## Saving your workflow changes

n8n keeps workflows in its own database, so a change made in the editor is
not in git until you export it. After changing a workflow:

```bash
./n8n/export.sh               # writes n8n/workflows/*.json from your n8n
git diff n8n/workflows/       # check it is the change you meant
```

Then commit as usual. The export refuses to write anything if a password or
token from your `.env` appears in a workflow, or if a workflow calls a
sub-workflow that is not in the repository. It also drops pinned test data,
which can hold real articles or Telegram messages.

Workflows call each other by id, and the ids in `n8n/workflows/` are the ones
everybody uses. If you build a new workflow, export it and commit it before
another workflow starts calling it.

## Rebuilding

`./n8n/rebuild.sh` builds the n8n side of a new instance: it creates the
credentials from `.env`, imports every workflow and switches on the ones that
were on when they were exported. The Mailchimp key is optional: with
`MAILCHIMP_API_KEY` empty, a "DFP Mailchimp" credential already in n8n is kept,
and a new n8n gets an empty one to fill in. It is meant for a new, empty n8n. On one
that already has these workflows it overwrites them with the repository's
copy.

## Notes

The n8n image is pinned to 2.38.1, the version this setup was tested against.

n8n stores the full payload of every run, including article text, and prunes
it after 30 days (`N8N_EXECUTION_RETENTION_HOURS` in `.env`). That makes it a
retention setting rather than only housekeeping.
