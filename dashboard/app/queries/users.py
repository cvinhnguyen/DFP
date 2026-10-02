"""SQL for accounts and logins. Sessions are found by a hash of the token,
never by the token itself.

Someone removed keeps their row, with removed_at set, so the articles they
sent still carry their name. Every lookup used for logging in leaves them out.
"""

from .. import database

ACTIVE = "removed_at IS NULL"


def by_email(email, include_removed=False):
    return database.row(
        f"""SELECT id, email, display_name, role, password_hash, telegram_user_id, removed_at
              FROM users
             WHERE lower(email) = lower(%s) {'' if include_removed else 'AND ' + ACTIVE}""",
        (email.strip(),))


def by_telegram_id(telegram_user_id, include_removed=False):
    return database.row(
        f"""SELECT id, email, display_name, role, removed_at, password_hash IS NOT NULL AS has_password
              FROM users
             WHERE telegram_user_id = %s {'' if include_removed else 'AND ' + ACTIVE}""",
        (str(telegram_user_id),))


def by_session(token_hash):
    return database.row(
        """SELECT u.id, u.email, u.display_name, u.role
             FROM sessions s
             JOIN users u ON u.id = s.user_id
            WHERE s.token_hash = %s
              AND s.expires_at > now()
              AND u.removed_at IS NULL""",
        (token_hash,))


def start_session(token_hash, user_id, hours):
    database.run("DELETE FROM sessions WHERE expires_at < now()")
    database.run(
        """INSERT INTO sessions (token_hash, user_id, expires_at)
           VALUES (%s, %s, now() + make_interval(hours => %s))""",
        (token_hash, user_id, hours))
    database.run("UPDATE users SET last_login_at = now() WHERE id = %s", (user_id,))


def end_session(token_hash):
    database.run("DELETE FROM sessions WHERE token_hash = %s", (token_hash,))


def end_all_sessions(user_id):
    database.run("DELETE FROM sessions WHERE user_id = %s", (user_id,))


def set_password_hash(user_id, password_hash):
    database.run("UPDATE users SET password_hash = %s, removed_at = NULL WHERE id = %s",
                 (password_hash, user_id))


def everyone():
    return database.rows(
        """SELECT coalesce(email, '') AS email, coalesce(display_name, '') AS name, role,
                  password_hash IS NOT NULL    AS can_log_in,
                  telegram_user_id IS NOT NULL AS on_telegram,
                  removed_at IS NOT NULL       AS removed,
                  to_char(last_login_at AT TIME ZONE 'Europe/Helsinki', 'DD.MM.YYYY HH24:MI') AS last_login
             FROM users
            ORDER BY removed_at IS NOT NULL, id""")


def active_people():
    return database.rows(
        f"""SELECT id, coalesce(display_name, email) AS name, email, role, telegram_user_id,
                  telegram_user_id IS NOT NULL AS on_telegram,
                  password_hash IS NOT NULL    AS has_password
             FROM users
            WHERE {ACTIVE}
            ORDER BY role, lower(coalesce(display_name, email))""")


def create_account(email, name, role):
    """An account that logs in with its email and a password the person
    chooses later. One that was removed comes back; one that never got its
    password takes the new name and role. Returns the row."""
    email = email.strip().lower()
    with database.pool.connection() as conn, conn.transaction():
        found = conn.execute(
            "SELECT id FROM users WHERE lower(email) = %s FOR UPDATE", (email,)).fetchone()
        if found:
            return conn.execute(
                """UPDATE users
                      SET removed_at = NULL, display_name = %s, role = %s
                    WHERE id = %s
                RETURNING id, email, display_name, role""",
                (name, role, found["id"])).fetchone()
        return conn.execute(
            """INSERT INTO users (email, display_name, role)
               VALUES (%s, %s, %s)
            RETURNING id, email, display_name, role""",
            (email, name, role)).fetchone()


def find_active(name_or_telegram_id):
    """People whose full name, first name, Telegram id or email is the given
    text."""
    text = name_or_telegram_id.strip()
    return database.rows(
        f"""SELECT id, coalesce(display_name, email) AS name, email, role, telegram_user_id
             FROM users
            WHERE {ACTIVE}
              AND (lower(display_name) = lower(%(t)s)
                   OR lower(split_part(display_name, ' ', 1)) = lower(%(t)s)
                   OR telegram_user_id = %(t)s
                   OR lower(email) = lower(%(t)s))
            ORDER BY id""",
        {"t": text})


def count_admins():
    return database.row(f"SELECT count(*) AS n FROM users WHERE role = 'admin' AND {ACTIVE}")["n"]


def set_telegram(user_id, telegram_user_id):
    database.run("UPDATE users SET telegram_user_id = %s WHERE id = %s", (str(telegram_user_id), user_id))


def add(email, name, role, password_hash):
    database.run("INSERT INTO users (email, display_name, role, password_hash) VALUES (%s, %s, %s, %s)",
                 (email.strip(), name, role, password_hash))


def remove(user_id):
    """Ends someone's access: no password, no open logins, no login links or
    links to choose a password, off the bot's list. The row stays for the
    articles they sent."""
    with database.pool.connection() as conn, conn.transaction():
        conn.execute("UPDATE users SET removed_at = now(), password_hash = NULL WHERE id = %s", (user_id,))
        conn.execute("DELETE FROM sessions WHERE user_id = %s", (user_id,))
        conn.execute("DELETE FROM login_links WHERE user_id = %s", (user_id,))
        conn.execute("DELETE FROM password_links WHERE user_id = %s", (user_id,))
