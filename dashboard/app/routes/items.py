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
from ..schemas.topics import TagIn
from ..services import issues, items, picks, topics, yso

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
    topic: Annotated[int | None, Query(description="Only articles in this topic")] = None,
    tag: Annotated[int | None, Query(description="Only articles with this tag")] = None,
    untopiced: Annotated[bool, Query(description="Only news no topic took")] = False,
    date_from: Annotated[date | None, Query(alias="from", description="First day, Finnish time")] = None,
    date_to: Annotated[date | None, Query(alias="to", description="Last day, Finnish time")] = None,
    sort: Sort = "collected",
    page: Annotated[int, Query(ge=1, le=10000)] = 1,
    per_page: Annotated[int, Query(ge=1, le=100)] = 25,
    user: User = Depends(current_user),
):
    return items.list_items(view, sort, page, per_page, user.id, q=q, source=source, language=language,
                            signal=signal, section=section, date_from=date_from, date_to=date_to,
                            topic=topic, tag=tag, untopiced=untopiced)


@router.get("/items/{item_id}", response_model=Item, summary="One article")
def get_item(item_id: int, user: User = Depends(current_user)):
    try:
        return items.get_item(item_id, user.id)
    except items.NotFound:
        raise ApiError(404, "no_such_article", "There is no article with that number.")


@router.post("/items/{item_id}/summarise", response_model=Item, summary="Summarise a skipped article anyway",
             responses={409: {"description": "This article cannot be sent to the AI"}})
def summarise_anyway(item_id: int, user: User = Depends(current_user)):
    """Queues a skipped or failed article for the AI. The summarisation
    workflow picks it up on its next run, within 15 minutes."""
    try:
        return items.summarise_anyway(item_id, user.name, user.id)
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


@router.post("/items/{item_id}/seen", status_code=204, summary="The editor opened an article")
def mark_seen(item_id: int, user: User = Depends(current_user)):
    """After this the article is no longer new to this editor. The other
    editors still see it as new until they open it."""
    try:
        items.mark_seen(item_id, user.id)
    except items.NotFound:
        raise ApiError(404, "no_such_article", "There is no article with that number.")


@router.post("/items/{item_id}/tags", response_model=Item, summary="Add a tag to an article",
             responses={422: {"description": "Not a YSO term"}, 502: {"description": "Finto did not answer"}})
def add_tag(item_id: int, body: TagIn, user: User = Depends(current_user)):
    """The term's Finnish name is read from YSO. A tag taken off earlier comes back."""
    try:
        return topics.add_tag(item_id, body.uri, user.id)
    except items.NotFound:
        raise ApiError(404, "no_such_article", "There is no article with that number.")
    except yso.NotATerm:
        raise ApiError(422, "not_a_term", "YSO has no such term.")
    except yso.Unreachable:
        raise ApiError(502, "finto_unreachable", "Finto, where the subject terms come from, did not answer. Try again in a moment.")


@router.delete("/items/{item_id}/tags/{tag_id}", response_model=Item, summary="Take a wrong tag off an article")
def remove_tag(item_id: int, tag_id: int, user: User = Depends(current_user)):
    """The tag stays off: the tagging workflow does not put it back."""
    try:
        return topics.remove_tag(item_id, tag_id, user.id)
    except items.NotFound:
        raise ApiError(404, "no_such_article", "There is no article with that number.")
    except topics.NoSuchTag:
        raise ApiError(404, "no_such_tag", "The article has no such tag.")


@router.get("/filters", response_model=FilterOptions, summary="What the article filters can choose from")
def filter_options():
    return items.filter_options()
