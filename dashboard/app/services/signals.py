"""Weak signals. Finding them is n8n's job, every Monday morning; the
dashboard lists what it found and can ask it to look now.
Jira: DM42-40
"""

import urllib.error
import urllib.request

from .. import config
from ..queries import signals as queries
from ..schemas.signals import Signals


class RunProblem(Exception):
    """Says what went wrong, as a code the pages translate and a message in
    English."""

    def __init__(self, code, message, http=503, **params):
        super().__init__(message)
        self.code = code
        self.http = http
        self.params = params


def recent(days=30):
    found = queries.recent(days)
    return Signals(latest=max((s["detected_on"] for s in found), default=None), signals=found)


def start_run():
    """Asks n8n to look for signals now and returns at once. A run reads every
    summarised article of the window, which takes a few minutes."""
    if not config.INGEST_TOKEN:
        raise RunProblem("signals_not_set_up", "Looking for signals now is not set up: INGEST_TOKEN is missing from .env.")
    request = urllib.request.Request(
        f"{config.N8N_URL}/webhook/signals", data=b"{}", method="POST",
        headers={"Content-Type": "application/json", "X-Ingest-Token": config.INGEST_TOKEN})
    try:
        with urllib.request.urlopen(request, timeout=10):
            pass
    except urllib.error.HTTPError as e:
        raise RunProblem("signals_refused", f"n8n did not start looking for signals (it answered {e.code}). "
                         "Is the signal detection workflow switched on?", http=502, status=e.code)
    except (urllib.error.URLError, OSError):
        raise RunProblem("n8n_unreachable", "Could not reach n8n. Is it running?", http=502)
