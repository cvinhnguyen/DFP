"""SQL for the association's member organisations (29-members.sql)."""

from .. import database


def listed():
    """The members on the association's members page when it was last read,
    and when that was."""
    rows = database.rows(
        """SELECT name, website, kind, last_seen
             FROM members
            WHERE listed
            ORDER BY kind DESC, lower(name)""")
    return rows
