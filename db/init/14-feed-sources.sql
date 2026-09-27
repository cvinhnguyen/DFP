-- Sources read from RSS feeds and from Crossref, next to the one crawled site.
-- Jira: DM42-29, DM42-36
--
-- The client's list has around 40 sites and journals. One crawler per site
-- would take weeks and break whenever a site changes its layout, so most are
-- read from the feed the publisher offers for exactly this:
--
--   rss       a site's RSS or Atom feed
--   crossref  a journal's new articles from api.crossref.org, where publishers
--             register title, link and usually the abstract
--   webpage   our own crawler, for sites without a feed
--
-- The client asked us to respect IPR and never break into anything. So a
-- journal is read from its feed or from Crossref and nothing else: we never
-- fetch the article, never go past a login, and a site that refuses automated
-- access (403) stays switched off. Only public news pages whose robots.txt
-- allows it are read in full, where fetch_full_text is true.
--
-- The client's actual list is not in this repository, which is public. It is
-- loaded separately from db/client/sources.sql, which git ignores.
--
-- Safe to run against an existing database as well as a fresh one:
--
--   docker compose exec -T postgres psql -U $POSTGRES_USER -d newsletter \
--     < db/init/14-feed-sources.sql

\connect newsletter

-- The address the client gave us, which is often not the one we read from.
ALTER TABLE sources ADD COLUMN IF NOT EXISTS homepage TEXT;

-- Who wrote it, printed with every summary. The feed does not always say.
ALTER TABLE sources ADD COLUMN IF NOT EXISTS publisher TEXT;

-- Read the article page itself, not only what the feed carries. Only for
-- public pages whose robots.txt allows it. Never for journals.
ALTER TABLE sources ADD COLUMN IF NOT EXISTS fetch_full_text BOOLEAN NOT NULL DEFAULT FALSE;

-- Why a source is switched off, or anything else worth knowing about it.
ALTER TABLE sources ADD COLUMN IF NOT EXISTS notes TEXT;
