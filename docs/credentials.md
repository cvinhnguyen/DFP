# Credentials and access

Jira: DM42-43

The Mailchimp key would reach the association's real member list, and a Drive
connection would reach their files. These are live credentials of a real
organisation handled in a student project, so this page sets out where each
secret lives, who can see it and how the client takes it back.

## Where each secret lives

| Secret | Kept in | Used by |
|---|---|---|
| Postgres password | `.env`, and the n8n credential "DFP Postgres" | every workflow that reads or writes the database |
| Ingest token | `.env` as `INGEST_TOKEN`, and the n8n credential "DFP ingest token" | the ingest API and `POST /webhook/collect` |
| n8n encryption key | `.env` only | n8n, to encrypt its credential store |
| Telegram bot token | `.env` as `TELEGRAM_BOT_TOKEN` | Telegram capture and the collection schedule, see below |
| Mailchimp API key | not requested yet | |
| Google Drive access | not requested yet | |

No secret is typed into a node or a Code node. Workflows refer to credentials
by name and id, and n8n keeps the values encrypted in its own database.
`scripts/n8n-export.sh` checks every workflow file against the secrets in your
`.env` and writes nothing if one turns up. `.env` is in `.gitignore`, and
should be readable only by you:

```bash
chmod 600 .env
```

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

When a server for the client is set up, its editors are agreed with the client
and listed here, and the list stays as short as the work allows.

## Asking the client for a credential

- Ask through the product owner, in line with the team agreement.
- Ask only when the story that needs it starts. Mailchimp waits for the
  draft story in sprint 3 and for DM42-74, which finds a Mailchimp role that can
  create drafts but cannot send. Google Drive waits for the client's decision
  on DM42-75.
- Ask for the smallest access that does the job: a Mailchimp user that cannot
  send, and one Drive folder shared with a service account.
- The credential goes straight into the n8n credential store of the one
  instance that needs it. It is never sent by chat, email or Jira, and never
  written into a file in this repository.

## Handing over

Everything the client gives us stays theirs to take back without asking us.

| Credential | Belongs to | How the client revokes it |
|---|---|---|
| Mailchimp API key | their Mailchimp account | delete the key under API keys in their account settings, then create a new one |
| Google Drive | their Google account | stop sharing the folder with the service account |
| Telegram bot | the team, who created it | the bot is transferred to the client with BotFather's transfer ownership option, and the new owner issues a new token with `/revoke`, which ends our access |
| Ingest token, Postgres password, encryption key | the server | generated new for the client's server, never copied from a laptop |

After handover, every team member deletes the client's credentials from their
own instance.
