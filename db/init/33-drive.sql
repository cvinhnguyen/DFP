-- Google Drive: the association's one folder for the newsletter's material,
-- read into Artikkelit, and its finished newsletters saved back into it.
-- Jira: DM42-43
--
-- The guard that keeps the tool in that one folder is
-- dashboard/app/services/drive.py; docs/drive.md explains it for the
-- association. Here: the switch and the folder (app_settings), the source
-- the documents arrive as, what the guard last listed of the folder
-- (drive_files), and every action it took or refused (drive_log).
--
-- Safe to run against an existing database as well as a fresh one:
--
--   docker compose exec -T postgres psql -U $POSTGRES_USER -d newsletter \
--     < db/init/33-drive.sql

\connect newsletter

BEGIN;

INSERT INTO app_settings (key, value, description) VALUES
    ('drive_enabled', 'false',
     'Whether the tool may use the Google Drive folder at all: true or false. Off, it reads and saves nothing. Changed on Asetukset.'),
    ('drive_folder_id', '',
     'The id of the one Drive folder the tool reads, from the address an admin gives on Asetukset; empty for none'),
    ('drive_folder_name', '', 'The folder''s name, as the last check found it'),
    ('drive_output_folder_id', '',
     'The folder inside it the tool saves in, as the last check found it or the tool made it; empty for none'),
    ('drive_check', '',
     'The last check of what the tool''s Google account can reach, as JSON (services/drive.py)'),
    ('drive_synced_at', '', 'When the folder was last read; empty before the first time')
ON CONFLICT (key) DO NOTHING;

-- The documents arrive as the articles of one source. Filtered like the
-- association's own site: everything goes to the AI. Pictures are not
-- fetched from a Drive address. Off until an admin switches Drive on.
INSERT INTO sources (name, url, type, language, active, filter_mode, publisher, picture_rights,
                     check_frequency_minutes, notes)
SELECT 'Google Drive', 'https://drive.google.com/', 'drive', 'fi', FALSE, 'always',
       'Suomen eOppimiskeskus ry', 'none', 60,
       'The association''s own Drive folder for the newsletter, read by the dashboard every hour (33-drive.sql)'
 WHERE NOT EXISTS (SELECT 1 FROM sources WHERE type = 'drive');

-- What the guard last listed of the folder: every file and folder in it,
-- what was done with each and why. A file's id is only ever used if it is
-- here, from the guard's own listing.
CREATE TABLE IF NOT EXISTS drive_files (
    drive_id          TEXT PRIMARY KEY,
    name              TEXT NOT NULL,
    mime_type         TEXT NOT NULL,
    parent_id         TEXT,
    path              TEXT NOT NULL DEFAULT '',   -- the folders above it, "Tapahtumat/Syksy"
    is_folder         BOOLEAN NOT NULL DEFAULT FALSE,
    size              BIGINT,
    modified_at       TIMESTAMPTZ,
    web_link          TEXT,
    -- new: not looked at yet; read: an article now; waiting: changed in the
    -- last half hour; skipped: not a document, too big, a shortcut, or a
    -- name that says it holds people's details; refused: a personal identity
    -- code in it, or moved out of the folder; failed: could not be read;
    -- folder: a folder read into; own: the tool's own saves
    status            TEXT NOT NULL DEFAULT 'new'
                      CHECK (status IN ('new', 'read', 'waiting', 'skipped', 'refused', 'failed', 'folder', 'own')),
    reason            TEXT,
    read_modified_at  TIMESTAMPTZ,                -- the version read, or refused
    item_id           BIGINT REFERENCES items(id) ON DELETE SET NULL,
    seen_at           TIMESTAMPTZ NOT NULL DEFAULT now(),
    gone_at           TIMESTAMPTZ                 -- no longer in the folder
);

-- Every action the guard took or refused, for the admins to see on
-- Asetukset. Names of files, never their contents.
CREATE TABLE IF NOT EXISTS drive_log (
    id        BIGSERIAL PRIMARY KEY,
    at        TIMESTAMPTZ NOT NULL DEFAULT now(),
    user_id   INTEGER REFERENCES users(id) ON DELETE SET NULL,
    actor     TEXT NOT NULL,                     -- the editor's name, or n8n for the hourly read
    action    TEXT NOT NULL CHECK (action IN ('check', 'sync', 'read', 'save', 'settings')),
    outcome   TEXT NOT NULL CHECK (outcome IN ('allowed', 'refused', 'failed')),
    reason    TEXT,                              -- a code, see services/drive_rules.py and drive.py
    drive_id  TEXT,
    name      TEXT,
    detail    JSONB
);
CREATE INDEX IF NOT EXISTS drive_log_at ON drive_log (at DESC);

COMMIT;
