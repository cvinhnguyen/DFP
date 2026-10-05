-- The association's Drive folder both ways: the tool saves articles and
-- lists of them into its own folder there, follows what happens to the
-- documents it has read, brings the folder's pictures into Kuvapankki, and
-- can save each sent newsletter by itself.
-- Jira: DM42-43
--
-- services/drive.py does all of it, behind the same guard as before
-- (33-drive.sql, docs/drive.md). Here:
--
--   items.withdrawn_at   an article whose document left the folder, or
--                        became something the guard does not read, while a
--                        newsletter still has it. One no newsletter has is
--                        deleted instead.
--   drive_saves          what the tool saved into the folder, and who asked
--   drive_changes        a document that changed after its article went into
--                        a newsletter, until an editor has looked
--   drive_thumbs         small previews of the folder's pictures
--   images.drive_id      a picture brought into Kuvapankki from the folder
--
-- Safe to run against an existing database as well as a fresh one:
--
--   docker compose exec -T postgres psql -U $POSTGRES_USER -d newsletter \
--     < db/init/34-drive-library.sql

\connect newsletter

BEGIN;

INSERT INTO app_settings (key, value, description) VALUES
    ('drive_autosave_sent', 'false',
     'Whether each newsletter marked sent is saved into the Drive folder by itself: true or false. Changed on Asetukset.'),
    ('drive_autosave_since', '',
     'When that was switched on. Newsletters sent before it are not saved by it.')
ON CONFLICT (key) DO NOTHING;

-- The folder is read every 15 minutes now (n8n/workflows/drive.json).
UPDATE sources SET check_frequency_minutes = 15 WHERE type = 'drive' AND check_frequency_minutes = 60;

-- An article whose Drive document is gone, or was renamed to say it holds
-- people's details, or now has a personal identity code in it. Its text is
-- taken away at once, and it leaves every list and Kysy artikkeleilta; it
-- stays only for the newsletter that has it, where Tarkistus asks for it to
-- be taken out of a draft.
ALTER TABLE items ADD COLUMN IF NOT EXISTS withdrawn_at     TIMESTAMPTZ;
ALTER TABLE items ADD COLUMN IF NOT EXISTS withdrawn_reason TEXT;
CREATE INDEX IF NOT EXISTS items_withdrawn_idx ON items (id) WHERE withdrawn_at IS NOT NULL;

-- Everything the tool saved into the folder. The files themselves are in
-- Drive; this is for the pages ("Tallennettu Driveen 5.10.") and so a sent
-- newsletter is saved by itself only once.
CREATE TABLE IF NOT EXISTS drive_saves (
    id          BIGSERIAL PRIMARY KEY,
    kind        TEXT NOT NULL CHECK (kind IN ('article', 'list', 'newsletter')),
    item_id     BIGINT REFERENCES items(id) ON DELETE SET NULL,
    issue_id    INTEGER REFERENCES issues(id) ON DELETE SET NULL,
    name        TEXT NOT NULL,               -- the Google Doc's name
    folder      TEXT NOT NULL,               -- its folder, inside the tool's own
    file_id     TEXT NOT NULL,
    link        TEXT,
    folder_link TEXT,
    saved_by    INTEGER REFERENCES users(id) ON DELETE SET NULL,  -- empty: saved by itself
    saved_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS drive_saves_item_idx ON drive_saves (item_id, saved_at DESC) WHERE item_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS drive_saves_issue_idx ON drive_saves (issue_id, saved_at DESC) WHERE issue_id IS NOT NULL;

-- A Drive document that changed after its article went into a newsletter.
-- The email keeps the text it had when the article was placed, so Tarkistus
-- holds the email back until an editor has looked (seen_at).
CREATE TABLE IF NOT EXISTS drive_changes (
    item_id    BIGINT PRIMARY KEY REFERENCES items(id) ON DELETE CASCADE,
    changed_at TIMESTAMPTZ NOT NULL,
    seen_at    TIMESTAMPTZ,
    seen_by    INTEGER REFERENCES users(id) ON DELETE SET NULL
);

-- A small preview of each picture in the folder, made the first time an
-- editor looks at the folder's pictures in Kuvapankki, and made again when
-- the picture changes. Goes with the picture when it leaves the folder.
CREATE TABLE IF NOT EXISTS drive_thumbs (
    drive_id    TEXT PRIMARY KEY,
    modified_at TIMESTAMPTZ,
    data        BYTEA NOT NULL,
    made_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- A picture an editor brought into Kuvapankki from the folder. Like the
-- articles, it goes when its file leaves the folder, unless a newsletter
-- uses it.
ALTER TABLE images ADD COLUMN IF NOT EXISTS drive_id TEXT;
CREATE INDEX IF NOT EXISTS images_drive_idx ON images (drive_id) WHERE drive_id IS NOT NULL;

-- Two more kinds of row in the log: an article taken away because its
-- document left the folder, and a picture brought into Kuvapankki.
ALTER TABLE drive_log DROP CONSTRAINT IF EXISTS drive_log_action_check;
ALTER TABLE drive_log ADD CONSTRAINT drive_log_action_check
    CHECK (action IN ('check', 'sync', 'read', 'save', 'settings', 'withdraw', 'import'));

COMMIT;
