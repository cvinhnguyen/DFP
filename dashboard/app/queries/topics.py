"""SQL for topics and tags: the topics with their terms and counts, following
one, and the tags on an article.
Jira: DM42-31

Which topics an article is in is decided by the item_topics view in
db/init/20-topics.sql, never here, so the page and the counts cannot
disagree with each other.
"""

from .. import database

# New is the same window as the Uudet list: undecided, and arrived within the
# days the filter keeps articles for.
WINDOW = "now() - make_interval(days => (SELECT value::int FROM app_settings WHERE key = 'filter_max_age_days'))"

TOPICS = f"""
SELECT t.id, t.name, t.followed, t.position,
       coalesce((SELECT jsonb_agg(jsonb_build_object('id', g.id, 'label', g.label) ORDER BY g.label)
                   FROM topic_tags tt
                   JOIN tags g ON g.id = tt.tag_id
                  WHERE tt.topic_id = t.id), '[]'::jsonb) AS tags,
       (SELECT count(*)
          FROM item_topics x
          JOIN items i           ON i.id = x.item_id
          LEFT JOIN item_picks p ON p.item_id = i.id
         WHERE x.topic_id = t.id
           AND p.item_id IS NULL
           AND i.duplicate_of IS NULL
           AND i.created_at >= {WINDOW}) AS new,
       (SELECT count(*)
          FROM item_topics x
          LEFT JOIN item_picks p ON p.item_id = x.item_id
         WHERE x.topic_id = t.id
           AND p.decision IS DISTINCT FROM 'dismissed') AS total
  FROM topics t
"""

# News that Finto AI has read and no topic took. Theses without a topic are
# not counted: most of the archive is about other fields, and that is fine.
UNTOPICED = """
    NOT coalesce(s.learning_tag_required, FALSE)
    AND i.status = 'summarised'
    AND EXISTS (SELECT 1 FROM item_tagging tg WHERE tg.item_id = i.id)
    AND NOT EXISTS (SELECT 1 FROM item_topics x WHERE x.item_id = i.id)
"""


def topics():
    return database.rows(TOPICS + " ORDER BY t.position, t.name")


def topic(topic_id):
    return database.row(TOPICS + " WHERE t.id = %s", (topic_id,))


def untopiced():
    return database.row(
        f"""SELECT count(*) FILTER (WHERE p.item_id IS NULL AND i.created_at >= {WINDOW}) AS new,
                   count(*) FILTER (WHERE p.decision IS DISTINCT FROM 'dismissed')       AS total
              FROM items i
              LEFT JOIN sources s    ON s.id = i.source_id
              LEFT JOIN item_picks p ON p.item_id = i.id
             WHERE {UNTOPICED}""")


def follow(topic_id, followed, user_id):
    return database.row(
        """UPDATE topics SET followed = %s, updated_by = %s, updated_at = now()
            WHERE id = %s
        RETURNING id""",
        (followed, user_id, topic_id))


def add_tag(item_id, uri, label, user_id):
    """Puts a YSO term on an article by hand. A tag taken off earlier comes
    back as it was."""
    with database.pool.connection() as conn, conn.transaction():
        conn.execute("INSERT INTO tags (uri, label) VALUES (%s, %s) ON CONFLICT (uri) DO NOTHING",
                     (uri, label))
        conn.execute(
            """INSERT INTO item_tags (item_id, tag_id, origin, added_by)
               SELECT %s, id, 'editor', %s FROM tags WHERE uri = %s
               ON CONFLICT (item_id, tag_id) DO UPDATE
                  SET removed_at = NULL, removed_by = NULL""",
            (item_id, user_id, uri))


def remove_tag(item_id, tag_id, user_id):
    """Takes a tag off an article. The row stays, marked, so the tagging
    workflow does not put the tag back. False if the article had no such tag."""
    found = database.row(
        """UPDATE item_tags SET removed_at = now(), removed_by = %s
            WHERE item_id = %s AND tag_id = %s AND removed_at IS NULL
        RETURNING tag_id""",
        (user_id, item_id, tag_id))
    return found is not None
