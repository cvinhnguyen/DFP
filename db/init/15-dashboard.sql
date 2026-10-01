-- The editors' dashboard: who is logged in, and search over the summaries.
-- Jira: DM42-31, DM42-33
--
-- Kaisa, Niina and perhaps one more person log in. The members never do, so
-- there is no sign-up page. An admin makes each account by hand:
--
--   docker compose exec dashboard python -m app.cli.users add kaisa@example.fi --name Kaisa
--
-- Safe to run against an existing database as well as a fresh one:
--
--   docker compose exec -T postgres psql -U $POSTGRES_USER -d newsletter \
--     < db/init/15-dashboard.sql

\connect newsletter

INSERT INTO app_settings (key, value, description) VALUES
    ('session_hours', '12',
     'How long a dashboard login lasts. After that the editor logs in again.')
ON CONFLICT (key) DO NOTHING;

-- One row per login. The browser keeps a random token in a cookie and only a
-- hash of it is stored here, so a copy of the database is not a way in.
CREATE TABLE IF NOT EXISTS sessions (
    token_hash TEXT PRIMARY KEY,
    user_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    expires_at TIMESTAMPTZ NOT NULL
);

CREATE INDEX IF NOT EXISTS sessions_user_id_idx ON sessions (user_id);

ALTER TABLE users ADD COLUMN IF NOT EXISTS last_login_at TIMESTAMPTZ;

-- Every summary is in Finnish, so the Finnish stemmer can match word forms:
-- a search for tekoäly also finds tekoälyn and tekoälyä. Titles and excerpts
-- already have an index of their own, items_fts_idx in 02-schema.sql.
ALTER TABLE summaries ADD COLUMN IF NOT EXISTS search tsvector
    GENERATED ALWAYS AS (to_tsvector('finnish', text)) STORED;

CREATE INDEX IF NOT EXISTS summaries_search_idx ON summaries USING GIN (search);
