"""SQL for suggesting an article's section: the member organisations
(29-members.sql)."""

from .. import database


def members():
    """The member organisations on the association's members page when it
    was last read."""
    return database.rows("SELECT name, host FROM members WHERE listed ORDER BY name")
