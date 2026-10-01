-- Jäsenkuulumisia: news from the association's members, as a section of the
-- newsletter an article can be picked into.
-- Jira: DM42-37
--
-- The association's member letter has four parts that come from articles:
-- its own news and projects, events, news from its members, and highlights
-- from the field. The tool collected for all four from the start
-- (items.section in 02-schema.sql), but a pick could go only into three.
--
-- Safe to run against an existing database as well as a fresh one:
--
--   docker compose exec -T postgres psql -U $POSTGRES_USER -d newsletter \
--     < db/init/19-member-news.sql

\connect newsletter

BEGIN;

ALTER TABLE item_picks DROP CONSTRAINT IF EXISTS item_picks_section_check;
ALTER TABLE item_picks ADD CONSTRAINT item_picks_section_check
    CHECK (section IN ('highlights', 'events', 'own_news', 'member_news'));

COMMENT ON COLUMN item_picks.section IS
    'own_news (the association''s own news and projects), events (Tapahtumat), '
    'member_news (Jäsenkuulumisia) or highlights (Nostoja kentältä)';

COMMIT;
