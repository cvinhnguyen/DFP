-- Subject tags on every article, the topics the editors read by, and theses
-- from Theseus.
-- Jira: DM42-31, DM42-29
--
-- The client liked the topic tags on the summaries in sprint 1, so now every
-- article gets them. A tag is a term from YSO, the general Finnish ontology
-- the National Library of Finland keeps (https://finto.fi/yso). One subject
-- then has one name whichever source and language it came from: artificial
-- intelligence in an English thesis and tekoäly in a Finnish summary are the
-- same tag.
--
--   tags           every YSO term met so far, with its Finnish name
--   tag_labels     the words sources used for a term, so each is looked up once
--   item_subjects  the subject words a source sent with an article
--   item_tags      the tags on each article, and where each one came from
--   item_tagging   which summaries Finto AI has read
--   topics         what the editors read by: a name and a list of terms
--   learning_tags  the terms a thesis also needs before it joins a topic
--
-- The tagging workflow fills them (n8n/workflows/tagging.json): Finto AI
-- suggests terms for each Finnish summary, and the theses' own subject words
-- and the signal words are matched to YSO. Nothing in this file calls out.
--
-- Theses come from Theseus, the shared archive of the universities of applied
-- sciences: around 45 each weekday, most of them not about learning. So they
-- wait without an AI summary until an editor picks one (status on_request),
-- and one joins a topic only when it also has a learning tag. Measured on the
-- 300 newest: tags alone put 48 a week into the followed topics, mostly AI in
-- business and engineering, and the learning rule 13.
--
-- Safe to run against an existing database as well as a fresh one:
--
--   docker compose exec -T postgres psql -U $POSTGRES_USER -d newsletter \
--     < db/init/20-topics.sql

\connect newsletter

BEGIN;

-- ---------- tags ----------

CREATE TABLE IF NOT EXISTS tags (
    id         SERIAL PRIMARY KEY,
    -- The term's address in YSO, http://www.yso.fi/onto/yso/p2616. It stays
    -- the same whatever the term is called in any language.
    uri        TEXT NOT NULL UNIQUE,
    -- Its Finnish name in YSO, tekoäly.
    label      TEXT NOT NULL,
    -- Too general to tell the editors anything, such as kehittäminen or
    -- Suomi. Kept, so it is not looked up again, but never shown.
    hidden     BOOLEAN NOT NULL DEFAULT FALSE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS tags_label_idx ON tags (lower(label));

CREATE TABLE IF NOT EXISTS tag_labels (
    -- A subject word as a source wrote it, in lower case: educational technology.
    label      TEXT PRIMARY KEY,
    -- The YSO term it means, or NULL when YSO has none. A miss is kept as
    -- well, so the same word is not asked about every 15 minutes.
    tag_id     INTEGER REFERENCES tags(id) ON DELETE CASCADE,
    checked_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- The subject words a source gives an article, as it gave them, lower case.
-- Theseus sends the YSO terms the author chose, in the thesis's language.
CREATE TABLE IF NOT EXISTS item_subjects (
    item_id  BIGINT NOT NULL REFERENCES items(id) ON DELETE CASCADE,
    label    TEXT NOT NULL,
    position SMALLINT NOT NULL DEFAULT 0,      -- the source's order
    PRIMARY KEY (item_id, label)
);

CREATE INDEX IF NOT EXISTS item_subjects_label_idx ON item_subjects (label);

CREATE TABLE IF NOT EXISTS item_tags (
    item_id    BIGINT  NOT NULL REFERENCES items(id) ON DELETE CASCADE,
    tag_id     INTEGER NOT NULL REFERENCES tags(id)  ON DELETE CASCADE,
    -- source  the article's own subject words, matched to YSO
    -- finto   suggested by Finto AI from the Finnish summary
    -- signal  the word signal detection gave the article
    -- editor  added by hand
    origin     TEXT NOT NULL CHECK (origin IN ('source', 'finto', 'signal', 'editor')),
    score      NUMERIC(5, 4),                  -- Finto AI's confidence, 0 to 1
    position   SMALLINT,                       -- the source's order
    added_by   INTEGER REFERENCES users(id) ON DELETE SET NULL,
    -- An editor took the tag off. The row stays, so the next run of the
    -- tagging workflow does not put it back.
    removed_at TIMESTAMPTZ,
    removed_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    PRIMARY KEY (item_id, tag_id)
);

CREATE INDEX IF NOT EXISTS item_tags_tag_idx ON item_tags (tag_id) WHERE removed_at IS NULL;

-- One row per summary Finto AI has read, with or without a result, so each
-- is sent once. An error means the service answered with one; the next run
-- tries that summary again after an hour.
CREATE TABLE IF NOT EXISTS item_tagging (
    item_id    BIGINT PRIMARY KEY REFERENCES items(id) ON DELETE CASCADE,
    checked_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    suggested  INTEGER NOT NULL DEFAULT 0,     -- terms kept, above the cut-off
    error      TEXT
);

INSERT INTO app_settings (key, value, description) VALUES
    ('tagging_min_score', '0.1',
     'Finto AI''s suggestions scoring below this are not kept as tags. On the first 224 summaries, 0.1 gave 220 of them at least one tag, about four each; the four without were short event notices.')
ON CONFLICT (key) DO NOTHING;

-- ---------- topics ----------

CREATE TABLE IF NOT EXISTS topics (
    id         SERIAL PRIMARY KEY,
    name       TEXT NOT NULL UNIQUE,
    -- A followed topic brings its theses into the editors' Uudet list. News
    -- comes there whatever its topic, because our news sources are already
    -- about education. Shared: Kaisa and Niina make one newsletter together.
    followed   BOOLEAN NOT NULL DEFAULT FALSE,
    position   INTEGER NOT NULL DEFAULT 0,
    updated_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- The terms of a topic. An article is in the topic when it has any of them.
CREATE TABLE IF NOT EXISTS topic_tags (
    topic_id INTEGER NOT NULL REFERENCES topics(id) ON DELETE CASCADE,
    tag_id   INTEGER NOT NULL REFERENCES tags(id)   ON DELETE CASCADE,
    PRIMARY KEY (topic_id, tag_id)
);

CREATE INDEX IF NOT EXISTS topic_tags_tag_idx ON topic_tags (tag_id);

-- Archives such as Theseus cover every field of study. An item from a source
-- with learning_tag_required joins a topic only if it also has one of these.
-- In the week measured, 30 theses had the tag tekoäly. With this rule 3
-- stayed: AI skills in NGOs, AI for student course feedback, and AI in
-- nursing documentation.
CREATE TABLE IF NOT EXISTS learning_tags (
    tag_id INTEGER PRIMARY KEY REFERENCES tags(id) ON DELETE CASCADE
);

ALTER TABLE sources ADD COLUMN IF NOT EXISTS learning_tag_required BOOLEAN NOT NULL DEFAULT FALSE;

-- What a source knows about an article beyond the shared fields, as its
-- collector sent it. For Theseus: kind (thesis or publication), level,
-- programme, licence. Shown to the editors; no rule depends on it.
ALTER TABLE items ADD COLUMN IF NOT EXISTS details JSONB;

-- Which topics each article is in. The one place the rule is written: one of
-- the article's tags is a term of the topic, and an article from a source
-- with learning_tag_required also has a learning tag. A tag an editor took
-- off counts for nothing.
CREATE OR REPLACE VIEW item_topics AS
SELECT DISTINCT it.item_id, tt.topic_id
  FROM item_tags it
  JOIN topic_tags tt  ON tt.tag_id = it.tag_id
  JOIN items i        ON i.id = it.item_id
  LEFT JOIN sources s ON s.id = i.source_id
 WHERE it.removed_at IS NULL
   AND (NOT coalesce(s.learning_tag_required, FALSE)
        OR EXISTS (SELECT 1
                     FROM item_tags l
                     JOIN learning_tags lt ON lt.tag_id = l.tag_id
                    WHERE l.item_id = it.item_id
                      AND l.removed_at IS NULL));

-- ---------- the terms the topics start from ----------

-- Every address checked against Finto on 1 October 2026. Hidden ones are the
-- general terms Finto AI and the theses use most, which say nothing about a
-- topic: on the first summaries they were one tag in nine.
INSERT INTO tags (uri, label, hidden)
SELECT 'http://www.yso.fi/onto/yso/' || v.p, v.label, v.hidden
  FROM (VALUES
    ('p2616', 'tekoäly', FALSE), ('p40748', 'generatiivinen tekoäly', FALSE),
    ('p21846', 'koneoppiminen', FALSE), ('p40335', 'kielimallit', FALSE),
    ('p6621', 'verkko-opetus', FALSE), ('p13627', 'verkko-oppiminen', FALSE),
    ('p6622', 'verkkokurssit', FALSE), ('p542', 'etäopetus', FALSE),
    ('p4418', 'opetusteknologia', FALSE), ('p26951', 'oppimisalustat', FALSE),
    ('p28463', 'verkkoseminaarit', FALSE), ('p39598', 'digitaaliset taidot', FALSE),
    ('p6262', 'elinikäinen oppiminen', FALSE), ('p38391', 'osaamisen kehittäminen', FALSE),
    ('p296', 'henkilöstökoulutus', FALSE), ('p6266', 'täydennyskoulutus', FALSE),
    ('p13158', 'ammatillinen kehitys', FALSE), ('p300', 'aikuiskoulutus', FALSE),
    ('p8343', 'osaaminen', FALSE),
    ('p1117', 'opettajat', FALSE), ('p10746', 'opettajankoulutus', FALSE),
    ('p14593', 'erityisopettajat', FALSE), ('p28618', 'opetustyö', FALSE),
    ('p23846', 'pedagoginen johtaminen', FALSE), ('p6984', 'erityisopetus', FALSE),
    ('p249', 'koulutuspolitiikka', FALSE), ('p5140', 'opetussuunnitelmat', FALSE),
    ('p11215', 'koululaitos', FALSE),
    ('p1650', 'varhaiskasvatus', FALSE), ('p20272', 'esiopetus', FALSE),
    ('p19327', 'perusopetus', FALSE), ('p2518', 'peruskoulu', FALSE),
    ('p21828', 'alakoulu', FALSE), ('p21292', 'yläkoulu', FALSE), ('p7401', 'lukio', FALSE),
    ('p1947', 'hyvinvointi', FALSE), ('p1835', 'työhyvinvointi', FALSE),
    ('p17226', 'kuormitus', FALSE), ('p5164', 'osallisuus', FALSE),
    ('p15764', 'liikuntakasvatus', FALSE),
    ('p3636', 'tietosuoja', FALSE), ('p15126', 'henkilötiedot', FALSE),
    ('p40520', 'oppimisanalytiikka', FALSE),
    ('p2945', 'oppiminen', FALSE), ('p2630', 'opetus', FALSE), ('p84', 'koulutus', FALSE),
    ('p16486', 'opiskelijat', FALSE), ('p8131', 'oppilaat', FALSE),
    ('p1584', 'pedagogiikka', FALSE), ('p4835', 'oppimisympäristö', FALSE),
    ('p988', 'opetusmenetelmät', FALSE), ('p1028', 'oppilaitokset', FALSE),
    ('p386', 'koulut', FALSE), ('p9700', 'ammatillinen koulutus', FALSE),
    ('p1246', 'korkeakouluopetus', FALSE), ('p476', 'kasvatus', FALSE),
    ('p4230', 'kehittäminen', TRUE), ('p1380', 'opinnäytteet', TRUE),
    ('p3006', 'projektit', TRUE), ('p272', 'organisaatiot', TRUE),
    ('p3209', 'kokemukset', TRUE), ('p183', 'tutkimus', TRUE),
    ('p94426', 'Suomi', TRUE), ('p277', 'muutos', TRUE), ('p1810', 'työ', TRUE),
    ('p11327', 'hyödyntäminen', TRUE), ('p1736', 'käyttö', TRUE),
    ('p795', 'vaikutukset', TRUE), ('p1913', 'menetelmät', TRUE),
    ('p26023', 'toimijat', TRUE)
  ) AS v(p, label, hidden)
ON CONFLICT (uri) DO NOTHING;

-- Learning in the broad sense the association means it: teaching, studying,
-- schools, training at work.
INSERT INTO learning_tags (tag_id)
SELECT id FROM tags
 WHERE uri IN (SELECT 'http://www.yso.fi/onto/yso/' || p FROM unnest(ARRAY[
         'p2945', 'p2630', 'p84', 'p1117', 'p16486', 'p8131', 'p1584', 'p4835',
         'p6262', 'p296', 'p6266', 'p988', 'p1028', 'p386', 'p1650', 'p19327',
         'p7401', 'p20272', 'p9700', 'p1246', 'p6621', 'p13627', 'p542',
         'p4418', 'p476', 'p10746']) AS p)
ON CONFLICT DO NOTHING;

-- The starting topics, to be agreed with the client. Only topics made by
-- this file get their terms here, so running it again never puts back a
-- term an editor removed.
WITH made AS (
    INSERT INTO topics (name, followed, position) VALUES
        ('Tekoäly', TRUE, 1),
        ('Digipedagogiikka ja verkko-opetus', TRUE, 2),
        ('Osaaminen ja jatkuva oppiminen', TRUE, 3),
        ('Opettajat ja opetustyö', TRUE, 4),
        ('Koulutuspolitiikka', TRUE, 5),
        ('Varhaiskasvatus ja koulut', FALSE, 6),
        ('Hyvinvointi ja jaksaminen', FALSE, 7),
        ('Tietosuoja ja oppimisanalytiikka', FALSE, 8)
    ON CONFLICT (name) DO NOTHING
    RETURNING id, name
)
INSERT INTO topic_tags (topic_id, tag_id)
SELECT m.id, g.id
  FROM made m
  JOIN (VALUES
    ('Tekoäly', 'p2616'), ('Tekoäly', 'p40748'), ('Tekoäly', 'p21846'), ('Tekoäly', 'p40335'),
    ('Digipedagogiikka ja verkko-opetus', 'p6621'), ('Digipedagogiikka ja verkko-opetus', 'p13627'),
    ('Digipedagogiikka ja verkko-opetus', 'p6622'), ('Digipedagogiikka ja verkko-opetus', 'p542'),
    ('Digipedagogiikka ja verkko-opetus', 'p4418'), ('Digipedagogiikka ja verkko-opetus', 'p26951'),
    ('Digipedagogiikka ja verkko-opetus', 'p28463'), ('Digipedagogiikka ja verkko-opetus', 'p39598'),
    ('Osaaminen ja jatkuva oppiminen', 'p6262'), ('Osaaminen ja jatkuva oppiminen', 'p38391'),
    ('Osaaminen ja jatkuva oppiminen', 'p296'), ('Osaaminen ja jatkuva oppiminen', 'p6266'),
    ('Osaaminen ja jatkuva oppiminen', 'p13158'), ('Osaaminen ja jatkuva oppiminen', 'p300'),
    ('Osaaminen ja jatkuva oppiminen', 'p8343'),
    ('Opettajat ja opetustyö', 'p1117'), ('Opettajat ja opetustyö', 'p10746'),
    ('Opettajat ja opetustyö', 'p14593'), ('Opettajat ja opetustyö', 'p28618'),
    ('Opettajat ja opetustyö', 'p23846'), ('Opettajat ja opetustyö', 'p6984'),
    ('Koulutuspolitiikka', 'p249'), ('Koulutuspolitiikka', 'p5140'), ('Koulutuspolitiikka', 'p11215'),
    ('Varhaiskasvatus ja koulut', 'p1650'), ('Varhaiskasvatus ja koulut', 'p20272'),
    ('Varhaiskasvatus ja koulut', 'p19327'), ('Varhaiskasvatus ja koulut', 'p2518'),
    ('Varhaiskasvatus ja koulut', 'p21828'), ('Varhaiskasvatus ja koulut', 'p21292'),
    ('Varhaiskasvatus ja koulut', 'p7401'),
    ('Hyvinvointi ja jaksaminen', 'p1947'), ('Hyvinvointi ja jaksaminen', 'p1835'),
    ('Hyvinvointi ja jaksaminen', 'p17226'), ('Hyvinvointi ja jaksaminen', 'p5164'),
    ('Hyvinvointi ja jaksaminen', 'p15764'),
    ('Tietosuoja ja oppimisanalytiikka', 'p3636'), ('Tietosuoja ja oppimisanalytiikka', 'p15126'),
    ('Tietosuoja ja oppimisanalytiikka', 'p40520')
  ) AS v(topic, p) ON v.topic = m.name
  JOIN tags g ON g.uri = 'http://www.yso.fi/onto/yso/' || v.p
ON CONFLICT DO NOTHING;

-- ---------- theses wait for an editor ----------

-- on_request: nothing from the source goes to the AI by itself. An item is
-- summarised when an editor picks it for a newsletter or asks for it, which
-- request_summary() below allows. Theseus is set this way: around 45 theses a
-- day would cost a summary each, and an editor reads the author's abstract
-- anyway before deciding.
--
-- These items get their own status, on_request, rather than filtered_out.
-- They are not the filter's doing, so they stay out of the skipped list and
-- out of what the filter reports it saved.
CREATE OR REPLACE FUNCTION run_filter() RETURNS filter_runs
LANGUAGE plpgsql AS $$
DECLARE
    max_age   int    := (SELECT value::int FROM app_settings WHERE key = 'filter_max_age_days');
    min_chars int    := (SELECT value::int FROM app_settings WHERE key = 'filter_min_text_chars');
    keywords  text[] := (SELECT array_agg(lower(btrim(k)))
                           FROM app_settings,
                                unnest(string_to_array(value, ',')) AS k
                          WHERE key = 'filter_keywords' AND btrim(k) <> '');
    -- Tokens per character of text, and tokens per answer, from summaries we
    -- have already paid for. The fallbacks are what we measured on the
    -- client's 20 articles in sprint 1.
    per_char  numeric := coalesce(
                  (SELECT sum(u.tokens_in)::numeric
                          / nullif(sum(length(i.title) + length(i.raw_text)), 0)
                     FROM llm_usage u JOIN items i ON i.id = u.item_id
                    WHERE u.workflow IN ('summarise', 'telegram_capture')
                      AND NOT u.cached AND u.tokens_in > 0),
                  0.44);
    per_reply numeric := coalesce(
                  (SELECT avg(tokens_out) FROM llm_usage
                    WHERE workflow IN ('summarise', 'telegram_capture')
                      AND NOT cached AND tokens_out > 0),
                  114);
    result    filter_runs;
BEGIN
    -- Items from on_request sources wait for an editor, see above. Not
    -- checked, not counted.
    UPDATE items i
       SET status = 'on_request', status_reason = NULL
      FROM sources s
     WHERE s.id = i.source_id
       AND i.status = 'new'
       AND s.filter_mode = 'on_request';

    WITH decided AS (
        SELECT i.id,
               i.title,
               i.raw_text,
               CASE
                 WHEN i.duplicate_of IS NOT NULL
                   THEN 'same story as item ' || i.duplicate_of
                 WHEN length(coalesce(i.raw_text, '')) < min_chars
                   THEN 'too little text to summarise'
                 WHEN coalesce(i.published_at, i.fetched_at) < now() - make_interval(days => max_age)
                   THEN 'older than ' || max_age || ' days'
                 WHEN coalesce(s.filter_mode, 'keywords') = 'keywords'
                  AND NOT EXISTS (
                        SELECT 1 FROM unnest(keywords) AS k
                         WHERE position(k IN lower(concat_ws(' ', i.title, i.excerpt, i.raw_text))) > 0)
                   THEN 'no keyword match'
               END AS reason
          FROM items i
          LEFT JOIN sources s ON s.id = i.source_id
         WHERE i.status = 'new'
           FOR UPDATE OF i SKIP LOCKED
    ),
    marked AS (
        UPDATE items i
           SET status        = CASE WHEN d.reason IS NULL THEN 'queued' ELSE 'filtered_out' END,
               status_reason = d.reason
          FROM decided d
         WHERE i.id = d.id
        RETURNING i.id
    ),
    -- a reason like "same story as item 25" counts under one heading
    reasons AS (
        SELECT regexp_replace(reason, ' [0-9]+$', '') AS reason, count(*) AS n
          FROM decided WHERE reason IS NOT NULL GROUP BY 1
    )
    INSERT INTO filter_runs (checked, queued, skipped, skipped_by_reason,
                             est_tokens_in, est_tokens_out)
    SELECT count(*),
           count(*) FILTER (WHERE reason IS NULL),
           count(*) FILTER (WHERE reason IS NOT NULL),
           coalesce((SELECT jsonb_object_agg(reason, n) FROM reasons), '{}'::jsonb),
           coalesce(round(sum(per_char * (length(title) + length(coalesce(raw_text, ''))))
                          FILTER (WHERE reason IS NOT NULL)), 0),
           round(per_reply * count(*) FILTER (WHERE reason IS NOT NULL))
      FROM decided
    RETURNING * INTO result;

    RETURN result;
END $$;

-- An editor's request sends an on_request item to the AI as well as a
-- skipped or failed one.
CREATE OR REPLACE FUNCTION request_summary(p_item_id bigint) RETURNS boolean
LANGUAGE sql AS $$
    WITH changed AS (
        UPDATE items
           SET status = 'queued', status_reason = 'requested by an editor'
         WHERE id = p_item_id
           AND status IN ('filtered_out', 'summary_failed', 'on_request')
        RETURNING id
    )
    SELECT count(*) > 0 FROM changed;
$$;

-- ---------- Theseus ----------

-- Read through Theseus's DSpace API, newest arrivals first: the publication
-- date of a thesis is only its year, so the day it arrived in Theseus is the
-- date that sorts. The archive is public and the API is meant for this; we
-- read the description and the abstract, never the thesis file.
--
-- The client's source list (db/client/) had Theseus as a switched-off RSS
-- feed. That row becomes this one, so it keeps its id.
UPDATE sources
   SET name                  = 'Theseus, AMK theses',
       url                   = 'https://www.theseus.fi/server/api/discover/search/objects?query=*&sort=dc.date.accessioned,DESC&size=100&dsoType=ITEM',
       type                  = 'dspace',
       homepage              = 'https://www.theseus.fi/',
       publisher             = NULL,
       language              = 'fi',
       active                = TRUE,
       filter_mode           = 'on_request',
       fetch_full_text       = FALSE,
       learning_tag_required = TRUE,
       notes                 = 'Every new thesis and publication, read through the DSpace API. Theses wait for an editor before any AI summary, and join a topic only with a learning tag. See db/init/20-topics.sql.'
 WHERE url LIKE 'https://www.theseus.fi/%'
   AND type <> 'dspace'
   AND NOT EXISTS (SELECT 1 FROM sources
                    WHERE url = 'https://www.theseus.fi/server/api/discover/search/objects?query=*&sort=dc.date.accessioned,DESC&size=100&dsoType=ITEM');

INSERT INTO sources (name, url, type, homepage, language, active, filter_mode,
                     fetch_full_text, learning_tag_required, check_frequency_minutes, notes)
VALUES ('Theseus, AMK theses',
        'https://www.theseus.fi/server/api/discover/search/objects?query=*&sort=dc.date.accessioned,DESC&size=100&dsoType=ITEM',
        'dspace', 'https://www.theseus.fi/', 'fi', TRUE, 'on_request', FALSE, TRUE, 1440,
        'Every new thesis and publication, read through the DSpace API. Theses wait for an editor before any AI summary, and join a topic only with a learning tag. See db/init/20-topics.sql.')
ON CONFLICT (url) DO UPDATE
   SET type                  = EXCLUDED.type,
       filter_mode           = EXCLUDED.filter_mode,
       learning_tag_required = EXCLUDED.learning_tag_required;

COMMIT;

-- Examples:
--
-- The tags on an article, newest article first:
--
--   SELECT i.id, i.title, g.label, it.origin, it.score
--     FROM items i
--     JOIN item_tags it ON it.item_id = i.id AND it.removed_at IS NULL
--     JOIN tags g       ON g.id = it.tag_id AND NOT g.hidden
--    ORDER BY i.id DESC, it.origin, it.score DESC NULLS LAST
--    LIMIT 50;
--
-- How many articles each topic has had this month:
--
--   SELECT t.name, count(*)
--     FROM item_topics x
--     JOIN topics t ON t.id = x.topic_id
--     JOIN items i  ON i.id = x.item_id
--    WHERE i.created_at > now() - interval '30 days'
--    GROUP BY t.name ORDER BY 2 DESC;
