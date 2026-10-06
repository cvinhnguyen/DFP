-- The sources as the admins keep them in the dashboard, on Asetukset →
-- Lähteet: a source is added from its address, switched off, given a new
-- address, or deleted when it was added by mistake, without SQL from us.
-- Jira: DM42-29, DM42-36, DM42-47
--
-- services/sources.py does the work. Here:
--
--   sources.added_by,     who added a source in the dashboard, and who last
--   changed_at,           changed one. The sources loaded from
--   changed_by            db/client/sources.sql have no adder.
--   watch_links           the links a watched page has had: a site without a
--                         feed is read by watching one of its listing pages,
--                         and only a link not seen before becomes an article
--                         (services/watch.py, type 'watch')
--   source_suggestions    what the dashboard found when it looked for a feed
--                         on a site the past newsletters linked to, or on a
--                         member organisation's site, and the ones an admin
--                         said no to. The sites themselves are worked out
--                         from the archive and the members each time.
--
-- Safe to run against an existing database as well as a fresh one:
--
--   docker compose exec -T postgres psql -U $POSTGRES_USER -d newsletter \
--     < db/init/36-sources.sql

\connect newsletter

BEGIN;

ALTER TABLE sources ADD COLUMN IF NOT EXISTS added_by   INTEGER REFERENCES users(id) ON DELETE SET NULL;
ALTER TABLE sources ADD COLUMN IF NOT EXISTS changed_at TIMESTAMPTZ;
ALTER TABLE sources ADD COLUMN IF NOT EXISTS changed_by INTEGER REFERENCES users(id) ON DELETE SET NULL;

COMMENT ON COLUMN sources.type IS
    'rss (a feed), crossref (a journal through api.crossref.org), webpage (the association''s own site, by its '
    'crawler), dspace (an archive such as Theseus), watch (a listing page watched for new links), drive (the '
    'association''s Drive folder) or manual (links sent to the Telegram bot)';

CREATE TABLE IF NOT EXISTS watch_links (
    source_id     INTEGER NOT NULL REFERENCES sources(id) ON DELETE CASCADE,
    canonical_url TEXT NOT NULL,
    url           TEXT NOT NULL,
    title         TEXT,
    first_seen    TIMESTAMPTZ NOT NULL DEFAULT now(),
    -- the article it became; none for the links the page had when it was
    -- added, which are only remembered
    item_id       BIGINT REFERENCES items(id) ON DELETE SET NULL,
    PRIMARY KEY (source_id, canonical_url)
);

CREATE TABLE IF NOT EXISTS source_suggestions (
    host         TEXT PRIMARY KEY,               -- example.fi, without www.
    result       TEXT CHECK (result IN ('feed', 'page', 'none', 'blocked', 'failed')),
    feed_url     TEXT,                           -- the feed found, when one was
    feed_title   TEXT,
    feed_items   INTEGER,                        -- articles in it, or links on the page
    per_month    NUMERIC(7, 1),                  -- about how many a month
    checked_at   TIMESTAMPTZ,
    dismissed_at TIMESTAMPTZ,
    dismissed_by INTEGER REFERENCES users(id) ON DELETE SET NULL
);

-- The Lähteet page follows a check as it runs, and an admin's change.
DO $$
DECLARE
    t  record;
    op record;
    name text;
BEGIN
    FOR t IN SELECT * FROM (VALUES
        ('sources',            'sources', 'id'),
        ('collection_runs',    'sources', 'source_id'),
        ('source_suggestions', 'sources', '')
    ) AS v(tbl, kind, col)
    LOOP
        FOR op IN SELECT * FROM (VALUES
            ('ins', 'INSERT', 'NEW TABLE AS new_rows'),
            ('upd', 'UPDATE', 'NEW TABLE AS new_rows'),
            ('del', 'DELETE', 'OLD TABLE AS old_rows')
        ) AS w(short, event, referencing)
        LOOP
            name := format('%s_live_%s_%s', t.tbl, t.kind, op.short);
            EXECUTE format('DROP TRIGGER IF EXISTS %I ON %I', name, t.tbl);
            EXECUTE format('CREATE TRIGGER %I AFTER %s ON %I REFERENCING %s FOR EACH STATEMENT '
                           'EXECUTE FUNCTION live_changed(%L, %L)',
                           name, op.event, t.tbl, op.referencing, t.kind, t.col);
        END LOOP;
    END LOOP;
END $$;

COMMIT;
