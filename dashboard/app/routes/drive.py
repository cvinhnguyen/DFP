"""Google Drive: the association's one folder, behind the guard in
services/drive.py. Admins choose the folder, switch it on and off, check
what the tool can reach and read it now; editors see what the folder holds
and what became of each file, save an article, a list of articles or a
finished newsletter into it, and bring its pictures into Kuvapankki. n8n
reads it every 15 minutes (n8n/workflows/drive.json).

The shared demo login does none of it: the folder is the association's own.
Jira: DM42-43
"""

from typing import Annotated, get_args

from fastapi import APIRouter, Depends, Path, Response

from ..dependencies import admin_only, current_user, is_demo, n8n_only, not_demo
from ..errors import ApiError
from ..queries import drive as drive_queries
from ..schemas.auth import User
from ..schemas.drive import (DriveArticleIn, DriveFiles, DriveListIn, DrivePicture, DriveSaved, DriveSaveOptions,
                             DriveSettingsIn, DriveState, DriveSync, DriveWithdrawn)
from ..schemas.items import View
from ..services import images, issues
from ..services.drive import Guard, Refused
from ..services.drive_google import DriveError

router = APIRouter(tags=["drive"])
# n8n's scheduled read, with its token rather than a login.
token_router = APIRouter(tags=["drive"])

DriveId = Annotated[str, Path(pattern=r"^[A-Za-z0-9_-]{10,100}$", description="A file in the folder")]


def _guard():
    return Guard()


def _refused(e):
    return ApiError(409, f"drive_{e.code}", str(e), **e.params)


def _failed(e):
    return ApiError(502, f"drive_{e.code}", str(e))


@router.get("/drive", response_model=DriveState, response_model_exclude_none=True,
            summary="Whether the Drive folder is in use; for admins, the folder, the last check and the log")
def state(user: User = Depends(current_user)):
    # The shared demo login sees Drive as off: the folder is the
    # association's own, and nothing of it is for the room.
    if is_demo(user):
        return DriveState(configured=False, enabled=False)
    return _guard().state(admin=user.role == "admin")


@router.put("/drive", response_model=DriveState, response_model_exclude_none=True,
            dependencies=[Depends(admin_only)],
            summary="Choose the folder, switch Drive on or off, or the saving of sent newsletters (admins)")
def update(body: DriveSettingsIn, user: User = Depends(current_user)):
    guard = _guard()
    try:
        if body.folder is not None:
            guard.set_folder(body.folder, user)
        if body.enabled is not None:
            guard.set_enabled(body.enabled, user)
        if body.autosave is not None:
            guard.set_autosave(body.autosave, user)
    except Refused as e:
        raise ApiError(422, f"drive_{e.code}", str(e))
    return guard.state(admin=True)


@router.post("/drive/check", response_model=DriveState, response_model_exclude_none=True,
             dependencies=[Depends(admin_only)],
             summary="Check what the tool's Google account can reach, now (admins)")
def check(user: User = Depends(current_user)):
    guard = _guard()
    try:
        guard.check(user)
    except Refused as e:
        raise _refused(e)
    except DriveError as e:
        raise _failed(e)
    return guard.state(admin=True)


@router.post("/drive/sync", response_model=DriveSync, dependencies=[Depends(admin_only)],
             summary="Read the folder now (admins)")
def sync_now(user: User = Depends(current_user)):
    try:
        return _guard().sync(user)
    except Refused as e:
        raise _refused(e)
    except DriveError as e:
        raise _failed(e)


@router.post("/drive/withdraw", response_model=DriveWithdrawn, dependencies=[Depends(admin_only)],
             summary="Take every article made from the folder out of the tool (admins)")
def withdraw_all(user: User = Depends(not_demo)):
    """As when their documents leave the folder: one no newsletter has is
    deleted, and one a newsletter has stays for it without its text. A
    document changed later in the folder is read again while Drive is on."""
    return _guard().withdraw_all(user)


@router.get("/drive/files", response_model=DriveFiles, summary="What the folder holds, and what became of each file")
def files(user: User = Depends(not_demo)):
    """From the last listing, without asking Google: read into an article,
    waiting to be read and when, or not read and why."""
    return _guard().files()


@router.get("/drive/pictures", response_model=list[DrivePicture],
            summary="The folder's pictures, for Kuvapankki")
def pictures(user: User = Depends(not_demo)):
    return _guard().picture_list()


@router.get("/drive/pictures/{drive_id}/thumb", summary="A small preview of one of the folder's pictures",
            response_class=Response, responses={200: {"content": {"image/jpeg": {}}}})
def thumbnail(drive_id: DriveId, user: User = Depends(not_demo)):
    try:
        data = _guard().thumbnail(drive_id, user)
    except Refused as e:
        raise _refused(e)
    except DriveError as e:
        raise _failed(e)
    except images.BadImage as e:
        raise ApiError(422, e.code, str(e))
    return Response(content=data, media_type="image/jpeg", headers={"Cache-Control": "private, max-age=600"})


@router.post("/drive/pictures/{drive_id}", summary="Bring one of the folder's pictures into Kuvapankki")
def import_picture(drive_id: DriveId, user: User = Depends(not_demo)):
    """Shrunk for email and without its camera details, location included,
    like an upload. Picked again, the same copy is used."""
    try:
        return _guard().import_picture(drive_id, user)
    except Refused as e:
        raise _refused(e)
    except DriveError as e:
        raise _failed(e)
    except images.BadImage as e:
        raise ApiError(422, e.code, str(e))


@router.get("/items/{item_id}/drive", response_model=DriveSaveOptions,
            summary="What saving this article into Drive would do")
def save_options(item_id: int, user: User = Depends(not_demo)):
    try:
        return _guard().save_options(item_id, user)
    except Refused as e:
        raise ApiError(404, "no_such_article", str(e))


@router.post("/items/{item_id}/drive", response_model=DriveSaved,
             summary="Save the article into the Drive folder, as a Google Doc",
             responses={403: {"description": "The shared demo login"}, 409: {"description": "Drive refuses"}})
def save_article(item_id: int, body: DriveArticleIn, user: User = Depends(not_demo)):
    """Into Artikkelit/<folder> inside the tool's save folder: the title,
    where it came from, the link, the AI's summary, the event's details, its
    topics and tags, and its picture when the picture is the association's
    own or openly licensed. Not the original's full text."""
    try:
        return _guard().save_article(item_id, body.folder, user)
    except Refused as e:
        raise _refused(e)
    except DriveError as e:
        raise _failed(e)


@router.post("/drive/lists", response_model=DriveSaved, summary="Save a list of articles into the Drive folder",
             responses={403: {"description": "The shared demo login"}, 409: {"description": "Drive refuses"}})
def save_list(body: DriveListIn, user: User = Depends(not_demo)):
    """The list as Artikkelit shows it, its first 100 articles: one Google Doc
    with each one's title, source, link and summary, and the same as a
    Google Sheet."""
    place = body.place
    if place.view not in get_args(View):
        raise ApiError(422, "bad_view", "No such list.")
    filters = {k: v for k, v in {"q": place.q, "source": place.source, "topic": place.topic, "tag": place.tag,
                                 "signal": place.signal, "untopiced": place.untopiced}.items() if v}
    try:
        return _guard().save_list({"view": place.view, "sort": place.sort, "filters": filters}, body.title,
                                  body.folder, user)
    except Refused as e:
        raise _refused(e)
    except DriveError as e:
        raise _failed(e)


@router.post("/items/{item_id}/drive-change", status_code=204,
             summary="An editor has looked at a Drive document that changed after its article went into a newsletter")
def change_seen(item_id: int, user: User = Depends(not_demo)):
    """Tarkistus stops holding the email back for it."""
    if not drive_queries.change_seen(item_id, user.id):
        raise ApiError(404, "no_change", "There is no change to look at for that article.")
    return Response(status_code=204)


@router.post("/issues/{issue_id}/drive", response_model=DriveSaved,
             summary="Save the finished newsletter into the Drive folder, once Tarkistus lists no error",
             responses={403: {"description": "The shared demo login"}, 409: {"description": "Not ready, or Drive refuses"}})
def save(issue_id: int, user: User = Depends(not_demo)):
    """A folder of its own in Uutiskirjeet inside the tool's save folder, with
    the email as HTML, the same as a Google Doc, and its articles as a Google
    Sheet. Nothing in the folder is changed; nothing is sent."""
    try:
        issue = issues.get(issue_id)
        document = issues.export_document(issue_id)
    except issues.NotFound:
        raise ApiError(404, "no_such_issue", "There is no newsletter with that number.")
    if document is None:
        raise ApiError(409, "not_designed_yet", "Open the newsletter in the editor and save it first.")
    try:
        issues.check_ready(issue_id)
    except issues.NotReady as e:
        raise ApiError(409, "not_ready", str(e), count=sum(e.problems.values()), problems=e.problems)
    try:
        return _guard().save_newsletter({"name": issue.name}, document,
                                        [a.model_dump() for a in issue.articles], user, issue_id=issue_id)
    except Refused as e:
        raise _refused(e)
    except DriveError as e:
        raise _failed(e)


@token_router.post("/drive/refresh", response_model=DriveSync, dependencies=[Depends(n8n_only)],
                   summary="Read the folder (n8n only, with its token)")
def refresh():
    """Nothing to do, rather than an error, while Drive is off."""
    try:
        return _guard().sync(None)
    except DriveError as e:
        raise _failed(e)
