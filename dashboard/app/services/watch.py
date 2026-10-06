"""A site without a feed, read by watching one of its listing pages: an
events page, a news page. Every link the page has had is remembered
(watch_links, 36-sources.sql), and one not seen before becomes an article
through the same ingest API the collectors use, so the same checks apply.
n8n's collection schedule asks for it like any other source
(n8n/workflows/page-watcher.json).
Jira: DM42-36, DM42-29

What counts as an article's link on a listing page:
  - on the same site, and not the page itself or the site's front page
  - in the page's content: links in its header, navigation, sidebar and
    footer are left out
  - with words to it: at least three words or 15 characters, so "Lue
    lisää", a date or an arrow does not count, unless the same address has
    a longer text elsewhere on the page
  - not a file, a mail or phone link, a page of a list, a tag, category,
    author or search page, a login, or a language switch
  - when three or more such links are under the listing page's own
    address, only those: they are its articles, the rest are elsewhere

A page is read only where its robots.txt allows, and an article's own page
in full only where the source may be (fetch_full_text), as for feeds.
"""

import json
import re
import urllib.error
import urllib.request
from html import unescape
from html.parser import HTMLParser
from urllib.parse import parse_qs, urljoin, urlparse, urlunparse

from .. import config
from ..queries import sources as queries
from . import feeds

# How many new articles one check brings at most. When a page suddenly has
# many more new links, as after the site is rebuilt, the rest are only
# remembered.
MAX_NEW = 15
RESET = 30
MAX_LINKS = 80

# Where links are never an article's: the page's frame.
FRAME = {"nav", "header", "footer", "aside", "form", "script", "style", "noscript", "template", "select", "svg"}
FRAME_ROLES = {"navigation", "banner", "contentinfo", "complementary", "search", "menu", "menubar"}
VOID = {"area", "base", "br", "col", "embed", "hr", "img", "input", "link", "meta", "param", "source", "track", "wbr"}

FILES = re.compile(r"\.(pdf|jpe?g|png|gif|webp|svg|zip|docx?|xlsx?|pptx?|odt|mp3|mp4|mov|ics|csv)$", re.IGNORECASE)
NOT_ARTICLES = re.compile(
    r"/(tag|tags|avainsana|category|categories|kategoria|aihe|author|kirjoittaja|page|sivu|search|haku|"
    r"login|kirjaudu|wp-login\.php|wp-admin|feed|rss|cart|ostoskori|share|jaa)(/|$)", re.IGNORECASE)
LANGUAGE_ONLY = re.compile(r"^/[a-z]{2}(-[a-z]{2})?/?$", re.IGNORECASE)
PAGING = {"page", "p", "s", "lang", "sivu", "replytocom", "share"}


class _Links(HTMLParser):
    """The links in a page's content, with their words, in page order."""

    def __init__(self, everywhere=False):
        super().__init__(convert_charrefs=True)
        self.everywhere = everywhere   # the frame's links too
        self.stack = []        # (tag, frame) of the open elements
        self.links = []        # (href, text)
        self.anchor = None     # [href, words] while inside <a>

    def _in_frame(self):
        return any(frame for _, frame in self.stack)

    def handle_starttag(self, tag, attrs):
        a = {k.lower(): (v or "") for k, v in attrs}
        if tag == "a":
            if self.anchor is not None:
                self._close_anchor()
            if a.get("href") and (self.everywhere or not self._in_frame()):
                self.anchor = [a["href"], [a.get("title") or a.get("aria-label") or ""]]
        if tag in VOID:
            return
        frame = tag in FRAME or a.get("role", "").lower() in FRAME_ROLES
        self.stack.append((tag, frame))

    def handle_endtag(self, tag):
        if tag == "a" and self.anchor is not None:
            self._close_anchor()
        for at in range(len(self.stack) - 1, -1, -1):
            if self.stack[at][0] == tag:
                del self.stack[at:]
                break

    def handle_data(self, data):
        if self.anchor is not None:
            self.anchor[1].append(data)

    def _close_anchor(self):
        href, words = self.anchor
        self.anchor = None
        title, *text = words
        text = re.sub(r"\s+", " ", " ".join(text)).strip()
        self.links.append((href, text if len(text) >= len(title.strip()) else title.strip()))


def all_links(html, page_url):
    """Every link of a page with its words, the navigation's too, as
    [(address, words)]."""
    parser = _Links(everywhere=True)
    try:
        parser.feed(html[:1_500_000])
        parser.close()
    except Exception:
        pass
    return [(urljoin(page_url, href.strip()), text) for href, text in parser.links]


def _canonical(url):
    """An address as the database compares them: https, no www., no
    fragment, no trailing slash, no tracking parameters."""
    parsed = urlparse(url)
    host = (parsed.hostname or "").lower()
    host = host[4:] if host.startswith("www.") else host
    query = "&".join(part for part in parsed.query.split("&") if part and not part.lower().startswith(("utm_", "fbclid", "gclid")))
    return urlunparse(("https", host, parsed.path.rstrip("/") or "/", "", query, ""))


def _wordy(text):
    return len(text) >= 15 or len(text.split()) >= 3


def extract_links(html, page_url):
    """The article links of a listing page as [{url, title}], in the order
    the page has them, at most 80."""
    parser = _Links()
    try:
        parser.feed(html[:1_500_000])
        parser.close()
    except Exception:  # a broken page keeps the links read before it broke
        pass
    site = feeds.host_of(page_url)
    page = _canonical(page_url)
    listing = urlparse(page_url).path.rstrip("/")
    found = {}
    for href, text in parser.links:
        url = urljoin(page_url, href.strip())
        parsed = urlparse(url)
        if parsed.scheme not in ("http", "https") or not feeds.same_site(feeds.host_of(url), site):
            continue
        path = parsed.path or "/"
        if (path in ("", "/") or FILES.search(path) or NOT_ARTICLES.search(path) or LANGUAGE_ONLY.match(path)
                or PAGING & set(parse_qs(parsed.query))):
            continue
        key = _canonical(url)
        if key == page:
            continue
        text = unescape(text).strip()
        url = urlunparse(parsed._replace(fragment=""))
        if key not in found or len(text) > len(found[key]["title"]):
            found[key] = {"url": url, "title": text[:300], "key": key}
    links = [link for link in found.values() if _wordy(link["title"])]
    if listing:
        under = [link for link in links if urlparse(link["url"]).path.startswith(listing + "/")]
        if len(under) >= 3:
            links = under
    return [{"url": link["url"], "title": link["title"]} for link in links[:MAX_LINKS]]


# ---------- an article's own page ----------

# Where an article's text usually is; each is tried and the one with the
# most paragraph text wins, as the feed collector does (feed-collector.json).
MARKS = re.compile(r"<(?:article|main)\b|class=\"[^\"]*\b(?:journal-content-article|entry-content|article-body|"
                   r"post-content|single-content|news-content|content-main)\b", re.IGNORECASE)
CHROME = re.compile(r"<(script|style|noscript|nav|header|footer|aside|form|figure|svg)\b[\s\S]*?</\1>", re.IGNORECASE)
PARAGRAPH = re.compile(r"<p\b[^>]*>([\s\S]*?)</p>", re.IGNORECASE)
PUBLISHED = re.compile(r"\"datePublished\"\s*:\s*\"([^\"]+)\"")


def _paragraphs(region):
    texts = (re.sub(r"\s+", " ", unescape(re.sub(r"<[^>]+>", " ", p))).strip()
             for p in PARAGRAPH.findall(CHROME.sub(" ", region)))
    return [t for t in texts if len(t) > 40]


def read_article(url):
    """{title, excerpt, published_at, text} from an article's own page:
    its title, its own description, the day it gives, and its text, at most
    6000 characters. What the page does not give is None."""
    page = feeds.fetch(url)
    html = page.text
    head = feeds.page_head(html)
    starts = [m.start() for m in MARKS.finditer(html)]
    regions = [html[s:(starts[n + 1] if n + 1 < len(starts) else len(html))] for n, s in enumerate(starts)] or [html]
    best = max((_paragraphs(r) for r in regions), key=lambda p: len("".join(p)), default=[])
    title = head.meta.get("og:title") or head.meta.get("twitter:title") or head.title
    when = (head.meta.get("article:published_time") or head.meta.get("datepublished")
            or (PUBLISHED.search(html) or [None, None])[1])
    published = feeds.parse_date(when) if when else None
    excerpt = head.meta.get("og:description") or head.meta.get("description")
    return {"title": re.sub(r"\s+", " ", title or "").strip()[:300] or None,
            "excerpt": re.sub(r"\s+", " ", excerpt or "").strip()[:300] or None,
            "published_at": published.isoformat() if published else None,
            "text": "\n".join(best)[:6000] or None}


# ---------- a check ----------

def _ingest(items):
    """The articles to the ingest API (docs/ingest-api.md), which stores the
    good ones and answers for each."""
    request = urllib.request.Request(
        f"{config.N8N_URL}/webhook/ingest", data=json.dumps({"items": items}).encode("utf-8"), method="POST",
        headers={"Content-Type": "application/json", "X-Ingest-Token": config.INGEST_TOKEN})
    with urllib.request.urlopen(request, timeout=60) as response:
        return json.loads(response.read() or b"{}")


def remember(source_id, links):
    """The links a page has now, only remembered: what it had when it was
    added, unless its articles were wanted too."""
    queries.watched_add(source_id, [{"key": _canonical(link["url"]), "url": link["url"], "title": link["title"],
                                     "item_id": None} for link in links])


def run(source):
    """One check of a watched page: {items_found, items_new, error}, what
    the collection schedule writes into collection_runs."""
    if not config.INGEST_TOKEN:
        return {"items_found": 0, "items_new": 0, "error": "INGEST_TOKEN is missing from .env"}
    try:
        robots = feeds.robots_for(source["url"])
        if not robots.allows(source["url"]):
            return {"items_found": 0, "items_new": 0, "error": "robots.txt keeps the tool out of the page"}
        page = feeds.fetch(source["url"])
    except feeds.FetchProblem as e:
        return {"items_found": 0, "items_new": 0, "error": str(e)}
    links = extract_links(page.text, page.url)
    if not links:
        return {"items_found": 0, "items_new": 0, "error": "no links to articles on the page"}
    seen = queries.watched(source["id"])
    fresh = [link for link in links if _canonical(link["url"]) not in seen]
    if len(fresh) > RESET:
        remember(source["id"], fresh[MAX_NEW:])
    fresh = fresh[:MAX_NEW]
    if not fresh:
        return {"items_found": len(links), "items_new": 0, "error": None}
    articles = []
    for link in fresh:
        article = {"source_id": source["id"], "url": link["url"], "title": link["title"],
                   "publisher": source.get("publisher") or None}
        if source.get("fetch_full_text") and robots.allows(link["url"]):
            try:
                found = read_article(link["url"])
            except feeds.FetchProblem:
                found = {}
            # The link's own words are the title the page lists it by; the
            # article's page often adds the site's name to it.
            article.update({"excerpt": found.get("excerpt"), "raw_text": found.get("text"),
                            "published_at": found.get("published_at")})
            if not link["title"] and found.get("title"):
                article["title"] = found["title"]
        articles.append({k: v for k, v in article.items() if v is not None})
    try:
        answer = _ingest(articles)
    except (urllib.error.URLError, TimeoutError, OSError, ValueError) as e:
        return {"items_found": len(links), "items_new": 0, "error": f"the ingest API did not answer ({e})"}
    results = answer.get("results") or []
    stored = []
    for link, result in zip(fresh, results):
        if result.get("accepted"):
            stored.append({"key": _canonical(link["url"]), "url": link["url"], "title": link["title"],
                           "item_id": int(result["item_id"]) if result.get("item_id") else None})
    queries.watched_add(source["id"], stored)
    rejected = [r.get("reason") for r in results if not r.get("accepted")]
    return {"items_found": len(links), "items_new": sum(1 for r in results if r.get("accepted") and r.get("new")),
            "error": f"{len(rejected)} rejected: {', '.join(sorted(set(filter(None, rejected))))}" if rejected else None}
