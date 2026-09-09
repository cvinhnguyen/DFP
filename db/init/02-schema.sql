-- Newsletter automation, first cut of the shared schema.
-- Jira: DM42-23
--
-- This runs once, when the Postgres volume is first created. If you change
-- this file you must recreate the volume for it to take effect:
--
--   docker compose down -v && docker compose up -d
--
-- That deletes all local data, which is fine while we are still developing.
-- Once the API service exists it will own migrations properly.

\connect newsletter

-- People who use the tool. Two or three accounts only: Kaisa, Niina and
-- possibly one more. Members never log in, so no member data lives here.
CREATE TABLE users (
    id               SERIAL PRIMARY KEY,
    email            TEXT NOT NULL UNIQUE,
    display_name     TEXT,
    password_hash    TEXT,
    role             TEXT NOT NULL DEFAULT 'editor',   -- editor | admin
    telegram_user_id TEXT UNIQUE,                      -- allowlist for the capture bot
    created_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- The sites, feeds and newsletters we monitor.
CREATE TABLE sources (
    id                      SERIAL PRIMARY KEY,
    name                    TEXT NOT NULL,
    url                     TEXT NOT NULL,
    type                    TEXT NOT NULL,              -- rss | webpage | email | manual
    check_frequency_minutes INTEGER NOT NULL DEFAULT 1440,
    active                  BOOLEAN NOT NULL DEFAULT TRUE,
    -- Copyright. Where this is false the summarisation workflow skips the
    -- item and flags it for a person to handle instead.
    summarization_allowed   BOOLEAN NOT NULL DEFAULT TRUE,
    licence_note            TEXT,
    last_checked_at         TIMESTAMPTZ,
    created_at              TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- One row per article, event or post we collect.
CREATE TABLE items (
    id              BIGSERIAL PRIMARY KEY,
    source_id       INTEGER REFERENCES sources(id) ON DELETE SET NULL,

    -- source_id is where we found it. publisher is who wrote it.
    -- publisher is the attribution printed in the newsletter, so it is not
    -- the same thing as the source and both are needed.
    publisher       TEXT,

    source_url      TEXT NOT NULL,
    canonical_url   TEXT,               -- tracking parameters stripped, for dedup
    title           TEXT NOT NULL,
    -- Often empty. The crawler cannot get it reliably, so nothing may
    -- depend on this field being present.
    author          TEXT,
    -- The publisher's own short description. The filter can match keywords
    -- on this without paying for an AI call, and the dashboard can show it
    -- when an item has no summary.
    excerpt         TEXT,
    raw_text        TEXT,               -- deleted after the retention period
    published_at    TIMESTAMPTZ,
    fetched_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    source_language TEXT,               -- fi | en
    -- Which part of the newsletter this belongs to. The association writes
    -- its own news, projects and training sections itself.
    section         TEXT,               -- events | member_news | highlights
    -- new           not yet processed
    -- filtered_out  skipped before the AI step, on purpose
    -- summarised    has a summary
    -- summary_failed the call failed, needs a retry or manual handling
    status          TEXT NOT NULL DEFAULT 'new',
    -- Duplicates are linked, not deleted. Knowing four sources carried the
    -- same story is a useful signal that it matters.
    duplicate_of    BIGINT REFERENCES items(id) ON DELETE SET NULL,
    captured_by     INTEGER REFERENCES users(id) ON DELETE SET NULL,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX items_canonical_url_idx ON items (canonical_url);
CREATE INDEX items_published_at_idx  ON items (published_at DESC);
CREATE INDEX items_status_idx        ON items (status);
CREATE INDEX items_section_idx       ON items (section);
CREATE INDEX items_source_id_idx     ON items (source_id);

-- Finnish full text search, so we do not need a separate search engine.
CREATE INDEX items_fts_idx ON items
    USING GIN (to_tsvector('finnish',
        coalesce(title, '') || ' ' || coalesce(excerpt, '')));

-- One item can have a Finnish summary and an English one, so this is a
-- separate table rather than a column on items.
CREATE TABLE summaries (
    id           BIGSERIAL PRIMARY KEY,
    item_id      BIGINT NOT NULL REFERENCES items(id) ON DELETE CASCADE,
    language     TEXT NOT NULL,          -- fi | en
    text         TEXT NOT NULL,
    provider     TEXT,
    model        TEXT,
    generated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (item_id, language)
);

-- Every AI call writes a row here. This is what answers the client's
-- question about what the tokens cost.
CREATE TABLE llm_usage (
    id                BIGSERIAL PRIMARY KEY,
    item_id           BIGINT REFERENCES items(id) ON DELETE SET NULL,
    workflow          TEXT,
    provider          TEXT NOT NULL,
    model             TEXT NOT NULL,
    tokens_in         INTEGER,
    tokens_out        INTEGER,
    estimated_cost_eur NUMERIC(10, 6),
    duration_ms       INTEGER,
    created_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX llm_usage_created_at_idx ON llm_usage (created_at DESC);

-- One row per collection run, so an editor can see when it last worked.
CREATE TABLE collection_runs (
    id          BIGSERIAL PRIMARY KEY,
    source_id   INTEGER REFERENCES sources(id) ON DELETE CASCADE,
    started_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
    finished_at TIMESTAMPTZ,
    items_found INTEGER DEFAULT 0,
    items_new   INTEGER DEFAULT 0,
    error       TEXT
);

-- One example source so the crawler has something to reference straight
-- away. Replace this once we get the real list from the client.
INSERT INTO sources (name, url, type, check_frequency_minutes)
VALUES ('eOppimiskeskus website', 'https://www.eoppimiskeskus.fi/', 'webpage', 1440);
