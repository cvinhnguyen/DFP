"""The rules about articles beyond reading them: which ones may go to the AI
again, and turning database rows into what the API returns.
Jira: DM42-31
"""

import re

from ..queries import items as queries
from ..queries import settings
from ..schemas.items import Counts, FilterOptions, Item, ItemPage
from . import events


class NotFound(Exception):
    pass


class CannotSummarise(Exception):
    """Says why, as a code the pages translate and a message in English."""

    def __init__(self, code, message, **params):
        super().__init__(message)
        self.code = code
        self.params = params


def _min_chars():
    return settings.get_int("filter_min_text_chars", 300)


# Words that usually mean an article is about an event, in Finnish and
# English. Only a default for the editor's choice of section.
EVENT_WORDS = re.compile(r"tapahtum|webinaar|seminaar|konferens|tilaisuu|messuil|messut|työpaja|"
                         r"\bevent|webinar|seminar|conference|workshop|summit", re.IGNORECASE)


SECTIONS = ("own_news", "events", "member_news", "highlights")


def suggest_section(found):
    """The section a workflow gave the article, if any. Otherwise an event
    the AI found in the article goes to Tapahtumat, the association's own
    events too, as its newsletter has them; the association's own site is its
    own news, other events are events, and the rest is news from the field.
    Members' news is the editors' choice."""
    if found.get("section") in SECTIONS:
        return found["section"]
    if found.get("event_starts"):
        return "events"
    if "eoppimiskeskus.fi" in (found.get("url") or ""):
        return "own_news"
    summary = found.get("summary") or {}
    if EVENT_WORDS.search(f"{found.get('title') or ''} {summary.get('text') or ''}"):
        return "events"
    return "highlights"


def _as_item(found, min_chars):
    # The same rules as request_summary() in 20-topics.sql, plus two of our
    # own: a repeat of a story already here, and an article with too little
    # text to summarise, would only give the model a chance to invent.
    can_request = (found["status"] in ("filtered_out", "summary_failed", "on_request")
                   and found["duplicate_of"] is None
                   and found["text_length"] >= min_chars)
    return Item(**found, can_request_summary=can_request, suggested_section=suggest_section(found),
                event=events.details(found))


def list_items(view, sort, page, per_page, user_id=None, **chosen):
    """user_id is the editor asking: whether each article is new to them."""
    chosen["q"] = (chosen.get("q") or "").strip() or None
    if sort == "relevance" and not chosen["q"]:
        sort = "collected"
    where, params = queries.filters(**chosen)
    params["user"] = user_id
    counts = queries.counts(where, params)
    found = queries.page(where, params, view, sort, per_page, (page - 1) * per_page)
    min_chars = _min_chars()
    tag = chosen.get("tag")
    return ItemPage(items=[_as_item(f, min_chars) for f in found], total=counts[view],
                    page=page, per_page=per_page, counts=Counts(**counts),
                    tag_label=queries.tag_name(tag) if tag is not None else None)


def get_item(item_id, user_id=None):
    found = queries.one(item_id, user_id)
    if not found:
        raise NotFound()
    return _as_item(found, _min_chars())


def summarise_anyway(item_id, requested_by, user_id=None):
    """The filter keeps an article from the AI when it looks off topic or old,
    but an editor knows better. The article is queued, and the summarisation
    workflow picks it up on its next run, within 15 minutes."""
    item = get_item(item_id, user_id)
    if item.duplicate_of is not None:
        raise CannotSummarise("duplicate", f"This is the same story as article {item.duplicate_of}. Use that one.",
                              id=item.duplicate_of)
    if item.status in ("filtered_out", "summary_failed", "on_request") and not item.can_request_summary:
        raise CannotSummarise("too_little_text", "There is only a title or a few lines here, so nothing to summarise.")
    if not queries.request_summary(item_id, requested_by):
        raise CannotSummarise("cannot_summarise", "Only skipped or failed articles can be sent to the AI again.")
    return get_item(item_id, user_id)


def mark_seen(item_id, user_id):
    """The editor opened the article, so it is no longer new to them."""
    get_item(item_id)   # raises NotFound
    queries.mark_seen(item_id, user_id)


def filter_options():
    return FilterOptions(**queries.filter_options())
