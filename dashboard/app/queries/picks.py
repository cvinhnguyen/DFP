"""SQL for the editors' decisions about articles."""

from .. import database


def current(item_id):
    return database.row(
        """SELECT p.decision, p.issue_id, iss.name AS issue_name, iss.status AS issue_status
             FROM item_picks p
             LEFT JOIN issues iss ON iss.id = p.issue_id
            WHERE p.item_id = %s""",
        (item_id,))


def decide(item_id, decision, issue_id, section, user_id, suggested_section, suggestion_reason):
    """The decision, with the section the dashboard suggested at the time and
    why (30-section-suggestions.sql)."""
    database.run(
        """INSERT INTO item_picks (item_id, decision, issue_id, section, decided_by,
                                   suggested_section, suggestion_reason)
           VALUES (%s, %s, %s, %s, %s, %s, %s)
           ON CONFLICT (item_id) DO UPDATE
              SET decision = EXCLUDED.decision, issue_id = EXCLUDED.issue_id,
                  section = EXCLUDED.section, decided_by = EXCLUDED.decided_by,
                  decided_at = now(), suggested_section = EXCLUDED.suggested_section,
                  suggestion_reason = EXCLUDED.suggestion_reason""",
        (item_id, decision, issue_id, section, user_id, suggested_section, suggestion_reason))


def follow_design(issue_id, placed):
    """Moves each picked article of the issue to the section the email has it
    in: placed is {item id: section}."""
    if not placed:
        return
    database.run(
        """UPDATE item_picks p
              SET section = x.section
             FROM unnest(%(ids)s::bigint[], %(sections)s::text[]) AS x(item_id, section)
            WHERE p.item_id = x.item_id AND p.issue_id = %(issue)s
              AND p.decision = 'picked' AND p.section IS DISTINCT FROM x.section""",
        {"issue": issue_id, "ids": list(placed), "sections": list(placed.values())})


def clear(item_id):
    database.run("DELETE FROM item_picks WHERE item_id = %s", (item_id,))
