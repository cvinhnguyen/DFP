-- Planning a newsletter: the day it is meant to go out, and what has been
-- done to it, who picked, moved or took out which article and when.
-- Jira: DM42-37, DM42-32
--
--   issues.planned_for   the day the editors plan to send it, Finnish time.
--                        Artikkelit and Tapahtumakalenteri measure events and
--                        sign-up deadlines against it.
--   issue_activity       one row per thing done to a newsletter's picks, name,
--                        subject line or day (services/issues.py,
--                        services/picks.py). What the issues table keeps
--                        itself, made, last saved in the editor, exported and
--                        sent, is not written here again.
--
-- Safe to run against an existing database as well as a fresh one:
--
--   docker compose exec -T postgres psql -U $POSTGRES_USER -d newsletter \
--     < db/init/37-planning.sql

\connect newsletter

BEGIN;

ALTER TABLE issues ADD COLUMN IF NOT EXISTS planned_for DATE;

CREATE TABLE IF NOT EXISTS issue_activity (
    id           BIGSERIAL PRIMARY KEY,
    issue_id     INTEGER NOT NULL REFERENCES issues(id) ON DELETE CASCADE,
    user_id      INTEGER REFERENCES users(id) ON DELETE SET NULL,
    kind         TEXT NOT NULL CHECK (kind IN ('picked', 'moved', 'removed', 'planned', 'subject', 'renamed')),
    item_id      BIGINT REFERENCES items(id) ON DELETE SET NULL,
    title        TEXT,                    -- the article's title at the time
    section      TEXT,                    -- where it went
    from_section TEXT,                    -- where it was, for a move
    detail       TEXT,                    -- the new day, subject line or name
    -- moved by placing it in another section of the email in the editor
    in_editor    BOOLEAN NOT NULL DEFAULT FALSE,
    at           TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS issue_activity_issue_idx ON issue_activity (issue_id, at DESC);

-- A newsletter's page shows what was just done, also by someone else.
DROP TRIGGER IF EXISTS issue_activity_live_issues_ins ON issue_activity;
CREATE TRIGGER issue_activity_live_issues_ins
    AFTER INSERT ON issue_activity REFERENCING NEW TABLE AS new_rows
    FOR EACH STATEMENT EXECUTE FUNCTION live_changed('issues', 'issue_id');

COMMIT;
