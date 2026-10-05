"""SQL for the Google Drive guard (services/drive.py): its settings, the
catalogue of what it last listed in the folder, and its log.
db/init/33-drive.sql."""

import json

from psycopg.types.json import Jsonb

from .. import database

KEYS = ("drive_enabled", "drive_folder_id", "drive_folder_name", "drive_output_folder_id", "drive_check",
        "drive_synced_at", "drive_autosave_sent", "drive_autosave_since")


def settings():
    found = {r["key"]: r["value"] for r in database.rows(
        "SELECT key, value FROM app_settings WHERE key = ANY(%s)", (list(KEYS),))}
    try:
        check = json.loads(found.get("drive_check") or "null")
    except ValueError:
        check = None
    return {
        "enabled": (found.get("drive_enabled") or "").lower() == "true",
        "folder_id": found.get("drive_folder_id") or "",
        "folder_name": found.get("drive_folder_name") or "",
        "output_id": found.get("drive_output_folder_id") or "",
        "check": check,
        "synced": found.get("drive_synced_at") or None,
        "autosave": (found.get("drive_autosave_sent") or "").lower() == "true",
        "autosave_since": found.get("drive_autosave_since") or None,
    }


def put(key, value):
    assert key in KEYS
    database.run("UPDATE app_settings SET value = %s, updated_at = now() WHERE key = %s", (value, key))


def source():
    return database.row("SELECT id, active FROM sources WHERE type = 'drive' ORDER BY id LIMIT 1")


def set_source_active(on):
    database.run("UPDATE sources SET active = %s WHERE type = 'drive'", (on,))


def catalogue():
    return {r["drive_id"]: r for r in database.rows(
        "SELECT drive_id, status, reason, item_id, read_modified_at, gone_at FROM drive_files")}


def remember(entries):
    """What one listing found. A file keeps what was done with it, unless the
    listing says otherwise: a folder, the tool's own, or skipped."""
    with database.pool.connection() as conn, conn.transaction():
        for e in entries:
            conn.execute(
                """INSERT INTO drive_files (drive_id, name, mime_type, parent_id, path, is_folder, size,
                                            modified_at, web_link, status, reason, seen_at, gone_at)
                   VALUES (%(drive_id)s, %(name)s, %(mime_type)s, %(parent_id)s, %(path)s, %(is_folder)s,
                           %(size)s, %(modified_at)s, %(web_link)s, coalesce(%(status)s::text, 'new'), %(reason)s::text,
                           now(), NULL)
                   ON CONFLICT (drive_id) DO UPDATE
                      SET name = EXCLUDED.name, mime_type = EXCLUDED.mime_type, parent_id = EXCLUDED.parent_id,
                          path = EXCLUDED.path, is_folder = EXCLUDED.is_folder, size = EXCLUDED.size,
                          modified_at = EXCLUDED.modified_at, web_link = EXCLUDED.web_link,
                          status = CASE WHEN %(status)s::text IS NOT NULL THEN %(status)s::text
                                        WHEN drive_files.gone_at IS NOT NULL THEN 'new'
                                        ELSE drive_files.status END,
                          reason = CASE WHEN %(status)s::text IS NOT NULL THEN EXCLUDED.reason
                                        WHEN drive_files.gone_at IS NOT NULL THEN NULL
                                        ELSE drive_files.reason END,
                          read_modified_at = CASE WHEN drive_files.gone_at IS NOT NULL THEN NULL
                                                  ELSE drive_files.read_modified_at END,
                          seen_at = now(), gone_at = NULL""", e)


def gone(seen):
    """What the latest listing did not find any more, newly: each file's id,
    name and the article made of it."""
    return database.rows(
        """UPDATE drive_files SET gone_at = now()
            WHERE gone_at IS NULL AND NOT (drive_id = ANY(%s))
        RETURNING drive_id, name, mime_type, item_id""", (list(seen),))


def mark(drive_id, status, reason, item_id=None, read_modified_at=None):
    database.run(
        """UPDATE drive_files SET status = %s, reason = %s::text,
                  item_id = coalesce(%s::bigint, item_id),
                  read_modified_at = coalesce(%s::timestamptz, read_modified_at)
            WHERE drive_id = %s""", (status, reason, item_id, read_modified_at, drive_id))


def reset():
    """Another folder was chosen: the old one's listing no longer counts,
    nor do the previews of its pictures."""
    with database.pool.connection() as conn, conn.transaction():
        conn.execute("DELETE FROM drive_files")
        conn.execute("DELETE FROM drive_thumbs")


def requeue(item_id):
    """A document that changed gets a new summary of its new text. It goes
    through the filter again, so one that was too short to summarise and
    has grown is summarised now."""
    database.run("""UPDATE items SET status = 'new', status_reason = 'the Drive document changed'
                     WHERE id = %s AND status IN ('summarised', 'filtered_out', 'summary_failed')""", (item_id,))


def log(user_id, actor, action, outcome, reason, drive_id, name, detail):
    database.run(
        """INSERT INTO drive_log (user_id, actor, action, outcome, reason, drive_id, name, detail)
           VALUES (%s, %s, %s, %s, %s, %s, %s, %s)""",
        (user_id, actor, action, outcome, reason, drive_id, name, Jsonb(detail) if detail else None))


def recent_log(limit):
    return database.rows(
        """SELECT id, at, actor, action, outcome, reason, name, detail
             FROM drive_log ORDER BY at DESC, id DESC LIMIT %s""", (limit,))


def counts():
    found = database.row(
        """SELECT count(*) FILTER (WHERE NOT is_folder AND gone_at IS NULL) AS files,
                  count(*) FILTER (WHERE status = 'read' AND gone_at IS NULL) AS read,
                  count(*) FILTER (WHERE status = 'refused' AND gone_at IS NULL) AS refused,
                  count(*) FILTER (WHERE status = 'skipped' AND NOT is_folder AND gone_at IS NULL) AS skipped,
                  count(*) FILTER (WHERE status = 'waiting' AND gone_at IS NULL) AS waiting
             FROM drive_files""")
    return dict(found) if found else {}


# --- following the documents (34-drive-library.sql) -------------------------------

# Where an article is in a newsletter: picked for one, draft or sent, or
# placed in a draft's email.
IN_A_NEWSLETTER = """(
       EXISTS (SELECT 1 FROM item_picks p WHERE p.item_id = i.id AND p.decision = 'picked')
    OR EXISTS (SELECT 1 FROM issues iss
                WHERE iss.status = 'draft'
                  AND jsonb_path_exists(iss.design, '$.** ? (@.itemId == $id || @.itemId == $text)',
                                        jsonb_build_object('id', i.id, 'text', i.id::text)))
)"""


def withdraw(item_id, reason):
    """An article whose document left the folder, or became one the guard
    does not read. One no newsletter has is deleted, with its summary, tags
    and picks. One a newsletter has keeps only what the newsletter needs:
    its text goes, and it leaves every list. Returns deleted, withdrawn, or
    None when there is no such article."""
    with database.pool.connection() as conn, conn.transaction():
        found = conn.execute(f"SELECT i.id, {IN_A_NEWSLETTER} AS kept FROM items i WHERE i.id = %s FOR UPDATE",
                             (item_id,)).fetchone()
        if not found:
            return None
        if not found["kept"]:
            conn.execute("DELETE FROM items WHERE id = %s", (item_id,))
            return "deleted"
        conn.execute(
            """UPDATE items SET withdrawn_at = coalesce(withdrawn_at, now()), withdrawn_reason = %s,
                      raw_text = NULL, excerpt = NULL, author = NULL,
                      text_removed_at = coalesce(text_removed_at, now())
                WHERE id = %s""", (reason, item_id))
        return "withdrawn"


def restore(item_id):
    """The document is back in the folder: so is its article."""
    database.run("UPDATE items SET withdrawn_at = NULL, withdrawn_reason = NULL WHERE id = %s AND withdrawn_at IS NOT NULL",
                 (item_id,))


def clean_up_withdrawn():
    """Taken-away articles no newsletter has any more, deleted. How many."""
    found = database.rows(f"""DELETE FROM items i WHERE i.withdrawn_at IS NOT NULL AND NOT {IN_A_NEWSLETTER}
                              RETURNING i.id""")
    return len(found)


def drive_item_ids():
    """Every article from the Drive folder still in the tool."""
    return [r["id"] for r in database.rows(
        """SELECT i.id FROM items i JOIN sources s ON s.id = i.source_id
            WHERE s.type = 'drive' AND i.withdrawn_at IS NULL""")]


def in_a_newsletter(item_id):
    found = database.row(f"SELECT {IN_A_NEWSLETTER} AS kept FROM items i WHERE i.id = %s", (item_id,))
    return bool(found and found["kept"])


def changed(item_id, at):
    """The document changed after its article went into a newsletter."""
    database.run(
        """INSERT INTO drive_changes (item_id, changed_at) VALUES (%s, %s)
           ON CONFLICT (item_id) DO UPDATE SET changed_at = EXCLUDED.changed_at, seen_at = NULL, seen_by = NULL""",
        (item_id, at))


def change_seen(item_id, user_id):
    found = database.row(
        """UPDATE drive_changes SET seen_at = now(), seen_by = %s
            WHERE item_id = %s AND seen_at IS NULL RETURNING item_id""", (user_id, item_id))
    return bool(found)


# --- saves --------------------------------------------------------------------------------


def saved(kind, name, folder, file_id, link, folder_link, user_id, item_id=None, issue_id=None):
    database.run(
        """INSERT INTO drive_saves (kind, item_id, issue_id, name, folder, file_id, link, folder_link, saved_by)
           VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s)""",
        (kind, item_id, issue_id, name, folder, file_id, link, folder_link, user_id))


def unsaved_sent(since, limit=3):
    """Newsletters sent since then that have not been saved since they were
    sent, oldest first."""
    return [r["id"] for r in database.rows(
        """SELECT iss.id FROM issues iss
            WHERE iss.status = 'sent' AND iss.sent_at >= %s
              AND NOT EXISTS (SELECT 1 FROM drive_saves ds
                               WHERE ds.issue_id = iss.id AND ds.kind = 'newsletter' AND ds.saved_at >= iss.sent_at)
            ORDER BY iss.sent_at LIMIT %s""", (since, limit))]


# --- the folder's files, as the pages list them ------------------------------------------------


def file_list():
    """Everything the last listing found in the folder, with what became of
    each: the article made of it, and how far it is."""
    return database.rows(
        """SELECT f.drive_id, f.name, f.mime_type, f.path, f.is_folder, f.size, f.modified_at, f.web_link,
                  f.status, f.reason, f.item_id, i.status AS item_status, i.withdrawn_at IS NOT NULL AS withdrawn
             FROM drive_files f
             LEFT JOIN items i ON i.id = f.item_id
            WHERE f.gone_at IS NULL
            ORDER BY lower(f.path), f.is_folder DESC, lower(f.name)""")


def catalogue_file(drive_id):
    return database.row(
        """SELECT drive_id, name, mime_type, parent_id, path, size, modified_at, status, gone_at
             FROM drive_files WHERE drive_id = %s""", (drive_id,))


def folder_ids():
    """The folders under the chosen one that the last listing read into."""
    return {r["drive_id"] for r in database.rows(
        "SELECT drive_id FROM drive_files WHERE is_folder AND status = 'folder' AND gone_at IS NULL")}


def pictures():
    """The pictures in the folder, as the last listing found them, newest first."""
    return database.rows(
        """SELECT f.drive_id, f.name, f.mime_type, f.path, f.size, f.modified_at,
                  (SELECT img.key FROM images img WHERE img.drive_id = f.drive_id
                    ORDER BY img.created_at DESC LIMIT 1) AS image_key
             FROM drive_files f
            WHERE NOT f.is_folder AND f.gone_at IS NULL AND f.mime_type LIKE 'image/%%'
            ORDER BY f.modified_at DESC NULLS LAST, lower(f.name)""")


def thumb(drive_id, modified_at):
    found = database.row(
        "SELECT data FROM drive_thumbs WHERE drive_id = %s AND modified_at IS NOT DISTINCT FROM %s",
        (drive_id, modified_at))
    return bytes(found["data"]) if found else None


def put_thumb(drive_id, modified_at, data):
    database.run(
        """INSERT INTO drive_thumbs (drive_id, modified_at, data) VALUES (%s, %s, %s)
           ON CONFLICT (drive_id) DO UPDATE SET modified_at = EXCLUDED.modified_at, data = EXCLUDED.data,
                                               made_at = now()""", (drive_id, modified_at, data))


def drop_thumbs(drive_ids):
    database.run("DELETE FROM drive_thumbs WHERE drive_id = ANY(%s)", (list(drive_ids),))


def picture_of(item_id):
    """An article's own picture, with whose it is, for saving it along."""
    found = database.row(
        """SELECT img.data, img.mime, img.credit, coalesce(img.rights, 'check') AS rights
             FROM images img WHERE img.item_id = %s""", (item_id,))
    if found:
        found["data"] = bytes(found["data"])
    return found


def pictures_from(drive_ids):
    """The Kuvapankki pictures brought in from these files."""
    return [str(r["key"]) for r in database.rows(
        "SELECT key FROM images WHERE drive_id = ANY(%s)", (list(drive_ids),))]
