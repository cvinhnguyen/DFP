-- How far back signal detection looks.
-- Jira: DM42-68, DM42-69
--
-- Thirty days suits a system collecting hundreds of items a month. A small
-- test set needs a wider window, and widening it should not mean editing a
-- workflow, so it lives here with the rest of the configuration.
--
-- Safe to run against an existing database as well as a fresh one:
--
--   docker compose exec -T postgres psql -U $POSTGRES_USER -d newsletter \
--     < db/init/08-signal-window.sql

\connect newsletter

INSERT INTO app_settings (key, value, description) VALUES
    ('signal_window_days', '30',
     'How many days back signal detection reads when looking for topics that are growing.')
ON CONFLICT (key) DO NOTHING;
