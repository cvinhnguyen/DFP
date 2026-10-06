"""Asetukset → Lähteet, for admins: every source and how it is doing, adding
one from its address, changing, switching off, checking or deleting one,
and the sites worth adding. n8n reads a watched page through the dashboard
with its token (n8n/workflows/page-watcher.json).
Jira: DM42-29, DM42-36, DM42-47

A source's section and pictures keep their own endpoints, which do more
than change one column: PUT /api/sources/{id}/section and
PUT /api/sources/{id}/pictures.
"""

from typing import Annotated

from fastapi import APIRouter, Depends, Path, Response

from ..dependencies import admin_only, n8n_only
from ..errors import ApiError
from ..schemas.auth import User
from ..schemas.sources import (Dismissed, LookupIn, LookupOut, SourceDetail, SourceIn, SourceList, SourceUpdate,
                               SuggestionList, WatchResult)
from ..services import collection, sources

router = APIRouter(tags=["sources"], dependencies=[Depends(admin_only)])
# n8n's collection schedule, for a watched page, with its token.
token_router = APIRouter(tags=["sources"])

NOT_FOUND = (404, "no_such_source", "There is no source with that number.")
Host = Annotated[str, Path(pattern=r"^[a-z0-9.-]{3,253}$", description="A site, example.fi")]


def _problem(e):
    return ApiError(e.status, e.code, str(e), **e.params)


@router.get("/sources", response_model=SourceList, summary="Every source and how it is doing")
def listing():
    return sources.listing()


@router.get("/sources/suggestions", response_model=SuggestionList,
            summary="Sites the past newsletters linked to, and member organisations, that no source reads")
def suggestions():
    """The sites are looked at for a feed in the background when they have
    not been for two weeks; looking says so, and the page hears each result."""
    return sources.suggestions()


@router.post("/sources/suggestions/look", response_model=SuggestionList, summary="Look at every suggested site again now")
def look_again():
    return sources.look_again()


@router.put("/sources/suggestions/{host}", status_code=204, summary="Say no to a suggested site, or take the no back")
def dismiss(host: Host, body: Dismissed, user: User = Depends(admin_only)):
    sources.dismiss(host, user.id, body.dismissed)
    return Response(status_code=204)


@router.post("/sources/lookup", response_model=LookupOut, response_model_exclude_none=True,
             summary="What is at an address: a feed, a journal, a page to watch, or nothing",
             responses={422: {"description": "The address cannot be read"}})
def lookup(body: LookupIn):
    """Nothing is saved. The answer is what the form to add the source
    starts from."""
    try:
        return sources.lookup(body.address)
    except sources.Problem as e:
        raise _problem(e)


@router.post("/sources", response_model=SourceDetail, status_code=201, summary="Add a source",
             responses={409: {"description": "A source is already read from that address"}})
def create(body: SourceIn, user: User = Depends(admin_only)):
    """Checked in the next collection, or at once with
    POST /api/sources/{id}/check."""
    try:
        return sources.create(body, user.id)
    except sources.Problem as e:
        raise _problem(e)


@router.get("/sources/{source_id}", response_model=SourceDetail, summary="One source, its checks and its newest articles")
def detail(source_id: int):
    try:
        return sources.detail(source_id)
    except sources.NotFound:
        raise ApiError(*NOT_FOUND)


@router.patch("/sources/{source_id}", response_model=SourceDetail, summary="Change a source, or switch it off or on")
def update(source_id: int, body: SourceUpdate, user: User = Depends(admin_only)):
    try:
        return sources.update(source_id, body.model_dump(exclude_unset=True), user.id)
    except sources.NotFound:
        raise ApiError(*NOT_FOUND)
    except sources.Problem as e:
        raise _problem(e)


@router.delete("/sources/{source_id}", status_code=204, summary="Delete a source that never brought an article",
               responses={409: {"description": "It has articles: switch it off instead"}})
def remove(source_id: int):
    try:
        sources.remove(source_id)
    except sources.NotFound:
        raise ApiError(*NOT_FOUND)
    except sources.Problem as e:
        raise _problem(e)
    return Response(status_code=204)


@router.post("/sources/{source_id}/check", summary="Check one source now",
             responses={409: {"description": "Switched off, or a check is already running"},
                        502: {"description": "n8n did not start the check"},
                        503: {"description": "Check now is not set up"}})
def check(source_id: int):
    try:
        sources.check(source_id)
    except sources.NotFound:
        raise ApiError(*NOT_FOUND)
    except sources.Problem as e:
        raise _problem(e)
    except collection.CheckRunning as e:
        raise ApiError(409, e.code, str(e), **e.params)
    except collection.CheckNotSetUp as e:
        raise ApiError(503, e.code, str(e), **e.params)
    except collection.CheckFailed as e:
        raise ApiError(502, e.code, str(e), **e.params)
    return {"started": True}


@token_router.post("/sources/{source_id}/watch", response_model=WatchResult, dependencies=[Depends(n8n_only)],
                   summary="Check a watched page (n8n only, with its token)")
def watch_run(source_id: int):
    """What the collection schedule writes for it: the links found, the
    new articles, and the error if there was one."""
    try:
        return sources.watch_run(source_id)
    except sources.NotFound:
        raise ApiError(*NOT_FOUND)
