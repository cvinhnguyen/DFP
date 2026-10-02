"""Logging in and out.
Jira: DM42-33

The login lives in a cookie that the page's own scripts cannot read
(HttpOnly) and that the browser sends only to this site (SameSite=Strict).
"""

from fastapi import APIRouter, Depends, Request, Response

from .. import config
from ..dependencies import COOKIE, current_user
from ..errors import ApiError
from ..schemas.auth import Credentials, LinkOwner, LinkToken, NewPassword, PasswordLink, User
from ..services import auth

router = APIRouter(tags=["login"])


def _set_cookie(response, token, hours):
    response.set_cookie(COOKIE, token, max_age=hours * 3600, path="/",
                        httponly=True, samesite="strict", secure=config.COOKIE_SECURE)


@router.post("/login", response_model=User, summary="Log in with a password",
             responses={401: {"description": "Wrong email or password"},
                        429: {"description": "Too many wrong passwords for this email"}})
def login(body: Credentials, response: Response):
    try:
        found, token, hours = auth.log_in(body.email, body.password)
    except auth.LockedOut:
        raise ApiError(429, "locked_out", "Too many wrong passwords. Wait 15 minutes and try again.")
    except auth.WrongPassword:
        raise ApiError(401, "wrong_password", "Wrong email or password.")
    _set_cookie(response, token, hours)
    return User.from_row(found)


@router.post("/login/link", response_model=User, summary="Log in with a link from the Telegram bot",
             responses={401: {"description": "The link is unknown, used or expired"}})
def login_with_link(body: LinkToken, response: Response):
    """The token travels in the body, never in the address, so it does not end
    up in server logs. The page only sends it when the person presses the
    button, so Telegram's link preview cannot use it up."""
    try:
        found, token, hours = auth.log_in_with_link(body.token)
    except auth.BadLink:
        raise ApiError(401, "bad_link", "This link has expired or was already used. Send /login to the bot for a new one.")
    _set_cookie(response, token, hours)
    return User.from_row(found)


BAD_PASSWORD_LINK = (401, "bad_password_link",
                     "This link has expired or was already used. Send /password to the bot for a new one, "
                     "or ask an admin.")


@router.post("/password/link", response_model=LinkOwner, summary="Who a link to choose a password is for",
             responses={401: {"description": "The link is unknown, used or expired"}})
def password_link(body: PasswordLink):
    """Does not use the link up, so the page can greet the person and show the
    email they will log in with, or ask for one if they have none yet."""
    try:
        found = auth.password_link_owner(body.token)
    except auth.BadLink:
        raise ApiError(*BAD_PASSWORD_LINK)
    return LinkOwner(id=found["id"], name=found["display_name"] or found["email"] or "", email=found["email"],
                     has_password=found["has_password"], min_length=auth.MIN_PASSWORD)


@router.post("/password", response_model=User, summary="Choose a password with a link from the bot",
             responses={401: {"description": "The link is unknown, used or expired"},
                        409: {"description": "Another account has that email"},
                        422: {"description": "The password is too short, or the email is missing or not one"}})
def set_password(body: NewPassword, response: Response):
    """The link works once. The person is logged in straight away, and any
    other login of theirs ends. An account without an email gets the one
    sent with the password."""
    try:
        found, token, hours = auth.set_password_with_link(body.token, body.password, body.email)
    except auth.WeakPassword:
        raise ApiError(422, "weak_password", f"Use at least {auth.MIN_PASSWORD} characters.", n=auth.MIN_PASSWORD)
    except auth.BadEmail:
        raise ApiError(422, "bad_login_email", "Type the email address you will log in with.")
    except auth.EmailTaken:
        raise ApiError(409, "email_taken", "Another account has that email already. Type another one, or ask an admin.")
    except auth.BadLink:
        raise ApiError(*BAD_PASSWORD_LINK)
    _set_cookie(response, token, hours)
    return User.from_row(found)


@router.post("/logout", summary="Log out")
def logout(request: Request, response: Response):
    token = request.cookies.get(COOKIE)
    if token:
        auth.log_out(token)
    response.delete_cookie(COOKIE, path="/", httponly=True, samesite="strict", secure=config.COOKIE_SECURE)
    return {"ok": True}


@router.get("/me", response_model=User, summary="Who is logged in")
def me(user: User = Depends(current_user)):
    return user
