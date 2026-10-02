"""How long the text of collected articles is kept. The cleanup itself runs
in n8n every night (n8n/workflows/retention.json).
Jira: DM42-45
"""

from fastapi import APIRouter, Depends

from ..dependencies import admin_only
from ..queries import retention
from ..schemas.retention import Retention, RetentionChange

router = APIRouter(tags=["retention"])


@router.get("/retention", response_model=Retention, summary="How long article text is kept, and what went")
def state():
    """After the period an article keeps its link, title, publisher and
    summary. One in a newsletter or kept for later stays whole."""
    return retention.state()


@router.put("/retention", response_model=Retention, summary="Change how long article text is kept (admins)",
            dependencies=[Depends(admin_only)])
def change(body: RetentionChange):
    retention.set_days(body.days)
    return retention.state()
