"""SQL for the one-time links the bot hands out: login links, and links to
choose a password. Only hashes are stored, and a link is used up in
the same statement that checks it, so two clicks at once cannot both get in.
"""

from .. import database


def create_login_link(token_hash, user_id, minutes):
    """A new link cancels the person's earlier unused ones, so only the latest
    /login works."""
    with database.pool.connection() as conn, conn.transaction():
        conn.execute("DELETE FROM login_links WHERE user_id = %s AND used_at IS NULL", (user_id,))
        conn.execute(
            """INSERT INTO login_links (token_hash, user_id, expires_at)
               VALUES (%s, %s, now() + make_interval(mins => %s))""",
            (token_hash, user_id, minutes))


def use_login_link(token_hash):
    """The person the link belongs to, or None if it is unknown, used or
    expired, or they have been removed since."""
    return database.row(
        """WITH used AS (
               UPDATE login_links
                  SET used_at = now()
                WHERE token_hash = %s
                  AND used_at IS NULL
                  AND expires_at > now()
            RETURNING user_id
           )
           SELECT u.id, u.email, u.display_name, u.role
             FROM used
             JOIN users u ON u.id = used.user_id
            WHERE u.removed_at IS NULL""",
        (token_hash,))


def create_password_link(token_hash, user_id, created_by, hours):
    """A new link cancels the person's earlier unused ones, so only the latest
    works."""
    with database.pool.connection() as conn, conn.transaction():
        conn.execute("DELETE FROM password_links WHERE user_id = %s AND used_at IS NULL", (user_id,))
        conn.execute(
            """INSERT INTO password_links (token_hash, user_id, created_by, expires_at)
               VALUES (%s, %s, %s, now() + make_interval(hours => %s))""",
            (token_hash, user_id, created_by, hours))


def password_link_owner(token_hash):
    """Whose link it is, without using it up, or None if it is unknown, used
    or expired, or they have been removed since."""
    return database.row(
        """SELECT u.id, u.email, u.display_name, u.password_hash IS NOT NULL AS has_password
             FROM password_links l
             JOIN users u ON u.id = l.user_id
            WHERE l.token_hash = %s
              AND l.used_at IS NULL
              AND l.expires_at > now()
              AND u.removed_at IS NULL""",
        (token_hash,))


def use_password_link(token_hash, password_hash, email=None):
    """Uses up the link and sets the password, in one go, and ends the
    person's other logins. email is for someone who joined through Telegram
    and has none yet; an email they have stays. Returns the person, or None.
    An email someone else has raises database.UniqueViolation, and the link
    stays unused."""
    with database.pool.connection() as conn, conn.transaction():
        person = conn.execute(
            """WITH used AS (
                   UPDATE password_links
                      SET used_at = now()
                    WHERE token_hash = %s
                      AND used_at IS NULL
                      AND expires_at > now()
                RETURNING user_id
               )
               UPDATE users u
                  SET password_hash = %s, email = coalesce(u.email, %s)
                 FROM used
                WHERE u.id = used.user_id
                  AND u.removed_at IS NULL
            RETURNING u.id, u.email, u.display_name, u.role""",
            (token_hash, password_hash, email)).fetchone()
        if person:
            conn.execute("DELETE FROM sessions WHERE user_id = %s", (person["id"],))
        return person
