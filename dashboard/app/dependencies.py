"""Who is asking. Every endpoint that needs a login gets its user from here,
and the few that only n8n may call check its token here."""

import hmac

from fastapi import Depends, Request

from . import config
from .errors import ApiError
from .schemas.auth import User
from .services import auth

COOKIE = "dfp_session"


def current_user(request: Request) -> User:
    token = request.cookies.get(COOKIE)
    if not token:
        raise ApiError(401, "not_logged_in", "Log in first.")
    found = auth.user_for(token)
    if not found:
        raise ApiError(401, "login_ended", "Your login has ended. Log in again.")
    return User.from_row(found)


def admin_only(user: User = Depends(current_user)) -> User:
    if user.role != "admin":
        raise ApiError(403, "admin_only", "Only an admin can do this.")
    return user


def n8n_only(request: Request):
    """For n8n rather than people: the same shared token its webhooks use,
    sent in X-Ingest-Token, instead of a login."""
    if not config.INGEST_TOKEN:
        raise ApiError(503, "no_ingest_token", "INGEST_TOKEN is not set in .env, so n8n cannot be let in.")
    sent = request.headers.get("x-ingest-token", "")
    if not hmac.compare_digest(sent.encode(), config.INGEST_TOKEN.encode()):
        raise ApiError(401, "bad_ingest_token", "Wrong or missing X-Ingest-Token.")
