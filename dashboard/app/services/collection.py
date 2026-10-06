"""Collecting is n8n's job. The dashboard asks it to check every source now,
the same as /check in Telegram, or one source from Asetukset → Lähteet,
through the webhook the collection schedule already has. It also works out
when the next scheduled check is.
"""

import json
import urllib.error
import urllib.request
from datetime import timedelta
from zoneinfo import ZoneInfo

from .. import config
from ..queries import overview as queries

HELSINKI = ZoneInfo("Europe/Helsinki")


class CheckProblem(Exception):
    """Says what went wrong, as a code the pages translate and a message in
    English."""

    def __init__(self, code, message, **params):
        super().__init__(message)
        self.code = code
        self.params = params


class CheckRunning(CheckProblem):
    pass


class CheckNotSetUp(CheckProblem):
    pass


class CheckFailed(CheckProblem):
    pass


def next_check(times, now):
    """The next of the editors' check times. collection_times holds times like
    08:00 14:00 in Finnish time, or off."""
    slots = []
    for word in (times or "").split():
        hour, _, minute = word.partition(":")
        if hour.isdigit() and minute.isdigit() and int(hour) < 24 and int(minute) < 60:
            slots.append((int(hour), int(minute)))
    local = now.astimezone(HELSINKI)
    for days in (0, 1):
        day = local + timedelta(days=days)
        for hour, minute in sorted(slots):
            at = day.replace(hour=hour, minute=minute, second=0, microsecond=0)
            if at > local:
                return at
    return None


def start_check(source_id=None):
    """Starts the check of every source, or of the one source, and returns
    at once. The check takes about a minute; collection_runs shows it
    running until it is done."""
    if queries.check_running():
        raise CheckRunning("check_running", "A check is already running.")
    if not config.INGEST_TOKEN:
        raise CheckNotSetUp("check_not_set_up", "Check now is not set up: INGEST_TOKEN is missing from .env.")
    body = json.dumps({"source_id": source_id} if source_id else {}).encode()
    request = urllib.request.Request(
        f"{config.N8N_URL}/webhook/collect", data=body, method="POST",
        headers={"Content-Type": "application/json", "X-Ingest-Token": config.INGEST_TOKEN})
    try:
        with urllib.request.urlopen(request, timeout=10):
            pass
    except urllib.error.HTTPError as e:
        raise CheckFailed("n8n_refused", f"n8n did not start the check (it answered {e.code}). "
                          "Is the collection schedule workflow switched on?", status=e.code)
    except (urllib.error.URLError, OSError):
        raise CheckFailed("n8n_unreachable", "Could not reach n8n. Is it running?")
