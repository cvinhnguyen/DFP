"""The way into Mailchimp, through n8n. Nothing here sends the newsletter:
it creates and updates a draft, sends tests, and reads what became of it.
Jira: DM42-37, DM42-74
"""

import re

from fastapi import APIRouter, Depends

from ..dependencies import admin_only, current_user, not_demo
from ..errors import ApiError
from ..schemas.auth import User
from ..schemas.issues import Issue
from ..schemas.mailchimp import MailchimpSettings, MailchimpState, PicturesOut, TestIn
from ..services import issues, mailchimp

router = APIRouter(tags=["mailchimp"])

EMAIL = re.compile(r"^[^@\s]+@[^@\s]+\.[^@\s]+$")


def _problem(e):
    return ApiError(502 if e.code in ("n8n_unreachable", "mailchimp_n8n_error", "mailchimp_failed") else 409,
                    e.code, str(e), **e.params)


@router.get("/mailchimp", response_model=MailchimpState, summary="Is Mailchimp connected, and how the drafts are set up")
def state(refresh: bool = False):
    return mailchimp.account(refresh=refresh)


@router.put("/mailchimp", response_model=MailchimpState, summary="Change the Mailchimp settings (admins)",
            dependencies=[Depends(admin_only)])
def save_settings(body: MailchimpSettings):
    return mailchimp.save_settings({
        "mailchimp_server": body.server, "mailchimp_audience_id": body.audience_id, "mailchimp_plan": body.plan,
        "newsletter_from_name": body.from_name, "newsletter_reply_to": body.reply_to,
    })


@router.post("/issues/{issue_id}/mailchimp", response_model=Issue, summary="Create or update the issue's draft in Mailchimp")
def export_draft(issue_id: int, user: User = Depends(not_demo)):
    try:
        return mailchimp.export_draft(issue_id, user.id)
    except issues.NotFound:
        raise ApiError(404, "no_such_issue", "There is no newsletter with that number.")
    except issues.Locked:
        raise ApiError(409, "issue_sent", "This newsletter has been sent, so it can no longer be changed.")
    except mailchimp.MailchimpProblem as e:
        raise _problem(e)


@router.get("/issues/{issue_id}/mailchimp", response_model=Issue, summary="Ask Mailchimp what became of the issue's draft")
def refresh(issue_id: int, user: User = Depends(current_user)):
    try:
        return mailchimp.refresh_status(issue_id, user.id)
    except issues.NotFound:
        raise ApiError(404, "no_such_issue", "There is no newsletter with that number.")
    except mailchimp.MailchimpProblem as e:
        raise _problem(e)


@router.post("/mailchimp/refresh", summary="Ask Mailchimp about every exported draft")
def refresh_all(user: User = Depends(current_user)):
    mailchimp.refresh_all(user.id)
    return {"ok": True}


@router.post("/issues/{issue_id}/mailchimp/test", response_model=Issue, summary="Send a test of the issue through Mailchimp")
def send_test(issue_id: int, body: TestIn, user: User = Depends(not_demo)):
    emails = [e.strip() for e in body.emails if e.strip()]
    bad = [e for e in emails if not EMAIL.match(e)]
    if bad or not emails:
        raise ApiError(422, "bad_email", "Check the email addresses.", emails=", ".join(bad))
    try:
        return mailchimp.send_test(issue_id, emails, user.id)
    except issues.NotFound:
        raise ApiError(404, "no_such_issue", "There is no newsletter with that number.")
    except issues.Locked:
        raise ApiError(409, "issue_sent", "This newsletter has been sent, so it can no longer be changed.")
    except mailchimp.MailchimpProblem as e:
        raise _problem(e)


@router.post("/issues/{issue_id}/mailchimp/pictures", response_model=PicturesOut,
             summary="Copy the issue's pictures into Mailchimp, for pasting the email into a Mailchimp template",
             dependencies=[Depends(not_demo)])
def pictures(issue_id: int):
    try:
        issue = issues.get(issue_id)
        if not issue.html:
            raise ApiError(409, "not_designed_yet", "Open the newsletter in the editor and save it first.")
        return PicturesOut(mapping=mailchimp.upload_pictures(issue.html))
    except issues.NotFound:
        raise ApiError(404, "no_such_issue", "There is no newsletter with that number.")
    except mailchimp.MailchimpProblem as e:
        raise _problem(e)
