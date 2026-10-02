"""SQL for newsletter issues and the articles picked for them."""

from psycopg.types.json import Jsonb

from .. import database

SUMMARY = """
SELECT iss.id, iss.name, iss.status, iss.subject, iss.template, iss.created_at, iss.updated_at, iss.sent_at,
       iss.design IS NOT NULL AS has_design, iss.design_saved_at,
       du.display_name AS design_saved_by, uu.display_name AS updated_by,
       iss.mailchimp_status, iss.mailchimp_exported_at, iss.mailchimp_web_id,
       (SELECT count(*) FROM item_picks p WHERE p.issue_id = iss.id) AS picked,
       (SELECT count(*) FROM issue_comments c WHERE c.issue_id = iss.id AND c.resolved_at IS NULL) AS open_comments
  FROM issues iss
  LEFT JOIN users du ON du.id = iss.design_saved_by
  LEFT JOIN users uu ON uu.id = iss.updated_by
"""

FULL = """
SELECT iss.id, iss.name, iss.status, iss.subject, iss.preheader, iss.template, iss.html,
       iss.created_at, iss.updated_at, iss.sent_at,
       iss.design IS NOT NULL AS has_design, iss.design_saved_at,
       du.display_name AS design_saved_by, uu.display_name AS updated_by,
       iss.mailchimp_campaign_id, iss.mailchimp_web_id, iss.mailchimp_status, iss.mailchimp_exported_at,
       eu.display_name AS mailchimp_exported_by, iss.mailchimp_exported_hash, iss.mailchimp_checked_at,
       iss.mailchimp_send_time, iss.mailchimp_emails_sent,
       (SELECT count(*) FROM item_picks p WHERE p.issue_id = iss.id) AS picked,
       (SELECT count(*) FROM issue_comments c WHERE c.issue_id = iss.id AND c.resolved_at IS NULL) AS open_comments
  FROM issues iss
  LEFT JOIN users du ON du.id = iss.design_saved_by
  LEFT JOIN users uu ON uu.id = iss.updated_by
  LEFT JOIN users eu ON eu.id = iss.mailchimp_exported_by
 WHERE iss.id = %s
"""

# The article as the newsletter needs it: what it is, who published it, and
# the text to start from, the Finnish summary or else the publisher's own
# description.
ARTICLES = """
SELECT i.id, p.section, i.title, i.source_url AS url,
       coalesce(nullif(btrim(i.publisher), ''), s.publisher,
                substring(coalesce(i.canonical_url, i.source_url) FROM '^https?://([^/?#]+)')) AS publisher,
       s.name AS source,
       coalesce(i.source_language, s.language) AS language,
       sm.text AS summary,
       -- the AI's Finnish title, for an article in another language
       CASE WHEN coalesce(i.source_language, s.language) IS DISTINCT FROM 'fi'
             AND lower(btrim(sm.title)) <> lower(btrim(i.title))
            THEN nullif(btrim(sm.title), '') END AS title_fi,
       sm.event_starts, sm.event_ends, sm.event_time, sm.event_place,
       nullif(btrim(i.excerpt), '') AS excerpt,
       i.published_at,
       u.display_name AS decided_by,
       p.decided_at
  FROM item_picks p
  JOIN items i            ON i.id = p.item_id
  LEFT JOIN sources s     ON s.id = i.source_id
  LEFT JOIN summaries sm  ON sm.item_id = i.id AND sm.language = 'fi'
  LEFT JOIN users u       ON u.id = p.decided_by
 WHERE p.issue_id = %s AND p.decision = 'picked'
 ORDER BY p.section, p.decided_at, i.id
"""


def summaries():
    return database.rows(SUMMARY + " ORDER BY iss.status = 'sent', iss.created_at DESC")


def current_draft_id():
    found = database.row("SELECT id FROM issues WHERE status = 'draft' ORDER BY created_at DESC LIMIT 1")
    return found["id"] if found else None


def name_taken(name):
    return database.row("SELECT EXISTS (SELECT 1 FROM issues WHERE lower(name) = lower(%s)) AS taken", (name,))["taken"]


def create(name, user_id, template=None):
    return database.row(
        "INSERT INTO issues (name, template, created_by, updated_by) VALUES (%s, %s, %s, %s) RETURNING id",
        (name, template, user_id, user_id))["id"]


def remove(issue_id):
    """Deletes a draft. Its picks go with it, so its articles are undecided
    again; its images and their files stay in the library."""
    found = database.row("DELETE FROM issues WHERE id = %s AND status = 'draft' RETURNING id", (issue_id,))
    return found is not None


def one(issue_id):
    return database.row(FULL, (issue_id,))


def articles(issue_id):
    return database.rows(ARTICLES, (issue_id,))


def update(issue_id, changes, user_id):
    """changes holds only name, subject and preheader, checked by the caller."""
    columns = ", ".join(f"{name} = %({name})s" for name in changes)
    database.run(
        f"UPDATE issues SET {columns}, updated_by = %(user_id)s, updated_at = now() WHERE id = %(id)s",
        {**changes, "user_id": user_id, "id": issue_id})


def design(issue_id):
    return database.row("SELECT design, design_saved_at FROM issues WHERE id = %s", (issue_id,))


def save_design(issue_id, design, html, user_id, based_on, force):
    """Saves unless someone else saved after based_on. Returns the new save
    time, or None when it was refused for that reason."""
    found = database.row(
        """UPDATE issues
              SET design = %(design)s, html = %(html)s,
                  design_saved_at = now(), design_saved_by = %(user_id)s,
                  updated_at = now(), updated_by = %(user_id)s
            WHERE id = %(id)s
              AND (%(force)s
                   OR design_saved_at IS NULL
                   OR design_saved_at <= %(based_on)s::timestamptz)
        RETURNING design_saved_at""",
        {"design": Jsonb(design), "html": html, "user_id": user_id, "id": issue_id,
         "force": force, "based_on": based_on})
    return found["design_saved_at"] if found else None


def mark_sent(issue_id, user_id):
    found = database.row(
        """UPDATE issues SET status = 'sent', sent_at = now(), updated_at = now(), updated_by = %s
            WHERE id = %s AND status = 'draft'
        RETURNING id""",
        (user_id, issue_id))
    return found is not None


def set_mailchimp(issue_id, fields):
    """Records what Mailchimp said: the draft's ids, its status, when it went
    out. Only the mailchimp_ columns named in fields change."""
    allowed = {"mailchimp_campaign_id", "mailchimp_web_id", "mailchimp_status", "mailchimp_exported_at",
               "mailchimp_exported_by", "mailchimp_exported_hash", "mailchimp_checked_at",
               "mailchimp_send_time", "mailchimp_emails_sent"}
    fields = {k: v for k, v in fields.items() if k in allowed}
    if not fields:
        return
    columns = ", ".join(f"{name} = %({name})s" for name in fields)
    database.run(f"UPDATE issues SET {columns} WHERE id = %(id)s", {**fields, "id": issue_id})


def drafts_in_mailchimp():
    return database.rows(
        """SELECT id, mailchimp_campaign_id FROM issues
            WHERE status = 'draft' AND mailchimp_campaign_id IS NOT NULL""")
