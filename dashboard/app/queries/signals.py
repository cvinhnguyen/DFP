"""SQL for weak signals: topics that keep coming up in the news, found by
n8n/workflows/signal-detection.json, each with the articles it came from.
Jira: DM42-40
"""

from .. import database

# Each signal with how many articles it came from and those articles, newest
# first, for a WHERE and a GROUP BY g.id to follow.
SIGNALS = """SELECT g.id, g.topic, g.kind, g.reason, g.score::float AS score,
                  g.period_start, g.period_end, g.detected_on,
                  count(i.id) AS articles,
                  coalesce(jsonb_agg(jsonb_build_object(
                               'id', i.id, 'title', i.title,
                               'url', coalesce(i.canonical_url, i.source_url),
                               'publisher', coalesce(nullif(btrim(i.publisher), ''), s.publisher),
                               'published_at', i.published_at)
                           ORDER BY i.published_at DESC) FILTER (WHERE i.id IS NOT NULL), '[]') AS items
             FROM signals g
             LEFT JOIN signal_items si ON si.signal_id = g.id
             LEFT JOIN items i ON i.id = si.item_id
             LEFT JOIN sources s ON s.id = i.source_id"""


def recent(days):
    return database.rows(
        SIGNALS + """
            WHERE g.status <> 'dismissed'
              AND g.detected_on >= current_date - %s
            GROUP BY g.id
            ORDER BY g.detected_on DESC, count(i.id) DESC, g.score DESC NULLS LAST, g.topic""",
        (days,))


def one(signal_id):
    """A signal as recent() gives them, or None."""
    return database.row(SIGNALS + " WHERE g.id = %s GROUP BY g.id", (signal_id,))


def for_writing(signal_id, limit):
    """The articles a signal came from, as the AI reads them to say why the
    topic matters: the Finnish title and summary where there is one, the
    ones with a summary first, newest first."""
    return database.rows(
        """SELECT coalesce(CASE WHEN coalesce(i.source_language, s.language) IS DISTINCT FROM 'fi'
                                THEN nullif(btrim(sm.title), '') END, i.title) AS title,
                  coalesce(nullif(btrim(i.publisher), ''), s.publisher) AS publisher,
                  coalesce(sm.text, nullif(btrim(i.excerpt), '')) AS summary
             FROM signal_items si
             JOIN items i           ON i.id = si.item_id
             LEFT JOIN sources s    ON s.id = i.source_id
             LEFT JOIN summaries sm ON sm.item_id = i.id AND sm.language = 'fi'
            WHERE si.signal_id = %s
            ORDER BY sm.text IS NULL, i.published_at DESC NULLS LAST
            LIMIT %s""",
        (signal_id, limit))
