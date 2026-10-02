-- What the AI costs, and a monthly budget it keeps to.
-- Jira: DM42-39
--
-- llm_usage already keeps every call with its tokens and estimated price.
-- ai_budget turns that into this month's state, Finnish time, against
-- monthly_budget_eur:
--
--   warn  80 % or more of the budget is used. The dashboard says so, and the
--         bot tells the team once that month.
--   over  the budget is used up. Summarising the articles the sources bring
--         in, and making older summaries again, waits until next month or
--         until an admin raises the budget. What an editor asks for still
--         happens: a link sent to the bot, and a summary asked for in the
--         dashboard. The team is told when it stops and when it starts again.
--
-- A budget of 0 means no cap.
--
-- Safe to run against an existing database as well as a fresh one:
--
--   docker compose exec -T postgres psql -U $POSTGRES_USER -d newsletter \
--     < db/init/24-ai-budget.sql

\connect newsletter

BEGIN;

CREATE OR REPLACE VIEW ai_budget AS
WITH month AS (
    SELECT date_trunc('month', now() AT TIME ZONE 'Europe/Helsinki') AT TIME ZONE 'Europe/Helsinki' AS starts
),
budget AS (
    SELECT coalesce((SELECT nullif(btrim(value), '')::numeric
                       FROM app_settings WHERE key = 'monthly_budget_eur'), 0) AS eur
),
spent AS (
    SELECT coalesce(sum(u.estimated_cost_eur), 0) AS eur
      FROM llm_usage u, month m
     WHERE u.created_at >= m.starts
)
SELECT m.starts                                   AS month_starts,
       b.eur                                      AS budget_eur,
       s.eur                                      AS spent_eur,
       CASE WHEN b.eur > 0 THEN s.eur / b.eur END AS share,
       b.eur > 0 AND s.eur >= 0.8 * b.eur         AS warn,
       b.eur > 0 AND s.eur >= b.eur               AS over
  FROM month m, budget b, spent s;

UPDATE app_settings
   SET description = 'AI budget per calendar month in euros, Finnish time. At 80 % the dashboard warns and the bot tells the team; when it is used up, articles from the sources wait for next month, while what editors ask for is still summarised. 0 means no cap.'
 WHERE key = 'monthly_budget_eur';

COMMIT;
