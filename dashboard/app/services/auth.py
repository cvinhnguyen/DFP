"""Logging in: with a link from the Telegram bot, or with a password; the
lockout after wrong passwords; and sessions.
Jira: DM42-33

The members never log in, so there is no sign-up and no password reset by
email. An admin makes an account for an email address with /adduser in the
Telegram bot (services/telegram.py), and the person chooses their password
through a one-time link. /password in the bot gives anyone a link to choose
their own, and an admin one for someone else; someone on the bot's list logs
in with /login. The command line, python -m app.cli.users, does the same
without the bot.

A login is a random token kept in a cookie (routes/auth.py sets it). Only a
hash of the token is stored, so a copy of the sessions table is no way in.
Passwords are stored as Argon2 hashes and in no other form.
"""

import hashlib
import re
import secrets
import threading
import time

from argon2 import PasswordHasher
from argon2.exceptions import InvalidHashError, VerificationError

from .. import database
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


class WeakPassword(Exception):
    pass


class BadEmail(Exception):
    pass


class EmailTaken(Exception):
    pass


# The command line asks for the same.
MIN_PASSWORD = 10

EMAIL = re.compile(r"^[^@\s]+@[^@\s]+\.[^@\s]+$")


# Five wrong passwords for one email and that email waits a quarter of an
# hour. Kept in memory: the service runs as a single process, and a restart
# that forgets the count does no harm. The shared demo login gets twenty: a
# room of people typing the same password on their phones makes typos, and
# its password, three words and a number, holds out against that many
# guesses for the few days it works.
_MAX_FAILURES = 5
_DEMO_FAILURES = 20
# One address that gets fifty wrong in a quarter of an hour, whatever the
# emails, waits too: someone trying a few passwords on many emails is never
# slowed down by the count per email. Fifty leaves room for a whole class on
# one network sharing the demo login, with its twenty, and their own typos.
_ADDRESS_FAILURES = 50
_WINDOW_SECONDS = 15 * 60
_failures = {}
_lock = threading.Lock()


def _recent(key, now):
    return [t for t in _failures.get(key, []) if now - t < _WINDOW_SECONDS]


def _locked_out(key, limit):
    with _lock:
        return len(_recent(key, time.monotonic())) >= limit


def _count_failure(*keys):
    now = time.monotonic()
    with _lock:
        for key in keys:
            _failures[key] = _recent(key, now) + [now]
        for stale in [k for k in _failures if not _recent(k, now)]:
            del _failures[stale]


def token_hash(token):
    return hashlib.sha256(token.encode()).hexdigest()


def hash_password(password):
    return hasher.hash(password)


def log_in(email, password, address=None):
    """Checks the password and starts a session. Returns the user's row, the
    token for the cookie, and how many hours the login lasts. address is
    where the request came from (routes/auth.py), for the count per address."""
    email = email.strip().lower()
    demo = email == (settings.get("demo_email") or "").strip().lower()
    by_email, by_address = ("email", email), ("address", address or "unknown")
    if (_locked_out(by_email, _DEMO_FAILURES if demo else _MAX_FAILURES)
            or _locked_out(by_address, _ADDRESS_FAILURES)):
        raise LockedOut()

    found = users.by_email(email)
    stored = found["password_hash"] if found else None
    try:
        hasher.verify(stored or _NOBODY, password)
        ok = stored is not None
    except (VerificationError, InvalidHashError):
        ok = False
    if not ok:
        _count_failure(by_email, by_address)
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


def password_link_owner(link_token):
    """Who a link to choose a password is for, without using it up. Raises
    BadLink."""
    found = links.password_link_owner(token_hash(link_token))
    if not found:
        raise BadLink()
    return found


def set_password_with_link(link_token, password, email=None):
    """Sets the password the person chose, and the email they typed if the
    account has none yet, uses up the link, ends their other logins and
    starts a session. Returns the same as log_in. Raises BadLink,
    WeakPassword, BadEmail or EmailTaken."""
    owner = links.password_link_owner(token_hash(link_token))
    if not owner:
        raise BadLink()
    if len(password) < MIN_PASSWORD:
        raise WeakPassword()
    new_email = None
    if not owner["email"]:
        new_email = (email or "").strip().lower()
        if len(new_email) > 200 or not EMAIL.match(new_email):
            raise BadEmail()
        other = users.by_email(new_email, include_removed=True)
        if other and other["id"] != owner["id"]:
            raise EmailTaken()
    try:
        found = links.use_password_link(token_hash(link_token), hasher.hash(password), new_email)
    except database.UniqueViolation:
        # Taken in the moment between the check and the change.
        raise EmailTaken()
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
