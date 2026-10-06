-- The questions each editor has asked in Kysy artikkeleilta, so one asked
-- every month is a click away. Only the question and how far back it
-- looked: the answer is written again from the articles there are then.
-- Each editor sees their own, the newest 30 (services/writing.py).
-- Jira: DM42-31, DM42-80
--
-- Safe to run against an existing database as well as a fresh one:
--
--   docker compose exec -T postgres psql -U $POSTGRES_USER -d newsletter \
--     < db/init/38-ask-history.sql

\connect newsletter

BEGIN;

CREATE TABLE IF NOT EXISTS ask_history (
    id       BIGSERIAL PRIMARY KEY,
    user_id  INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    question TEXT NOT NULL CHECK (length(question) BETWEEN 3 AND 300),
    days     INTEGER NOT NULL,
    times    INTEGER NOT NULL DEFAULT 1,      -- how often it has been asked
    asked_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- The same question again, in other capitals, is the same one asked again.
CREATE UNIQUE INDEX IF NOT EXISTS ask_history_question_idx ON ask_history (user_id, lower(question));
CREATE INDEX IF NOT EXISTS ask_history_user_idx ON ask_history (user_id, asked_at DESC);

COMMIT;
