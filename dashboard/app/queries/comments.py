"""SQL for the comments the editors leave on an issue."""

from .. import database

COLUMNS = """
SELECT c.id, c.issue_id, c.block_id, c.block_label, c.body, c.created_at, c.resolved_at,
       c.created_by AS created_by_id, cu.display_name AS created_by, ru.display_name AS resolved_by
  FROM issue_comments c
  LEFT JOIN users cu ON cu.id = c.created_by
  LEFT JOIN users ru ON ru.id = c.resolved_by
"""


def listed(issue_id):
    return database.rows(COLUMNS + " WHERE c.issue_id = %s ORDER BY c.created_at, c.id", (issue_id,))


def one(comment_id):
    return database.row(COLUMNS + " WHERE c.id = %s", (comment_id,))


def add(issue_id, body, block_id, block_label, user_id):
    return database.row(
        """INSERT INTO issue_comments (issue_id, body, block_id, block_label, created_by)
           VALUES (%s, %s, %s, %s, %s) RETURNING id""",
        (issue_id, body, block_id, block_label, user_id))["id"]


def resolve(comment_id, resolved, user_id):
    found = database.row(
        """UPDATE issue_comments
              SET resolved_at = CASE WHEN %(resolved)s THEN coalesce(resolved_at, now()) END,
                  resolved_by = CASE WHEN %(resolved)s THEN coalesce(resolved_by, %(user)s) END
            WHERE id = %(id)s
        RETURNING id""",
        {"resolved": resolved, "user": user_id, "id": comment_id})
    return found is not None


def remove(comment_id):
    database.run("DELETE FROM issue_comments WHERE id = %s", (comment_id,))
