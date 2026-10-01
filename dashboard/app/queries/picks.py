"""SQL for the editors' decisions about articles."""

from .. import database


def current(item_id):
    return database.row(
        """SELECT p.decision, p.issue_id, iss.name AS issue_name, iss.status AS issue_status
             FROM item_picks p
             LEFT JOIN issues iss ON iss.id = p.issue_id
            WHERE p.item_id = %s""",
        (item_id,))


def decide(item_id, decision, issue_id, section, user_id):
    database.run(
        """INSERT INTO item_picks (item_id, decision, issue_id, section, decided_by)
           VALUES (%s, %s, %s, %s, %s)
           ON CONFLICT (item_id) DO UPDATE
              SET decision = EXCLUDED.decision, issue_id = EXCLUDED.issue_id,
                  section = EXCLUDED.section, decided_by = EXCLUDED.decided_by,
                  decided_at = now()""",
        (item_id, decision, issue_id, section, user_id))


def clear(item_id):
    database.run("DELETE FROM item_picks WHERE item_id = %s", (item_id,))
