"""Which of the newsletter's four sections an article most likely belongs in,
and why: the default an editor sees on Artikkelit as "Ehdotus", with the
reason under it. Only a suggestion; where the editor puts it is what counts.
Jira: DM42-32, DM42-37

The first rule that fits decides:

  1. a section the workflow that brought the article gave it
  2. an event still to come: the AI found its date in the article and the
     day has not passed, or the last day to sign up for something an event
     word names, such as a call for webinar presenters  ->  Tapahtumat
  3. an invitation: an event word and an invitation such as "ilmoittaudu" or
     "call for" in the title or summary, when the AI found no date  ->  Tapahtumat
  4. the association's "Mitä kuuluu jäsenille" posts  ->  Jäsenkuulumisia
  5. a section the editors chose for the source  ->  that section
  6. Learning Factory's own sites, its courses  ->  Learning Factory
  7. anything else on the association's own site  ->  Ajankohtaista yhdistykseltä
  8. a member organisation's own website, or a member as the publisher  ->
     Jäsenkuulumisia. The members are the association's community members,
     read from its members page every week (29-members.sql)
  9. the association named in the title or summary  ->  Ajankohtaista yhdistykseltä
 10. a member named in the title  ->  Jäsenkuulumisia
 11. anything else  ->  Nostoja kentältä

An event that has been is news, not something to go to, so a past date
falls through to the other rules: the association's report of its own
webinar is its news. A word alone does not make an event either: a
minister's speech at a seminar names one but invites nobody.

The source's section is the editors' own: Artikkelit asks for it when a
source's articles keep going to another section than the one suggested
(services/suggestions.py). It comes after what an article itself says, a
date or a member post, and before what is only guessed from where it was
published or whom it names.
"""

import re
import time
from datetime import date, datetime
from urllib.parse import urlparse

from ..queries import suggest as queries
from .collection import HELSINKI

SECTIONS = ("own_news", "events", "member_news", "highlights", "training")
# The reasons a section chosen for the source takes the place of, None
# being Nostoja kentältä when nothing else fits. Only the picks with one of
# these count towards asking for a source's section.
SOURCE_DECIDES = (None, "source_section", "learning_factory", "own_site", "member_site", "association_named",
                  "member_named")

ASSOCIATION_SITE = "eoppimiskeskus.fi"
# Learning Factory, the association's trainings: its site and its course hub.
LEARNING_FACTORY = ("learningfactory.fi", "learningfactory.hub.howspace.com")
# The association's blog series of its members' news.
MEMBER_POSTS = re.compile(r"^/mita-kuuluu-jasen", re.IGNORECASE)
ASSOCIATION_NAMED = re.compile(r"eoppimiskeskus", re.IGNORECASE)

EVENT_WORDS = re.compile(r"tapahtum|webinaar|seminaar|konferens|tilaisuu|työpaja|messu|"
                         r"\bevent|webinar|seminar|conference|workshop|summit|meetup", re.IGNORECASE)
INVITATION = re.compile(r"ilmoittau|kutsu|tervetuloa|save the date|call for|register|join us|"
                        r"liity mukaan|hae mukaan|tule mukaan", re.IGNORECASE)

# A member's name in a title, as Finnish bends it: HAMKin, HAMK:n, Qridin,
# Sanoma Pron.
ENDING = r"(?::?[a-zäöå]{1,5})?"
LEGAL = re.compile(r"[\s,]+(oy ltd\.?|oyj|oy|ltd\.?|ry|ab|inc\.?)$", re.IGNORECASE)
ACRONYM = re.compile(r"\b([A-ZÄÖÅ]{4,})\+?$")

# The members are asked for once a minute, not for every article.
CACHE_SECONDS = 60
_cache = {"at": 0.0, "members": []}


def _day(value):
    if isinstance(value, datetime):
        return value.astimezone(HELSINKI).date() if value.tzinfo else value.date()
    if isinstance(value, date):
        return value
    if isinstance(value, str) and len(value) >= 10:
        try:
            return date.fromisoformat(value[:10])
        except ValueError:
            return None
    return None


def _host(url):
    try:
        host = (urlparse(url or "").hostname or "").lower()
    except ValueError:
        return ""
    return host[4:] if host.startswith("www.") else host


def _on(host, site):
    return bool(host) and (host == site or host.endswith("." + site))


def _plain(name):
    """A member's name without Oy, Ltd or ry: Qridi Oy is Qridi."""
    return LEGAL.sub("", name.strip()).strip()


def _names(name, site):
    """What an article's title might call a member: its name without Oy or
    ry, each part of a name with a slash, a closing acronym such as XAMK and
    the name without it (Kaakkois-Suomen ammattikorkeakoulu), a long word its
    website is named after (itslearning), and a short website name as an
    acronym (hamk.fi: HAMK). A short ordinary word is never one: Linnan
    Kehitys is not every "Linnan" in a headline."""
    names = set()
    for part in [name, *re.split(r"\s*/\s*", name)]:
        part = _plain(part)
        if len(part) >= 4:
            names.add(part)
        acronym = ACRONYM.search(part)
        if acronym:
            names.add(acronym.group(1))
            spelled = part[:acronym.start()].rstrip(" -–—,")
            if " " in spelled and len(spelled) >= 10:
                names.add(spelled)
    stem = site.split(".")[0]
    words = re.findall(r"[\w-]+", name)
    if any(w.lower() == stem for w in words):
        names.update(w for w in words if w.lower() == stem and len(w) >= 7)
    elif stem.isalpha() and 4 <= len(stem) <= 6:
        names.add(stem.upper())
    return names


def _title_pattern(names):
    # An acronym is matched as written, so TAKK is not the Norwegian "takk";
    # a name in any case.
    alternatives = [re.escape(n) if n.isupper() else f"(?i:{re.escape(n)})"
                    for n in sorted(names, key=len, reverse=True)]
    return re.compile(rf"(?<!\w)(?:{'|'.join(alternatives)}){ENDING}(?!\w)")


def _members():
    if time.monotonic() - _cache["at"] > CACHE_SECONDS:
        members = []
        for row in queries.members():
            names = _names(row["name"], row["host"])
            members.append({"name": _plain(row["name"]), "host": row["host"],
                            "names": {n.lower() for n in names}, "title": _title_pattern(names)})
        _cache.update(at=time.monotonic(), members=members)
    return _cache["members"]


def suggest(found, today=None):
    """(section, reason, detail): the section, a code for why, and what the
    reason names, a member or a day. The reason is None for Nostoja
    kentältä, which needs none."""
    if found.get("section") in SECTIONS:
        if found.get("source_type") == "drive":
            # From a folder named after the section in the Drive folder.
            return found["section"], "drive_folder", (found.get("details") or {}).get("folder")
        return found["section"], "chosen", None
    today = today or datetime.now(HELSINKI).date()

    starts = _day(found.get("event_starts"))
    last = _day(found.get("event_ends")) or starts
    deadline = _day(found.get("event_deadline"))
    title = " ".join(filter(None, [found.get("title"), found.get("title_fi")]))
    summary = (found.get("summary") or {}).get("text") or ""
    text = f"{title} {summary}"
    if last and last >= today:
        return "events", "event", (starts or last).isoformat()
    # A deadline alone may be a funding call's: an event word says it is
    # something to go to.
    if deadline and deadline >= today and EVENT_WORDS.search(text):
        return "events", "deadline", deadline.isoformat()
    if not starts and EVENT_WORDS.search(text) and INVITATION.search(text):
        return "events", "invitation", None

    url = found.get("url") or ""
    host = _host(url)
    own = _on(host, ASSOCIATION_SITE)
    if own and MEMBER_POSTS.match(urlparse(url).path or ""):
        return "member_news", "member_post", None
    if found.get("source_section") in SECTIONS:
        return found["source_section"], "source_section", None
    if any(_on(host, site) for site in LEARNING_FACTORY):
        return "training", "learning_factory", None
    if own:
        return "own_news", "own_site", None

    publisher = LEGAL.sub("", (found.get("publisher") or "").strip()).strip().lower()
    for member in _members():
        if _on(host, member["host"]) or (publisher and publisher in member["names"]):
            return "member_news", "member_site", member["name"]

    if ASSOCIATION_NAMED.search(text):
        return "own_news", "association_named", None

    for member in _members():
        if member["title"].search(title):
            return "member_news", "member_named", member["name"]

    return "highlights", None, None
