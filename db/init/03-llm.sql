-- Configuration, pricing and caching for AI calls.
-- Jira: DM42-25
--
-- Everything here exists so that the shared LLM sub-workflow can change
-- provider, model and prices without anyone editing a workflow. Kaisa asked
-- two things in the kickoff: can we use open source models, and what do the
-- tokens cost. These tables are how we answer both with real numbers.
--
-- Safe to run against an existing database as well as a fresh one.

\connect newsletter

-- Settings that change without editing workflows or code.
CREATE TABLE IF NOT EXISTS app_settings (
    key         TEXT PRIMARY KEY,
    value       TEXT NOT NULL,
    description TEXT,
    updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

INSERT INTO app_settings (key, value, description) VALUES
    ('llm_provider', 'ollama',
     'Which provider the shared LLM sub-workflow uses. ollama runs locally and costs nothing per token.'),
    ('llm_model', 'llama3.2:1b',
     'Model name passed to the provider.'),
    ('llm_base_url', 'http://host.docker.internal:11434',
     'Where the model server is. This differs by setup: host.docker.internal on Mac and Windows when Ollama runs natively, http://ollama:11434 when using the local-llm compose profile, and http://172.17.0.1:11434 on Linux.'),
    ('llm_cache_enabled', 'true',
     'Reuse a stored response when the same text and prompt are sent again.'),
    ('monthly_budget_eur', '10',
     'Budget cap for AI spend per calendar month. Used by DM42-39.'),
    ('raw_text_retention_days', '90',
     'How long the full article text is kept before cleanup. Used by DM42-45.')
ON CONFLICT (key) DO NOTHING;

-- Token prices live here rather than in a workflow, because providers change
-- them and Kaisa specifically said prices keep going up. Storing them as data
-- means we can recalculate past spend when a price changes.
CREATE TABLE IF NOT EXISTS llm_pricing (
    id                SERIAL PRIMARY KEY,
    provider          TEXT NOT NULL,
    model             TEXT NOT NULL,
    input_eur_per_1k  NUMERIC(12, 8) NOT NULL DEFAULT 0,
    output_eur_per_1k NUMERIC(12, 8) NOT NULL DEFAULT 0,
    note              TEXT,
    updated_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (provider, model)
);

-- Local models cost nothing per token. The real cost is the machine needed to
-- run them, which is why the comparison for the client has to include hosting
-- and not only tokens.
INSERT INTO llm_pricing (provider, model, input_eur_per_1k, output_eur_per_1k, note) VALUES
    ('ollama', 'llama3.2', 0, 0,
     'Local model. No token cost. The cost is the hardware needed to run it.')
ON CONFLICT (provider, model) DO NOTHING;

-- Placeholder for whichever commercial provider we test against. Fill the
-- real numbers in from the provider's current pricing page before running the
-- comparison, and do not guess them.
INSERT INTO llm_pricing (provider, model, input_eur_per_1k, output_eur_per_1k, note) VALUES
    ('commercial', 'TBD', 0, 0,
     'Placeholder. Set provider, model and real prices before the cost comparison.')
ON CONFLICT (provider, model) DO NOTHING;

-- Response cache, so the same text is never paid for twice. The hash covers
-- provider, model, prompt and input text, so changing any of them is a new
-- entry rather than a stale hit.
CREATE TABLE IF NOT EXISTS llm_cache (
    hash       TEXT PRIMARY KEY,
    provider   TEXT NOT NULL,
    model      TEXT NOT NULL,
    response   TEXT NOT NULL,
    tokens_in  INTEGER,
    tokens_out INTEGER,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS llm_cache_created_at_idx ON llm_cache (created_at DESC);

-- Mark whether a usage row came from the cache, so a saving can be shown
-- rather than described.
ALTER TABLE llm_usage ADD COLUMN IF NOT EXISTS cached BOOLEAN NOT NULL DEFAULT FALSE;

-- What the client actually asks for: spend per month.
CREATE OR REPLACE VIEW llm_cost_by_month AS
SELECT
    date_trunc('month', created_at)                AS month,
    provider,
    model,
    count(*)                                       AS calls,
    count(*) FILTER (WHERE cached)                 AS cached_calls,
    coalesce(sum(tokens_in), 0)                    AS tokens_in,
    coalesce(sum(tokens_out), 0)                   AS tokens_out,
    round(coalesce(sum(estimated_cost_eur), 0), 4) AS cost_eur
FROM llm_usage
GROUP BY 1, 2, 3
ORDER BY 1 DESC, 5 DESC;
