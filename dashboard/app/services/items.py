"""The rules about articles beyond reading them: which ones may go to the AI
again, and turning database rows into what the API returns, with the section
each most likely belongs in (services/suggest.py).
Jira: DM42-31
"""

from datetime import date, timedelta

from ..queries import items as queries
from ..queries import settings
from ..schemas.items import Counts, FilterOptions, Item, ItemPage
from . import events, suggest


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


def _as_item(found, min_chars):
    # The same rules as request_summary() in 20-topics.sql, plus two of our
    # own: a repeat of a story already here, and an article with too little
    # text to summarise, would only give the model a chance to invent.
    can_request = (found["status"] in ("filtered_out", "summary_failed", "on_request")
                   and found["duplicate_of"] is None
                   and found["text_length"] >= min_chars)
    section, reason, detail = suggest.suggest(found)
    return Item(**found, can_request_summary=can_request, suggested_section=section,
                suggestion_reason=reason, suggestion_detail=detail, event=events.details(found))


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


def items_by_ids(ids, user_id=None, hide_drive=False):
    """The articles with these ids, in the order given. One that is gone
    is left out."""
    found = {f["id"]: f for f in queries.by_ids(ids, user_id, hide_drive)}
    min_chars = _min_chars()
    return [_as_item(found[i], min_chars) for i in ids if i in found]


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


def filter_options(hide_drive=False):
    return FilterOptions(**queries.filter_options(hide_drive))


# ---------- what is waiting for each section ----------

def waiting_by_section(hide_drive=False):
    """How many articles in Uudet each section is suggested for."""
    counts = {section: 0 for section in suggest.SECTIONS}
    for row in queries.suggestion_inputs(hide_drive):
        counts[suggest.suggest(row)[0]] += 1
    return counts


def list_suggested(section, page, per_page, user_id=None, hide_drive=False):
    """The articles in Uudet suggested for the section, the newest first:
    what "3 waiting" on a newsletter's page opens."""
    ids = [r["id"] for r in queries.suggestion_inputs(hide_drive) if suggest.suggest(r)[0] == section]
    where, params = queries.filters(hide_drive=hide_drive)
    params["user"] = user_id
    counts = queries.counts(where, params)
    chunk = ids[(page - 1) * per_page:page * per_page]
    return ItemPage(items=items_by_ids(chunk, user_id, hide_drive), total=len(ids), page=page, per_page=per_page,
                    counts=Counts(**counts))


# ---------- the calendar ----------

def calendar(month, user_id=None, hide_drive=False):
    """The events of a month, 2026-10, as the list shows articles: every
    one whose days are in it, or whose last day to sign up is."""
    year, number = (int(x) for x in month.split("-"))
    first = date(year, number, 1)
    last = (first + timedelta(days=32)).replace(day=1) - timedelta(days=1)
    return {"month": f"{year:04d}-{number:02d}",
            "items": items_by_ids(queries.event_ids(first, last, hide_drive), user_id, hide_drive),
            "upcoming": queries.upcoming_events(hide_drive)}
