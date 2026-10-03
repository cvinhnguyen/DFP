-- Pictures from the articles' own pages: each summarised article's lead
-- picture, shown with the article on Artikkelit and as the picture its entry
-- in the newsletter starts with. An editor removes or replaces it there.
-- Jira: DM42-37, DM42-31
--
-- Whose they are: a picture on a publisher's page belongs to the publisher or
-- its photographer, and the newsletters end up in the association's public
-- Mailchimp archive. So each source says what its pictures are:
--
--   own    the association's own site: its own pictures
--   open   an open licence such as CC BY: used with the credit under it
--   check  anything else, the default: Tarkistus stops the export until an
--          editor ticks "Saa käyttää" or removes or replaces the picture
--   none   no picture is fetched: journals we read only as the metadata their
--          publishers offer, and theses
--
-- n8n/workflows/article-pictures.json finds the picture on the article's page
-- (og:image, or the site's featured image), downloads it, and hands it to the
-- dashboard (POST /api/items/{id}/picture), which shrinks it for email, drops
-- its metadata and keeps it in images with the article's id. The same picture
-- for several articles of one source is a logo, not a photo, and is left out.
--
-- A picture goes with its article's text after raw_text_retention_days, for
-- the same reason (copyright, see 25-retention.sql), unless the article is
-- picked, kept for later, or its picture is in a newsletter or a template.
--
-- Safe to run against an existing database as well as a fresh one:
--
--   docker compose exec -T postgres psql -U $POSTGRES_USER -d newsletter \
--     < db/init/28-article-pictures.sql

\connect newsletter

BEGIN;

ALTER TABLE sources ADD COLUMN IF NOT EXISTS picture_rights TEXT NOT NULL DEFAULT 'check';
DO $$ BEGIN
    ALTER TABLE sources ADD CONSTRAINT sources_picture_rights_check
        CHECK (picture_rights IN ('own', 'open', 'check', 'none'));
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
COMMENT ON COLUMN sources.picture_rights IS
    'What the pictures on this source''s pages are: own (the association''s), open (an open licence, credited), check (an editor ticks "Saa käyttää" before export), none (none fetched)';

-- The association's own news, in Finnish and in English.
UPDATE sources SET picture_rights = 'own'
 WHERE url IN ('https://eoppimiskeskus.fi/ajankohtaista/', 'https://eoppimiskeskus.fi/en/news/')
   AND picture_rights = 'check';
-- Journals read only as their metadata, and theses: their pages are not read.
UPDATE sources SET picture_rights = 'none'
 WHERE (licence_note LIKE 'Journal metadata%' OR type = 'dspace')
   AND picture_rights = 'check';

-- An article's picture: null until n8n has looked. stored: in images;
-- none: the page has no picture; small: an icon rather than a picture;
-- generic: the same picture as other articles of its source, a logo;
-- failed: the page or the picture could not be read; removed: taken away
-- with the article's text.
ALTER TABLE items ADD COLUMN IF NOT EXISTS picture_status TEXT;
ALTER TABLE items ADD COLUMN IF NOT EXISTS picture_url    TEXT;
ALTER TABLE items ADD COLUMN IF NOT EXISTS picture_alt    TEXT;
ALTER TABLE items ADD COLUMN IF NOT EXISTS picture_sha256 TEXT;
DO $$ BEGIN
    ALTER TABLE items ADD CONSTRAINT items_picture_status_check
        CHECK (picture_status IN ('stored', 'none', 'small', 'generic', 'failed', 'removed'));
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
CREATE INDEX IF NOT EXISTS items_picture_waiting_idx ON items (id)
    WHERE picture_status IS NULL AND status = 'summarised';
CREATE INDEX IF NOT EXISTS items_picture_sha_idx ON items (source_id, picture_sha256)
    WHERE picture_sha256 IS NOT NULL;

-- The picture itself sits with the uploaded ones, so /media/ serves it and
-- an export carries it into Mailchimp, but Kuvapankki does not list it.
ALTER TABLE images ADD COLUMN IF NOT EXISTS item_id    BIGINT REFERENCES items(id) ON DELETE CASCADE;
ALTER TABLE images ADD COLUMN IF NOT EXISTS credit     TEXT;
ALTER TABLE images ADD COLUMN IF NOT EXISTS rights     TEXT;
ALTER TABLE images ADD COLUMN IF NOT EXISTS source_url TEXT;
CREATE UNIQUE INDEX IF NOT EXISTS images_item_idx ON images (item_id) WHERE item_id IS NOT NULL;

ALTER TABLE retention_runs ADD COLUMN IF NOT EXISTS pictures_removed INTEGER NOT NULL DEFAULT 0;

-- 25-retention.sql's cleanup, now taking the articles' pictures as well.
CREATE OR REPLACE FUNCTION clean_up_raw_text()
RETURNS SETOF retention_runs
LANGUAGE plpgsql AS $$
DECLARE
    keep_days integer := coalesce((SELECT nullif(btrim(value), '')::integer
                                     FROM app_settings WHERE key = 'raw_text_retention_days'), 90);
    cutoff    timestamptz;
    cleared   integer;
    chars     bigint;
    cache     integer;
    kept      integer;
    pictures  integer;
BEGIN
    -- A mistyped 0 would take everything at once.
    IF keep_days < 30 THEN
        RAISE EXCEPTION 'raw_text_retention_days is %, and has to be at least 30', keep_days;
    END IF;
    cutoff := now() - make_interval(days => keep_days);

    WITH old AS (
        SELECT i.id,
               length(coalesce(i.raw_text, '')) + length(coalesce(i.excerpt, ''))
                 + length(coalesce(i.author, '')) AS chars,
               EXISTS (SELECT 1 FROM item_picks p
                        WHERE p.item_id = i.id AND p.decision IN ('picked', 'later')) AS in_use
          FROM items i
         WHERE i.created_at < cutoff
           AND i.status NOT IN ('new', 'queued')
           AND (i.raw_text IS NOT NULL OR i.excerpt IS NOT NULL OR i.author IS NOT NULL)
    ),
    gone AS (
        UPDATE items i
           SET raw_text = NULL, excerpt = NULL, author = NULL, text_removed_at = now()
          FROM old o
         WHERE o.id = i.id AND NOT o.in_use
        RETURNING o.chars
    )
    SELECT (SELECT count(*) FROM gone), (SELECT coalesce(sum(g.chars), 0) FROM gone g),
           (SELECT count(*) FROM old WHERE in_use)
      INTO cleared, chars, kept;

    -- The pictures of articles whose text has gone: the publishers' as much
    -- as the text is. One a newsletter or a template uses stays.
    WITH gone_pictures AS (
        DELETE FROM images img
         USING items i
         WHERE img.item_id = i.id
           AND i.text_removed_at IS NOT NULL
           AND NOT EXISTS (SELECT 1 FROM item_picks p
                            WHERE p.item_id = i.id AND p.decision IN ('picked', 'later'))
           AND NOT EXISTS (SELECT 1 FROM issues s
                            WHERE s.design::text LIKE '%' || img.key::text || '%'
                               OR s.html LIKE '%' || img.key::text || '%')
           AND NOT EXISTS (SELECT 1 FROM newsletter_templates t
                            WHERE t.design::text LIKE '%' || img.key::text || '%')
        RETURNING img.item_id
    ),
    marked AS (
        UPDATE items i SET picture_status = 'removed'
          FROM gone_pictures g
         WHERE i.id = g.item_id
        RETURNING 1
    )
    SELECT count(*) INTO pictures FROM marked;

    DELETE FROM llm_cache WHERE created_at < cutoff;
    GET DIAGNOSTICS cache = ROW_COUNT;

    RETURN QUERY
        INSERT INTO retention_runs (keep_days, items_cleared, chars_removed, cache_removed, kept_in_use, pictures_removed)
        VALUES (keep_days, cleared, chars, cache, kept, pictures)
        RETURNING *;
END $$;

COMMIT;
