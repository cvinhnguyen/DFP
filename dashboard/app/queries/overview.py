"""SQL for the status line: source checks, and articles by state."""

from .. import database

# The reason the summarisation workflow gives an article it sends back to the
# queue because the model did not answer. See "Save summary" in
# n8n/workflows/summarisation.json.
AI_DID_NOT_ANSWER = "waiting for the AI to answer again"

RUNNING = """EXISTS (SELECT 1 FROM collection_runs
                      WHERE finished_at IS NULL
                        AND started_at > now() - interval '30 minutes')"""

STATUS = f"""
WITH latest AS (
    SELECT DISTINCT ON (r.source_id) r.started_at, r.error, s.name
      FROM collection_runs r
      JOIN sources s ON s.id = r.source_id
     WHERE s.active
       AND r.finished_at IS NOT NULL
     ORDER BY r.source_id, r.started_at DESC
)
SELECT (SELECT max(finished_at) FROM collection_runs) AS last_check_at,
       {RUNNING} AS checking_now,
       coalesce((SELECT jsonb_agg(jsonb_build_object('source', name, 'error', error, 'at', started_at)
                                  ORDER BY name)
                   FROM latest
                  WHERE error IS NOT NULL), '[]'::jsonb) AS failed_sources,
       -- created_at, not fetched_at: the ingest API moves fetched_at forward
       -- whenever a source sends an article it already sent. Theses are
       -- counted on their own: some 45 a day would drown the news.
       (SELECT count(*) FROM items i
          LEFT JOIN sources s ON s.id = i.source_id
         WHERE i.created_at >= date_trunc('day', now() AT TIME ZONE 'Europe/Helsinki')
                               AT TIME ZONE 'Europe/Helsinki'
           AND s.filter_mode IS DISTINCT FROM 'on_request') AS new_today,
       (SELECT count(*) FROM items i
          JOIN sources s ON s.id = i.source_id
         WHERE i.created_at >= date_trunc('day', now() AT TIME ZONE 'Europe/Helsinki')
                               AT TIME ZONE 'Europe/Helsinki'
           AND s.filter_mode = 'on_request') AS new_theses_today,
       (SELECT count(*) FROM items WHERE status IN ('new', 'queued')) AS waiting,
       (SELECT count(*) FROM items
         WHERE status = 'queued' AND status_reason = '{AI_DID_NOT_ANSWER}') AS waiting_for_ai,
       (SELECT count(*) FROM items WHERE status IN ('summary_failed', 'manual')) AS needs_attention
"""


def status():
    return database.row(STATUS)


def check_running():
    return database.row(f"SELECT {RUNNING} AS running")["running"]
