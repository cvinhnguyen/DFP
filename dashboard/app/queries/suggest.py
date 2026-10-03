"""SQL for suggesting an article's section: the member organisations
(29-members.sql), and what the editors' picks say about the suggestions
(30-section-suggestions.sql)."""

from .. import database


def members():
    """The member organisations on the association's members page when it
    was last read."""
    return database.rows("SELECT name, host FROM members WHERE listed ORDER BY name")


def recent_picks(reasons, streak):
    """Each source's last picks since the editors last answered for it,
    newest first, counting only those suggested for one of these reasons ('' for
    none). Only the sources with that many, and not the Telegram capture,
    whose links come from all kinds of sites."""
    return database.rows(
        """WITH recent AS (
               SELECT i.source_id, p.section, p.suggested_section, p.decided_at,
                      row_number() OVER (PARTITION BY i.source_id
                                         ORDER BY p.decided_at DESC, p.item_id DESC) AS n
                 FROM item_picks p
                 JOIN items i   ON i.id = p.item_id
                 JOIN sources s ON s.id = i.source_id
                WHERE p.decision = 'picked'
                  AND p.suggested_section IS NOT NULL
                  AND coalesce(p.suggestion_reason, '') = ANY(%(reasons)s)
                  AND s.type IS DISTINCT FROM 'manual'
                  AND p.decided_at > coalesce(s.section_answered_at, '-infinity'::timestamptz))
           SELECT s.id AS source_id, s.name AS source, s.suggested_section AS chosen,
                  array_agg(r.section ORDER BY r.n) AS sections,
                  array_agg(r.suggested_section ORDER BY r.n) AS suggested
             FROM recent r
             JOIN sources s ON s.id = r.source_id
            WHERE r.n <= %(streak)s
            GROUP BY s.id
           HAVING count(*) = %(streak)s
            ORDER BY max(r.decided_at) DESC""",
        {"reasons": list(reasons), "streak": streak})


def pick_counts():
    """The picks that kept what was suggested for them, counted by why it
    was suggested, by source, and by the section suggested and chosen."""
    return database.rows(
        """SELECT p.suggestion_reason AS reason, i.source_id, s.name AS source, s.type AS source_type,
                  p.suggested_section AS suggested, p.section, count(*)::int AS n
             FROM item_picks p
             JOIN items i ON i.id = p.item_id
             LEFT JOIN sources s ON s.id = i.source_id
            WHERE p.decision = 'picked' AND p.suggested_section IS NOT NULL
            GROUP BY 1, 2, 3, 4, 5, 6""")


def chosen_sections():
    """The sources with a section the editors chose for their articles."""
    return database.rows(
        """SELECT s.id AS source_id, s.name AS source, s.type AS source_type, s.suggested_section AS section,
                  s.section_answered_at AS chosen_at, u.display_name AS chosen_by
             FROM sources s
             LEFT JOIN users u ON u.id = s.section_answered_by
            WHERE s.suggested_section IS NOT NULL""")


def source(source_id):
    return database.row(
        "SELECT id AS source_id, name AS source, type, suggested_section AS section FROM sources WHERE id = %s",
        (source_id,))


def set_section(source_id, section, user_id):
    """The section to suggest for the source's articles, or None for none.
    Either way the editors have answered, and the picks before now no
    longer count towards asking again."""
    database.run(
        """UPDATE sources
              SET suggested_section = %(section)s, section_answered_at = now(), section_answered_by = %(user)s
            WHERE id = %(id)s""",
        {"id": source_id, "section": section, "user": user_id})


def declined(source_id, user_id):
    """The editors said no: the source's section stays as it is, and the
    picks before now no longer count towards asking again."""
    database.run(
        "UPDATE sources SET section_answered_at = now(), section_answered_by = %s WHERE id = %s",
        (user_id, source_id))
