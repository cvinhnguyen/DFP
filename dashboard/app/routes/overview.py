"""The status line, and "check now".
Jira: DM42-80
"""

from fastapi import APIRouter

from ..errors import ApiError
from ..schemas.overview import Overview
from ..services import collection
from ..services import overview as status

router = APIRouter(tags=["overview"])


@router.get("/overview", response_model=Overview, summary="The state of collecting and summarising")
def overview():
    return status.overview()


@router.post("/collect", summary="Check every source now",
             responses={409: {"description": "A check is already running"},
                        502: {"description": "n8n did not start the check"},
                        503: {"description": "Check now is not set up"}})
def check_now():
    """Starts the collection schedule's check of every active source and
    answers at once. The check takes about a minute. Follow it with
    GET /api/overview, where checking_now turns false when it is done."""
    try:
        collection.start_check()
    except collection.CheckRunning as e:
        raise ApiError(409, e.code, str(e), **e.params)
    except collection.CheckNotSetUp as e:
        raise ApiError(503, e.code, str(e), **e.params)
    except collection.CheckFailed as e:
        raise ApiError(502, e.code, str(e), **e.params)
    return {"started": True}
