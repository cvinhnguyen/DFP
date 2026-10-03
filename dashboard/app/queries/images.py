"""SQL for the images uploaded for newsletters."""

from .. import database


def add(issue_id, filename, mime, data, width, height, user_id):
    return database.row(
        """INSERT INTO images (issue_id, filename, mime, data, width, height, uploaded_by)
           VALUES (%s, %s, %s, %s, %s, %s, %s)
        RETURNING key""",
        (issue_id, filename, mime, data, width, height, user_id))["key"]


def by_key(key):
    return database.row("SELECT key, filename, mime, data, width, height FROM images WHERE key = %s", (key,))


def _like(text):
    return "%" + text.replace("\\", "\\\\").replace("%", "\\%").replace("_", "\\_") + "%"


def page(query, issue_id, limit, offset):
    """One page of images, newest first, with how many there are in all.
    query matches the file name; issue_id keeps one issue's images. The
    pictures from the articles' pages belong to their articles, not here."""
    where = ["item_id IS NULL"]
    params = {"limit": limit, "offset": offset}
    if query:
        where.append("filename ILIKE %(q)s")
        params["q"] = _like(query)
    if issue_id:
        where.append("issue_id = %(issue)s")
        params["issue"] = issue_id
    clause = f"WHERE {' AND '.join(where)}" if where else ""
    rows = database.rows(
        f"""SELECT key, filename, width, height, mime, created_at, octet_length(data) AS bytes,
                   count(*) OVER () AS total
              FROM images {clause}
             ORDER BY created_at DESC, id DESC
             LIMIT %(limit)s OFFSET %(offset)s""",
        params)
    total = rows[0]["total"] if rows else database.row(f"SELECT count(*) AS n FROM images {clause}", params)["n"]
    return rows, total


def used_in(key):
    """The issues whose design or finished email shows the image."""
    return [r["name"] for r in database.rows(
        """SELECT name FROM issues
            WHERE design::text LIKE %(m)s OR html LIKE %(m)s
            ORDER BY created_at DESC""",
        {"m": f"%/media/{key}%"})]


def used_in_templates(key):
    return [r["name"] for r in database.rows(
        "SELECT name FROM newsletter_templates WHERE design::text LIKE %s ORDER BY name",
        (f"%/media/{key}%",))]


def remove(key):
    found = database.row("DELETE FROM images WHERE key = %s RETURNING id", (key,))
    return found is not None
