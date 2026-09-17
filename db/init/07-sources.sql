-- The two news sections we collect from, as data rather than as a URL typed
-- into a workflow.
-- Jira: DM42-59
--
-- The site publishes news twice: ajankohtaista in Finnish and en/news in
-- English, with different articles in each. The newsletter is Finnish, so the
-- Finnish section is the one that matters. The English section is here because
-- an English edition is still an open question with the client, and having it
-- configured costs nothing until somebody sets active.
--
-- Safe to run against an existing database as well as a fresh one:
--
--   docker compose exec -T postgres psql -U $POSTGRES_USER -d newsletter \
--     < db/init/07-sources.sql

\connect newsletter

-- Which language a source publishes in. The crawler can stop guessing from the
-- URL, and summarisation knows what it is reading before it reads it.
ALTER TABLE sources ADD COLUMN IF NOT EXISTS language TEXT;

-- One row per section. Without this, re-running the file adds duplicates and
-- the crawler collects everything twice.
CREATE UNIQUE INDEX IF NOT EXISTS sources_url_idx ON sources (url);

-- Row 1 was seeded pointing at the site root, which is not a listing page and
-- nothing could crawl it. The 20 articles already collected came from the
-- Finnish section, so pointing row 1 there keeps them attached to the right
-- source.
UPDATE sources
   SET name     = 'eOppimiskeskus, ajankohtaista (fi)',
       url      = 'https://eoppimiskeskus.fi/ajankohtaista/',
       language = 'fi',
       type     = 'webpage'
 WHERE id = 1;

INSERT INTO sources (name, url, type, language, check_frequency_minutes, active)
VALUES ('eOppimiskeskus, news (en)', 'https://eoppimiskeskus.fi/en/news/',
        'webpage', 'en', 1440, TRUE)
ON CONFLICT (url) DO UPDATE
   SET name     = EXCLUDED.name,
       language = EXCLUDED.language,
       type     = EXCLUDED.type;

-- If the client decides against an English edition, switch it off rather than
-- deleting it, so the items already collected keep their source:
--   UPDATE sources SET active = FALSE WHERE language = 'en';
