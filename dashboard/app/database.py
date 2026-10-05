"""The connection pool, and the three helpers every query uses.

Connections are in autocommit mode: each statement is saved as it runs. Code
that needs several statements to succeed or fail together opens a
transaction itself, as queries/items.request_summary does.
"""

from psycopg.errors import UniqueViolation  # noqa: F401  (for the queries)
from psycopg.rows import dict_row
from psycopg_pool import ConnectionPool

pool = ConnectionPool(
    conninfo="",
    min_size=1,
    max_size=5,
    open=False,
    kwargs={"autocommit": True, "row_factory": dict_row},
)


def rows(sql, params=None):
    with pool.connection() as conn:
        return conn.execute(sql, params).fetchall()


def row(sql, params=None):
    with pool.connection() as conn:
        return conn.execute(sql, params).fetchone()


def run(sql, params=None):
    with pool.connection() as conn:
        conn.execute(sql, params)


# What the dashboard needs from db/init/, newest first. A teammate who pulls
# new code without applying a migration is told which file to run, instead of
# getting an error from deep inside a query.
NEEDS = [
    ("35-live.sql", "SELECT to_regproc('public.live_send') IS NOT NULL AS ok"),
    ("34-drive-library.sql", "SELECT to_regclass('public.drive_saves') IS NOT NULL AS ok"),
    ("33-drive.sql", "SELECT to_regclass('public.drive_log') IS NOT NULL AS ok"),
    ("32-archive-import.sql", "SELECT EXISTS (SELECT 1 FROM app_settings WHERE key = 'newsletter_archive_read_at') AS ok"),
    ("31-learning-factory.sql", """SELECT pg_get_constraintdef(oid) LIKE '%training%' AS ok
                                  FROM pg_constraint WHERE conname = 'item_picks_section_check'"""),
    ("30-section-suggestions.sql", """SELECT EXISTS (SELECT 1 FROM information_schema.columns
                                    WHERE table_name = 'item_picks' AND column_name = 'suggested_section') AS ok"""),
    ("29-members.sql", "SELECT to_regclass('public.members') IS NOT NULL AS ok"),
    ("28-article-pictures.sql", """SELECT EXISTS (SELECT 1 FROM information_schema.columns
                                    WHERE table_name = 'sources' AND column_name = 'picture_rights') AS ok"""),
    ("27-brand.sql", "SELECT EXISTS (SELECT 1 FROM app_settings WHERE key = 'brand_logo') AS ok"),
    ("26-archive.sql", "SELECT to_regclass('public.archive_entries') IS NOT NULL AS ok"),
    ("25-retention.sql", "SELECT to_regclass('public.retention_runs') IS NOT NULL AS ok"),
    ("24-ai-budget.sql", "SELECT to_regclass('public.ai_budget') IS NOT NULL AS ok"),
    ("23-alerts.sql", "SELECT to_regclass('public.alerts') IS NOT NULL AS ok"),
    ("22-password-links.sql", "SELECT to_regclass('public.password_links') IS NOT NULL AS ok"),
    ("21-titles-events.sql", "SELECT to_regclass('public.item_views') IS NOT NULL AS ok"),
    ("20-topics.sql", "SELECT to_regclass('public.item_topics') IS NOT NULL AS ok"),
    ("19-member-news.sql", """SELECT pg_get_constraintdef(oid) LIKE '%member_news%' AS ok
                              FROM pg_constraint WHERE conname = 'item_picks_section_check'"""),
    ("18-editor-mailchimp.sql", "SELECT to_regclass('public.newsletter_templates') IS NOT NULL AS ok"),
    ("17-newsletter.sql", "SELECT to_regclass('public.item_picks') IS NOT NULL AS ok"),
    ("16-telegram-accounts.sql", "SELECT to_regclass('public.login_links') IS NOT NULL AS ok"),
    ("15-dashboard.sql", "SELECT to_regclass('public.sessions') IS NOT NULL AS ok"),
    ("14-feed-sources.sql", """SELECT EXISTS (SELECT 1 FROM information_schema.columns
                                WHERE table_name = 'sources' AND column_name = 'publisher') AS ok"""),
    ("11-filter.sql", "SELECT to_regproc('public.request_summary') IS NOT NULL AS ok"),
]


def schema_problem():
    with pool.connection() as conn:
        missing = [name for name, check in NEEDS if not conn.execute(check).fetchone()["ok"]]
    if not missing:
        return None
    files = " and ".join(f"db/init/{name}" for name in reversed(missing))
    return (f"The database is missing {files}. Apply it as db/README.md describes, "
            "then restart the dashboard with: docker compose restart dashboard")
