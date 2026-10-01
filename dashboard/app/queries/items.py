"""SQL for the collected articles: listing, searching, counting, and queuing
one for a summary.
Jira: DM42-31

Search covers the title, the publisher's own description and the Finnish
summary, two ways at once. Finnish words are matched by their stem, so
tekoäly also finds tekoälyn. And the text is matched as typed, so the start
of a word or a name like Sitra is found too.
"""

from .. import database

# What each view shows: the editors' decisions first, then what the AI step
# did with an article.
VIEWS = {
    "review": "i.status = 'summarised' AND p.item_id IS NULL",
    "picked": "p.decision = 'picked' AND iss.status = 'draft'",
    "later": "p.decision = 'later'",
    "dismissed": "p.decision = 'dismissed'",
    "used": "p.decision = 'picked' AND iss.status = 'sent'",
    "waiting": "i.status IN ('new', 'queued')",
    "skipped": "i.status = 'filtered_out'",
    "attention": "i.status IN ('summary_failed', 'manual')",
    "all": "TRUE",
}

FROM = """
  FROM items i
  LEFT JOIN sources s     ON s.id = i.source_id
  LEFT JOIN summaries sm  ON sm.item_id = i.id AND sm.language = 'fi'
  LEFT JOIN item_picks p  ON p.item_id = i.id
  LEFT JOIN issues iss    ON iss.id = p.issue_id
"""

COLUMNS = """
SELECT i.id,
       i.title,
       i.source_url                            AS url,
       coalesce(nullif(btrim(i.publisher), ''), s.publisher,
                substring(coalesce(i.canonical_url, i.source_url) FROM '^https?://([^/?#]+)'))
                                               AS publisher,
       s.id                                    AS source_id,
       s.name                                  AS source,
       s.type                                  AS source_type,
       u.display_name                          AS sent_by,
       i.published_at,
       i.created_at                            AS collected_at,
       coalesce(i.source_language, s.language) AS language,
       i.status,
       i.status_reason,
       i.section,
       nullif(btrim(i.excerpt), '')            AS excerpt,
       length(coalesce(i.raw_text, ''))        AS text_length,
       CASE WHEN sm.id IS NOT NULL THEN
            jsonb_build_object('text', sm.text, 'model', sm.model, 'made_at', sm.generated_at)
       END                                     AS summary,
       i.duplicate_of,
       d.title                                 AS duplicate_of_title,
       coalesce((SELECT jsonb_agg(jsonb_build_object('id', c.id, 'url', c.source_url,
                                                     'source', cs.name, 'publisher', c.publisher)
                                  ORDER BY c.id)
                   FROM items c
                   LEFT JOIN sources cs ON cs.id = c.source_id
                  WHERE c.duplicate_of = i.id), '[]'::jsonb) AS copies,
       coalesce((SELECT jsonb_agg(jsonb_build_object('id', g.id, 'topic', g.topic) ORDER BY g.topic)
                   FROM signal_items si
                   JOIN signals g ON g.id = si.signal_id
                  WHERE si.item_id = i.id
                    AND g.status <> 'dismissed'), '[]'::jsonb) AS signals,
       p.decision,
       p.section                               AS pick_section,
       p.issue_id                              AS pick_issue_id,
       iss.name                                AS pick_issue_name,
       iss.status                              AS pick_issue_status,
       pu.display_name                         AS decided_by,
       p.decided_at
""" + FROM + """
  LEFT JOIN users u  ON u.id = i.captured_by
  LEFT JOIN items d  ON d.id = i.duplicate_of
  LEFT JOIN users pu ON pu.id = p.decided_by
"""

COUNTS = "SELECT " + ",\n       ".join(
    f'count(*) FILTER (WHERE {condition}) AS "{view}"' for view, condition in VIEWS.items()) + FROM

TITLE_TEXT = "to_tsvector('finnish', coalesce(i.title, '') || ' ' || coalesce(i.excerpt, ''))"
QUERY = "websearch_to_tsquery('finnish', %(q)s)"

SEARCH = f"""(
       {TITLE_TEXT} @@ {QUERY}
    OR sm.search    @@ {QUERY}
    OR i.title      ILIKE %(like)s
    OR sm.text      ILIKE %(like)s
    OR i.publisher  ILIKE %(like)s
    OR s.name       ILIKE %(like)s
)"""

# A match in the title counts twice what a match in the summary does.
RANK = f"""(
      2 * ts_rank({TITLE_TEXT}, {QUERY})
    + ts_rank(coalesce(sm.search, ''::tsvector), {QUERY})
    + CASE WHEN i.title ILIKE %(like)s THEN 1 ELSE 0 END
)"""

# When an article was first stored. fetched_at is not that: the ingest API
# moves it forward every time a source sends the same article again.
ARRIVED = "i.created_at"
ARTICLE_DATE = f"coalesce(i.published_at, {ARRIVED})"

ORDER = {
    # Newest arrivals first. One collection run stores its articles with the
    # same time, so inside a run the newest publication comes first.
    "collected": f"{ARRIVED} DESC, {ARTICLE_DATE} DESC, i.id DESC",
    "published": f"{ARTICLE_DATE} DESC, i.id DESC",
    "relevance": f"{RANK} DESC, {ARTICLE_DATE} DESC, i.id DESC",
}


def like_pattern(text):
    """The text as a literal ILIKE pattern, so a % or _ the editor typed is
    searched for rather than treated as a wildcard."""
    return "%" + text.replace("\\", "\\\\").replace("%", "\\%").replace("_", "\\_") + "%"


def filters(q=None, source=None, language=None, signal=None, section=None, date_from=None, date_to=None):
    """The WHERE conditions and their parameters for the chosen filters. Only
    fixed SQL goes into the conditions; everything the editor typed travels as
    a parameter."""
    where, params = [], {}
    if q:
        where.append(SEARCH)
        params.update(q=q, like=like_pattern(q))
    if source is not None:
        where.append("i.source_id = %(source)s")
        params["source"] = source
    if language == "unknown":
        where.append("coalesce(i.source_language, s.language) IS NULL")
    elif language:
        where.append("coalesce(i.source_language, s.language) = %(language)s")
        params["language"] = language
    if signal is not None:
        where.append("EXISTS (SELECT 1 FROM signal_items si"
                     " WHERE si.item_id = i.id AND si.signal_id = %(signal)s)")
        params["signal"] = signal
    if section:
        where.append("p.decision = 'picked' AND p.section = %(section)s")
        params["section"] = section
    # Dates are Finnish days: "from 1.10." starts at midnight in Helsinki.
    if date_from:
        where.append(f"{ARTICLE_DATE} >= (%(date_from)s::date::timestamp AT TIME ZONE 'Europe/Helsinki')")
        params["date_from"] = date_from
    if date_to:
        where.append(f"{ARTICLE_DATE} < ((%(date_to)s::date + 1)::timestamp AT TIME ZONE 'Europe/Helsinki')")
        params["date_to"] = date_to
    return where, params


def where_sql(conditions):
    return " WHERE " + " AND ".join(conditions) if conditions else ""


def counts(where, params):
    return database.row(COUNTS + where_sql(where), params)


def page(where, params, view, sort, limit, offset):
    return database.rows(
        COLUMNS + where_sql(where + [VIEWS[view]])
        + f" ORDER BY {ORDER[sort]} LIMIT %(limit)s OFFSET %(offset)s",
        {**params, "limit": limit, "offset": offset})


def one(item_id):
    return database.row(COLUMNS + " WHERE i.id = %(id)s", {"id": item_id})


def request_summary(item_id, requested_by):
    """Queues a skipped or failed article for the AI, through
    request_summary() in 11-filter.sql, and records who asked."""
    with database.pool.connection() as conn, conn.transaction():
        queued = conn.execute("SELECT request_summary(%s) AS ok", (item_id,)).fetchone()["ok"]
        if queued:
            conn.execute("UPDATE items SET status_reason = %s WHERE id = %s",
                         (f"requested by {requested_by}", item_id))
    return queued


def filter_options():
    sources = database.rows(
        """SELECT s.id, s.name, count(*) AS items
             FROM sources s
             JOIN items i ON i.source_id = s.id
            GROUP BY s.id
            ORDER BY s.name""")
    languages = database.rows(
        """SELECT coalesce(i.source_language, s.language) AS code, count(*) AS items
             FROM items i
             LEFT JOIN sources s ON s.id = i.source_id
            GROUP BY 1
            ORDER BY 2 DESC""")
    signals = database.rows(
        """SELECT g.id, g.topic, count(*) AS items
             FROM signals g
             JOIN signal_items si ON si.signal_id = g.id
            WHERE g.status <> 'dismissed'
            GROUP BY g.id
            ORDER BY g.topic""")
    return {"sources": sources, "languages": languages, "signals": signals}
