-- Telling the team on Telegram when something breaks: a source that stops
-- working, or a workflow that stops with an error.
-- Jira: DM42-44
--
-- n8n/workflows/alerts.json does the telling and keeps this table:
--
--   A source counts as broken when its last two checks both failed, or both
--   found nothing at all. One failed check is usually the network and sorts
--   itself out, and a feed that works always lists its latest articles. The
--   team hears once when a source breaks and once when it works again.
--
--   A workflow that runs every few minutes is reported on its second failure
--   within an hour, so a blip that fixes itself stays quiet; the others on
--   the first. After that only a different problem is reported, or the same
--   one again after a day.
--
-- Where the messages go is alert_chat_id: empty for every admin privately,
-- or the chat of the team's group, which /alerts sent in that group sets.
-- off keeps the record here without telling anyone.
--
-- Safe to run against an existing database as well as a fresh one:
--
--   docker compose exec -T postgres psql -U $POSTGRES_USER -d newsletter \
--     < db/init/23-alerts.sql

\connect newsletter

BEGIN;

CREATE TABLE IF NOT EXISTS alerts (
    id         BIGSERIAL PRIMARY KEY,
    key        TEXT NOT NULL,              -- source:<id> or workflow:<n8n id>
    subject    TEXT NOT NULL,              -- the source or the workflow, by name
    problem    TEXT,                       -- a workflow's error with the numbers taken out, to tell the same problem from a new one
    detail     TEXT,                       -- the latest error as it came, or "found nothing"
    times      INTEGER NOT NULL DEFAULT 1, -- failures so far: checks in a row for a source
    started_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    last_seen  TIMESTAMPTZ NOT NULL DEFAULT now(),
    told_at    TIMESTAMPTZ,                -- when the team was last told, if yet
    ended_at   TIMESTAMPTZ                 -- when it worked again, or went quiet
);

-- One open alert per source or workflow.
CREATE UNIQUE INDEX IF NOT EXISTS alerts_open_idx ON alerts (key) WHERE ended_at IS NULL;

INSERT INTO app_settings (key, value, description) VALUES
    ('alert_chat_id', '',
     'Where the bot reports problems: empty for every admin privately, the chat of the team''s group (send /alerts in the group), or off.')
ON CONFLICT (key) DO NOTHING;

COMMIT;
