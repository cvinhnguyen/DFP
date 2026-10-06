"""Reading a site from the outside, the way Asetukset → Lähteet needs it:
whether it has a feed, what is in it, whether we may read it, and how often
it publishes.
Jira: DM42-29

Every address an admin types is fetched by the dashboard itself, so it is
fetched with care:

  - only http and https
  - never an address inside our own network: the name is looked up first,
    and one in a private, loopback, link-local or reserved range is refused,
    after every redirect too
  - at most five redirects, ten seconds and 2 MB a request
  - as the tool, with the name the collector uses, so a site's robots.txt can
    keep it out

The client asked us to respect IPR and never break into anything
(14-feed-sources.sql). So a site that answers 401 or 403, or whose
robots.txt keeps the tool out, is not added, and an article's own page is
read in full only where robots.txt allows it.
"""

import ipaddress
import json
import re
import socket
import urllib.error
import urllib.request
import xml.etree.ElementTree as ET
from datetime import datetime, timedelta, timezone
from email.utils import parsedate_to_datetime
from html import unescape
from html.parser import HTMLParser
from urllib.parse import urljoin, urlparse, urlunparse
from urllib.robotparser import RobotFileParser

# The collector's own name (n8n/workflows/feed-collector.json).
USER_AGENT = "DFP newsletter bot (HAMK student project)"
TIMEOUT = 10
MAX_BYTES = 2_000_000
MAX_REDIRECTS = 5

ISSN = re.compile(r"^\s*(?:issn\s*:?\s*)?(\d{4})-?(\d{3}[\dXx])\s*$", re.IGNORECASE)
CROSSREF = "https://api.crossref.org/journals"

# Where a feed usually is when the page does not say: WordPress and most
# others at /feed/, the rest at one of these.
FEED_PATHS = ("feed/", "rss.xml", "feed.xml", "atom.xml", "rss/", "index.xml")


class FetchProblem(Exception):
    """Says why an address could not be read, as a code the pages translate
    and a message in English."""

    def __init__(self, code, message, status=None):
        super().__init__(message)
        self.code = code
        self.status = status


class Page:
    def __init__(self, url, status, content_type, body, truncated=False):
        self.url = url
        self.status = status
        self.content_type = content_type or ""
        self.body = body
        self.truncated = truncated

    @property
    def text(self):
        found = re.search(r"charset=([\w-]+)", self.content_type, re.IGNORECASE)
        name = found.group(1) if found else None
        if not name:
            meta = re.search(rb"<meta[^>]+charset=[\"']?([\w-]+)", self.body[:4000], re.IGNORECASE)
            name = meta.group(1).decode("ascii", "ignore") if meta else "utf-8"
        try:
            return self.body.decode(name, errors="replace")
        except LookupError:
            return self.body.decode("utf-8", errors="replace")


# ---------- addresses ----------

def normalise(text):
    """What an admin typed as an address: https:// is added when it is
    missing, and spaces go."""
    text = (text or "").strip()
    if not text:
        raise FetchProblem("bad_address", "Give a web address.")
    if not re.match(r"^[a-z][a-z0-9+.-]*://", text, re.IGNORECASE):
        text = "https://" + text.lstrip("/")
    return text


def host_of(url):
    """example.fi from https://www.example.fi/news, lower case, without www."""
    try:
        host = (urlparse(url).hostname or "").lower().rstrip(".")
    except ValueError:
        return ""
    return host[4:] if host.startswith("www.") else host


def same_site(host, site):
    return bool(host) and (host == site or host.endswith("." + site))


def _public(address):
    """Whether an address is out on the internet: not private, loopback,
    link-local, shared, reserved or multicast."""
    ip = ipaddress.ip_address(address)
    if ip.version == 6 and ip.ipv4_mapped:
        ip = ip.ipv4_mapped
    return ip.is_global and not ip.is_multicast


def check_address(url, resolve=socket.getaddrinfo):
    """The address taken apart, or FetchProblem when it is not one the
    dashboard may fetch. resolve is swapped in tests."""
    try:
        parsed = urlparse(url)
    except ValueError:
        raise FetchProblem("bad_address", "That is not a web address.")
    if parsed.scheme not in ("http", "https") or not parsed.hostname:
        raise FetchProblem("bad_address", "Only http and https addresses can be followed.")
    if parsed.username or parsed.password:
        raise FetchProblem("bad_address", "An address with a user name or password in it is not followed.")
    try:
        port = parsed.port
    except ValueError:
        raise FetchProblem("bad_address", "That is not a web address.")
    host = parsed.hostname
    try:
        literal = ipaddress.ip_address(host)
    except ValueError:
        literal = None
    if literal is not None:
        addresses = [str(literal)]
    else:
        if host.lower().rstrip(".") in ("localhost",) or "." not in host:
            raise FetchProblem("private_address", "Addresses inside our own network are not followed.")
        try:
            addresses = {info[4][0] for info in resolve(host, port or 443, proto=socket.IPPROTO_TCP)}
        except (socket.gaierror, UnicodeError, OSError):
            raise FetchProblem("unreachable", f"No site answers at {host}.")
    if not addresses or not all(_public(a.split("%")[0]) for a in addresses):
        raise FetchProblem("private_address", "Addresses inside our own network are not followed.")
    return parsed


class _NoRedirects(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, *args, **kwargs):
        return None


_opener = urllib.request.build_opener(_NoRedirects())


def fetch(url, accept="text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8", max_bytes=MAX_BYTES):
    """The page at url, after its redirects, each one checked. Raises
    FetchProblem with refused for 401 and 403, not_found for 404 and 410."""
    for _ in range(MAX_REDIRECTS + 1):
        check_address(url)
        request = urllib.request.Request(url, headers={"User-Agent": USER_AGENT, "Accept": accept,
                                                       "Accept-Language": "fi,en;q=0.8"})
        try:
            with _opener.open(request, timeout=TIMEOUT) as response:
                body = response.read(max_bytes + 1)
                return Page(response.geturl(), response.status, response.headers.get("Content-Type"),
                            body[:max_bytes], truncated=len(body) > max_bytes)
        except urllib.error.HTTPError as e:
            if e.code in (301, 302, 303, 307, 308) and e.headers.get("Location"):
                url = urljoin(url, e.headers["Location"])
                continue
            if e.code in (401, 403):
                raise FetchProblem("refused", f"The site refuses to be read automatically ({e.code}).", e.code)
            if e.code in (404, 410):
                raise FetchProblem("not_found", f"There is nothing at that address ({e.code}).", e.code)
            raise FetchProblem("http_error", f"The site answered {e.code}.", e.code)
        except FetchProblem:
            raise
        except (urllib.error.URLError, TimeoutError, OSError, ValueError) as e:
            reason = getattr(e, "reason", e)
            raise FetchProblem("unreachable", f"The site could not be reached ({reason}).")
    raise FetchProblem("too_many_redirects", "The address sends us on too many times.")


def fetch_json(url):
    page = fetch(url, accept="application/json")
    try:
        return json.loads(page.body)
    except ValueError:
        raise FetchProblem("http_error", "The answer was not what was expected.")


# ---------- robots.txt ----------

class Robots:
    """A site's robots.txt as it applies to the tool. Without one, or when it
    cannot be read, everything is allowed; behind 401 or 403, nothing is,
    as Python's own reader has it."""

    def __init__(self, lines=None, everything=None):
        self.parser = RobotFileParser()
        if everything is True:
            self.parser.allow_all = True
        elif everything is False:
            self.parser.disallow_all = True
        else:
            self.parser.parse(lines or [])

    def allows(self, url):
        return self.parser.can_fetch(USER_AGENT, url)


def robots_for(url):
    parsed = urlparse(url)
    try:
        page = fetch(urlunparse((parsed.scheme, parsed.netloc, "/robots.txt", "", "", "")),
                     accept="text/plain", max_bytes=500_000)
    except FetchProblem as e:
        return Robots(everything=False if e.code == "refused" else True)
    return Robots(page.text.splitlines())


# ---------- feeds ----------

def _local(tag):
    return tag.rsplit("}", 1)[-1] if isinstance(tag, str) else ""


def _child(element, *names):
    for child in element:
        if _local(child.tag) in names:
            return child
    return None


def _text(element, *names):
    found = _child(element, *names) if element is not None else None
    return _clean(found.text if found is not None else "")


def _clean(text):
    text = unescape(re.sub(r"<[^>]+>", " ", text or ""))
    return re.sub(r"\s+", " ", text).strip()


def parse_date(text):
    """A date as feeds and pages write it, RFC 822 or ISO 8601, or None."""
    text = (text or "").strip()
    if not text:
        return None
    try:
        found = parsedate_to_datetime(text)
    except (TypeError, ValueError, IndexError):
        found = None
    if found is None:
        try:
            found = datetime.fromisoformat(text.replace("Z", "+00:00"))
        except ValueError:
            return None
    return found if found.tzinfo else found.replace(tzinfo=timezone.utc)


def _atom_link(entry):
    for link in entry:
        if _local(link.tag) == "link" and link.get("rel", "alternate") == "alternate" and link.get("href"):
            return link.get("href")
    return None


def parse_feed(data):
    """An RSS, Atom or RDF feed as {title, link, language, items: [{title,
    url, published_at}]}, or None when data is no feed. A document that
    declares its own entities is not read at all."""
    head = data[:5000] if isinstance(data, bytes) else data[:5000].encode()
    if b"<!ENTITY" in head:
        return None
    try:
        root = ET.fromstring(data)
    except ET.ParseError:
        return None
    kind = _local(root.tag)
    if kind == "rss":
        channel = _child(root, "channel")
        if channel is None:
            return None
        entries = [e for e in channel if _local(e.tag) == "item"]
        feed = {"title": _text(channel, "title"), "link": _text(channel, "link"),
                "language": _text(channel, "language")}
    elif kind == "feed":
        entries = [e for e in root if _local(e.tag) == "entry"]
        feed = {"title": _text(root, "title"), "link": _atom_link(root) or "",
                "language": root.get("{http://www.w3.org/XML/1998/namespace}lang") or ""}
    elif kind == "RDF":
        channel = _child(root, "channel")
        entries = [e for e in root if _local(e.tag) == "item"]
        feed = {"title": _text(channel, "title"), "link": _text(channel, "link"), "language": _text(channel, "language")}
    else:
        return None
    items = []
    for entry in entries:
        url = _text(entry, "link") if kind != "feed" else (_atom_link(entry) or "")
        if not url and kind == "rss":
            guid = _child(entry, "guid")
            if guid is not None and guid.get("isPermaLink", "true") != "false":
                url = _clean(guid.text)
        when = parse_date(_text(entry, "pubDate", "published", "updated", "date", "issued"))
        title = _text(entry, "title")
        if title and url:
            items.append({"title": title[:300], "url": url, "published_at": when})
    feed["items"] = items
    return feed


def looks_like_feed(page):
    kind = page.content_type.split(";")[0].strip().lower()
    start = page.body[:400].lstrip().lower()
    return "xml" in kind or "rss" in kind or "atom" in kind or start.startswith((b"<?xml", b"<rss", b"<feed", b"<rdf"))


# ---------- pages ----------

class _Head(HTMLParser):
    """What a page says about itself: its feeds, name, language and
    description."""

    def __init__(self):
        super().__init__(convert_charrefs=True)
        self.feeds = []
        self.meta = {}
        self.lang = ""
        self.title = ""
        self._in_title = False

    def handle_starttag(self, tag, attrs):
        a = {k.lower(): (v or "") for k, v in attrs}
        if tag == "html" and a.get("lang"):
            self.lang = a["lang"]
        elif tag == "title":
            self._in_title = True
        elif tag == "link" and "alternate" in a.get("rel", "").lower().split():
            kind = a.get("type", "").lower()
            if kind in ("application/rss+xml", "application/atom+xml", "application/rdf+xml") and a.get("href"):
                self.feeds.append((a["href"], a.get("title", "")))
        elif tag == "meta":
            key = (a.get("property") or a.get("name") or a.get("itemprop") or "").lower()
            if key and a.get("content") and key not in self.meta:
                self.meta[key] = a["content"].strip()

    def handle_endtag(self, tag):
        if tag == "title":
            self._in_title = False

    def handle_data(self, data):
        if self._in_title and len(self.title) < 300:
            self.title += data


def page_head(html):
    head = _Head()
    try:
        head.feed(html[:400_000])
    except Exception:  # a page broken enough to stop the parser keeps what it had
        pass
    head.title = re.sub(r"\s+", " ", head.title).strip()
    return head


# A comments feed is a feed of the readers' comments, not of the articles.
COMMENTS = re.compile(r"comment|kommentti", re.IGNORECASE)


def feed_links(html, base):
    """The feeds a page names in its head, comment feeds left out, in the
    order it names them."""
    found = []
    for href, title in page_head(html).feeds:
        url = urljoin(base, href)
        if COMMENTS.search(href) or COMMENTS.search(title) or url in found:
            continue
        found.append(url)
    return found


def guessed_feeds(page_url, root_too=True):
    """Where a feed is likely to be when the page does not say: under the
    page itself (a blog's /feed), beside it, and at the root of the site."""
    parsed = urlparse(page_url)
    root = urlunparse((parsed.scheme, parsed.netloc, "/", "", "", ""))
    found = []
    own = parsed.path.rstrip("/")
    if own:
        base = urlunparse((parsed.scheme, parsed.netloc, own, "", "", ""))
        found += [base + "/feed", base + "/feed/"]
        parent = own.rsplit("/", 1)[0] + "/"
        if parent != "/":
            found.append(urljoin(urlunparse((parsed.scheme, parsed.netloc, parent, "", "", "")), "feed/"))
    if root_too:
        found += [urljoin(root, p) for p in FEED_PATHS]
    return found


# What a site calls the pages that list its news and events.
LISTING_WORDS = re.compile(r"ajankohtai|uutis|tiedott|tapahtum|blog|news|event|artikkel|webinaar|kalenter|"
                           r"calendar|press|nyheter|evenemang|aktuellt", re.IGNORECASE)


def listing_pages(html, page_url):
    """The pages a site lists its news and events on, from the links of one
    of its pages, the navigation's too: [{url, title}], at most five."""
    from . import watch
    site = host_of(page_url)
    here = page_url.split("#")[0].rstrip("/")
    found = []
    for url, text in watch.all_links(html, page_url):
        parsed = urlparse(url)
        path = parsed.path.rstrip("/")
        depth = len([part for part in path.split("/") if part])
        if (not same_site(host_of(url), site) or not 1 <= depth <= 2 or parsed.query
                or watch.FILES.search(path) or watch.NOT_ARTICLES.search(path + "/")
                or not LISTING_WORDS.search(f"{text} {path}")):
            continue
        clean = urlunparse((parsed.scheme, parsed.netloc, path, "", "", ""))
        if clean.rstrip("/") == here or any(f["url"] == clean for f in found):
            continue
        found.append({"url": clean, "title": (text or path).strip()[:80]})
    return found[:5]


# ---------- what the source is like ----------

def per_month(dates, now=None):
    """About how many articles a month, from the dates of those in a feed:
    how many there are over the time from the oldest to now. None with
    fewer than two dates."""
    now = now or datetime.now(timezone.utc)
    known = sorted(d for d in dates if d and d <= now + timedelta(days=1))
    if len(known) < 2:
        return None
    days = max((now - known[0]).total_seconds() / 86400, 1)
    return round(len(known) / days * 30, 1)


LANGUAGES = {"fi": "fi", "en": "en", "sv": "sv", "no": "no", "nb": "no", "nn": "no", "da": "da", "de": "de", "et": "et"}
WORDS = {
    "fi": re.compile(r"\b(ja|on|että|tai|kun|joka|mitä|miten|uusi|ovat|sekä|myös|tapahtuma|koulutus)\b|[äö]", re.IGNORECASE),
    "sv": re.compile(r"\b(och|för|att|är|med|som|på|av|det|en)\b|[å]", re.IGNORECASE),
    "en": re.compile(r"\b(the|and|of|for|with|to|in|on|is|new|how)\b", re.IGNORECASE),
}


def guess_language(declared, texts):
    """fi, en, sv, no and so on: what the feed or the page says, or else
    what its titles look like. None when there is nothing to go by."""
    code = (declared or "").strip().lower()[:2]
    if code in LANGUAGES:
        return LANGUAGES[code]
    sample = " ".join(t for t in texts if t)[:3000]
    if not sample:
        return None
    scores = {lang: len(pattern.findall(sample)) for lang, pattern in WORDS.items()}
    best = max(scores, key=scores.get)
    return best if scores[best] else None


# What a site calls its news. A feed called only that gets the site's name
# in front of it: "ITK-Konferenssi, Ajankohtaista".
SECTION_WORDS = {"ajankohtaista", "ajankohtaiset", "uutiset", "uutishuone", "tiedotteet", "blogi", "blogit",
                 "artikkelit", "tapahtumat", "news", "latest news", "blog", "posts", "articles", "events",
                 "press releases", "nyheter", "aktuellt"}
# What a front page calls itself, which names no site.
HOME_WORDS = {"koti", "etusivu", "home", "home page", "homepage", "front page", "welcome", "tervetuloa",
              "startsida", "hem"}


def _plain(name):
    """A name as it is compared: small letters, without dashes and other
    marks, so "TOT - Oppiminen" and "TOT – Oppiminen" are one name."""
    return " ".join(re.sub(r"[^\w+]+", " ", (name or "").lower()).split())


def tidy_name(name):
    """A feed's own title, without what feeds add to it: " – Syöte",
    "RSS", "Archives"."""
    name = re.sub(r"\s*[-–|»:]\s*(rss|feed|syöte|atom|archives?|arkisto|uutiset rss)\s*$", "", name or "",
                  flags=re.IGNORECASE)
    name = re.sub(r"^(rss|feed)\s*[-–|:]\s*", "", name, flags=re.IGNORECASE)
    return re.sub(r"\s+", " ", name).strip()[:120]


def journal(issn):
    """A journal by its ISSN, through Crossref: its name, publisher and
    newest articles, the way the collector reads it."""
    issn = f"{issn[:4]}-{issn[-4:]}".upper()
    try:
        found = fetch_json(f"{CROSSREF}/{issn}").get("message") or {}
    except FetchProblem as e:
        if e.code == "not_found":
            return {"kind": "none", "message": f"Crossref does not know the ISSN {issn}."}
        raise
    works = fetch_json(f"{CROSSREF}/{issn}/works?sort=published&order=desc&rows=8"
                       "&filter=type:journal-article&select=title,URL,published")
    items = []
    for w in (works.get("message") or {}).get("items") or []:
        parts = ((w.get("published") or {}).get("date-parts") or [[None]])[0]
        when = (datetime(parts[0], (parts[1] if len(parts) > 1 else 1) or 1, (parts[2] if len(parts) > 2 else 1) or 1,
                         tzinfo=timezone.utc) if parts and parts[0] else None)
        title = _clean((w.get("title") or [""])[0])
        if title and w.get("URL"):
            items.append({"title": title[:300], "url": w["URL"], "published_at": when})
    return {
        "kind": "journal", "type": "crossref", "url": f"{CROSSREF}/{issn}/works", "homepage": None,
        "name": tidy_name(found.get("title") or issn), "publisher": (found.get("publisher") or "").strip() or None,
        "language": "en", "items": items, "per_month": per_month([i["published_at"] for i in items]),
        # A journal is read from Crossref and nothing more: never its pages.
        "full_text": False, "issn": issn,
    }


# ---------- what is at an address ----------

def site_root(url):
    parsed = urlparse(url)
    return urlunparse((parsed.scheme, parsed.netloc, "/", "", "", ""))


def site_name(head):
    """The site's own name: what it tells social media, or the last part of
    its page title, "Uutiset | Kansanvalistusseura". Never what a page calls
    itself, "Koti" or "Uutiset"."""
    parts = [p for p in re.split(r"\s+[|–—-]\s+", head.title or "")
             if _plain(p) and _plain(p) not in HOME_WORDS | SECTION_WORDS]
    for name in (head.meta.get("og:site_name"), head.meta.get("application-name"), parts[-1] if parts else None):
        name = re.sub(r"\s+", " ", name or "").strip()[:120]
        if name and _plain(name) not in HOME_WORDS:
            return name
    return None


def _robots_allow(url, robots, page_url):
    if same_site(host_of(url), host_of(page_url)):
        return robots.allows(url)
    return robots_for(url).allows(url)


def _feed_result(feed_url, feed, robots, page_url, head=None):
    items = sorted(feed["items"], key=lambda i: i["published_at"] or datetime.min.replace(tzinfo=timezone.utc),
                   reverse=True)
    first = items[0]["url"] if items else None
    named = site_name(head) if head else None
    title = tidy_name(feed["title"])
    # A blog's feed is often called only what the site calls its news,
    # "Ajankohtaista": the site's name goes in front, as the sources are
    # named. A feed with a name of its own keeps it as it is.
    if named and _plain(title) in SECTION_WORDS and _plain(named) != _plain(title):
        title = f"{named}, {title}"
    return {
        "kind": "feed", "type": "rss", "url": feed_url,
        "homepage": feed["link"] if (feed["link"] or "").startswith("http") else site_root(page_url),
        "name": title or named or host_of(page_url), "publisher": named or title or None,
        "language": guess_language(feed["language"] or (head.lang if head else ""), [i["title"] for i in items]),
        "items": items[:8], "per_month": per_month([i["published_at"] for i in items]),
        # An article is read in full only from the same site, and only where
        # robots.txt lets the tool in.
        "full_text": bool(first) and same_site(host_of(first), host_of(page_url)) and robots.allows(first),
    }


def discover(text):
    """What is at the address an admin typed, for the form that adds it:

      feed     a feed with articles in it, type rss
      journal  an ISSN, read through Crossref, type crossref
      page     no feed, but a page with links to articles that can be
               watched, type watch
      none     nothing to follow there
      blocked  the site keeps the tool out

    with the name, publisher and language to start from, the newest
    articles, about how many a month, and whether articles may be read in
    full. Raises FetchProblem when the address cannot be read at all."""
    issn = ISSN.match(text or "")
    if issn:
        return journal(issn.group(1) + issn.group(2))
    url = normalise(text)
    try:
        page = fetch(url)
    except FetchProblem as e:
        if e.code == "refused":
            return {"kind": "blocked", "url": url, "message": str(e)}
        raise
    robots = robots_for(page.url)
    if looks_like_feed(page):
        feed = parse_feed(page.body)
        if feed and feed["items"]:
            if not robots.allows(page.url):
                return {"kind": "blocked", "url": page.url, "message": "The site's robots.txt keeps the tool out."}
            return _feed_result(page.url, feed, robots, page.url)
    html = page.text
    head = page_head(html)
    named = feed_links(html, page.url)
    tried = []
    for candidate in [*named, *guessed_feeds(page.url)]:
        if candidate in tried or len(tried) >= 8:
            continue
        tried.append(candidate)
        if not _robots_allow(candidate, robots, page.url):
            continue
        try:
            found = fetch(candidate, accept="application/rss+xml, application/atom+xml, application/xml;q=0.9, */*;q=0.5")
        except FetchProblem:
            continue
        feed = parse_feed(found.body) if looks_like_feed(found) else None
        if feed and feed["items"]:
            return _feed_result(found.url, feed, robots, page.url, head)
    # A front page without a feed: the site's news or events page may
    # have one of its own, as a blog has.
    listings = listing_pages(html, page.url)
    for listing in listings[:3]:
        for candidate in guessed_feeds(listing["url"], root_too=False)[:2]:
            if candidate in tried or not robots.allows(candidate):
                continue
            tried.append(candidate)
            try:
                found = fetch(candidate, accept="application/rss+xml, application/atom+xml, application/xml;q=0.9")
            except FetchProblem:
                continue
            feed = parse_feed(found.body) if looks_like_feed(found) else None
            if feed and feed["items"]:
                return {**_feed_result(found.url, feed, robots, page.url, head), "via": listing["url"]}
    if not robots.allows(page.url):
        return {"kind": "blocked", "url": page.url, "message": "The site's robots.txt keeps the tool out of this page."}
    from . import watch
    links = watch.extract_links(html, page.url)
    others = [listing for listing in listings if listing["url"].rstrip("/") != page.url.rstrip("/")]
    if len(links) >= 3:
        name = site_name(head)
        return {
            "kind": "page", "type": "watch", "url": page.url, "homepage": site_root(page.url),
            "name": name or host_of(page.url), "publisher": name,
            "language": guess_language(head.lang, [link["title"] for link in links]),
            "items": [{"title": link["title"], "url": link["url"], "published_at": None} for link in links[:8]],
            "links": len(links), "per_month": None,
            "full_text": robots.allows(links[0]["url"]), "listings": others,
        }
    return {"kind": "none", "url": page.url, "listings": others,
            "message": "No feed and no links to articles were found there."}
