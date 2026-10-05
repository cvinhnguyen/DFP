# Credentials and access

Jira: DM42-43

The Mailchimp key would reach the association's real member list, and a Drive
connection would reach their files. These are live credentials of a real
organisation handled in a student project, so this page sets out where each
secret lives, who can see it and how the client takes it back.

## Where each secret lives

| Secret | Kept in | Used by |
|---|---|---|
| Postgres password | `.env`, and the n8n credential "DFP Postgres" | every workflow that reads or writes the database, and the dashboard |
| Ingest token | `.env` as `INGEST_TOKEN`, and the n8n credential "DFP ingest token" | the ingest API, `POST /webhook/collect`, and the dashboard's "check now" button |
| n8n encryption key | `.env` only | n8n, to encrypt its credential store |
| Telegram bot token | `.env` as `TELEGRAM_BOT_TOKEN` | Telegram capture and the collection schedule, see below |
| Dashboard passwords | `users.password_hash`, as Argon2 hashes only | logging in to the dashboard |
| Dashboard logins | `sessions`, as hashes of the cookie's token only | staying logged in, 12 hours by default |
| Login links and password links | `login_links` and `password_links`, as hashes only | the bot's /login, /adduser and /password; each works once and expires |
| Mailchimp API key | the n8n credential "DFP Mailchimp", and `.env` as `MAILCHIMP_API_KEY` if you want `n8n/rebuild.sh` to create it | the Mailchimp workflow only, see below |
| Google Drive key | `secrets/google-drive.json` on the server, never in git, read only by the dashboard | the dashboard's Drive guard only, see below and `docs/drive.md` |

No secret is typed into a node or a Code node. Workflows refer to credentials
by name and id, and n8n keeps the values encrypted in its own database.
`n8n/export.sh` checks every workflow file against the secrets in your
`.env` and writes nothing if one turns up. `.env` is in `.gitignore`, and
should be readable only by you:

```bash
chmod 600 .env
```

## Mailchimp: drafts only

The editors want the tool to put a finished newsletter into Mailchimp as a
draft, which they check and send themselves. The dashboard never sends.

Mailchimp cannot enforce that for us. An API key can do whatever the user who
made it can do, and only users at Manager level or above can make one
([About API Keys](https://mailchimp.com/help/about-api-keys/)). Managers can
send ([user levels](https://mailchimp.com/help/manage-user-levels-in-your-account/)).
An Author can create emails but cannot send, and cannot make a key. So no
Mailchimp key is limited to drafts, and that part of DM42-74 has no answer
inside Mailchimp.

The limit is in our own setup instead:

- The key is kept in n8n's credential store, and in `.env` only when
  `n8n/rebuild.sh` is to create that credential. The dashboard never sees
  it: it asks n8n through `POST /webhook/mailchimp` with the ingest token.
- That workflow, `n8n/workflows/mailchimp.json`, knows five requests: check
  the account, upload a picture, create or update a draft, read a draft's
  status, and send a test to addresses an editor types. It has no step that
  sends or schedules a campaign, and it refuses any other request.
- The dashboard asks it to change only the drafts it made itself, and the
  workflow refuses to change a campaign that is sent or scheduled.
- n8n's editor is reachable only on the machine it runs on, so nobody else
  can add a send step.

The key still reads what a Manager can read, member list included, so it is
handled like the other live credentials here. A Mailchimp user made just for
the tool, at Manager level, keeps the key apart from anyone's own login and
can be removed in one step. It takes one of the plan's user seats, so the
client decides.

## Google Drive: one folder

The association shares one Drive folder with the tool, for the newsletter's
material and its finished newsletters (`docs/drive.md`). The tool reaches it
as a Google service account, a Google identity made for the tool alone, with
a JSON key.

Unlike the Mailchimp key, this one is held by the dashboard rather than n8n:
the guard that keeps the tool in that one folder has to sit next to the key,
and the guard is the part that must be right, so it is Python with tests
(`dashboard/app/services/drive.py`). n8n only asks it to read the folder
every hour. The dashboard reads the key from `secrets/`, mounted read-only,
and nothing else in the dashboard can reach it.

What the key can do is decided by Google, not by us: the account sees only
what the association shares with it. Shared as recommended, that is reading
one folder and adding files to one folder inside it, so even a stolen key
could not change or delete the association's own files. Never turn on
domain-wide delegation for the account, which would let it act as people in
the association. To take the access back, stop sharing the folder, or
delete the key in Google Cloud.

## The exception: the Telegram token

Telegram puts the bot token in the address of every request,
`https://api.telegram.org/bot<token>/getUpdates`. An n8n credential can add a
header or a query parameter to a request but cannot put a value into the path.
n8n's own Telegram node does use the credential store, but it cannot fetch new
messages, and fetching them is how the bot works without a public address. So
the workflows read the token from the environment as `$env.TELEGRAM_BOT_TOKEN`.

That needs `N8N_BLOCK_ENV_ACCESS_IN_NODE=false` in `docker-compose.yml`, and the
cost is real: any workflow on the instance can read every environment
variable, including the database password and the encryption key. We accept it
while each of us runs our own n8n and is its only user. It would be wrong on a
shared server.

When the tool moves to a server for the client, that server has a public https
address. The capture then switches to n8n's Telegram Trigger and Telegram
node, which both take the token from the credential store, and environment
access is blocked again.

## Who has editor access

Each developer runs their own n8n on their own laptop. Its ports are bound to
127.0.0.1, so nobody else can reach it, and the only editor is the person whose
laptop it is. There is no shared instance during development.

The bot token is held only on the backend developer's instance. The bot
accepts messages only from Telegram ids listed in `users.telegram_user_id` and
refuses everyone else.

The dashboard has no sign-up page. An admin adds people with /adduser in
the bot, and each person chooses their own password on a page in the
dashboard that the bot links to, so no password passes through Telegram.
Someone on the bot's list can also log in with a one-time link from /login.
The first admin is made with `python -m app.cli.users`, as
`dashboard/README.md` shows.

The shared demo login, the account whose email is `demo_email` in
`app_settings`, has its password shown to a room of people. It cannot send
anything to Mailchimp or delete anything, and it is removed with /remove
after the presentation.

When a server for the client is set up, its editors are agreed with the client
and listed here, and the list stays as short as the work allows.

## Asking the client for a credential

- Ask through the product owner, in line with the team agreement.
- Ask only when the story that needs it starts. The Mailchimp draft
  workflow is built and tested against a trial account of the team's own, so
  the client's key waits until they have agreed to the arrangement above.
  Google Drive waits for the client's decision on DM42-75.
- Ask for the smallest access that does the job: a Mailchimp key from a
  Manager-level user, the lowest level Mailchimp gives a key to, and one
  Drive folder shared with a service account.
- The credential goes straight into the n8n credential store of the one
  instance that needs it. It is never sent by chat, email or Jira, and never
  written into a file in this repository.

## Handing over

Everything the client gives us stays theirs to take back without asking us.

| Credential | Belongs to | How the client revokes it |
|---|---|---|
| Mailchimp API key | their Mailchimp account | delete the key under API keys in their account settings, then create a new one, or remove the user made for the tool |
| Google Drive | their Google account | stop sharing the folder with the service account |
| Telegram bot | the team, who created it | the bot is transferred to the client with BotFather's transfer ownership option, and the new owner issues a new token with `/revoke`, which ends our access |
| Ingest token, Postgres password, encryption key | the server | generated new for the client's server, never copied from a laptop |
| Dashboard accounts | the server | the team's own accounts are removed with `python -m app.cli.users remove`, and the editors keep theirs |

After handover, every team member deletes the client's credentials from their
own instance.
