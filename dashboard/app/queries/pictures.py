"""SQL for the pictures from the articles' own pages (28-article-pictures.sql)."""

from .. import database


def article(item_id):
    """The article a picture is for: its source, what that source's pictures
    are, and the name the credit under the picture gives."""
    return database.row(
        """SELECT i.id, i.source_id,
                  coalesce(s.picture_rights, 'check') AS rights,
                  coalesce(nullif(btrim(i.publisher), ''), s.publisher, s.name) AS credit
             FROM items i
             LEFT JOIN sources s ON s.id = i.source_id
            WHERE i.id = %s""",
        (item_id,))


def same_picture(source_id, sha256, item_id):
    """The other articles of the source that came with the same picture."""
    return [r["id"] for r in database.rows(
        "SELECT id FROM items WHERE source_id = %s AND picture_sha256 = %s AND id <> %s",
        (source_id, sha256, item_id))]


def mark(item_id, status, url, alt, sha256):
    """What came of the article's picture, when none is kept."""
    database.run(
        """WITH gone AS (DELETE FROM images WHERE item_id = %(id)s)
           UPDATE items
              SET picture_status = %(status)s, picture_url = %(url)s, picture_alt = %(alt)s,
                  picture_sha256 = %(sha)s
            WHERE id = %(id)s""",
        {"id": item_id, "status": status, "url": url, "alt": alt, "sha": sha256})


def mark_generic(source_id, sha256):
    """A picture that turned out to be the source's logo: none of the
    source's articles that came with it keeps it."""
    database.run(
        """WITH gone AS (DELETE FROM images img USING items i
                          WHERE img.item_id = i.id AND i.source_id = %(source)s AND i.picture_sha256 = %(sha)s)
           UPDATE items SET picture_status = 'generic'
            WHERE source_id = %(source)s AND picture_sha256 = %(sha)s""",
        {"source": source_id, "sha": sha256})


def store(item_id, mime, data, width, height, credit, rights, url, alt, sha256):
    """Keeps the article's picture, in place of one kept before, and returns
    its key."""
    return database.row(
        """WITH kept AS (
               INSERT INTO images (item_id, filename, mime, data, width, height, credit, rights, source_url)
               VALUES (%(id)s, %(name)s, %(mime)s, %(data)s, %(width)s, %(height)s, %(credit)s, %(rights)s, %(url)s)
               ON CONFLICT (item_id) WHERE item_id IS NOT NULL
               DO UPDATE SET filename = EXCLUDED.filename, mime = EXCLUDED.mime, data = EXCLUDED.data,
                             width = EXCLUDED.width, height = EXCLUDED.height, credit = EXCLUDED.credit,
                             rights = EXCLUDED.rights, source_url = EXCLUDED.source_url
               RETURNING key)
           UPDATE items
              SET picture_status = 'stored', picture_url = %(url)s, picture_alt = %(alt)s,
                  picture_sha256 = %(sha)s
             FROM kept
            WHERE items.id = %(id)s
        RETURNING kept.key""",
        {"id": item_id, "name": f"artikkeli-{item_id}", "mime": mime, "data": data, "width": width,
         "height": height, "credit": credit, "rights": rights, "url": url, "alt": alt, "sha": sha256})["key"]
