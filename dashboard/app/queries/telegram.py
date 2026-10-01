"""SQL for the one-time links the bot hands out: login links and invites.
Only hashes are stored, and a link is used up in the same statement that
checks it, so two clicks at once cannot both get in.
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


def create_invite(code_hash, role, created_by, hours):
    database.run(
        """INSERT INTO invites (code_hash, role, created_by, expires_at)
           VALUES (%s, %s, %s, now() + make_interval(hours => %s))""",
        (code_hash, role, created_by, hours))


def use_invite(code_hash, telegram_user_id, name):
    """Adds the person the invite was for. Someone removed earlier gets their
    old row back. Returns the new member's row, or None if the invite is
    unknown, used or expired."""
    with database.pool.connection() as conn, conn.transaction():
        invite = conn.execute(
            """UPDATE invites
                  SET used_at = now()
                WHERE code_hash = %s
                  AND used_at IS NULL
                  AND expires_at > now()
            RETURNING role""",
            (code_hash,)).fetchone()
        if not invite:
            return None
        member = conn.execute(
            """UPDATE users
                  SET removed_at = NULL, role = %s, display_name = coalesce(display_name, %s)
                WHERE telegram_user_id = %s
            RETURNING id, email, display_name, role""",
            (invite["role"], name, str(telegram_user_id))).fetchone()
        if not member:
            member = conn.execute(
                """INSERT INTO users (display_name, role, telegram_user_id)
                   VALUES (%s, %s, %s)
                RETURNING id, email, display_name, role""",
                (name, invite["role"], str(telegram_user_id))).fetchone()
        conn.execute("UPDATE invites SET used_by = %s WHERE code_hash = %s", (member["id"], code_hash))
    return member
