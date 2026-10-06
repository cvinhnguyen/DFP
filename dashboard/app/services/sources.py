"""The sources on Asetukset → Lähteet: how each is doing, adding one from
its address, changing or switching one off, deleting one added by mistake,
checking one now, and the sites worth adding.
Jira: DM42-29, DM42-36, DM42-47

How a source is doing (health):

  off       switched off
  unread    switched on, but nothing reads it: a site that would need a
            reader of its own (only the association's site has a crawler)
  checking  being checked now
  failed    its last check ended in an error
  waiting   not checked yet
  quiet     no new article for 60 days, or none at all two weeks after its
            first check
  ok        the rest

The Drive folder and the Telegram bot have schedules of their own and are
always ok here; Asetukset → Google Drive and the bot say more.

A source is never deleted once it has brought an article: switching it off
keeps every article and where it came from (07-sources.sql says why). One
added by mistake, with nothing from it yet, can be deleted.

The suggested sites are worked out from the archive of past newsletters
(26-archive.sql) and the member organisations (29-members.sql): the sites
linked to at least twice, and the members' own, that no source reads. The
dashboard looks at each for a feed in the background, at most every two
weeks, and the page hears the results as they come (live.js).
"""

import threading
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime, timedelta, timezone

from ..database import UniqueViolation
from ..queries import settings
from ..queries import sources as queries
from . import collection, feeds, suggest, watch

QUIET_DAYS = 60
QUIET_AFTER_DAYS = 14
# Read by the collection schedule (n8n/workflows/collection-schedule.json):
# the association's own site is the only webpage it has a reader for.
OWN_SITE = "https://eoppimiskeskus.fi/"
SCHEDULED = ("rss", "crossref", "dspace", "watch")

# Sites that are somewhere to put things rather than a source of news:
# video, forms, social media, link shorteners, meeting and sign-up tools.
PLATFORMS = ("youtube.com", "youtu.be", "vimeo.com", "webropol.com", "link.webropol.com", "docs.google.com",
             "drive.google.com", "forms.gle", "forms.office.com", "bit.ly", "linkedin.com", "facebook.com",
             "instagram.com", "x.com", "twitter.com", "zoom.us", "teams.microsoft.com", "eventbrite.com",
             "eventbrite.fi", "lyyti.fi", "lyyti.in", "campaign-archive.com", "mailchi.mp", "list-manage.com",
             "howspace.com", "tiktok.com", "spotify.com", "apple.com")
LOOK_AGAIN = timedelta(days=14)
LOOK_AT_MOST = 40


class NotFound(Exception):
    pass


class Problem(Exception):
    """Says why, as a code the pages translate and a message in English."""

    def __init__(self, code, message, status=409, **params):
        super().__init__(message)
        self.code = code
        self.status = status
        self.params = params


# ---------- how a source is doing ----------

def scheduled(row):
    return row["type"] in SCHEDULED or (row["type"] == "webpage" and row["url"].startswith(OWN_SITE))


def health(row, now=None):
    now = now or datetime.now(timezone.utc)
    if not row["active"]:
        return "off"
    if row["type"] in ("drive", "manual"):
        return "ok"
    if not scheduled(row):
        return "unread"
    if row["running"]:
        return "checking"
    if row["last_error"]:
        return "failed"
    if row["last_run_at"] is None:
        return "waiting"
    if row["last_item_at"] is None:
        started = row["first_run"] or row["created_at"]
        return "quiet" if now - started >= timedelta(days=QUIET_AFTER_DAYS) else "ok"
    return "quiet" if now - row["last_item_at"] >= timedelta(days=QUIET_DAYS) else "ok"


def weekly(weeks):
    """{weeks ago: count} as twelve counts, the oldest week first."""
    weeks = weeks or {}
    return [int(weeks.get(str(ago), 0)) for ago in range(11, -1, -1)]


def _can(row):
    special = row["type"] in ("drive", "manual")
    return {
        "check": row["active"] and scheduled(row),
        "switch": not special,
        "edit_address": row["type"] in ("rss", "crossref", "watch", "webpage") and not row["url"].startswith(OWN_SITE),
        "filter": row["type"] not in ("dspace", "drive", "manual"),
        "section": row["type"] != "manual",
        "delete": row["total"] == 0 and not special,
    }


def _shaped(row, now=None):
    return {**row, "weeks": weekly(row["weeks"]), "health": health(row, now), "can": _can(row)}


def listing():
    times = settings.get("collection_times", "off")
    return {"sources": [_shaped(r) for r in queries.listing()], "collection_times": times,
            "next_check_at": collection.next_check(times, datetime.now(collection.HELSINKI))}


def detail(source_id):
    row = queries.one(source_id)
    if not row:
        raise NotFound()
    site = feeds.host_of(row["homepage"] or row["url"])
    others = [s for s in queries.on_site(site) if s["id"] != source_id] if site else []
    return {**_shaped(row), "runs": queries.runs(source_id), "latest": queries.latest_items(source_id),
            "on_site": others}


# ---------- adding ----------

def _starting_section(host):
    """The section a new source's articles start in: a member's site in
    Jäsenkuulumisia, Learning Factory's own in its section, else none."""
    if any(feeds.same_site(host, site) for site in suggest.LEARNING_FACTORY):
        return "training"
    if any(feeds.same_site(host, site) for site in suggest.member_hosts()):
        return "member_news"
    return None


def lookup(address):
    """What is at an address, with what the form to add it starts from."""
    try:
        found = feeds.discover(address)
    except feeds.FetchProblem as e:
        raise Problem(f"source_{e.code}", str(e), 422)
    if found["kind"] not in ("feed", "journal", "page"):
        return found
    host = feeds.host_of(found.get("homepage") or found["url"])
    same = queries.same_address(found["url"])
    per_month = found.get("per_month")
    return {
        **found,
        "existing": same,
        "on_site": [s for s in queries.on_site(host) if not same or s["id"] != same["id"]] if host else [],
        "section": _starting_section(host) if found["kind"] != "journal" else None,
        # A source that publishes a few a month comes in whole; a busier one
        # by the keywords, as new sources do (11-filter.sql).
        "filter_mode": "always" if per_month is not None and per_month <= 12 else "keywords",
        "picture_rights": "none" if found["kind"] == "journal" else "check",
    }


def _checked_address(url):
    try:
        feeds.check_address(url)
    except feeds.FetchProblem as e:
        raise Problem(f"source_{e.code}", str(e), 422)


def create(body, user_id):
    _checked_address(body.url)
    if queries.same_address(body.url):
        raise Problem("source_exists", "A source is already read from this address.")
    full_text = body.fetch_full_text and body.type != "crossref"
    baseline = None
    if body.type == "watch" and not body.import_existing:
        # Only what comes after this is new: the page's links now are
        # remembered and become no articles.
        try:
            page = feeds.fetch(body.url)
        except feeds.FetchProblem as e:
            raise Problem(f"source_{e.code}", str(e), 422)
        baseline = watch.extract_links(page.text, page.url)
    fields = {
        "name": body.name.strip(), "url": body.url.strip(), "type": body.type,
        "homepage": (body.homepage or "").strip() or None, "language": body.language,
        "publisher": (body.publisher or "").strip() or None, "filter_mode": body.filter_mode,
        "fetch_full_text": full_text, "picture_rights": body.picture_rights, "section": body.section,
    }
    try:
        source_id = queries.create(fields, user_id)
    except UniqueViolation:
        raise Problem("source_exists", "A source is already read from this address.")
    if baseline:
        watch.remember(source_id, baseline)
    return detail(source_id)


# ---------- changing ----------

def update(source_id, changes, user_id):
    row = queries.one(source_id)
    if not row:
        raise NotFound()
    can = _can(row)
    if "active" in changes and not can["switch"]:
        raise Problem("source_special", "This one is switched on and off where it is set up.")
    if "filter_mode" in changes and not can["filter"]:
        raise Problem("source_special", "What comes in from this one is set where it is set up.")
    if "url" in changes:
        if not can["edit_address"] or not changes.get("type"):
            raise Problem("source_special", "This one's address cannot be changed here.")
        _checked_address(changes["url"])
        same = queries.same_address(changes["url"])
        if same and same["id"] != source_id:
            raise Problem("source_exists", "A source is already read from this address.")
        if changes["type"] == "crossref":
            changes["fetch_full_text"] = False
        if changes["type"] == "watch":
            try:
                page = feeds.fetch(changes["url"])
            except feeds.FetchProblem as e:
                raise Problem(f"source_{e.code}", str(e), 422)
            watch.remember(source_id, watch.extract_links(page.text, page.url))
    elif "type" in changes:
        changes.pop("type")
    for key in ("name", "publisher", "notes", "homepage"):
        if key in changes and isinstance(changes[key], str):
            changes[key] = changes[key].strip() or None
    if changes.get("name") is None:
        changes.pop("name", None)
    try:
        queries.update(source_id, changes, user_id)
    except UniqueViolation:
        raise Problem("source_exists", "A source is already read from this address.")
    return detail(source_id)


def remove(source_id):
    row = queries.one(source_id)
    if not row:
        raise NotFound()
    if not _can(row)["delete"] or not queries.remove(source_id):
        raise Problem("source_has_articles", "A source that has brought articles is switched off, not deleted, "
                      "so its articles keep where they came from.", n=row["total"])


def check(source_id):
    row = queries.one(source_id)
    if not row:
        raise NotFound()
    if not _can(row)["check"]:
        raise Problem("source_not_checked", "Only a source that is switched on and read by the schedule can be checked.")
    collection.start_check(source_id)


def watch_run(source_id):
    """One check of a watched page, for n8n's collection schedule."""
    row = queries.one(source_id)
    if not row or row["type"] != "watch":
        raise NotFound()
    return watch.run(row)


# ---------- the sites worth adding ----------

_looking = threading.Lock()


def _platform(host):
    return any(feeds.same_site(host, p) for p in PLATFORMS)


def suggestions(start_looking=True):
    rows = [r for r in queries.suggestions() if not _platform(r["host"])]
    stale = [r for r in rows if not r["dismissed_at"]
             and (r["checked_at"] is None or datetime.now(timezone.utc) - r["checked_at"] > LOOK_AGAIN)]
    if start_looking and stale and not _looking.locked():
        threading.Thread(target=_look_at, args=(stale[:LOOK_AT_MOST],), daemon=True).start()
    return {"looking": _looking.locked() or bool(start_looking and stale),
            "suggestions": [{**r, "dismissed": r["dismissed_at"] is not None} for r in rows]}


def look_again():
    """Every suggested site looked at again now, in the background."""
    rows = [r for r in queries.suggestions() if not _platform(r["host"]) and not r["dismissed_at"]]
    if rows and not _looking.locked():
        threading.Thread(target=_look_at, args=(rows[:LOOK_AT_MOST],), daemon=True).start()
    return suggestions(start_looking=False) | {"looking": bool(rows)}


def _look_at(rows):
    if not _looking.acquire(blocking=False):
        return
    try:
        with ThreadPoolExecutor(max_workers=4) as pool:
            list(pool.map(_look, rows))
    finally:
        _looking.release()


def _look(row):
    address = row["website"] or f"https://{row['host']}/"
    try:
        found = feeds.discover(address)
    except feeds.FetchProblem as e:
        found = {"kind": "blocked" if e.code == "refused" else "failed"}
    except Exception:  # one site's oddity never stops the others
        found = {"kind": "failed"}
    kind = found["kind"]
    result = {"feed": "feed", "journal": "feed", "page": "page"}.get(kind, kind if kind in ("none", "blocked") else "failed")
    queries.suggestion_found(row["host"], {
        "result": result,
        "feed_url": found.get("url") if result in ("feed", "page") else None,
        "feed_title": found.get("name") if result in ("feed", "page") else None,
        "feed_items": (len(found.get("items") or []) if result == "feed" else found.get("links")),
        "per_month": found.get("per_month"),
    })


def dismiss(host, user_id, dismissed=True):
    queries.suggestion_dismissed(host, user_id, dismissed)
