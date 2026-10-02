-- Accounts an admin makes from Telegram with an email address, where the
-- person chooses their own password; a shared login for showing the
-- dashboard; and /reschedule next to /schedule.
-- Jira: DM42-33, DM42-36
--
--   /adduser kaisa@example.fi Kaisa Virtanen   an account that logs in to the
--                                              dashboard with email and password
--   /adduser admin kaisa@example.fi Kaisa      the same, as an admin
--   /password kaisa@example.fi                 admins: a new link, for a forgotten password
--   /password                                  anyone: a link to choose their own
--
-- The bot gives a link that works once, for a few days, and opens a page in
-- the dashboard where the person types the password they want, and their
-- email if the account has none yet. The password itself never passes
-- through Telegram, which keeps every message, or through n8n, which keeps
-- every run for 30 days. Only a hash of each link is stored, as with the
-- login links.
--
-- Safe to run against an existing database as well as a fresh one:
--
--   docker compose exec -T postgres psql -U $POSTGRES_USER -d newsletter \
--     < db/init/22-password-links.sql

\connect newsletter

BEGIN;

CREATE TABLE IF NOT EXISTS password_links (
    token_hash TEXT PRIMARY KEY,
    user_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    created_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    expires_at TIMESTAMPTZ NOT NULL,
    used_at    TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS password_links_user_id_idx ON password_links (user_id);

INSERT INTO app_settings (key, value, description) VALUES
    ('password_link_hours', '72',
     'How long a link to choose a password works, from /adduser or /password. It works only once either way.')
ON CONFLICT (key) DO NOTHING;
UPDATE app_settings
   SET description = 'How long a link to choose a password works, from /adduser or /password. It works only once either way.'
 WHERE key = 'password_link_hours';

-- The login everyone at a presentation shares, made with /adduser like any
-- other. Its password is shown to the whole room, so it cannot send
-- anything to Mailchimp or delete anything (dependencies.not_demo). Remove
-- it with /remove when the presentation is over.
INSERT INTO app_settings (key, value, description) VALUES
    ('demo_email', 'demo@demo.com',
     'The shared demo login: the account with this email cannot send to Mailchimp or delete anything. Empty for none.')
ON CONFLICT (key) DO NOTHING;

-- One account per email address, whatever its capitals. Logging in already
-- ignores them, so kaisa@ and Kaisa@ have to be the same account.
CREATE UNIQUE INDEX IF NOT EXISTS users_email_lower_idx ON users (lower(email));

-- /reschedule changes the check times as well. /schedule stays: the editors
-- know it, and it reads better for setting the times the first time.
UPDATE app_settings
   SET description = 'Times of day (Finnish time) when every active source is checked, separated by spaces, or off. Set from Telegram with /schedule or /reschedule.'
 WHERE key = 'collection_times';

COMMIT;
