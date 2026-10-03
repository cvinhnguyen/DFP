"""The association's past newsletters, read from their public archive in
Mailchimp and kept as reference data (db/init/26-archive.sql): what the
editors chose by hand, to check against what the system finds.
Jira: DM42-47

The archive's home page lists every newsletter sent, newest first, as
"25/09/2026 - <a href=...>Subject</a>". Each newsletter page is the email
itself, behind Mailchimp's bar of sharing and translating links. A block in
it has a heading and links under it; each link is an entry, with that
heading. What every newsletter has, rather than chose, is left out.
"""

import re
import time
import urllib.error
import urllib.request
from datetime import date, datetime, timezone
from html.parser import HTMLParser

from ..queries import archive as queries
from ..queries import settings

HEADERS = {"User-Agent": "DFP newsletter bot (HAMK student project)"}

# Mailchimp's own links, sharing and translating, the association's social
# media and its membership page, which end every newsletter. A video on
# YouTube is content and stays.
BOILERPLATE = re.compile(
    r"campaign-archive\.com|list-manage\.com|mailchi\.mp|eepurl\.com|mailchimp\.com|translate\.google"
    r"|twitter\.com|//x\.com|facebook\.com|instagram\.com|linkedin\.com|youtube\.com/channel"
    r"|eoppimiskeskus\.fi/jasenyys", re.I)
# A site's front page, as the logo and the footer link to.
FRONT_PAGE = re.compile(r"^https?://[^/?#]+/?$", re.I)
LISTED = re.compile(r'<li class="campaign">\s*(\d{2})/(\d{2})/(\d{4})\s*-\s*<a [^>]*href="([^"]+)"[^>]*>(.*?)</a>', re.S)


class _Links(HTMLParser):
    """Every heading and every link, in order."""

    def __init__(self):
        super().__init__(convert_charrefs=True)
        self.found = []        # ("heading", text) or ("link", href, text)
        self.title = ""
        self._open = None      # the heading, link or title being read
        self._text = []

    def handle_starttag(self, tag, attrs):
        if tag in ("h1", "h2", "h3", "h4", "a", "title"):
            self._open = (tag, dict(attrs).get("href", ""))
            self._text = []

    def handle_endtag(self, tag):
        if not self._open or self._open[0] != tag:
            return
        text = " ".join("".join(self._text).split())
        if tag == "title":
            self.title = text
        elif tag == "a":
            self.found.append(("link", self._open[1], text))
        elif text:
            self.found.append(("heading", text))
        self._open = None

    def handle_data(self, data):
        if self._open:
            self._text.append(data)


def entries(html):
    """The subject, and the links the newsletter chose, each with the heading
    it stood under: [{heading, link_text, url}]."""
    page = _Links()
    page.feed(html)
    found = page.found
    # The email starts after Mailchimp's "view in your browser" link.
    starts = next((i for i, f in enumerate(found)
                   if f[0] == "link" and f[1].startswith("https://mailchi.mp/")), -1)
    heading, out, by_url = None, [], {}
    for f in found[starts + 1:]:
        if f[0] == "heading":
            heading = f[1]
            continue
        url, text = f[1].strip(), f[2]
        if not url.lower().startswith(("http://", "https://")) or BOILERPLATE.search(url):
            continue
        # A front page without words is a logo; with words it is a real link,
        # such as an event's own site.
        if FRONT_PAGE.match(url) and not text:
            continue
        entry = by_url.get(url)
        if entry is None:
            by_url[url] = {"heading": heading, "link_text": text or None, "url": url}
            out.append(by_url[url])
        elif not entry["link_text"] and text:
            # A picture often links above its heading; the words below it
            # say which block it belongs to.
            entry.update(heading=heading, link_text=text)
    return page.title, out


def listed(home_html):
    """The newsletters the archive's home page lists: [(sent_on, url, subject)]."""
    out = []
    for day, month, year, url, subject in LISTED.findall(home_html):
        out.append((date(int(year), int(month), int(day)), url.replace("&amp;", "&"),
                    " ".join(re.sub(r"<[^>]+>", " ", subject).split())))
    return out


def _fetch(url):
    with urllib.request.urlopen(urllib.request.Request(url, headers=HEADERS), timeout=20) as response:
        return response.read().decode("utf-8", errors="replace")


def import_archive(url, report=print):
    """Imports every newsletter on an archive's home page, or the one
    newsletter a link points at. A newsletter imported before is replaced.
    One page a second, to be polite."""
    if "/home/" in url:
        newsletters = listed(_fetch(url))
        report(f"The archive lists {len(newsletters)} newsletters.")
    else:
        newsletters = [(None, url, None)]
    _bring_in(newsletters, report)
    return len(newsletters)


def _bring_in(newsletters, report=lambda line: None):
    for n, (sent_on, link, subject) in enumerate(newsletters):
        if n:
            time.sleep(1)
        title, found = entries(_fetch(link))
        queries.save_issue(link, subject or title or link, sent_on, found)
        report(f"{sent_on or '?'}  {len(found):>3} links  {subject or title}")


# ---------- from the dashboard: Uutiskirjeet → Arkisto ----------

# An archive's home page: https://us11.campaign-archive.com/home/?u=…&id=…
ARCHIVE_HOME = re.compile(r"^https://[a-z0-9-]+\.campaign-archive\.com/home/\?(?=.*\bu=[0-9a-f]+)(?=.*\bid=[0-9a-f]+)", re.I)


class NoArchive(Exception):
    """No archive address has been given yet."""


class BadArchive(Exception):
    """Not the address of a Mailchimp archive's home page."""


class Unreachable(Exception):
    pass


class NotFound(Exception):
    pass


def source():
    found = queries.imported()
    try:
        read_at = datetime.fromisoformat(settings.get("newsletter_archive_read_at") or "")
    except ValueError:
        read_at = None
    return {"url": settings.get("newsletter_archive_url") or None, "read_at": read_at, "imported_at": found["last"],
            "newsletters": len(found["urls"])}


def set_source(url):
    url = (url or "").strip().replace("&amp;", "&")
    if not ARCHIVE_HOME.match(url):
        raise BadArchive()
    settings.put("newsletter_archive_url", url)
    return source()


def import_new(quiet=False):
    """The newsletters the archive lists that are not here yet: the ones
    sent since it was last read. Those here already stay as they are. With
    quiet, as n8n's weekly run asks, no address yet is nothing to do rather
    than a problem."""
    url = settings.get("newsletter_archive_url") or ""
    if not url:
        if quiet:
            return {"listed": 0, "imported": 0, "source": source()}
        raise NoArchive()
    try:
        everything = listed(_fetch(url))
        known = set(queries.imported()["urls"])
        new = [n for n in everything if n[1] not in known]
        _bring_in(new)
    except (urllib.error.URLError, OSError, ValueError) as e:
        raise Unreachable(str(e))
    settings.put("newsletter_archive_read_at", datetime.now(timezone.utc).isoformat())
    return {"listed": len(everything), "imported": len(new), "source": source()}


def comparison(issue_id):
    """One past newsletter against the system: each link it chose, and what
    the system summarised before it that it did not use. For a newsletter
    made in the dashboard also what was picked for it, and which of those
    went out: a link in the email no pick has was added by hand."""
    found = next((i for i in queries.issues() if i["id"] == issue_id), None)
    if not found:
        raise NotFound()
    entries_ = queries.entries(issue_id)
    here = queries.made_here(issue_id)
    not_sent = []
    if here:
        picks = queries.picks(here["id"])
        picked = {p["canonical_url"] for p in picks}
        sent = {e["canonical_url"] for e in entries_}
        not_sent = [p for p in picks if p["canonical_url"] not in sent]
        here = {**here, "picked": len(picks), "sent": len(picks) - len(not_sent)}
    for e in entries_:
        e["picked"] = bool(here) and e["canonical_url"] in picked
    return {"issue": found, "entries": entries_, "surfaced": queries.surfaced(issue_id) if found["sent_on"] else [],
            "made_here": here, "picked_not_sent": not_sent}
