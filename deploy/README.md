# Putting the dashboard on the internet

The whole system on one Linux server, as on a laptop, with one difference:
Caddy in front of the dashboard gives it an https address. n8n, PostgreSQL
and the model server stay on the server itself and are never reachable from
outside; only ports 22 (SSH), 80 and 443 are open in the server's firewall.

| File | What it is |
|---|---|
| `docker-compose.public.yml` | adds Caddy, and gives the containers' network a fixed range so the dashboard trusts the proxy's X-Forwarded-For and nobody else's |
| `Caddyfile` | https for `PUBLIC_HOST`, the certificate from Let's Encrypt and renewed by Caddy, everything passed to the dashboard |

## The server

Any Linux server with 4 GB of memory and Docker. For the demo it is an
Azure virtual machine on the Azure for Students subscription: Ubuntu Server
24.04, Standard B2als_v2 (2 vCPUs, 4 GB), a 30 GB Standard SSD, SSH key
login only, in one of the regions that subscription allows (Poland Central,
Italy North, France Central, Switzerland North, Germany West Central). Its
public IP is static and has an Azure DNS name label, which is the public
address. Azure for Students credit pays for it; stopping the server in the
portal when nobody needs it saves most of that.

On the server: Docker and Compose (`docker.io docker-compose-v2`), 2 GB of
swap, the time zone set to Europe/Helsinki, and Ollama listening on
`0.0.0.0:11434` (a systemd override, `OLLAMA_HOST`) so the containers reach
it as `host.docker.internal`. The firewall keeps that port closed to the
outside. Ollama is signed in to the team's Ollama account once
(`ollama signin`, approved in a browser), which is what lets it run the
cloud model in `app_settings`.

## Setting it up

1. Copy the project to the server, without `.git` and the client's files.
   `.env` and `secrets/google-drive.json` go separately, by `scp`, never
   through git. The same `.env` keeps n8n's saved credentials readable
   (`N8N_ENCRYPTION_KEY`).
2. Add to the server's `.env`:

   ```
   COMPOSE_FILE=docker-compose.yml:deploy/docker-compose.public.yml
   PUBLIC_HOST=<the public name>
   COOKIE_SECURE=true
   ALLOWED_HOSTS=localhost,127.0.0.1,dashboard,<the public name>
   FORWARDED_ALLOW_IPS=172.30.0.0/24
   ```

3. Bring the data across: `pg_dump -Fc` of `newsletter` and `n8n` on the
   old machine; on the server start PostgreSQL alone, wait until its first
   start has run `db/init/`, drop and create the two databases, and
   `pg_restore --no-owner` each dump into them. Or start empty and run
   `n8n/rebuild.sh` as on a new laptop.
4. `docker compose up -d --build`. Caddy gets the certificate within a
   minute; `docker compose logs caddy` says "certificate obtained".

Only one copy may run the schedules and the Telegram bot: two copies polling
the same bot split its messages between them, and both would collect,
summarise and send alerts. Stop n8n on the old machine
(`docker compose stop n8n`) before the server's starts.

## Keeping it

- A new version of the code: copy the project again the same way, then
  `docker compose up -d --build`. A change to `db/init/` is run by hand,
  as on any existing database.
- Backups: a cron job at 3.30 every night dumps both databases into
  `~/backups` on the server and keeps the last seven days.
- n8n's editor is not public. Reach it through SSH:
  `ssh -L 5678:127.0.0.1:5678 <server>` and open http://localhost:5678.
