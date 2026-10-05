"""Everything the dashboard reads from its environment, in one place.
docker-compose.yml sets these from .env.

The database connection is not here. psycopg reads PGHOST, PGUSER,
PGPASSWORD and PGDATABASE itself, so the password never passes through this
code.
"""

import os

# Where n8n is, for "check now", and the token its webhook asks for.
N8N_URL = os.environ.get("N8N_URL", "http://n8n:5678").rstrip("/")
INGEST_TOKEN = os.environ.get("INGEST_TOKEN", "")

# Only once the dashboard is served over https. A secure cookie is never sent
# over plain http, so turning this on for localhost makes logging in impossible.
# It also tells browsers to use https only (middleware.py).
COOKIE_SECURE = os.environ.get("COOKIE_SECURE", "false").lower() == "true"

# The names the dashboard answers to, comma separated. localhost and
# 127.0.0.1 are the browser on this computer, and dashboard is how n8n
# reaches it inside Docker. Add the public name once it is hosted, such as
# uutiskirje.example.fi, or *.example.fi for every name under one. A request
# for any other name is refused (middleware.py); * alone switches the check off.
ALLOWED_HOSTS = tuple(name.strip().lower()
                      for name in (os.environ.get("ALLOWED_HOSTS") or "localhost,127.0.0.1,dashboard").split(",")
                      if name.strip())
