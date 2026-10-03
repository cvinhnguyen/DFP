-- Where the association's past newsletters are, so the dashboard can bring in
-- the ones sent since it last looked and compare each with what the system
-- found, without the command line.
-- Jira: DM42-47
--
-- The address is the "past newsletters" link in any of the association's
-- newsletters, a Mailchimp campaign archive's home page. An admin gives it on
-- Uutiskirjeet → Arkisto; it is kept here rather than in the repository.
-- n8n/workflows/archive.json brings in new newsletters every Monday, and the
-- page has a button for doing it now (docs/evaluation.md).
--
-- Safe to run against an existing database as well as a fresh one:
--
--   docker compose exec -T postgres psql -U $POSTGRES_USER -d newsletter \
--     < db/init/32-archive-import.sql

\connect newsletter

BEGIN;

INSERT INTO app_settings (key, value, description) VALUES
    ('newsletter_archive_url', '',
     'The association''s public newsletter archive in Mailchimp, https://<dc>.campaign-archive.com/home/?u=…&id=…: '
     'new newsletters are brought in from it and compared with what the system found'),
    ('newsletter_archive_read_at', '',
     'When the archive was last read, by n8n on Mondays or with the button; empty before the first time')
ON CONFLICT (key) DO NOTHING;

COMMIT;
