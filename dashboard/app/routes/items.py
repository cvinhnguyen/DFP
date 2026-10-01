"""The article endpoints. They read the request and turn the services'
answers and errors into HTTP; the rules live in services/items.py and the SQL
in queries/items.py.
Jira: DM42-31
"""

from datetime import date
from typing import Annotated

from fastapi import APIRouter, Depends, Query

from ..dependencies import current_user
from ..errors import ApiError
from ..schemas.auth import User
from ..schemas.issues import DecisionIn
from ..schemas.items import FilterOptions, Item, ItemPage, Section, Sort, View
from ..services import issues, items, picks

router = APIRouter(tags=["articles"])


@router.get("/items", response_model=ItemPage, summary="List, search and filter articles")
def list_items(
    view: View = "review",
    q: Annotated[str | None, Query(max_length=200, description="Words to search for")] = None,
    source: int | None = None,
    language: Annotated[str | None, Query(pattern="^([a-z]{2,3}|unknown)$",
                                          description="fi, en, no, or unknown")] = None,
    signal: int | None = None,
    section: Section | None = None,
    date_from: Annotated[date | None, Query(alias="from", description="First day, Finnish time")] = None,
    date_to: Annotated[date | None, Query(alias="to", description="Last day, Finnish time")] = None,
    sort: Sort = "collected",
    page: Annotated[int, Query(ge=1, le=10000)] = 1,
    per_page: Annotated[int, Query(ge=1, le=100)] = 25,
):
    return items.list_items(view, sort, page, per_page, q=q, source=source, language=language,
                            signal=signal, section=section, date_from=date_from, date_to=date_to)


@router.get("/items/{item_id}", response_model=Item, summary="One article")
def get_item(item_id: int):
    try:
        return items.get_item(item_id)
    except items.NotFound:
        raise ApiError(404, "no_such_article", "There is no article with that number.")


@router.post("/items/{item_id}/summarise", response_model=Item, summary="Summarise a skipped article anyway",
             responses={409: {"description": "This article cannot be sent to the AI"}})
def summarise_anyway(item_id: int, user: User = Depends(current_user)):
    """Queues a skipped or failed article for the AI. The summarisation
    workflow picks it up on its next run, within 15 minutes."""
    try:
        return items.summarise_anyway(item_id, user.name)
    except items.NotFound:
        raise ApiError(404, "no_such_article", "There is no article with that number.")
    except items.CannotSummarise as e:
        raise ApiError(409, e.code, str(e), **e.params)


@router.put("/items/{item_id}/decision", response_model=Item, summary="Pick an article for the newsletter, keep it for later, or not use it",
            responses={409: {"description": "It went out in a newsletter already"}})
def decide(item_id: int, body: DecisionIn, user: User = Depends(current_user)):
    """A picked article goes into the newsletter being prepared, or the draft
    named by issue_id, in the given section. A decision of null takes the
    earlier one back."""
    try:
        return picks.decide(item_id, body.decision, body.section, user, body.issue_id)
    except items.NotFound:
        raise ApiError(404, "no_such_article", "There is no article with that number.")
    except picks.NeedSection:
        raise ApiError(422, "section_needed", "Say which section of the newsletter the article goes in.")
    except picks.NotADraft:
        raise ApiError(409, "issue_sent", "That newsletter has been sent, so nothing more goes into it.")
    except issues.NotFound:
        raise ApiError(404, "no_such_issue", "There is no newsletter with that number.")
    except picks.AlreadyUsed as e:
        raise ApiError(409, "already_used", str(e), issue=e.issue_name)


@router.get("/filters", response_model=FilterOptions, summary="What the article filters can choose from")
def filter_options():
    return items.filter_options()
