-- Every summary carries its source link and publisher.
-- Jira: DM42-35
--
-- Kaisa raised copyright in the kickoff. Summaries are abstracts, not copies,
-- and the link back and the name of who wrote it travel with every one. They
-- are copied onto the summary itself, so a summary pulled into a newsletter is
-- complete on its own and cannot lose its attribution on the way.
--
-- Filled by a trigger, so no workflow can forget to.
--
-- Safe to run against an existing database as well as a fresh one:
--
--   docker compose exec -T postgres psql -U $POSTGRES_USER -d newsletter \
--     < db/init/12-summaries.sql

\connect newsletter

ALTER TABLE summaries ADD COLUMN IF NOT EXISTS source_url TEXT;
ALTER TABLE summaries ADD COLUMN IF NOT EXISTS publisher  TEXT;

-- Where the item has no publisher, the site's own address is the fairest
-- attribution we have. The source name is not: "Telegram capture" did not
-- write anything.
CREATE OR REPLACE FUNCTION summaries_attribution() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
    SELECT coalesce(NEW.source_url, i.source_url),
           coalesce(NEW.publisher, nullif(btrim(i.publisher), ''),
                    substring(coalesce(i.canonical_url, i.source_url) FROM '^https?://([^/?#]+)'))
      INTO NEW.source_url, NEW.publisher
      FROM items i
     WHERE i.id = NEW.item_id;
    RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS summaries_attribution ON summaries;
CREATE TRIGGER summaries_attribution
    BEFORE INSERT OR UPDATE ON summaries
    FOR EACH ROW EXECUTE FUNCTION summaries_attribution();

-- Summaries written before this file. The UPDATE fires the trigger above.
UPDATE summaries SET source_url = NULL, publisher = NULL
 WHERE source_url IS NULL OR publisher IS NULL;

ALTER TABLE summaries ALTER COLUMN source_url SET NOT NULL;
ALTER TABLE summaries ALTER COLUMN publisher  SET NOT NULL;
