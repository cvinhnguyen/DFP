-- Learning Factory, the association's trainings, as a fifth section to pick
-- an article into: the newsletter's Learning Factory block, which the
-- association's newsletters have had since 2024 ("Learning Factory – Kehitä
-- osaamistasi"). Key 5 on Artikkelit.
-- Jira: DM42-32, DM42-37
--
-- Unlike the other four, the block is not left out of an email when no
-- picked article is in it: the editors write it by hand too, as they did
-- before, so it goes out whenever it has anything in it.
--
-- An article from Learning Factory's own sites is suggested for it
-- (dashboard/app/services/suggest.py), and the editors can choose it for a
-- source like any other section (30-section-suggestions.sql).
--
-- Safe to run against an existing database as well as a fresh one:
--
--   docker compose exec -T postgres psql -U $POSTGRES_USER -d newsletter \
--     < db/init/31-learning-factory.sql

\connect newsletter

BEGIN;

ALTER TABLE item_picks DROP CONSTRAINT IF EXISTS item_picks_section_check;
ALTER TABLE item_picks ADD CONSTRAINT item_picks_section_check
    CHECK (section IN ('highlights', 'events', 'own_news', 'member_news', 'training'));
COMMENT ON COLUMN item_picks.section IS
    'Where a picked article goes: own_news (Ajankohtaista yhdistykseltä), events (Tapahtumat), '
    'member_news (Jäsenkuulumisia), highlights (Nostoja kentältä) or training (Learning Factory)';

ALTER TABLE item_picks DROP CONSTRAINT IF EXISTS item_picks_suggested_section_check;
ALTER TABLE item_picks ADD CONSTRAINT item_picks_suggested_section_check
    CHECK (suggested_section IN ('own_news', 'events', 'member_news', 'highlights', 'training'));

ALTER TABLE sources DROP CONSTRAINT IF EXISTS sources_suggested_section_check;
ALTER TABLE sources ADD CONSTRAINT sources_suggested_section_check
    CHECK (suggested_section IN ('own_news', 'events', 'member_news', 'highlights', 'training'));

COMMIT;
