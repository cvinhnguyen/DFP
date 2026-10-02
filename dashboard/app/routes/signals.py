"""Weak signals: topics that keep coming up in the news, with the articles
they came from.
Jira: DM42-40
"""

from fastapi import APIRouter, Query

from ..errors import ApiError
from ..schemas.signals import Signals
from ..services import signals

router = APIRouter(tags=["signals"])


@router.get("/signals", response_model=Signals, summary="Weak signals, with their score, time window and articles")
def recent(days: int = Query(30, ge=1, le=365, description="Signals found in the last this many days")):
    """n8n looks every Monday morning, over the last signal_window_days of
    summarised articles. latest is the day of the newest run."""
    return signals.recent(days)


@router.post("/signals/run", summary="Look for signals now",
             responses={502: {"description": "n8n did not start the run"},
                        503: {"description": "Not set up"}})
def run_now():
    """Starts a run and answers at once. It takes a few minutes; GET
    /api/signals shows the result when it is done."""
    try:
        signals.start_run()
    except signals.RunProblem as e:
        raise ApiError(e.http, e.code, str(e), **e.params)
    return {"started": True}
