"""SQL for the designs the editors saved for reuse: whole emails (templates)
and single sections."""

from psycopg.types.json import Jsonb

from .. import database

COLUMNS = """
SELECT t.id, t.kind, t.name, t.design, t.created_at, t.updated_at,
       cu.display_name AS created_by, uu.display_name AS updated_by
  FROM newsletter_templates t
  LEFT JOIN users cu ON cu.id = t.created_by
  LEFT JOIN users uu ON uu.id = t.updated_by
"""


def listed(kind):
    return database.rows(COLUMNS + " WHERE t.kind = %s ORDER BY t.updated_at DESC, t.id DESC LIMIT 200", (kind,))


def one(template_id):
    return database.row(COLUMNS + " WHERE t.id = %s", (template_id,))


def add(kind, name, design, user_id):
    return database.row(
        """INSERT INTO newsletter_templates (kind, name, design, created_by, updated_by)
           VALUES (%s, %s, %s, %s, %s) RETURNING id""",
        (kind, name, Jsonb(design), user_id, user_id))["id"]


def update(template_id, name, design, user_id):
    """Changes the name, the design or both; None leaves one as it is."""
    found = database.row(
        """UPDATE newsletter_templates
              SET name = coalesce(%s, name), design = coalesce(%s, design),
                  updated_by = %s, updated_at = now()
            WHERE id = %s
        RETURNING id""",
        (name, Jsonb(design) if design is not None else None, user_id, template_id))
    return found is not None


def remove(template_id):
    found = database.row("DELETE FROM newsletter_templates WHERE id = %s RETURNING id", (template_id,))
    return found is not None
