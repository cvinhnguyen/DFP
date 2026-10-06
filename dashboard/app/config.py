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

# Google Drive (services/drive.py): the service account key the tool reads
# the association's folder with. A file on the server, never in git; see
# secrets/README.md. Without it, Drive stays off.
DRIVE_KEY_FILE = os.environ.get("DRIVE_KEY_FILE", "/srv/secrets/google-drive.json")
# For trying the pages with no Google account: the address of the stand-in
# in tests/fake_drive.py. No key and no token are used with it. Never set it
# for real use.
DRIVE_TEST_SERVER = os.environ.get("DRIVE_TEST_SERVER", "").strip()

# The line for the AI (services/ai_line.py): how many questions the model is
# asked at once, how many more may wait their turn, and for how many seconds.
# A room trying the dashboard at the same moment waits in order instead of
# the model refusing them all.
AI_AT_ONCE = max(1, int(os.environ.get("AI_AT_ONCE", "2")))
AI_LINE_MAX = max(0, int(os.environ.get("AI_LINE_MAX", "30")))
AI_LINE_PATIENCE = max(5, int(os.environ.get("AI_LINE_PATIENCE", "240")))
