"""SQL for the sources as Asetukset → Lähteet keeps them (36-sources.sql):
each source with what it has brought and how its checks went, changing one,
the links a watched page has had, and the sites suggested from the past
newsletters and the member organisations.
Jira: DM42-29, DM42-47
"""

from .. import database

# Each source with what the page shows about it. weeks is {weeks ago: new
# articles} for the last twelve weeks; the newest finished check says how
# the source is doing.
LISTING = """
WITH runs AS (
    SELECT r.source_id,
           count(*) FILTER (WHERE r.started_at > now() - interval '30 days')                       AS runs_30,
           count(*) FILTER (WHERE r.started_at > now() - interval '30 days' AND r.error IS NOT NULL) AS errors_30,
           min(r.started_at)                                                                       AS first_run,
           bool_or(r.finished_at IS NULL AND r.started_at > now() - interval '30 minutes')         AS running
      FROM collection_runs r
     GROUP BY r.source_id
),
latest AS (
    SELECT DISTINCT ON (r.source_id) r.source_id, r.started_at, r.items_found, r.items_new, r.error
      FROM collection_runs r
     WHERE r.finished_at IS NOT NULL
     ORDER BY r.source_id, r.started_at DESC
),
articles AS (
    SELECT i.source_id, count(*) AS total,
           count(*) FILTER (WHERE i.created_at > now() - interval '30 days') AS new_30,
           max(i.created_at) AS last_item_at
      FROM items i
     GROUP BY i.source_id
),
weeks AS (
    SELECT i.source_id, floor(extract(epoch FROM now() - i.created_at) / 604800)::int AS ago, count(*) AS n
      FROM items i
     WHERE i.created_at > now() - interval '84 days'
     GROUP BY 1, 2
),
picks AS (
    SELECT i.source_id,
           count(*) FILTER (WHERE p.decision = 'picked')                         AS picked,
           count(*) FILTER (WHERE p.decision = 'picked' AND iss.status = 'sent') AS sent
      FROM item_picks p
      JOIN items i       ON i.id = p.item_id
      LEFT JOIN issues iss ON iss.id = p.issue_id
     GROUP BY i.source_id
)
SELECT s.id, s.name, s.url, s.homepage, s.type, s.language, s.publisher, s.active, s.filter_mode,
       s.fetch_full_text, s.picture_rights, s.suggested_section, s.notes, s.created_at, s.last_checked_at,
       s.changed_at, cu.display_name AS changed_by, au.display_name AS added_by,
       coalesce(a.total, 0)::int    AS total,
       coalesce(a.new_30, 0)::int   AS new_30,
       a.last_item_at,
       coalesce(p.picked, 0)::int   AS picked,
       coalesce(p.sent, 0)::int     AS sent,
       coalesce(r.runs_30, 0)::int  AS runs_30,
       coalesce(r.errors_30, 0)::int AS errors_30,
       r.first_run,
       coalesce(r.running, FALSE)   AS running,
       l.started_at AS last_run_at, l.items_found AS last_found, l.items_new AS last_new, l.error AS last_error,
       (SELECT jsonb_object_agg(w.ago, w.n) FROM weeks w WHERE w.source_id = s.id) AS weeks
  FROM sources s
  LEFT JOIN articles a ON a.source_id = s.id
  LEFT JOIN picks p    ON p.source_id = s.id
  LEFT JOIN runs r     ON r.source_id = s.id
  LEFT JOIN latest l   ON l.source_id = s.id
  LEFT JOIN users cu   ON cu.id = s.changed_by
  LEFT JOIN users au   ON au.id = s.added_by
"""


def listing():
    return database.rows(LISTING + " ORDER BY lower(s.name), s.id")


def one(source_id):
    return database.row(LISTING + " WHERE s.id = %s", (source_id,))


def runs(source_id, limit=10):
    return database.rows(
        """SELECT started_at, finished_at, items_found, items_new, error
             FROM collection_runs WHERE source_id = %s
            ORDER BY started_at DESC LIMIT %s""",
        (source_id, limit))


def latest_items(source_id, limit=5):
    """The source's newest articles, as Artikkelit would open them."""
    return database.rows(
        """SELECT i.id, i.title, i.source_url AS url, i.created_at, i.status, p.decision
             FROM items i
             LEFT JOIN item_picks p ON p.item_id = i.id
            WHERE i.source_id = %s AND i.withdrawn_at IS NULL
            ORDER BY i.created_at DESC, i.id DESC
            LIMIT %s""",
        (source_id, limit))


def same_address(url):
    """A source already read from this address, as the database compares
    addresses (canonicalise_url, 10-dedup.sql)."""
    return database.row(
        """SELECT id, name, active, type FROM sources
            WHERE canonicalise_url(url) = canonicalise_url(%(url)s)
               OR (homepage IS NOT NULL AND type = 'watch'
                   AND canonicalise_url(homepage) = canonicalise_url(%(url)s))
            ORDER BY active DESC, id LIMIT 1""",
        {"url": url})


def on_site(host):
    """The sources already read from the same site, by name."""
    return database.rows(
        """SELECT id, name, active, type FROM sources
            WHERE %(host)s IN (substring(canonicalise_url(url) FROM '^https://([^/]+)'),
                               substring(canonicalise_url(coalesce(homepage, '')) FROM '^https://([^/]+)'))
            ORDER BY active DESC, lower(name)""",
        {"host": host})


def create(fields, user_id):
    """A new source. Raises UniqueViolation for an address already read."""
    return database.row(
        """INSERT INTO sources (name, url, type, homepage, language, publisher, filter_mode, fetch_full_text,
                                picture_rights, suggested_section, section_answered_at, section_answered_by,
                                check_frequency_minutes, active, added_by)
           VALUES (%(name)s, %(url)s, %(type)s, %(homepage)s, %(language)s, %(publisher)s, %(filter_mode)s,
                   %(fetch_full_text)s, %(picture_rights)s, %(section)s,
                   CASE WHEN %(section)s::text IS NOT NULL THEN now() END,
                   CASE WHEN %(section)s::text IS NOT NULL THEN %(user)s::int END,
                   1440, TRUE, %(user)s)
        RETURNING id""",
        {**fields, "user": user_id})["id"]


# What an admin may change here; the section and the pictures have their own
# endpoints, which do more than set a column.
EDITABLE = ("name", "publisher", "language", "filter_mode", "notes", "active", "url", "type", "homepage",
            "fetch_full_text")


def update(source_id, changes, user_id):
    changes = {k: v for k, v in changes.items() if k in EDITABLE}
    if not changes:
        return
    columns = ", ".join(f"{name} = %({name})s" for name in changes)
    database.run(
        f"UPDATE sources SET {columns}, changed_at = now(), changed_by = %(user)s WHERE id = %(id)s",
        {**changes, "user": user_id, "id": source_id})


def remove(source_id):
    """Deletes a source that never brought an article; with articles it
    stays, so they keep where they came from. True when it went."""
    found = database.row(
        """DELETE FROM sources s WHERE s.id = %s
              AND NOT EXISTS (SELECT 1 FROM items i WHERE i.source_id = s.id)
        RETURNING id""",
        (source_id,))
    return found is not None


# ---------- a watched page ----------

def watched(source_id):
    return {r["canonical_url"] for r in database.rows(
        "SELECT canonical_url FROM watch_links WHERE source_id = %s", (source_id,))}


def watched_add(source_id, links):
    """links: [{key, url, title, item_id}], key being the address as
    watch.py compares them."""
    if not links:
        return
    with database.pool.connection() as conn, conn.transaction():
        for link in links:
            conn.execute(
                """INSERT INTO watch_links (source_id, canonical_url, url, title, item_id)
                   VALUES (%s, %s, %s, %s, %s)
                   ON CONFLICT (source_id, canonical_url) DO UPDATE
                      SET item_id = coalesce(EXCLUDED.item_id, watch_links.item_id)""",
                (source_id, link["key"], link["url"], link["title"], link["item_id"]))


# ---------- suggested sites ----------

# The sites the past newsletters linked to at least twice, and the member
# organisations' sites, that no source reads, switched on or off, with what
# the dashboard found on each when it last looked.
SUGGESTIONS = """
WITH known AS (
    SELECT DISTINCT substring(canonicalise_url(u) FROM '^https://([^/]+)') AS host
      FROM sources s, unnest(ARRAY[s.url, s.homepage]) u
     WHERE u ~* '^https?://'
),
archive AS (
    SELECT substring(e.canonical_url FROM '^https://([^/]+)') AS host,
           count(*)::int AS links, count(DISTINCT e.issue_id)::int AS newsletters,
           max(a.sent_on) AS last_sent
      FROM archive_entries e
      JOIN archive_issues a ON a.id = e.issue_id
     GROUP BY 1
),
member AS (
    SELECT DISTINCT ON (m.host) m.host, m.name, m.website
      FROM members m WHERE m.listed ORDER BY m.host, m.id
),
sites AS (
    SELECT coalesce(a.host, m.host) AS host, coalesce(a.links, 0) AS links,
           coalesce(a.newsletters, 0) AS newsletters, a.last_sent, m.name AS member, m.website
      FROM archive a
      FULL JOIN member m ON m.host = a.host
     WHERE coalesce(a.links, 0) >= 2 OR m.host IS NOT NULL
)
SELECT x.host, x.links, x.newsletters, x.last_sent, x.member, x.website,
       ss.result, ss.feed_url, ss.feed_title, ss.feed_items, ss.per_month, ss.checked_at,
       ss.dismissed_at, du.display_name AS dismissed_by
  FROM sites x
  LEFT JOIN source_suggestions ss ON ss.host = x.host
  LEFT JOIN users du ON du.id = ss.dismissed_by
 WHERE x.host IS NOT NULL
   AND NOT EXISTS (SELECT 1 FROM known k WHERE x.host = k.host OR x.host LIKE '%%.' || k.host)
 ORDER BY x.newsletters DESC, x.links DESC, x.member NULLS LAST, x.host
"""


def suggestions():
    return database.rows(SUGGESTIONS)


def suggestion_found(host, found):
    """What looking at a site found: found has result, feed_url,
    feed_title, feed_items and per_month."""
    database.run(
        """INSERT INTO source_suggestions (host, result, feed_url, feed_title, feed_items, per_month, checked_at)
           VALUES (%(host)s, %(result)s, %(feed_url)s, %(feed_title)s, %(feed_items)s, %(per_month)s, now())
           ON CONFLICT (host) DO UPDATE
              SET result = EXCLUDED.result, feed_url = EXCLUDED.feed_url, feed_title = EXCLUDED.feed_title,
                  feed_items = EXCLUDED.feed_items, per_month = EXCLUDED.per_month, checked_at = now()""",
        {"host": host, **found})


def suggestion_dismissed(host, user_id, dismissed=True):
    database.run(
        """INSERT INTO source_suggestions (host, dismissed_at, dismissed_by)
           VALUES (%(host)s, CASE WHEN %(no)s THEN now() END, CASE WHEN %(no)s THEN %(user)s::int END)
           ON CONFLICT (host) DO UPDATE
              SET dismissed_at = EXCLUDED.dismissed_at, dismissed_by = EXCLUDED.dismissed_by""",
        {"host": host, "user": user_id, "no": dismissed})
