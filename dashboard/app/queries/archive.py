"""SQL for the association's past newsletters (db/init/26-archive.sql), and
how each entry compares with what the system has.
Jira: DM42-47
"""

from .. import database


def save_issue(url, subject, sent_on, entries):
    """Adds a newsletter, or replaces one imported before, with its entries."""
    with database.pool.connection() as conn, conn.transaction():
        issue = conn.execute(
            """INSERT INTO archive_issues (url, subject, sent_on) VALUES (%s, %s, %s)
               ON CONFLICT (url) DO UPDATE
                  SET subject = EXCLUDED.subject,
                      sent_on = coalesce(EXCLUDED.sent_on, archive_issues.sent_on),
                      imported_at = now()
               RETURNING id""",
            (url, subject, sent_on)).fetchone()
        conn.execute("DELETE FROM archive_entries WHERE issue_id = %s", (issue["id"],))
        for position, e in enumerate(entries, 1):
            conn.execute(
                """INSERT INTO archive_entries (issue_id, position, heading, link_text, url, canonical_url)
                   VALUES (%s, %s, %s, %s, %s, canonicalise_url(%s))
                   ON CONFLICT (issue_id, canonical_url) DO NOTHING""",
                (issue["id"], position, e["heading"], e["link_text"], e["url"], e["url"]))
        return issue["id"]


# Each entry against the system: the site it is on, whether a source we
# follow is on that site, and the article if we collected it. "In time" means
# collected by the day the newsletter went out.
ENTRIES = """
    WITH followed AS (
        SELECT DISTINCT substring(canonicalise_url(u) FROM '^https://([^/]+)') AS host
          FROM sources s, unnest(ARRAY[s.url, s.homepage]) u
         WHERE s.active AND u ~* '^https?://'
    )
    SELECT e.id, e.issue_id, e.position, e.heading, e.link_text, e.url,
           substring(e.canonical_url FROM '^https://([^/]+)') AS host,
           EXISTS (SELECT 1 FROM followed f
                    WHERE substring(e.canonical_url FROM '^https://([^/]+)') = f.host
                       OR substring(e.canonical_url FROM '^https://([^/]+)') LIKE '%%.' || f.host) AS followed,
           i.id AS item_id, i.title AS item_title, i.status AS item_status, i.created_at AS collected_at,
           s.name AS item_source,
           i.id IS NOT NULL AND (a.sent_on IS NULL OR i.created_at::date <= a.sent_on) AS in_time
      FROM archive_entries e
      JOIN archive_issues a ON a.id = e.issue_id
      LEFT JOIN items i ON i.canonical_url = e.canonical_url
      LEFT JOIN sources s ON s.id = i.source_id
"""


def issues():
    return database.rows(
        f"""WITH e AS ({ENTRIES})
            SELECT a.id, a.subject, a.sent_on, a.url, a.imported_at,
                   count(e.id)                        AS entries,
                   count(e.id) FILTER (WHERE e.followed) AS followed,
                   count(e.item_id)                   AS collected,
                   count(e.id) FILTER (WHERE e.in_time) AS in_time
              FROM archive_issues a
              LEFT JOIN e ON e.issue_id = a.id
             GROUP BY a.id
             ORDER BY a.sent_on DESC NULLS LAST, a.id DESC""")


def entries(issue_id):
    return database.rows(f"{ENTRIES} WHERE e.issue_id = %s ORDER BY e.position", (issue_id,))


def surfaced(issue_id, days=30):
    """What the system summarised in the days before the newsletter went out
    and the newsletter did not use: the other half of the comparison."""
    return database.rows(
        """SELECT i.id, i.title, coalesce(i.canonical_url, i.source_url) AS url, s.name AS source,
                  i.created_at AS collected_at
             FROM archive_issues a
             JOIN items i ON i.status = 'summarised'
                         AND i.created_at::date <= a.sent_on
                         AND i.created_at::date > a.sent_on - %s
             LEFT JOIN sources s ON s.id = i.source_id
            WHERE a.id = %s
              AND NOT EXISTS (SELECT 1 FROM archive_entries e
                               WHERE e.issue_id = a.id AND e.canonical_url = i.canonical_url)
            ORDER BY i.created_at DESC""",
        (days, issue_id))
