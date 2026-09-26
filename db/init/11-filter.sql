-- A cheap check in front of the AI, so only worthwhile items are paid for.
-- Jira: DM42-34
--
-- Kaisa asked for sustainability in the kickoff and said she does not want AI
-- used where it is not supposed to be used. This is the answer, and it lowers
-- the token bill at the same time.
--
-- The filter never throws anything away. An item that does not pass is stored
-- as usual, marked filtered_out with the reason in plain words, and an editor
-- can still ask for a summary of it.
--
--   new           -> run_filter() ->  queued        (goes to the AI)
--                                 ->  filtered_out  (status_reason says why)
--   filtered_out  -> request_summary(id) -> queued
--
-- Safe to run against an existing database as well as a fresh one:
--
--   docker compose exec -T postgres psql -U $POSTGRES_USER -d newsletter \
--     < db/init/11-filter.sql

\connect newsletter

-- The rules, as data. Changing them is an UPDATE, not a workflow edit.
INSERT INTO app_settings (key, value, description) VALUES
    ('filter_max_age_days', '30',
     'Items published longer ago than this are not sent to the AI.'),
    ('filter_min_text_chars', '300',
     'Items with less text than this are not sent to the AI. There is nothing to summarise, and a model given almost nothing tends to invent.'),
    ('filter_keywords',
     'oppi, opetu, opettaj, koulutu, osaami, tekoäly, digi, verkko-opp, learning, education, teaching, training, artificial intelligence, edtech',
     'Comma separated. Items from sources set to keywords need one of these in the title, excerpt or text. Matched anywhere in a word, so a Finnish stem such as oppi also finds oppimisanalytiikka and etäoppiminen. Avoid very short words: ai would match aika.')
ON CONFLICT (key) DO NOTHING;

-- always:   everything from this source goes to the AI (our own site, links an
--           editor sent on purpose)
-- keywords: only items that match filter_keywords (general news feeds)
--
-- New sources default to keywords, the cheaper choice.
ALTER TABLE sources ADD COLUMN IF NOT EXISTS filter_mode TEXT NOT NULL DEFAULT 'keywords';
UPDATE sources SET filter_mode = 'always'
 WHERE url IN ('https://eoppimiskeskus.fi/ajankohtaista/',
               'https://eoppimiskeskus.fi/en/news/')
    OR type = 'manual';

-- Why an item is where it is, in plain words: why the filter skipped it, that
-- an editor asked for it, or why the AI step failed. The dashboard shows this
-- next to the status.
ALTER TABLE items ADD COLUMN IF NOT EXISTS status_reason TEXT;

-- One row per run, so the effect can be shown to the client in numbers.
-- Tokens are estimated from what we measured on real summaries, not guessed.
CREATE TABLE IF NOT EXISTS filter_runs (
    id                BIGSERIAL PRIMARY KEY,
    run_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
    checked           INTEGER NOT NULL,
    queued            INTEGER NOT NULL,
    skipped           INTEGER NOT NULL,
    skipped_by_reason JSONB NOT NULL DEFAULT '{}'::jsonb,
    est_tokens_in     INTEGER NOT NULL DEFAULT 0,
    est_tokens_out    INTEGER NOT NULL DEFAULT 0
);

-- Decides every item still marked new, in one statement.
--
-- The first rule that applies gives the reason, in this order: the same story
-- is already here, too little text, too old, no keyword match. Everything else
-- is queued for the AI.
CREATE OR REPLACE FUNCTION run_filter() RETURNS filter_runs
LANGUAGE plpgsql AS $$
DECLARE
    max_age   int    := (SELECT value::int FROM app_settings WHERE key = 'filter_max_age_days');
    min_chars int    := (SELECT value::int FROM app_settings WHERE key = 'filter_min_text_chars');
    keywords  text[] := (SELECT array_agg(lower(btrim(k)))
                           FROM app_settings,
                                unnest(string_to_array(value, ',')) AS k
                          WHERE key = 'filter_keywords' AND btrim(k) <> '');
    -- Tokens per character of text, and tokens per answer, from summaries we
    -- have already paid for. The fallbacks are what we measured on the
    -- client's 20 articles in sprint 1.
    per_char  numeric := coalesce(
                  (SELECT sum(u.tokens_in)::numeric
                          / nullif(sum(length(i.title) + length(i.raw_text)), 0)
                     FROM llm_usage u JOIN items i ON i.id = u.item_id
                    WHERE u.workflow IN ('summarise', 'telegram_capture')
                      AND NOT u.cached AND u.tokens_in > 0),
                  0.44);
    per_reply numeric := coalesce(
                  (SELECT avg(tokens_out) FROM llm_usage
                    WHERE workflow IN ('summarise', 'telegram_capture')
                      AND NOT cached AND tokens_out > 0),
                  114);
    result    filter_runs;
BEGIN
    WITH decided AS (
        SELECT i.id,
               i.title,
               i.raw_text,
               CASE
                 WHEN i.duplicate_of IS NOT NULL
                   THEN 'same story as item ' || i.duplicate_of
                 WHEN length(coalesce(i.raw_text, '')) < min_chars
                   THEN 'too little text to summarise'
                 WHEN coalesce(i.published_at, i.fetched_at) < now() - make_interval(days => max_age)
                   THEN 'older than ' || max_age || ' days'
                 WHEN coalesce(s.filter_mode, 'keywords') = 'keywords'
                  AND NOT EXISTS (
                        SELECT 1 FROM unnest(keywords) AS k
                         WHERE position(k IN lower(concat_ws(' ', i.title, i.excerpt, i.raw_text))) > 0)
                   THEN 'no keyword match'
               END AS reason
          FROM items i
          LEFT JOIN sources s ON s.id = i.source_id
         WHERE i.status = 'new'
           FOR UPDATE OF i SKIP LOCKED
    ),
    marked AS (
        UPDATE items i
           SET status        = CASE WHEN d.reason IS NULL THEN 'queued' ELSE 'filtered_out' END,
               status_reason = d.reason
          FROM decided d
         WHERE i.id = d.id
        RETURNING i.id
    ),
    -- a reason like "same story as item 25" counts under one heading
    reasons AS (
        SELECT regexp_replace(reason, ' [0-9]+$', '') AS reason, count(*) AS n
          FROM decided WHERE reason IS NOT NULL GROUP BY 1
    )
    INSERT INTO filter_runs (checked, queued, skipped, skipped_by_reason,
                             est_tokens_in, est_tokens_out)
    SELECT count(*),
           count(*) FILTER (WHERE reason IS NULL),
           count(*) FILTER (WHERE reason IS NOT NULL),
           coalesce((SELECT jsonb_object_agg(reason, n) FROM reasons), '{}'::jsonb),
           coalesce(round(sum(per_char * (length(title) + length(coalesce(raw_text, ''))))
                          FILTER (WHERE reason IS NOT NULL)), 0),
           round(per_reply * count(*) FILTER (WHERE reason IS NOT NULL))
      FROM decided
    RETURNING * INTO result;

    RETURN result;
END $$;

-- What the dashboard calls when an editor wants a summary the filter skipped.
-- It goes to the AI on the next run. Refused for copyright-blocked sources
-- later, by the summarisation step, not here.
CREATE OR REPLACE FUNCTION request_summary(p_item_id bigint) RETURNS boolean
LANGUAGE sql AS $$
    WITH changed AS (
        UPDATE items
           SET status = 'queued', status_reason = 'requested by an editor'
         WHERE id = p_item_id
           AND status IN ('filtered_out', 'summary_failed')
        RETURNING id
    )
    SELECT count(*) > 0 FROM changed;
$$;

-- The saving, month by month, priced at whatever model is configured now. On
-- the free tier that is zero euros, which is the honest answer. To see it at
-- paid rates, swap the model in the join, for example to 'gemma4'.
CREATE OR REPLACE VIEW filter_savings_by_month AS
SELECT date_trunc('month', r.run_at)          AS month,
       sum(r.checked)                         AS checked,
       sum(r.skipped)                         AS skipped,
       sum(r.est_tokens_in + r.est_tokens_out) AS est_tokens_saved,
       round(sum(r.est_tokens_in)  / 1000.0 * coalesce(max(p.input_eur_per_1k), 0)
           + sum(r.est_tokens_out) / 1000.0 * coalesce(max(p.output_eur_per_1k), 0), 4)
                                              AS est_eur_saved
  FROM filter_runs r
  LEFT JOIN llm_pricing p
         ON p.provider = (SELECT value FROM app_settings WHERE key = 'llm_provider')
        AND p.model    = (SELECT value FROM app_settings WHERE key = 'llm_model')
 GROUP BY 1
 ORDER BY 1 DESC;
