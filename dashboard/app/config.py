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
COOKIE_SECURE = os.environ.get("COOKIE_SECURE", "false").lower() == "true"
