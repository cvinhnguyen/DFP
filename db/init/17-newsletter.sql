-- Newsletter issues, what the editors picked for them, and their images.
-- Jira: DM42-32, DM42-37
--
-- An editor reads an article's summary and decides: put it in the newsletter
-- (in a section), keep it for later, or not use it. Picked articles go into
-- the issue being prepared. The issue itself is designed in the dashboard's
-- newsletter editor and handed to Mailchimp, which sends it; nothing is ever
-- sent from here.
--
-- Safe to run against an existing database as well as a fresh one:
--
--   docker compose exec -T postgres psql -U $POSTGRES_USER -d newsletter \
--     < db/init/17-newsletter.sql

\connect newsletter

CREATE TABLE IF NOT EXISTS issues (
    id          SERIAL PRIMARY KEY,
    -- How the editors call it, for example Lokakuu 2026.
    name        TEXT NOT NULL,
    -- The email's subject line and the preview text shown after it.
    subject     TEXT NOT NULL DEFAULT '',
    preheader   TEXT NOT NULL DEFAULT '',
    -- draft while it is prepared, sent once an editor has sent it from
    -- Mailchimp and marked it here.
    status      TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'sent')),
    -- The editor's own description of the layout, which it loads back.
    design      JSONB,
    -- The finished email, styles written inline, as Mailchimp takes it.
    html        TEXT,
    -- Who saved the layout last and when. Two people share the work, so a
    -- save based on an older layout than this is refused rather than
    -- quietly overwriting the other person's changes.
    design_saved_at TIMESTAMPTZ,
    design_saved_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
    created_by  INTEGER REFERENCES users(id) ON DELETE SET NULL,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_by  INTEGER REFERENCES users(id) ON DELETE SET NULL,
    updated_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
    sent_at     TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS issues_status_idx ON issues (status, created_at DESC);

-- One decision per article, by whoever made it last. Two people share the
-- work, so the dashboard shows who decided and when.
--
--   picked     in an issue, in one of its sections
--   later      not this time, but keep it in view
--   dismissed  not for the newsletter
CREATE TABLE IF NOT EXISTS item_picks (
    item_id    BIGINT PRIMARY KEY REFERENCES items(id) ON DELETE CASCADE,
    decision   TEXT NOT NULL CHECK (decision IN ('picked', 'later', 'dismissed')),
    -- A pick belongs to its issue, so it goes if the issue ever does.
    issue_id   INTEGER REFERENCES issues(id) ON DELETE CASCADE,
    -- highlights (Nostoja kentältä), events (Tapahtumat) or own_news
    -- (the association's own news)
    section    TEXT CHECK (section IN ('highlights', 'events', 'own_news')),
    decided_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
    decided_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CHECK ((decision = 'picked') = (issue_id IS NOT NULL AND section IS NOT NULL))
);

CREATE INDEX IF NOT EXISTS item_picks_issue_idx ON item_picks (issue_id, section);

-- Images the editors upload for a newsletter. They are re-encoded on upload,
-- which drops the camera's location and other metadata. The key is random,
-- so an image's address cannot be guessed: it is meant to be seen by the
-- newsletter's readers and nobody else. gen_random_uuid() is part of
-- Postgres itself, so no extension is needed.
CREATE TABLE IF NOT EXISTS images (
    id          BIGSERIAL PRIMARY KEY,
    key         UUID NOT NULL UNIQUE DEFAULT gen_random_uuid(),
    issue_id    INTEGER REFERENCES issues(id) ON DELETE SET NULL,
    filename    TEXT,
    mime        TEXT NOT NULL,
    data        BYTEA NOT NULL,
    width       INTEGER,
    height      INTEGER,
    uploaded_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
