"""SQL for how long the text of collected articles is kept
(db/init/25-retention.sql).
Jira: DM42-45
"""

from .. import database


def state():
    return database.row(
        """WITH keep AS (
               SELECT coalesce((SELECT nullif(btrim(value), '')::integer
                                  FROM app_settings WHERE key = 'raw_text_retention_days'), 90) AS days
           )
           SELECT keep.days AS keep_days,
                  (SELECT count(*) FROM items WHERE text_removed_at IS NOT NULL) AS removed,
                  -- what the next night takes at the period set now, the same
                  -- rule as clean_up_raw_text()
                  (SELECT count(*) FROM items i
                    WHERE i.created_at < now() - make_interval(days => keep.days)
                      AND i.status NOT IN ('new', 'queued')
                      AND (i.raw_text IS NOT NULL OR i.excerpt IS NOT NULL OR i.author IS NOT NULL)
                      AND NOT EXISTS (SELECT 1 FROM item_picks p
                                       WHERE p.item_id = i.id AND p.decision IN ('picked', 'later'))) AS next_night,
                  (SELECT to_jsonb(r) FROM (SELECT ran_at, items_cleared, chars_removed, cache_removed, kept_in_use, pictures_removed
                                              FROM retention_runs ORDER BY id DESC LIMIT 1) r) AS last_run
             FROM keep""")


def set_days(days):
    database.run(
        "UPDATE app_settings SET value = %s, updated_at = now() WHERE key = 'raw_text_retention_days'",
        (str(days),))
