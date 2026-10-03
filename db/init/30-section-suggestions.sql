-- The suggested section learns from the editors, with their say-so: each
-- pick keeps what the dashboard suggested, and a source can have a section
-- the editors chose for its articles.
-- Jira: DM42-32, DM42-37
--
-- Each pick keeps the section the dashboard suggested when the decision was
-- made, and why (dashboard/app/services/suggest.py), so Asetukset can show
-- how often each rule was right. When an editor moves an article to another
-- section in the email editor, its pick moves with it, so a pick's section
-- is where the article really is.
--
-- When the last three picked articles of a source all went to the same
-- section, and none of them was suggested there, Artikkelit asks whether to
-- suggest that section for the source from now on. Only the articles the
-- source's own section would decide count: an event with a date is still an
-- event, and the association's member posts still members' news. The answer
-- is kept on the source, yes or no, and the picks before it no longer count,
-- so the question comes again only after three more. When the last three
-- went somewhere else than the section chosen, it asks whether to stop.
--
-- Safe to run against an existing database as well as a fresh one:
--
--   docker compose exec -T postgres psql -U $POSTGRES_USER -d newsletter \
--     < db/init/30-section-suggestions.sql

\connect newsletter

BEGIN;

ALTER TABLE item_picks
    ADD COLUMN IF NOT EXISTS suggested_section TEXT,
    ADD COLUMN IF NOT EXISTS suggestion_reason TEXT;

ALTER TABLE item_picks DROP CONSTRAINT IF EXISTS item_picks_suggested_section_check;
ALTER TABLE item_picks ADD CONSTRAINT item_picks_suggested_section_check
    CHECK (suggested_section IN ('own_news', 'events', 'member_news', 'highlights'));

COMMENT ON COLUMN item_picks.suggested_section IS
    'The section the dashboard suggested when the decision was made; null for decisions from before 30-section-suggestions.sql';
COMMENT ON COLUMN item_picks.suggestion_reason IS
    'Why it was suggested: chosen, event, deadline, invitation, member_post, source_section, own_site, member_site, association_named or member_named; null for Nostoja kentältä when nothing else fitted';

ALTER TABLE sources
    ADD COLUMN IF NOT EXISTS suggested_section   TEXT,
    ADD COLUMN IF NOT EXISTS section_answered_at TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS section_answered_by INTEGER REFERENCES users(id) ON DELETE SET NULL;

ALTER TABLE sources DROP CONSTRAINT IF EXISTS sources_suggested_section_check;
ALTER TABLE sources ADD CONSTRAINT sources_suggested_section_check
    CHECK (suggested_section IN ('own_news', 'events', 'member_news', 'highlights'));

COMMENT ON COLUMN sources.suggested_section IS
    'The section the editors chose to suggest for this source''s articles, unless an article is an event with a date or one of the association''s member posts';
COMMENT ON COLUMN sources.section_answered_at IS
    'When an editor last chose, removed or declined a section for this source; the picks before it no longer count towards asking again';

COMMIT;
