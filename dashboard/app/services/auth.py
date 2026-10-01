"""Logging in: with a link from the Telegram bot, or with a password; the
lockout after wrong passwords; and sessions.
Jira: DM42-33

The members never log in, so there is no sign-up and no password reset by
email. Editors join through an invite from the bot and log in with /login
(services/telegram.py). An admin can also make accounts with passwords with
python -m app.cli.users.

A login is a random token kept in a cookie (routes/auth.py sets it). Only a
hash of the token is stored, so a copy of the sessions table is no way in.
Passwords are stored as Argon2 hashes and in no other form.
"""

import hashlib
import secrets
import threading
import time

from argon2 import PasswordHasher
from argon2.exceptions import InvalidHashError, VerificationError

from ..queries import settings, users
from ..queries import telegram as links

hasher = PasswordHasher()

# Checked when the email is unknown, so a wrong email takes as long as a wrong
# password and the time to answer does not tell anyone which emails exist.
_NOBODY = hasher.hash(secrets.token_hex(16))


class WrongPassword(Exception):
    pass


class LockedOut(Exception):
    pass


class BadLink(Exception):
    pass


# Five wrong passwords for one email and that email waits a quarter of an
# hour. Kept in memory: the service runs as a single process, and a restart
# that forgets the count does no harm.
_MAX_FAILURES = 5
_WINDOW_SECONDS = 15 * 60
_failures = {}
_lock = threading.Lock()


def _recent(email, now):
    return [t for t in _failures.get(email, []) if now - t < _WINDOW_SECONDS]


def _locked_out(email):
    with _lock:
        return len(_recent(email, time.monotonic())) >= _MAX_FAILURES


def _count_failure(email):
    now = time.monotonic()
    with _lock:
        _failures[email] = _recent(email, now) + [now]
        for stale in [k for k in _failures if not _recent(k, now)]:
            del _failures[stale]


def token_hash(token):
    return hashlib.sha256(token.encode()).hexdigest()


def hash_password(password):
    return hasher.hash(password)


def log_in(email, password):
    """Checks the password and starts a session. Returns the user's row, the
    token for the cookie, and how many hours the login lasts."""
    email = email.strip().lower()
    if _locked_out(email):
        raise LockedOut()

    found = users.by_email(email)
    stored = found["password_hash"] if found else None
    try:
        hasher.verify(stored or _NOBODY, password)
        ok = stored is not None
    except (VerificationError, InvalidHashError):
        ok = False
    if not ok:
        _count_failure(email)
        raise WrongPassword()

    if hasher.check_needs_rehash(stored):
        users.set_password_hash(found["id"], hasher.hash(password))

    return (found, *_start_session(found["id"]))


def log_in_with_link(link_token):
    """Uses up a login link from the bot and starts a session. Returns the
    same as log_in."""
    found = links.use_login_link(token_hash(link_token))
    if not found:
        raise BadLink()
    return (found, *_start_session(found["id"]))


def new_token():
    """A random token for a cookie or a link: 256 bits, safe in a URL."""
    return secrets.token_urlsafe(32)


def _start_session(user_id):
    hours = settings.get_int("session_hours", 12)
    token = new_token()
    users.start_session(token_hash(token), user_id, hours)
    return token, hours


def log_out(token):
    users.end_session(token_hash(token))


def user_for(token):
    return users.by_session(token_hash(token)) if token else None
