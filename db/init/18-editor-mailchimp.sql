-- The newsletter editor's templates and comments, and the way into Mailchimp.
-- Jira: DM42-37, DM42-74, DM42-80
--
-- The editors design each issue in the dashboard, in an editor laid out like
-- Mailchimp's, starting from a template. They can save a design or a single
-- section of one for later, and leave each other comments on an issue.
--
-- The finished email goes to the association's Mailchimp, which sends it.
-- n8n holds the Mailchimp key and is the only thing that talks to Mailchimp;
-- it creates or updates a draft there, and nothing is ever sent from here.
-- What is kept below is only what the dashboard needs to show where the
-- draft is: its id in Mailchimp, when it was exported and by whom, and what
-- Mailchimp last said about it.
--
-- Safe to run against an existing database as well as a fresh one:
--
--   docker compose exec -T postgres psql -U $POSTGRES_USER -d newsletter \
--     < db/init/18-editor-mailchimp.sql

\connect newsletter

INSERT INTO app_settings (key, value, description) VALUES
    ('mailchimp_server', '',
     'The data centre in the association''s Mailchimp address, like us4 in us4.admin.mailchimp.com. '
     'The key itself is kept in n8n, never here.'),
    ('mailchimp_audience_id', '',
     'The Mailchimp audience new drafts are addressed to. The editors can change it in Mailchimp before sending.'),
    ('mailchimp_plan', 'unknown',
     'essentials, standard or unknown. On Essentials Mailchimp does not send an email made outside its own '
     'builder, so the dashboard offers copying into the association''s own Mailchimp template first.'),
    ('newsletter_from_name', 'Suomen eOppimiskeskus ry',
     'The sender''s name on Mailchimp drafts.'),
    ('newsletter_reply_to', '',
     'The sender''s address on Mailchimp drafts. Empty uses the audience''s own default.')
ON CONFLICT (key) DO NOTHING;

-- Where an issue started: a built-in template (builtin:<key>), a saved one
-- (saved:<id>), an earlier issue (issue:<id>) or nothing (blank). The editor
-- reads it the first time the issue is opened, before there is a design.
ALTER TABLE issues ADD COLUMN IF NOT EXISTS template TEXT;

-- The issue's draft in Mailchimp, once it has been exported there.
--   exported_hash  what was sent: the email, subject, preview text and name,
--                  so the dashboard can say when the draft is out of date
--   status         Mailchimp's own word: save (a draft), schedule, sending, sent
ALTER TABLE issues ADD COLUMN IF NOT EXISTS mailchimp_campaign_id TEXT;
ALTER TABLE issues ADD COLUMN IF NOT EXISTS mailchimp_web_id      BIGINT;
ALTER TABLE issues ADD COLUMN IF NOT EXISTS mailchimp_status      TEXT;
ALTER TABLE issues ADD COLUMN IF NOT EXISTS mailchimp_exported_at TIMESTAMPTZ;
ALTER TABLE issues ADD COLUMN IF NOT EXISTS mailchimp_exported_by INTEGER REFERENCES users(id) ON DELETE SET NULL;
ALTER TABLE issues ADD COLUMN IF NOT EXISTS mailchimp_exported_hash TEXT;
ALTER TABLE issues ADD COLUMN IF NOT EXISTS mailchimp_checked_at  TIMESTAMPTZ;
ALTER TABLE issues ADD COLUMN IF NOT EXISTS mailchimp_send_time   TIMESTAMPTZ;
ALTER TABLE issues ADD COLUMN IF NOT EXISTS mailchimp_emails_sent INTEGER;

-- Designs the editors saved for reuse: a whole email (template) or one part
-- of one (section), in the editor's own format.
CREATE TABLE IF NOT EXISTS newsletter_templates (
    id         SERIAL PRIMARY KEY,
    kind       TEXT NOT NULL CHECK (kind IN ('template', 'section')),
    name       TEXT NOT NULL CHECK (length(btrim(name)) BETWEEN 1 AND 120),
    design     JSONB NOT NULL,
    created_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS newsletter_templates_kind_idx ON newsletter_templates (kind, updated_at DESC);

-- Notes the editors leave each other on an issue, like Mailchimp's comments.
-- A comment can point at one block of the email; block_label says what the
-- block was, for when it has since been deleted.
CREATE TABLE IF NOT EXISTS issue_comments (
    id          BIGSERIAL PRIMARY KEY,
    issue_id    INTEGER NOT NULL REFERENCES issues(id) ON DELETE CASCADE,
    block_id    TEXT,
    block_label TEXT,
    body        TEXT NOT NULL CHECK (length(btrim(body)) BETWEEN 1 AND 2000),
    created_by  INTEGER REFERENCES users(id) ON DELETE SET NULL,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
    resolved_at TIMESTAMPTZ,
    resolved_by INTEGER REFERENCES users(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS issue_comments_issue_idx ON issue_comments (issue_id, created_at);

-- Pictures already copied into the association's Mailchimp (its Content
-- Studio), so each is uploaded once, not on every export. Keyed by the
-- Mailchimp account as well, because a test account and the association's
-- own keep separate copies.
CREATE TABLE IF NOT EXISTS mailchimp_files (
    account_id  TEXT NOT NULL,
    sha256      TEXT NOT NULL,
    url         TEXT NOT NULL,
    file_id     BIGINT,
    name        TEXT,
    uploaded_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    PRIMARY KEY (account_id, sha256)
);
