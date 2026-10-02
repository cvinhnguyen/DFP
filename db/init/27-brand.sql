-- The banners and logo new emails start with: the association's own
-- (dashboard/web/img/brand/), until an admin puts others in their place on
-- Asetukset. Each value is the picture chosen, as JSON with its address in
-- Kuvapankki and its size, or empty for the association's own.
-- Jira: DM42-37
--
-- Emails already started keep their pictures; an editor changes one there
-- like any other. A picture chosen here stays in Kuvapankki: it cannot be
-- deleted while it is in use.
--
-- Safe to run against an existing database as well as a fresh one:
--
--   docker compose exec -T postgres psql -U $POSTGRES_USER -d newsletter \
--     < db/init/27-brand.sql

\connect newsletter

BEGIN;

INSERT INTO app_settings (key, value, description) VALUES
    ('brand_newsletter_banner', '',
     'The banner new newsletters (Uutiskirje) start with: a picture from Kuvapankki, or empty for the association''s own green one. Changed on Asetukset.'),
    ('brand_members_banner', '',
     'The banner new member letters (Jäsenkirje) start with: a picture from Kuvapankki, or empty for the association''s own magenta one. Changed on Asetukset.'),
    ('brand_logo', '',
     'The logo templates with a logo start with: a picture from Kuvapankki, or empty for the association''s own. Changed on Asetukset.')
ON CONFLICT (key) DO NOTHING;

COMMIT;
