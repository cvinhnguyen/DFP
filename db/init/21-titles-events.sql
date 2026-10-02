-- A Finnish title and the event details with every summary, and what each
-- editor has already seen.
-- Jira: DM42-8, DM42-35, DM42-80
--
-- The summary call now asks the model for three things at once: a Finnish
-- title, the summary itself (the same instruction as before, DM42-71), and,
-- for an event, its dates, time, place and the last day to sign up. Half the
-- articles are in English, and the newsletter is Finnish. An event's details
-- give the line the association's newsletter starts every event with:
-- 17.9.2026 | Tampere.
--
-- Summaries made before this have no title or event details. The
-- summarisation workflow makes those again, a few in each run when the queue
-- leaves room, and the article stays summarised in the meantime. version says
-- which instruction a summary was made with.
--
-- Safe to run against an existing database as well as a fresh one:
--
--   docker compose exec -T postgres psql -U $POSTGRES_USER -d newsletter \
--     < db/init/21-titles-events.sql

\connect newsletter

BEGIN;

-- The article's title in Finnish. For a Finnish article it is the original.
ALTER TABLE summaries ADD COLUMN IF NOT EXISTS title TEXT;

-- Only what the article says. A date the article does not give stays empty,
-- and an article that is not about an event has none of these.
ALTER TABLE summaries ADD COLUMN IF NOT EXISTS event_starts   DATE;
ALTER TABLE summaries ADD COLUMN IF NOT EXISTS event_ends     DATE;   -- for an event of several days
ALTER TABLE summaries ADD COLUMN IF NOT EXISTS event_time     TEXT;   -- as written, 13–16
ALTER TABLE summaries ADD COLUMN IF NOT EXISTS event_place    TEXT;   -- a city, or Verkko
ALTER TABLE summaries ADD COLUMN IF NOT EXISTS event_deadline DATE;   -- the last day to sign up or send a proposal

-- 1  the summary alone, as the Telegram bot still makes it
-- 2  with the Finnish title and the event details
ALTER TABLE summaries ADD COLUMN IF NOT EXISTS version SMALLINT NOT NULL DEFAULT 1;

CREATE INDEX IF NOT EXISTS summaries_version_idx ON summaries (version) WHERE version < 2;

-- An article an editor has opened. Each editor sees what is new to them,
-- whatever the other one has read. Rows go when the account or the article
-- goes.
CREATE TABLE IF NOT EXISTS item_views (
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    item_id BIGINT  NOT NULL REFERENCES items(id) ON DELETE CASCADE,
    seen_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    PRIMARY KEY (user_id, item_id)
);

CREATE INDEX IF NOT EXISTS item_views_item_idx ON item_views (item_id);

COMMIT;
