"""SQL for the Google Drive guard (services/drive.py): its settings, the
catalogue of what it last listed in the folder, and its log.
db/init/33-drive.sql."""

import json

from psycopg.types.json import Jsonb

from .. import database

KEYS = ("drive_enabled", "drive_folder_id", "drive_folder_name", "drive_output_folder_id", "drive_check",
        "drive_synced_at")


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
        "SELECT drive_id, status, reason, item_id, read_modified_at FROM drive_files")}


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
                          status = coalesce(%(status)s::text, drive_files.status),
                          reason = CASE WHEN %(status)s::text IS NULL THEN drive_files.reason ELSE EXCLUDED.reason END,
                          seen_at = now(), gone_at = NULL""", e)


def gone(seen):
    """What the latest listing did not find any more."""
    database.run("UPDATE drive_files SET gone_at = now() WHERE gone_at IS NULL AND NOT (drive_id = ANY(%s))",
                 (list(seen),))


def mark(drive_id, status, reason, item_id=None, read_modified_at=None):
    database.run(
        """UPDATE drive_files SET status = %s, reason = %s::text,
                  item_id = coalesce(%s::bigint, item_id),
                  read_modified_at = coalesce(%s::timestamptz, read_modified_at)
            WHERE drive_id = %s""", (status, reason, item_id, read_modified_at, drive_id))


def reset():
    """Another folder was chosen: the old one's listing no longer counts."""
    database.run("DELETE FROM drive_files")


def requeue(item_id):
    """A document that changed gets a new summary of its new text."""
    database.run("""UPDATE items SET status = 'queued', status_reason = 'the Drive document changed'
                     WHERE id = %s AND status IN ('summarised', 'skipped', 'failed')""", (item_id,))


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
