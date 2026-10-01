"""Logging in and out.
Jira: DM42-33

The login lives in a cookie that the page's own scripts cannot read
(HttpOnly) and that the browser sends only to this site (SameSite=Strict).
"""

from fastapi import APIRouter, Depends, Request, Response

from .. import config
from ..dependencies import COOKIE, current_user
from ..errors import ApiError
from ..schemas.auth import Credentials, LinkToken, User
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
