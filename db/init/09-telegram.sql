-- Telegram capture: where manual captures land, and where polling keeps its place.
-- Jira: DM42-26
--
-- Kaisa and Niina already keep a Telegram channel where they post interesting
-- links. This takes over the capture half of that habit and asks them to change
-- nothing about how they work.
--
-- Safe to run against an existing database as well as a fresh one:
--
--   docker compose exec -T postgres psql -U $POSTGRES_USER -d newsletter \
--     < db/init/09-telegram.sql

\connect newsletter

-- A source for things a person sent us rather than something we crawled, so a
-- captured item still has somewhere to point and the dashboard can show where
-- it came from.
INSERT INTO sources (name, url, type, language, check_frequency_minutes, active)
VALUES ('Telegram capture', 'https://t.me/DFP_Mazhar4_bot', 'manual', NULL, 0, TRUE)
ON CONFLICT (url) DO UPDATE
   SET name = EXCLUDED.name, type = EXCLUDED.type;

-- The bot asks Telegram for new messages rather than Telegram calling us, which
-- is why none of this needs a public address or a tunnel. Telegram only forgets
-- a message once we ask for the next one, so this is the marker of where we got
-- to. It is advanced after the messages are handled, not before: handling the
-- same message twice is harmless, losing one is not.
INSERT INTO app_settings (key, value, description) VALUES
    ('telegram_offset', '0',
     'Telegram update_id to ask from next. Advanced only after a batch has been handled.')
ON CONFLICT (key) DO NOTHING;

-- The allowlist lives in users.telegram_user_id, which already exists. A bot
-- with an open door lets anyone who finds it put content into the client's
-- newsletter, so an unknown sender is refused. To add someone, have them
-- message the bot once: it replies with their numeric id, then
--
--   INSERT INTO users (email, display_name, role, telegram_user_id)
--   VALUES ('kaisa@example.fi', 'Kaisa', 'editor', '123456789');
