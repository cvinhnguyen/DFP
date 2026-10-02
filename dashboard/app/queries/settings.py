"""Reading app_settings, where every setting that is not a secret lives."""

from .. import database


def get(key, default=None):
    found = database.row("SELECT value FROM app_settings WHERE key = %s", (key,))
    return found["value"] if found else default


def put(key, value):
    database.run("UPDATE app_settings SET value = %s, updated_at = now() WHERE key = %s", (value, key))


def get_int(key, default):
    try:
        return int(get(key, default))
    except (TypeError, ValueError):
        return default
