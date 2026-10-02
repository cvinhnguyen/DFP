"""SQL for what the AI costs: this month against the budget, each month, and
each newsletter. Every call is in llm_usage with its tokens and estimated
price; ai_budget is db/init/24-ai-budget.sql.
Jira: DM42-39
"""

from .. import database


def budget():
    return database.row(
        """SELECT budget_eur, spent_eur, share, warn, over, month_starts,
                  (month_starts AT TIME ZONE 'Europe/Helsinki' + interval '1 month')::date AS next_month
             FROM ai_budget""")


def set_budget(eur):
    database.run(
        "UPDATE app_settings SET value = %s, updated_at = now() WHERE key = 'monthly_budget_eur'",
        (str(eur),))


# The model in use costs nothing on the free tier we use, so its row in
# llm_pricing says 0. The same model's paid rate, in the row named without
# the tag (gemma4 for gemma4:31b-cloud), shows what the same use would cost
# once it is paid for.
PAID_RATE = """
    SELECT p.model, p.input_eur_per_1k, p.output_eur_per_1k
      FROM llm_pricing p,
           (SELECT (SELECT value FROM app_settings WHERE key = 'llm_provider') AS provider,
                   (SELECT value FROM app_settings WHERE key = 'llm_model')    AS model) used
     WHERE p.provider = used.provider
       AND p.model = split_part(used.model, ':', 1)
       AND p.model <> used.model
       AND (p.input_eur_per_1k > 0 OR p.output_eur_per_1k > 0)
       AND NOT EXISTS (SELECT 1 FROM llm_pricing q
                        WHERE q.provider = used.provider AND q.model = used.model
                          AND (q.input_eur_per_1k > 0 OR q.output_eur_per_1k > 0))
"""


def model():
    return database.row(
        f"""SELECT (SELECT value FROM app_settings WHERE key = 'llm_provider') AS provider,
                   (SELECT value FROM app_settings WHERE key = 'llm_model')    AS model,
                   (SELECT model FROM ({PAID_RATE}) paid LIMIT 1)              AS paid_rate_model""")


def months(limit=6):
    """Calls, tokens and euros per calendar month, Finnish time, with what the
    pre-filter saved: the articles it left out, each as many tokens as an
    average summary that month took. Theses wait for an editor's request and
    are counted on their own."""
    return database.rows(
        f"""WITH used AS (
                SELECT date_trunc('month', u.created_at AT TIME ZONE 'Europe/Helsinki') AS month,
                       count(*)                                AS calls,
                       count(*) FILTER (WHERE u.cached)        AS cached,
                       coalesce(sum(u.tokens_in), 0)           AS tokens_in,
                       coalesce(sum(u.tokens_out), 0)          AS tokens_out,
                       coalesce(sum(u.estimated_cost_eur), 0)  AS eur,
                       avg(coalesce(u.tokens_in, 0) + coalesce(u.tokens_out, 0))
                           FILTER (WHERE u.workflow = 'summarise' AND NOT u.cached) AS per_summary
                  FROM llm_usage u
                 GROUP BY 1
            ),
            collected AS (
                SELECT date_trunc('month', i.created_at AT TIME ZONE 'Europe/Helsinki') AS month,
                       count(*) FILTER (WHERE i.status = 'filtered_out') AS filtered,
                       count(*) FILTER (WHERE i.status = 'on_request')   AS on_request
                  FROM items i
                 GROUP BY 1
            ),
            paid AS ({PAID_RATE} LIMIT 1),
            overall AS (
                SELECT avg(coalesce(tokens_in, 0) + coalesce(tokens_out, 0)) AS per_summary
                  FROM llm_usage WHERE workflow = 'summarise' AND NOT cached
            )
            SELECT to_char(coalesce(u.month, c.month), 'YYYY-MM') AS month,
                   coalesce(u.calls, 0)      AS calls,
                   coalesce(u.cached, 0)     AS cached,
                   coalesce(u.tokens_in, 0)  AS tokens_in,
                   coalesce(u.tokens_out, 0) AS tokens_out,
                   coalesce(u.eur, 0)        AS eur,
                   (SELECT coalesce(u.tokens_in, 0) / 1000.0 * p.input_eur_per_1k
                         + coalesce(u.tokens_out, 0) / 1000.0 * p.output_eur_per_1k FROM paid p) AS paid_rate_eur,
                   coalesce(c.filtered, 0)   AS filtered,
                   round(coalesce(c.filtered, 0) * coalesce(u.per_summary, o.per_summary, 0))::bigint AS saved_tokens,
                   coalesce(c.on_request, 0) AS on_request
              FROM used u
              FULL JOIN collected c ON c.month = u.month
             CROSS JOIN overall o
             ORDER BY 1 DESC
             LIMIT %s""",
        (limit,))


def issues(limit=12):
    """Each newsletter: the AI work for the articles in it, and all the AI
    work since the newsletter before it, which is what reading the sources
    for this one took. A draft's runs until now."""
    return database.rows(
        """SELECT i.id, i.name, i.status,
                  coalesce(i.sent_at, i.mailchimp_send_time, i.created_at) AS date,
                  count(p.item_id)                     AS articles,
                  coalesce(sum(own.tokens), 0)::bigint AS tokens,
                  coalesce(sum(own.eur), 0)            AS eur,
                  period.since                         AS period_since,
                  period.tokens                        AS period_tokens,
                  period.eur                           AS period_eur
             FROM issues i
             LEFT JOIN item_picks p ON p.issue_id = i.id AND p.decision = 'picked'
             LEFT JOIN LATERAL (
                 SELECT sum(coalesce(u.tokens_in, 0) + coalesce(u.tokens_out, 0)) AS tokens,
                        sum(u.estimated_cost_eur) AS eur
                   FROM llm_usage u WHERE u.item_id = p.item_id
             ) own ON TRUE
             CROSS JOIN LATERAL (
                 SELECT b.since,
                        coalesce(sum(coalesce(u.tokens_in, 0) + coalesce(u.tokens_out, 0)), 0)::bigint AS tokens,
                        coalesce(sum(u.estimated_cost_eur), 0) AS eur
                   FROM (SELECT max(coalesce(o.sent_at, o.mailchimp_send_time)) AS since
                           FROM issues o
                          WHERE o.status = 'sent'
                            AND coalesce(o.sent_at, o.mailchimp_send_time)
                                < coalesce(i.sent_at, i.mailchimp_send_time, now())) b
                   LEFT JOIN llm_usage u
                          ON u.created_at > coalesce(b.since, '-infinity')
                         AND u.created_at <= coalesce(i.sent_at, i.mailchimp_send_time, now())
                  GROUP BY b.since
             ) period
            GROUP BY i.id, period.since, period.tokens, period.eur
            ORDER BY coalesce(i.sent_at, i.mailchimp_send_time, i.created_at) DESC
            LIMIT %s""",
        (limit,))


def waiting_for_budget():
    """Articles in the queue that the budget holds back: what was not asked
    for by an editor (n8n/workflows/summarisation.json, Pick queued)."""
    return database.row(
        """SELECT count(*) AS n
             FROM items i
            WHERE i.status = 'queued'
              AND (SELECT over FROM ai_budget)
              AND i.status_reason IS DISTINCT FROM 'requested by an editor'
              AND i.captured_by IS NULL""")["n"]
