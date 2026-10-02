-- Keeping only what we need: the text of a collected article goes after
-- raw_text_retention_days (90), while its link, title, publisher and our own
-- summary stay.
-- Jira: DM42-45
--
-- Two reasons, both raised in the kickoff. Copyright: a full copy of other
-- people's articles should not be kept for ever. Data protection: article
-- text names real people and their opinions, even though we never set out to
-- collect personal data.
--
-- What goes, for an article collected longer ago than that: its full text,
-- the excerpt its feed gave, and the author's name.
-- What stays: the link, title, publisher, dates, language, tags and topics,
-- and the summary the AI wrote.
-- What stays whole: an article in a newsletter, sent or still a draft, one
-- an editor kept for later, and one still waiting for the AI.
-- The AI's cache of answers older than that goes as well.
--
-- n8n/workflows/retention.json runs clean_up_raw_text() every night, and
-- retention_runs keeps a line for each run. A source that sends an old
-- article again brings its text back with it; the next night takes it away.
--
-- n8n keeps its own copy of each run's data, article text included, for
-- N8N_EXECUTION_RETENTION_HOURS in .env, 720 hours. Keep that no longer than
-- this period, or n8n would hold what this removes.
--
-- Safe to run against an existing database as well as a fresh one:
--
--   docker compose exec -T postgres psql -U $POSTGRES_USER -d newsletter \
--     < db/init/25-retention.sql

\connect newsletter

BEGIN;

ALTER TABLE items ADD COLUMN IF NOT EXISTS text_removed_at TIMESTAMPTZ;

CREATE TABLE IF NOT EXISTS retention_runs (
    id            BIGSERIAL PRIMARY KEY,
    ran_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
    keep_days     INTEGER NOT NULL,
    items_cleared INTEGER NOT NULL,  -- articles whose text went
    chars_removed BIGINT  NOT NULL,  -- how much text that was
    cache_removed INTEGER NOT NULL,  -- old answers taken out of llm_cache
    kept_in_use   INTEGER NOT NULL   -- old articles kept whole, because a newsletter or an editor has them
);

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

    DELETE FROM llm_cache WHERE created_at < cutoff;
    GET DIAGNOSTICS cache = ROW_COUNT;

    RETURN QUERY
        INSERT INTO retention_runs (keep_days, items_cleared, chars_removed, cache_removed, kept_in_use)
        VALUES (keep_days, cleared, chars, cache, kept)
        RETURNING *;
END $$;

UPDATE app_settings
   SET description = 'Days the full text of a collected article is kept, at least 30. After that only its link, title, publisher and summary stay; articles in a newsletter or kept for later stay whole.'
 WHERE key = 'raw_text_retention_days';

COMMIT;
