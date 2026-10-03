-- The association's member organisations, read from its own members page,
-- so that an article from a member's website, or one naming a member in its
-- title, is suggested for Jäsenkuulumisia.
-- Jira: DM42-32, DM42-37
--
-- Only organisations: the page lists the community members, päättävät
-- (voting) and kannattavat (supporting) yhteisöjäsenet, each by name and
-- website. The association's individual members are on another page, are
-- personal data, and are never read.
--
-- n8n/workflows/members.json reads the page every Monday, or now with Run
-- now, and hands what it found to sync_members(). A member no longer on the
-- page stays in the table, marked not listed, and its articles are no longer
-- suggested as member news.
--
-- Safe to run against an existing database as well as a fresh one:
--
--   docker compose exec -T postgres psql -U $POSTGRES_USER -d newsletter \
--     < db/init/29-members.sql

\connect newsletter

BEGIN;

CREATE TABLE IF NOT EXISTS members (
    id         SERIAL PRIMARY KEY,
    name       TEXT NOT NULL,
    website    TEXT NOT NULL,                 -- as the members page links it
    host       TEXT NOT NULL UNIQUE,          -- the website's address without www. or fi., what an article's link is matched against
    kind       TEXT NOT NULL CHECK (kind IN ('voting', 'supporting')),
    listed     BOOLEAN NOT NULL DEFAULT TRUE, -- on the page when it was last read
    first_seen TIMESTAMPTZ NOT NULL DEFAULT now(),
    last_seen  TIMESTAMPTZ NOT NULL DEFAULT now()
);

INSERT INTO app_settings (key, value, description) VALUES
    ('members_page_url', 'https://eoppimiskeskus.fi/jasenyys/yhteisojasenet/',
     'The association''s page of its community members, which n8n reads every Monday for the member organisations and their websites')
ON CONFLICT (key) DO NOTHING;

-- What n8n found on the members page, as [{name, website, host, kind}].
CREATE OR REPLACE FUNCTION sync_members(from_page jsonb)
RETURNS TABLE (members_listed integer, members_added integer, members_gone integer)
LANGUAGE plpgsql AS $$
DECLARE
    added integer;
    gone  integer;
BEGIN
    -- A page whose layout changed would look as if everyone had left.
    IF jsonb_array_length(from_page) < 5 THEN
        RAISE EXCEPTION 'The members page gave only % members; its layout may have changed', jsonb_array_length(from_page);
    END IF;

    WITH incoming AS (
        SELECT DISTINCT ON (lower(x->>'host'))
               btrim(x->>'name') AS name, x->>'website' AS website, lower(x->>'host') AS host, x->>'kind' AS kind
          FROM jsonb_array_elements(from_page) x
         WHERE coalesce(x->>'host', '') <> '' AND coalesce(btrim(x->>'name'), '') <> ''
    ),
    saved AS (
        INSERT INTO members (name, website, host, kind)
        SELECT name, website, host, kind FROM incoming
        ON CONFLICT (host) DO UPDATE
           SET name = EXCLUDED.name, website = EXCLUDED.website, kind = EXCLUDED.kind,
               listed = TRUE, last_seen = now()
        RETURNING (xmax = 0) AS is_new
    )
    SELECT count(*) FILTER (WHERE is_new) INTO added FROM saved;

    UPDATE members m SET listed = FALSE
     WHERE m.listed
       AND m.host NOT IN (SELECT lower(x->>'host') FROM jsonb_array_elements(from_page) x);
    GET DIAGNOSTICS gone = ROW_COUNT;

    RETURN QUERY SELECT (SELECT count(*)::integer FROM members m WHERE m.listed), added, gone;
END $$;

COMMIT;
