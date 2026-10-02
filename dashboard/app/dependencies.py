"""Who is asking. Every endpoint that needs a login gets its user from here,
and the few that only n8n may call check its token here."""

import hmac

from fastapi import Depends, Request

from . import config
from .errors import ApiError
from .queries import settings
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


def not_demo(user: User = Depends(current_user)) -> User:
    """What the shared demo login may not do: send anything to Mailchimp, which
    leaves the dashboard, or delete things and mark a newsletter sent, which
    cannot be undone. It is the account whose email is demo_email in
    app_settings, made with /adduser like any other, and its password is
    shown to a whole room."""
    demo = (settings.get("demo_email") or "").strip().lower()
    if demo and (user.email or "").lower() == demo:
        raise ApiError(403, "demo_login", "The shared demo login cannot do this. Everything else works as usual.")
    return user


def n8n_only(request: Request):
    """For n8n rather than people: the same shared token its webhooks use,
    sent in X-Ingest-Token, instead of a login."""
    if not config.INGEST_TOKEN:
        raise ApiError(503, "no_ingest_token", "INGEST_TOKEN is not set in .env, so n8n cannot be let in.")
    sent = request.headers.get("x-ingest-token", "")
    if not hmac.compare_digest(sent.encode(), config.INGEST_TOKEN.encode()):
        raise ApiError(401, "bad_ingest_token", "Wrong or missing X-Ingest-Token.")
