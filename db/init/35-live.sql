-- Live pages: the database says what changed, the moment it changes, so an
-- open page can show it without a reload.
-- Jira: DM42-80
--
-- Most changes do not come from the page looking at them: n8n stores new
-- articles, their summaries, tags and pictures; another editor picks an
-- article or saves the newsletter; the Drive guard reads the folder. Each of
-- these is a statement on one of the tables below, and each such statement
-- sends one short notice on the channel dfp_live:
--
--   {"k": "items", "ids": [6073, 6074]}
--
-- k is what changed: items (an article, its summary, tags, topics, picture
-- or Drive save), picks (the editors' decisions), issues, comments,
-- signals, topics, images (Kuvapankki), drive (the Drive folder and its
-- settings). ids are the articles, newsletters or comments' newsletters it
-- was, or null when there were more than 100 or the kind has none.
--
-- Only that travels: never a title, a text or a name. The dashboard listens
-- (services/live.py) and passes the notice to the open pages, which ask the
-- API again for what they show, under the same login rules as always.
--
-- The functions name their own search path, so a notice is sent the same
-- way however the change was made, a backup being restored included (a
-- restore runs with an empty one).
--
-- One notice per statement, not per row, so n8n storing 40 articles at
-- once is one notice. An article's own row tells only of changes a page
-- shows: its status, title, section, picture and the like, not the time a
-- source last sent it again.
--
-- Safe to run against an existing database as well as a fresh one:
--
--   docker compose exec -T postgres psql -U $POSTGRES_USER -d newsletter \
--     < db/init/35-live.sql

\connect newsletter

BEGIN;

CREATE OR REPLACE FUNCTION live_send(kind text, ids bigint[]) RETURNS void
LANGUAGE sql SET search_path = pg_catalog, public AS $$
    SELECT pg_notify('dfp_live', json_build_object(
        'k', kind,
        'ids', CASE WHEN cardinality(ids) BETWEEN 1 AND 100 THEN ids END)::text)
$$;

-- For a statement that changed rows: the kind given to the trigger, and the
-- distinct values of the column it names (an article's or a newsletter's
-- id), or no ids when it names none.
CREATE OR REPLACE FUNCTION live_changed() RETURNS trigger
LANGUAGE plpgsql SET search_path = pg_catalog, public AS $$
DECLARE
    kind     text := TG_ARGV[0];
    col      text := nullif(TG_ARGV[1], '');
    changed  text := CASE TG_OP WHEN 'DELETE' THEN 'old_rows' ELSE 'new_rows' END;
    ids      bigint[];
    any_rows boolean;
BEGIN
    IF col IS NULL THEN
        EXECUTE format('SELECT EXISTS (SELECT 1 FROM %I)', changed) INTO any_rows;
        IF any_rows THEN
            PERFORM live_send(kind, NULL);
        END IF;
    ELSE
        EXECUTE format('SELECT array_agg(DISTINCT %I) FROM %I WHERE %I IS NOT NULL', col, changed, col) INTO ids;
        IF ids IS NOT NULL THEN
            PERFORM live_send(kind, ids);
        END IF;
    END IF;
    RETURN NULL;
END $$;

-- An article's row changes for many reasons no page shows, above all the
-- ingest API noting that a source sent the article again. Only these count.
CREATE OR REPLACE FUNCTION live_items_updated() RETURNS trigger
LANGUAGE plpgsql SET search_path = pg_catalog, public AS $$
DECLARE
    ids bigint[];
BEGIN
    SELECT array_agg(n.id) INTO ids
      FROM new_rows n
      JOIN old_rows o ON o.id = n.id
     WHERE (n.status, n.status_reason, n.title, n.section, n.duplicate_of, n.picture_status,
            n.withdrawn_at, n.text_removed_at)
           IS DISTINCT FROM
           (o.status, o.status_reason, o.title, o.section, o.duplicate_of, o.picture_status,
            o.withdrawn_at, o.text_removed_at);
    IF ids IS NOT NULL THEN
        PERFORM live_send('items', ids);
    END IF;
    RETURN NULL;
END $$;

-- Of the settings, only the Drive folder's show on a page that stays open.
CREATE OR REPLACE FUNCTION live_settings() RETURNS trigger
LANGUAGE plpgsql SET search_path = pg_catalog, public AS $$
BEGIN
    IF EXISTS (SELECT 1 FROM new_rows WHERE key LIKE 'drive\_%') THEN
        PERFORM live_send('drive', NULL);
    END IF;
    RETURN NULL;
END $$;

-- The triggers: for each table, what kind of change it is and which column
-- holds the ids. A table can send two kinds: a picture of an article is the
-- article's, and every picture is Kuvapankki's.
DO $$
DECLARE
    t  record;
    op record;
    name text;
BEGIN
    FOR t IN SELECT * FROM (VALUES
        ('items',          'items',    'id'),
        ('summaries',      'items',    'item_id'),
        ('item_tags',      'items',    'item_id'),
        ('images',         'items',    'item_id'),
        ('drive_saves',    'items',    'item_id'),
        ('drive_changes',  'items',    'item_id'),
        ('item_picks',     'picks',    'item_id'),
        ('issues',         'issues',   'id'),
        ('issue_comments', 'comments', 'issue_id'),
        ('signals',        'signals',  ''),
        ('topics',         'topics',   ''),
        ('topic_tags',     'topics',   ''),
        ('images',         'images',   ''),
        ('drive_files',    'drive',    ''),
        ('drive_log',      'drive',    '')
    ) AS v(tbl, kind, col)
    LOOP
        FOR op IN SELECT * FROM (VALUES
            ('ins', 'INSERT', 'NEW TABLE AS new_rows'),
            ('upd', 'UPDATE', 'NEW TABLE AS new_rows'),
            ('del', 'DELETE', 'OLD TABLE AS old_rows')
        ) AS w(short, event, referencing)
        LOOP
            name := format('%s_live_%s_%s', t.tbl, t.kind, op.short);
            EXECUTE format('DROP TRIGGER IF EXISTS %I ON %I', name, t.tbl);
            -- An article's own updates go through live_items_updated below.
            CONTINUE WHEN t.tbl = 'items' AND op.event = 'UPDATE';
            EXECUTE format('CREATE TRIGGER %I AFTER %s ON %I REFERENCING %s FOR EACH STATEMENT '
                           'EXECUTE FUNCTION live_changed(%L, %L)',
                           name, op.event, t.tbl, op.referencing, t.kind, t.col);
        END LOOP;
    END LOOP;
END $$;

DROP TRIGGER IF EXISTS items_live_items_upd ON items;
CREATE TRIGGER items_live_items_upd
    AFTER UPDATE ON items
    REFERENCING OLD TABLE AS old_rows NEW TABLE AS new_rows
    FOR EACH STATEMENT EXECUTE FUNCTION live_items_updated();

DROP TRIGGER IF EXISTS app_settings_live_ins ON app_settings;
CREATE TRIGGER app_settings_live_ins
    AFTER INSERT ON app_settings REFERENCING NEW TABLE AS new_rows
    FOR EACH STATEMENT EXECUTE FUNCTION live_settings();
DROP TRIGGER IF EXISTS app_settings_live_upd ON app_settings;
CREATE TRIGGER app_settings_live_upd
    AFTER UPDATE ON app_settings REFERENCING NEW TABLE AS new_rows
    FOR EACH STATEMENT EXECUTE FUNCTION live_settings();

COMMIT;
