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
| `collection-schedule.json` | checks the sources at the times the editors set with /schedule or /reschedule, or straight away with /check or the dashboard's "check now" |
| `eoppimiskeskus-crawler.json` | reads the association's own website |
| `feed-collector.json` | reads RSS feeds and Crossref for the other sources |
| `archive-collector.json` | reads an archive through its DSpace API: Theseus, the theses of the universities of applied sciences |
| `ingest-api.json` | the only way new articles enter the database |
| `summarisation.json` | runs the filter every 15 minutes, then summarises what passed. When the month's AI budget is used up, only what editors asked for. A document from the association's Drive gets the Drive guard's rules for the AI on top of the summary instruction (`docs/drive.md`) |
| `llm-call.json` | the only workflow that talks to an AI model |
| `mailchimp.json` | the only workflow that talks to Mailchimp: creates and updates the dashboard's draft campaigns, and never sends |
| `signal-detection.json` | finds topics that keep coming up in the news, every Monday at 6.00 (see Missed times below), or now from the dashboard's "Hae signaalit nyt" (`POST /webhook/signals`). Paused when the month's AI budget is used up |
| `writing-help.json` | writes for the editors when they ask, through the LLM call: subject lines and preview texts, the greeting, why a trend matters, and answers to questions about the articles, a follow-up first written out whole (`POST /webhook/writing`) |
| `tagging.json` | gives every article subject tags from YSO, every 15 minutes, five minutes after each round of summaries (at 5, 20, 35 and 50 past the hour), so a new summary has its tags a few minutes later: Finto AI reads each summary, and the theses' own terms and the signal words are matched to YSO |
| `telegram-capture.json` | the editors' bot: saves links, answers /check, /schedule, /reschedule and /help, and passes /login, /password, /adduser, /people, /remove and /alerts to the dashboard. It answers in Finnish when the person's Telegram is in Finnish, and in English otherwise |
| `bot-commands.json` | the list Telegram suggests when someone types / to the bot, as BotFather's /setcommands would set it: the everyday commands for everyone, and the admin commands too in each admin's own chat. Every morning at 5.00, or Run now after a change |
| `alerts.json` | tells the team on Telegram when something breaks: a source whose last two checks failed or found nothing, or a workflow that stopped with an error. Once when it breaks, and once when a source works again; also 80 % of the AI budget, and a budget used up. /alerts in the bot says where. The workflows that run on their own name it as their error workflow |
| `retention.json` | every night at 3.30 (see Missed times below), takes away the text of articles collected longer ago than `raw_text_retention_days` (90), and the pictures from their pages, except what a newsletter or an editor still has, and old answers from the AI's cache |
| `article-pictures.json` | every 15 minutes, five minutes after each round of summaries like the tagging, finds the picture on ten summarised articles' pages, downloads it and hands it to the dashboard (`POST /api/items/{id}/picture`) |
| `members.json` | every Monday at 5.30 (see Missed times below), reads the association's members page for its member organisations and their websites, so their articles are suggested for Jäsenkuulumisia |
| `drive.json` | every 15 minutes, at 10, 25, 40 and 55 past the hour, five minutes before each round of summaries, asks the dashboard to read the association's Drive folder: new and changed documents become articles of the source Google Drive, the articles of documents that left the folder are taken out, and sent newsletters are saved there when that is switched on (`POST /api/drive/refresh`). The dashboard holds the Google key and the guard that keeps the tool in that folder; nothing to do while Drive is off (`docs/drive.md`) |
| `archive.json` | every Monday at 6.15 (see Missed times below), asks the dashboard to bring in the newsletters sent since from the association's public archive in Mailchimp, to compare with what the system found (`POST /api/archive/refresh`) |

`ingest-api.json` is the write path for collected items: `POST
/webhook/ingest` with a batch, and it answers accepted or rejected for each
item. Workflows post there rather than writing to `items` directly, so one
workflow with a bug cannot fill the shared database. See
`docs/ingest-api.md`.

`summarisation.json` asks for three things in one call, as JSON: the title
in Finnish, the summary (Mikko's instruction, word for word, DM42-71), and
for an event its dates, time, place and the last day to sign up (DM42-8). A
date the article does not give stays empty. When the queue leaves room, each
run also makes again up to 20 summaries made before this, newest first; those
articles stay summarised meanwhile and nobody is told about them on Telegram
again. The Telegram bot still writes its quick summary with the instruction
alone, and the next run adds the title and the event details.

`llm-call.json` caps how much a model may write, using
`llm_max_output_tokens` in `app_settings`. When a model stops because it ran
out of room rather than because it finished, the call comes back with
`truncated: true` and the answer is not cached, because caching half a
sentence would hand the same half sentence to every later caller.
`llm_usage` records it too, so we can see whether the cap is set too low
instead of guessing. A caller that sends `json: true` gets an answer the
model server keeps to JSON, which is how the summarisation gets its fields.

`telegram-capture.json` lets an editor send a link to @DFP_Mazhar4_bot and
have it join the same pipeline as crawled content. It asks Telegram for new
messages every 20 seconds rather than Telegram calling us, so no tunnel and no
public address are needed. A poll that works is not kept in n8n's history,
only one that fails (see Run history below). Only Telegram ids listed in `users.telegram_user_id` are
accepted; anyone else is refused and told their own id, which is how they
get on the list (`python -m app.cli.users telegram`). Where the page cannot be read,
and LinkedIn almost never can, the bot uses the words the editor typed as the
title. Set `TELEGRAM_BOT_TOKEN` in `.env`.

The bot writes in the person's Telegram language: Finnish when their
Telegram is in Finnish, English otherwise. That covers its answers, the
/check result, a summary it sends later and the command menus. n8n
remembers each team member's language in `telegram_languages` in
`app_settings`. Alerts to the team stay in English.

Accounts live in the dashboard, so the bot only passes the account commands
on: /login, /password, /adduser, /people, /remove and /alerts. The dashboard
decides who may do what and says what to answer: a message, with a button
that opens a link. Telegram only takes a button to an https address, so
while the dashboard runs at http://localhost the address goes in the text
instead, and "Reply on Telegram" does the same if Telegram turns a button
down. See `dashboard/README.md`.

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

`archive-collector.json` reads Theseus through its public DSpace API, newest
arrivals first, from a day before the newest thesis already stored (a week
back the first time). It sends each record's title, the Finnish abstract
when there is one, the university, the author's YSO terms, and the level,
degree programme and licence, through the ingest API like every collector.
The thesis file is never fetched. Around 45 theses arrive each weekday, so
they do not go to the AI on their own: the source's `filter_mode` is
`on_request`, and a thesis is summarised when an editor picks it.

`tagging.json` writes `tags`, `tag_labels`, `item_tags` and `item_tagging`.
It asks two public services of the National Library of Finland, one call at
a time as they ask: Finto's search, to match a source's subject word to a
YSO term (an English thesis's educational technology is opetusteknologia),
and Finto AI, which suggests YSO terms for a Finnish summary. Suggestions
scoring below `tagging_min_score` in `app_settings` are not kept. Only the
title and our own summary are sent, never an article. When Finto does not
answer, the run stops and the next one carries on. Neither service needs a
key.

`signal-detection.json` fills `signals` and `signal_items`. It asks the model,
per article, whether the article points at something new or growing, and
keeps only the ones it says yes to. Articles that name the same topic become
one signal carrying all of them, which is what makes "this came up in six
articles" visible. How far back it reads is `signal_window_days` in
`app_settings`, 30 days. Jira: DM42-40.

What goes in and what comes out, so the detection step can change without
the rest noticing:

- In, one per article: the articles of the window that have a summary in
  Finnish (`item_id`, `title`, `published_at`, and the summary as `body`).
  The model reads the summary rather than the article, so every article is
  read the same way whatever its language, and the AI's cache answers for an
  article it has read before. Theses nobody asked for have no summary and
  stay out. Fewer than five articles and nothing is asked.
- The model answers with JSON only:
  `{"is_signal": true, "topic": "tekoäly", "reason": "<one sentence in Finnish>", "score": 0.8}`.
  The call goes through `llm-call.json`, so its cost is in `llm_usage` with
  everything else, as `signal_detection`.
- Out: one row in `signals` per topic (topic, reason from the article that
  scored highest, score, the window as `period_start` and `period_end`), and
  a row in `signal_items` for each article it came from. The dashboard reads
  them through `GET /api/signals`.

`article-pictures.json` brings each summarised article's own picture to
the dashboard, for Artikkelit and as the picture its newsletter entry starts
with. Every 15 minutes it takes ten articles nobody has looked at yet,
newest first, from the sources whose `picture_rights` is not `none`. For
each it reads the page for `og:image` (or `twitter:image`, or the featured
image of a WordPress site such as the association's), downloads the picture
with the bot's user agent, and posts it to the dashboard with the ingest
token, one at a time, so the dashboard notices a logo several articles
share. A page with no picture is marked `none`, and a page or picture that
cannot be read `failed`; neither is tried again. A login or bot wall is not
the article's page and counts as no picture. Jira: DM42-37, DM42-31.

- In (to the dashboard): `{"url": "...", "alt": "..." | null, "data":
  "<base64>"}`, at most 10 MB.
- Out: `{"status": "stored" | "generic" | "small" | "failed" | "none"}`; the
  dashboard has marked the article either way.
- A picture passes through as base64, so the workflow keeps no data of a
  successful run (`saveDataSuccessExecution: none`): n8n's database would
  fill with pictures. A failed run is kept, with each article's error.
- Run now in the editor takes the next ten; the articles collected before it
  existed get their pictures that way, or over a few hours on their own.

`members.json` reads the association's page of community members
(`members_page_url` in `app_settings`) every Monday, or now with Run now. It
takes the links under its two headings, päättävät and kannattavat
yhteisöjäsenet, as each member's name and website, and hands them to
`sync_members()` (`db/init/29-members.sql`): new ones are added, the rest
kept up to date, and one no longer on the page marked as no longer listed.
A page that gives fewer than five, as a changed layout would, stops the run
with an error, and the team hears of it, rather than every member leaving.
Only organisations are read: the association's individual members are on
another page and are personal data. Jira: DM42-32.

`writing-help.json` writes for the editors when they press a button in the
dashboard: subject lines and preview texts, a draft of the greeting, a
draft of why a trend matters, and the answer to a question asked on
Kysy artikkeleilta. The dashboard sends the material, `POST
/webhook/writing` with the ingest token, and waits for the answer; the
prompts are in "Build prompt", in Finnish, and say to use nothing the
material does not have. Jira: DM42-25, DM42-37, DM42-40.

- In: `{"task": "subject" | "greeting" | "trend" | "ask" | "standalone", "attempt": 1, ...}`.
  For the first two, `newsletter` (its name) and `articles`, the picked ones
  in section order with `section`, `title`, `publisher`, `event` and a
  shortened `summary`. For a trend, `topic`, `count`, `days` and up to six
  `articles`. For a question, `question` and up to eight `articles` with
  `title`, `publisher`, `date` and `summary`; the answer cites them as [1],
  [2] in that order. For a follow-up, `question` with `previous_question`,
  `previous_answer` and `previous_titles`, and no articles: the answer is
  the follow-up written out whole, or the question as it is when it stands
  on its own, which the dashboard then asks as an ordinary question.
  An `attempt` above 1 asks for other words, which also gets past the cache.
- Out, always answered: `{"ok": true, "subjects": [...], "preheaders":
  [...]}` or `{"ok": true, "text": "..."}`, with `tokens`, `cost_eur` and
  `truncated`; or `{"ok": false, "code": "ai_failed", "message": "..."}`
  when the model does not answer, so a model that is down does not alert the
  team on every press of the button.
- The call goes through `llm-call.json` as `writing-subject`,
  `writing-greeting`, `writing-trend` or `writing-ask`.

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

### Missed times

n8n runs on the computer it is installed on, and a sleeping laptop runs
nothing. A schedule that passes while it sleeps is not made up by n8n itself,
so the workflows that run at a set time (members, signal detection and the
archive on Monday mornings, retention at night, the bot's command list in
the morning) fire every hour instead, and their first node, Due, lets a run
through only when the planned time has passed since the last run that the
database remembers: `members.last_seen`, `signals_run_at`,
`newsletter_archive_read_at`, `retention_runs` and `bot_commands_set_at`. A
run from the dashboard ("Hae signaalit nyt", "Tuo uudet nyt") or Run now
counts as a run. So a Monday spent asleep until ten gets its signals within
the hour after the computer wakes, and only once. A members, archive or
retention run that fails is tried again the next hour, and Alerts tells the
team; signal detection and the menus count from when a run starts, so one
that fails waits for the next planned time. `signals_run_at` and
`bot_commands_set_at` are made in `app_settings` by their first run. The
collection and the 15-minute workflows catch up on their own: they look at
what is waiting each time they run.

### Run history

n8n keeps 10,000 runs. The Telegram poll runs every 20 seconds, so it saves
only the runs that fail (Settings, Save successful production executions: Do
not save), as the article pictures workflow does. The other workflows save
about 500 runs a day, the hourly checks above included, so a failure stays in
n8n's list of runs for about three weeks rather than a few days.

### Run data

n8n stores the full payload of every run, including article text, and prunes
it after 30 days (`N8N_EXECUTION_RETENTION_HOURS` in `.env`). That makes it a
retention setting rather than only housekeeping: keep it no longer than
`raw_text_retention_days`, or n8n would hold the text the nightly cleanup
takes out of the database.

### Errors

A workflow that runs on its own, from a schedule, names Alerts as its error
workflow (Settings, Error workflow), so its failures reach the team on
Telegram. The collectors and the LLM call do not need to: their failures
reach the workflow that called them, and a source that fails is reported by
the source check in Alerts. A workflow that contains an Error Trigger, as
Alerts does, is its own error workflow, which n8n runs once and not again for
a failure of that run.
