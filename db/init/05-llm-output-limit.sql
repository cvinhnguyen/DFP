-- A cap on how much a model may write, and a record of when it hit the cap.
-- Jira: DM42-25
--
-- A summary that stops mid-word looks finished. Nothing downstream can tell
-- the difference between a model that answered and one that ran out of room,
-- which makes a cut answer worse than a failed call: a failure is visible.
--
-- Safe to run against an existing database as well as a fresh one:
--
--   docker compose exec -T postgres psql -U $POSTGRES_USER -d newsletter \
--     < db/init/05-llm-output-limit.sql

\connect newsletter

INSERT INTO app_settings (key, value, description) VALUES
    ('llm_max_output_tokens', '400',
     'Most tokens a model may write in one answer. Generous for a three or four sentence summary, low enough that a runaway answer cannot cost much.')
ON CONFLICT (key) DO NOTHING;

-- Ollama reports done_reason 'length' when it stopped because it ran out of
-- room rather than because it finished. Store that, so at volume we can see
-- whether the cap is set too low instead of guessing.
ALTER TABLE llm_usage ADD COLUMN IF NOT EXISTS truncated BOOLEAN NOT NULL DEFAULT FALSE;

CREATE INDEX IF NOT EXISTS llm_usage_truncated_idx ON llm_usage (truncated) WHERE truncated;
