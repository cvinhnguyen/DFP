-- The association's past newsletters, as reference data: what Kaisa and
-- Niina chose by hand, to check against what the system finds.
-- Jira: DM42-47
--
-- They come from the newsletter's public archive in Mailchimp, which lists
-- every newsletter sent:
--
--   docker compose exec dashboard python -m app.cli.archive import <archive address>
--
-- Each newsletter is an archive issue and each link in it an entry, with
-- the heading it stood under. They are kept apart from the articles the
-- sources bring in, and nothing here is ever collected, summarised or
-- picked. GET /api/archive compares each entry with what the system has:
-- whether it follows the site the link is on, and whether it collected the
-- article before the newsletter went out.
--
-- Safe to run against an existing database as well as a fresh one:
--
--   docker compose exec -T postgres psql -U $POSTGRES_USER -d newsletter \
--     < db/init/26-archive.sql

\connect newsletter

BEGIN;

CREATE TABLE IF NOT EXISTS archive_issues (
    id          SERIAL PRIMARY KEY,
    url         TEXT NOT NULL UNIQUE,   -- the newsletter's page in the public archive
    subject     TEXT NOT NULL,
    sent_on     DATE,
    imported_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS archive_entries (
    id            BIGSERIAL PRIMARY KEY,
    issue_id      INTEGER NOT NULL REFERENCES archive_issues(id) ON DELETE CASCADE,
    position      INTEGER NOT NULL,     -- the order in the newsletter
    heading       TEXT,                 -- the heading the link stood under
    link_text     TEXT,
    url           TEXT NOT NULL,
    canonical_url TEXT NOT NULL,        -- canonicalise_url(url), the way items keep theirs
    UNIQUE (issue_id, canonical_url)
);

CREATE INDEX IF NOT EXISTS archive_entries_canonical_url_idx ON archive_entries (canonical_url);

COMMIT;
