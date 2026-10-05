"""SQL for asking the articles a question: the articles whose title, Finnish
summary or subject tags share the most words with it.
Jira: DM42-31

A question is not a search: "Mitä tekoälystä on kirjoitettu opettajille?"
has words no article needs to have all of. So any of its words will do, each
as the Finnish stemmer leaves it and as the start of a word, so tekoäly also
finds tekoälysovellus; the articles sharing the most, and in their titles
and tags rather than only in the summary, come first.
"""

from .. import database

# Words about the asking rather than the subject, as the stemmer leaves them:
# "mitä on kirjoitettu", "kerro uutisista viime viikolta".
FILLER = ["kirjoit%", "kerro%", "kerto%", "artikkel%", "juttu%", "jutu%", "uutis%", "kuukau%", "viiko%",
          "viime%", "aihe%", "löyty%", "lähtei%"]


def relevant(question, days, limit, hide_drive=False):
    """The ids of the best matching articles with a Finnish summary, from the
    last days, best first. hide_drive leaves out the association's own Drive
    material, for the shared demo login."""
    return database.rows(
        """WITH words AS (
               SELECT DISTINCT w.lexeme
                 FROM unnest(to_tsvector('finnish', %(question)s)) AS w
                WHERE length(w.lexeme) >= 3
                  AND NOT (w.lexeme LIKE ANY (%(filler)s))
           ),
           query AS (
               SELECT to_tsquery('simple', string_agg(quote_literal(lexeme) || ':*', ' | ')) AS q
                 FROM words
           ),
           docs AS (
               SELECT i.id, coalesce(i.published_at, i.created_at) AS day,
                      setweight(to_tsvector('finnish', coalesce(nullif(btrim(sm.title), ''), i.title, '')), 'A')
                      || setweight(coalesce(sm.search, ''::tsvector), 'B')
                      || setweight(to_tsvector('finnish', coalesce((
                             SELECT string_agg(g.label, ' ')
                               FROM item_tags it JOIN tags g ON g.id = it.tag_id
                              WHERE it.item_id = i.id AND it.removed_at IS NULL), '')), 'A') AS doc
                 FROM items i
                 JOIN summaries sm ON sm.item_id = i.id AND sm.language = 'fi'
                WHERE i.duplicate_of IS NULL
                  -- taken away because its Drive document left the folder
                  AND i.withdrawn_at IS NULL
                  AND coalesce(i.published_at, i.created_at) >= now() - make_interval(days => %(days)s)
                  AND NOT (%(hide_drive)s AND EXISTS (
                        SELECT 1 FROM sources s WHERE s.id = i.source_id AND s.type = 'drive'))
           )
           SELECT d.id, ts_rank_cd(d.doc, q.q) AS rank
             FROM docs d, query q
            WHERE q.q IS NOT NULL AND d.doc @@ q.q
            ORDER BY rank DESC, d.day DESC
            LIMIT %(limit)s""",
        {"question": question, "filler": FILLER, "days": days, "limit": limit, "hide_drive": hide_drive})
