-- Weak signals and trends found in the collected news.
-- Jira: DM42-68, DM42-69, DM42-70
--
-- Safe to run against an existing database as well as a fresh one. The init
-- scripts only run when the Postgres volume is created, so on a database that
-- already has data apply it by hand:
--
--   docker compose exec -T postgres psql -U $POSTGRES_USER -d newsletter \
--     < db/init/04-signals.sql

\connect newsletter

CREATE TABLE IF NOT EXISTS signals (
    id           BIGSERIAL PRIMARY KEY,
    topic        TEXT NOT NULL,
    kind         TEXT NOT NULL DEFAULT 'weak_signal',   -- weak_signal | trend
    -- Why the detector flagged this. An editor has to be able to judge a
    -- signal rather than take it on trust, so this is not optional.
    reason       TEXT NOT NULL,
    -- The window the detection looked at. Frequency over time means nothing
    -- unless you know over what period it was measured.
    period_start DATE NOT NULL,
    period_end   DATE NOT NULL,
    -- Whatever the detector used to rank it. Left free because we do not know
    -- yet what the scoring will be.
    score        NUMERIC(8, 4),
    workflow     TEXT,                                  -- which workflow wrote it
    detected_on  DATE NOT NULL DEFAULT current_date,
    -- new        found, nobody has looked at it
    -- reviewed   an editor has read it
    -- used       it went into a newsletter
    -- dismissed  an editor decided it was noise
    status       TEXT NOT NULL DEFAULT 'new',
    created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Detection will be run on a schedule and reruns are normal, so the same topic
-- found again on the same day has to update the existing row instead of piling
-- up copies. This index is what the upsert matches on. Topic is lowercased
-- because the model will not capitalise consistently.
CREATE UNIQUE INDEX IF NOT EXISTS signals_topic_day_idx
    ON signals (lower(topic), detected_on, kind);

CREATE INDEX IF NOT EXISTS signals_detected_on_idx ON signals (detected_on DESC);
CREATE INDEX IF NOT EXISTS signals_status_idx      ON signals (status);

-- The articles a signal was found in. A signal an editor cannot trace back to
-- real articles is not something they can put in front of members.
CREATE TABLE IF NOT EXISTS signal_items (
    signal_id BIGINT NOT NULL REFERENCES signals(id) ON DELETE CASCADE,
    item_id   BIGINT NOT NULL REFERENCES items(id)   ON DELETE CASCADE,
    PRIMARY KEY (signal_id, item_id)
);

CREATE INDEX IF NOT EXISTS signal_items_item_id_idx ON signal_items (item_id);

-- Enforce the traceability rule rather than trusting every workflow to keep
-- it. The check is deferred to commit, so a signal and its links written in
-- one statement are fine; a signal written on its own is not.
CREATE OR REPLACE FUNCTION signal_must_have_items() RETURNS trigger AS $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM signal_items WHERE signal_id = NEW.id) THEN
        RAISE EXCEPTION 'signal % ("%") has no linked items', NEW.id, NEW.topic
            USING HINT = 'Write the signal and its signal_items rows in one '
                         'statement. There is a worked example in the comment '
                         'at the bottom of db/init/04-signals.sql.';
    END IF;
    RETURN NULL;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS signals_require_items ON signals;
CREATE CONSTRAINT TRIGGER signals_require_items
    AFTER INSERT ON signals
    DEFERRABLE INITIALLY DEFERRED
    FOR EACH ROW EXECUTE FUNCTION signal_must_have_items();

-- What the dashboard needs: a signal with its evidence attached.
CREATE OR REPLACE VIEW signal_evidence AS
SELECT s.id            AS signal_id,
       s.topic,
       s.kind,
       s.reason,
       s.score,
       s.period_start,
       s.period_end,
       s.detected_on,
       s.status,
       i.id            AS item_id,
       i.title,
       i.publisher,
       i.source_url,
       i.published_at
FROM signals s
JOIN signal_items si ON si.signal_id = s.id
JOIN items i         ON i.id = si.item_id
ORDER BY s.detected_on DESC, s.id, i.published_at DESC;

-- Writing a signal from n8n. One statement, so the deferred check passes and a
-- rerun on the same day updates instead of duplicating. Pass the article ids
-- as an array, for example '{12,48,91}'.
--
--   WITH s AS (
--       INSERT INTO signals (topic, kind, reason, period_start, period_end,
--                            score, workflow)
--       VALUES ($1, $2, $3, $4::date, $5::date, $6::numeric, $7)
--       ON CONFLICT (lower(topic), detected_on, kind) DO UPDATE
--          SET reason     = EXCLUDED.reason,
--              score      = EXCLUDED.score,
--              period_end = EXCLUDED.period_end,
--              updated_at = now()
--       RETURNING id
--   )
--   INSERT INTO signal_items (signal_id, item_id)
--   SELECT s.id, unnest($8::bigint[]) FROM s
--   ON CONFLICT DO NOTHING;
