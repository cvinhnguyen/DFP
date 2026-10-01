-- Accounts through the Telegram bot: one-time login links and invites.
-- Jira: DM42-33
--
-- Kaisa and Niina already work in Telegram, so that is where their accounts
-- live too, and after handover nobody needs a developer to add a colleague:
--
--   /login          a link to the dashboard that works once, for 15 minutes
--   /invite         an admin's join link for a new colleague, for 24 hours
--   /people         who can use the bot and the dashboard
--   /remove Name    ends someone's access
--
-- No password ever passes through Telegram. The chat history keeps every
-- message on Telegram's servers, and n8n keeps the content of every run for
-- 30 days, so only links that stop working once used or expired go there.
-- Like the dashboard's sessions, only a hash of each link is stored.
--
-- Safe to run against an existing database as well as a fresh one:
--
--   docker compose exec -T postgres psql -U $POSTGRES_USER -d newsletter \
--     < db/init/16-telegram-accounts.sql

\connect newsletter

INSERT INTO app_settings (key, value, description) VALUES
    ('dashboard_url', 'http://localhost:8000',
     'The address the dashboard is opened at. Login links sent by the bot point here.'),
    ('telegram_bot_username', 'DFP_Mazhar4_bot',
     'The bot''s username, for invite links of the form t.me/<username>?start=<code>.'),
    ('login_link_minutes', '15',
     'How long a login link from /login works. It works only once either way.'),
    ('invite_hours', '24',
     'How long an invite link from /invite works. It works only once either way.')
ON CONFLICT (key) DO NOTHING;

-- Someone who joins through Telegram has no email address, and does not need
-- one: they log in with a link from the bot.
ALTER TABLE users ALTER COLUMN email DROP NOT NULL;

-- Removing someone ends their access but keeps the row, so the articles they
-- sent still say who sent them. An invite later brings the same row back.
ALTER TABLE users ADD COLUMN IF NOT EXISTS removed_at TIMESTAMPTZ;

CREATE TABLE IF NOT EXISTS login_links (
    token_hash TEXT PRIMARY KEY,
    user_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    expires_at TIMESTAMPTZ NOT NULL,
    used_at    TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS login_links_user_id_idx ON login_links (user_id);

CREATE TABLE IF NOT EXISTS invites (
    code_hash  TEXT PRIMARY KEY,
    role       TEXT NOT NULL DEFAULT 'editor' CHECK (role IN ('editor', 'admin')),
    created_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    expires_at TIMESTAMPTZ NOT NULL,
    used_at    TIMESTAMPTZ,
    used_by    INTEGER REFERENCES users(id) ON DELETE SET NULL
);
