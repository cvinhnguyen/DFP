"""The newsletter endpoints: the issues, each one's design from the editor,
marking one sent, and the finished email as a page, a file or a ZIP.
Jira: DM42-37
"""

from fastapi import APIRouter, Depends, Response as Empty
from fastapi.responses import Response

from ..dependencies import current_user
from ..errors import ApiError
from ..schemas.auth import User
from ..schemas.issues import DesignIn, DesignOut, DesignSaved, Issue, IssueCreate, IssueSummary, IssueUpdate
from ..services import issues

router = APIRouter(prefix="/issues", tags=["newsletter"])

NOT_FOUND = (404, "no_such_issue", "There is no newsletter with that number.")
LOCKED = (409, "issue_sent", "This newsletter has been sent, so it can no longer be changed.")


@router.get("", response_model=list[IssueSummary], summary="Every newsletter, the one in preparation first")
def list_issues():
    return issues.summaries()


@router.post("", response_model=Issue, status_code=201, summary="Start a new newsletter")
def create_issue(body: IssueCreate, user: User = Depends(current_user)):
    """It becomes the current draft, which new picks go into. template says
    what the editor starts it from; without one, the editor asks."""
    return issues.create(body.name, body.template, user.id)


@router.get("/current", response_model=Issue, summary="The newsletter being prepared")
def current(user: User = Depends(current_user)):
    """Made now, named after the month, if there is none."""
    return issues.get(issues.current_id(user.id))


@router.get("/{issue_id}", response_model=Issue, summary="One newsletter, with its picked articles")
def get_issue(issue_id: int):
    try:
        return issues.get(issue_id)
    except issues.NotFound:
        raise ApiError(*NOT_FOUND)


@router.delete("/{issue_id}", status_code=204, summary="Delete a draft",
               responses={409: {"description": "It has been sent"}})
def delete_issue(issue_id: int):
    """Its picked articles become undecided again; its images stay in the
    library."""
    try:
        issues.remove(issue_id)
    except issues.NotFound:
        raise ApiError(*NOT_FOUND)
    except issues.Locked:
        raise ApiError(*LOCKED)
    return Empty(status_code=204)


@router.patch("/{issue_id}", response_model=Issue, summary="Change the name, subject line or preview text")
def update_issue(issue_id: int, body: IssueUpdate, user: User = Depends(current_user)):
    try:
        return issues.update(issue_id, body.model_dump(exclude_unset=True), user.id)
    except issues.NotFound:
        raise ApiError(*NOT_FOUND)
    except issues.Locked:
        raise ApiError(*LOCKED)


@router.get("/{issue_id}/design", response_model=DesignOut, summary="The editor's saved layout")
def get_design(issue_id: int):
    try:
        found = issues.design(issue_id)
    except issues.NotFound:
        raise ApiError(*NOT_FOUND)
    return DesignOut(design=found["design"], saved_at=found["design_saved_at"])


@router.put("/{issue_id}/design", response_model=DesignSaved, summary="Save the editor's layout and the finished email",
            responses={409: {"description": "Sent already, or someone else saved since based_on"}})
def save_design(issue_id: int, body: DesignIn, user: User = Depends(current_user)):
    try:
        saved_at = issues.save_design(issue_id, body.design, body.html, user.id, body.based_on, body.force)
    except issues.NotFound:
        raise ApiError(*NOT_FOUND)
    except issues.Locked:
        raise ApiError(*LOCKED)
    except issues.EditedElsewhere as e:
        raise ApiError(409, "edited_elsewhere", str(e), name=e.saved_by or "?",
                       at=e.saved_at.isoformat() if e.saved_at else None)
    return DesignSaved(saved_at=saved_at)


@router.post("/{issue_id}/sent", response_model=Issue, summary="Record that the newsletter went out from Mailchimp")
def mark_sent(issue_id: int, user: User = Depends(current_user)):
    try:
        return issues.mark_sent(issue_id, user.id)
    except issues.NotFound:
        raise ApiError(*NOT_FOUND)
    except issues.Locked:
        raise ApiError(*LOCKED)


# The email shown inside the dashboard: its own inline styles may apply, no
# script may run, and only the dashboard itself may frame it.
PREVIEW_POLICY = ("default-src 'none'; style-src 'unsafe-inline'; img-src 'self' https: data:; "
                  "frame-ancestors 'self'; base-uri 'none'; form-action 'none'")


@router.get("/{issue_id}/preview", summary="The finished email, for the preview inside the dashboard",
            responses={200: {"content": {"text/html": {}}}})
def preview(issue_id: int):
    try:
        document = issues.export_document(issue_id, preview=True)
    except issues.NotFound:
        raise ApiError(*NOT_FOUND)
    if document is None:
        raise ApiError(409, "not_designed_yet", "Open the newsletter in the editor and save it first.")
    return Response(document, media_type="text/html; charset=utf-8",
                    headers={"Content-Security-Policy": PREVIEW_POLICY, "X-Frame-Options": "SAMEORIGIN"})


@router.get("/{issue_id}/export", summary="The finished email as an HTML file",
            responses={200: {"content": {"text/html": {}}}})
def export(issue_id: int):
    try:
        document = issues.export_document(issue_id)
    except issues.NotFound:
        raise ApiError(*NOT_FOUND)
    if document is None:
        raise ApiError(409, "not_designed_yet", "Open the newsletter in the editor and save it first.")
    name = issues.file_name(issues.get(issue_id))
    return Response(document, media_type="text/html; charset=utf-8",
                    headers={"Content-Disposition": f'attachment; filename="{name}.html"'})


@router.get("/{issue_id}/export.zip", summary="The finished email as a ZIP for Mailchimp's Import ZIP",
            responses={200: {"content": {"application/zip": {}}}})
def export_zip(issue_id: int):
    try:
        name, data = issues.export_zip(issue_id)
    except issues.NotFound:
        raise ApiError(*NOT_FOUND)
    if data is None:
        raise ApiError(409, "not_designed_yet", "Open the newsletter in the editor and save it first.")
    return Response(data, media_type="application/zip",
                    headers={"Content-Disposition": f'attachment; filename="{name}"'})
