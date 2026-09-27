-- When the sources are checked, chosen by the editors from Telegram.
-- Jira: DM42-36
--
-- Kaisa and Niina already work in Telegram, so that is where they control the
-- checking too:
--
--   /check                 check every source now
--   /schedule              show the times
--   /schedule 8:00 14:00   check every day at these times
--   /schedule off          no automatic checking, only /check
--
-- The times are Finnish time. n8n looks every 15 minutes whether one of them has
-- passed, so a check set for 08:00 runs between 08:00 and 08:15.
--
-- Safe to run against an existing database as well as a fresh one:
--
--   docker compose exec -T postgres psql -U $POSTGRES_USER -d newsletter \
--     < db/init/13-collection-times.sql

\connect newsletter

INSERT INTO app_settings (key, value, description) VALUES
    ('collection_times', '08:00',
     'Times of day (Finnish time) when every active source is checked, separated by spaces, or off. Set from Telegram with /schedule.')
ON CONFLICT (key) DO NOTHING;
