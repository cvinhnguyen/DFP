"""Google Drive: the association's one folder, behind the guard in
services/drive.py. Admins choose the folder, switch it on and off, check
what the tool can reach and read it now; editors save a finished newsletter
into it. n8n reads it every hour (n8n/workflows/drive.json).
Jira: DM42-43
"""

from fastapi import APIRouter, Depends

from ..dependencies import admin_only, current_user, n8n_only, not_demo
from ..errors import ApiError
from ..schemas.auth import User
from ..schemas.drive import DriveSaved, DriveSettingsIn, DriveState, DriveSync
from ..services import issues
from ..services.drive import Guard, Refused
from ..services.drive_google import DriveError

router = APIRouter(tags=["drive"])
# n8n's hourly read, with its token rather than a login.
token_router = APIRouter(tags=["drive"])


def _guard():
    return Guard()


def _refused(e):
    return ApiError(409, f"drive_{e.code}", str(e), **e.params)


def _failed(e):
    return ApiError(502, f"drive_{e.code}", str(e))


@router.get("/drive", response_model=DriveState, response_model_exclude_none=True,
            summary="Whether the Drive folder is in use; for admins, the folder, the last check and the log")
def state(user: User = Depends(current_user)):
    return _guard().state(admin=user.role == "admin")


@router.put("/drive", response_model=DriveState, response_model_exclude_none=True,
            dependencies=[Depends(admin_only)], summary="Choose the folder, or switch Drive on or off (admins)")
def update(body: DriveSettingsIn, user: User = Depends(current_user)):
    guard = _guard()
    try:
        if body.folder is not None:
            guard.set_folder(body.folder, user)
        if body.enabled is not None:
            guard.set_enabled(body.enabled, user)
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


@router.post("/issues/{issue_id}/drive", response_model=DriveSaved,
             summary="Save the finished newsletter into the Drive folder, once Tarkistus lists no error",
             responses={403: {"description": "The shared demo login"}, 409: {"description": "Not ready, or Drive refuses"}})
def save(issue_id: int, user: User = Depends(not_demo)):
    """A folder of its own in the tool's save folder, with the email as HTML,
    the same as a Google Doc, and its articles as a Google Sheet. Nothing in
    the folder is changed; nothing is sent."""
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
                                        [a.model_dump() for a in issue.articles], user)
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
