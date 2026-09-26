-- The same story reaching us more than once.
-- Jira: DM42-30
--
-- Kaisa and Niina follow web pages, LinkedIn, emails and other newsletters, so
-- one story arriving three ways is normal. There are two cases:
--
--   Same address, written differently. A link shared from LinkedIn carries
--   ?utm_source=... and the crawler's copy does not. Cleaning the address makes
--   them the same canonical_url, and the unique index turns the second one into
--   an update of the first instead of a new row.
--
--   Different address, same article. Here the text is the same, so a hash of
--   the text finds it. The second copy is kept and pointed at the first with
--   duplicate_of, never deleted: four sources carrying a story says it matters.
--
-- Both happen in a trigger, so the crawler, the ingest API and Telegram capture
-- all get it without each one having to remember.
--
-- Safe to run against an existing database as well as a fresh one:
--
--   docker compose exec -T postgres psql -U $POSTGRES_USER -d newsletter \
--     < db/init/10-dedup.sql

\connect newsletter

-- https, lowercase host without www, no tracking parameters, no #fragment and
-- no trailing slash. The rest of the address is left as it is, because a path
-- or a parameter we do not recognise may well be what picks the article.
CREATE OR REPLACE FUNCTION canonicalise_url(url text) RETURNS text
LANGUAGE plpgsql IMMUTABLE AS $$
DECLARE
    p     text[];
    host  text;
    path  text;
    kept  text[];
BEGIN
    IF url IS NULL OR btrim(url) = '' THEN
        RETURN NULL;
    END IF;

    p := regexp_match(btrim(url),
                      '^(https?)://([^/?#]+)([^?#]*)(?:\?([^#]*))?', 'i');
    IF p IS NULL THEN
        RETURN btrim(url);   -- not a web address, leave it alone
    END IF;

    host := regexp_replace(lower(p[2]), '^www\.', '');
    host := regexp_replace(host, ':(80|443)$', '');
    path := regexp_replace(p[3], '/+$', '');

    SELECT array_agg(q ORDER BY n) INTO kept
      FROM unnest(string_to_array(p[4], '&')) WITH ORDINALITY AS t(q, n)
     WHERE q <> ''
       AND q !~* '^(utm_[^=]*|fbclid|gclid|dclid|msclkid|yclid|mc_cid|mc_eid|igshid|_hsenc|_hsmi|mkt_tok|trk|trackingid|rcm|ref_src)(=|$)';

    RETURN 'https://' || host || path
           || coalesce('?' || array_to_string(kept, '&'), '');
END $$;

-- Case and spacing differ between copies of the same text, so neither counts.
-- Short texts are left out: two different pages can share 80 characters of
-- cookie banner, and a false match hides a real story.
CREATE OR REPLACE FUNCTION item_content_hash(body text) RETURNS text
LANGUAGE sql IMMUTABLE AS $$
    SELECT CASE
             WHEN length(n) >= 200 THEN md5(n)
           END
      FROM (SELECT btrim(regexp_replace(lower(body), '\s+', ' ', 'g')) AS n) t
$$;

ALTER TABLE items ADD COLUMN IF NOT EXISTS content_hash TEXT;
CREATE INDEX IF NOT EXISTS items_content_hash_idx ON items (content_hash);

-- Runs before the unique index is checked, so ON CONFLICT (canonical_url)
-- already sees the cleaned address.
--
-- The earliest copy stays the original. Pointing at an item that is itself a
-- duplicate would make chains, so only originals are candidates.
CREATE OR REPLACE FUNCTION items_dedup() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
    IF TG_OP = 'INSERT' THEN
        NEW.canonical_url := canonicalise_url(coalesce(NEW.canonical_url, NEW.source_url));
    END IF;

    NEW.content_hash := item_content_hash(NEW.raw_text);

    IF NEW.duplicate_of IS NULL AND NEW.content_hash IS NOT NULL THEN
        SELECT i.id INTO NEW.duplicate_of
          FROM items i
         WHERE i.content_hash = NEW.content_hash
           AND i.id < NEW.id
           AND i.duplicate_of IS NULL
         ORDER BY i.id
         LIMIT 1;
    END IF;

    RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS items_dedup ON items;
CREATE TRIGGER items_dedup
    BEFORE INSERT OR UPDATE OF raw_text ON items
    FOR EACH ROW EXECUTE FUNCTION items_dedup();

-- Bring rows collected before this file up to date. The addresses are cleared
-- first so two rows never hold the same value halfway through. Where two old
-- rows clean up to the same address, the later one becomes a duplicate.
BEGIN;

UPDATE items SET content_hash = item_content_hash(raw_text);

UPDATE items SET canonical_url = NULL;

WITH c AS (
    SELECT id,
           canonicalise_url(source_url) AS url,
           min(id) OVER (PARTITION BY canonicalise_url(source_url)) AS first_id
      FROM items
)
UPDATE items i
   SET canonical_url = CASE WHEN c.id = c.first_id THEN c.url END,
       duplicate_of  = CASE WHEN c.id = c.first_id THEN i.duplicate_of
                            ELSE c.first_id END
  FROM c
 WHERE c.id = i.id;

WITH h AS (
    SELECT id, min(id) OVER (PARTITION BY content_hash) AS first_id
      FROM items
     WHERE content_hash IS NOT NULL
)
UPDATE items i
   SET duplicate_of = h.first_id
  FROM h
 WHERE h.id = i.id
   AND h.first_id <> i.id
   AND i.duplicate_of IS NULL;

COMMIT;

-- What the editor sees: for each story, how many other sources carried it and
-- where. The dashboard reads this rather than working it out itself.
CREATE OR REPLACE VIEW story_coverage AS
SELECT o.id                         AS item_id,
       o.title,
       count(d.id)                  AS other_sources,
       coalesce(jsonb_agg(jsonb_build_object(
                    'item_id',   d.id,
                    'url',       d.source_url,
                    'source',    s.name,
                    'publisher', d.publisher)
                  ORDER BY d.id) FILTER (WHERE d.id IS NOT NULL),
                '[]'::jsonb)        AS carried_by
  FROM items o
  LEFT JOIN items   d ON d.duplicate_of = o.id
  LEFT JOIN sources s ON s.id = d.source_id
 WHERE o.duplicate_of IS NULL
 GROUP BY o.id, o.title;

-- Example: the stories more than one source carried, most covered first.
--
--   SELECT item_id, title, other_sources, carried_by
--     FROM story_coverage
--    WHERE other_sources > 0
--    ORDER BY other_sources DESC;
