"""Help from the AI with the newsletter's own text: subject lines and preview
texts to choose from, a draft of the greeting, and a draft of why a trend
matters. Everything is a suggestion for an editor to read. A draft goes into
the email unchecked, outlined like an AI summary, until an editor ticks it.
Jira: DM42-25, DM42-37, DM42-40

The dashboard gathers what the text is about from the database and n8n
writes it, through n8n/workflows/writing-help.json and the shared LLM call,
so each answer lands in llm_usage with the rest of the AI's costs, and the
same material asked for again comes from the cache at no cost. The prompts
are in that workflow, next to the others.

Like an article summary an editor asks for, it is written even when the
month's AI budget is used up: an editor pressed the button.
"""

import json
import urllib.error
import urllib.request

from .. import config
from ..queries import signals as signal_queries
from . import issues

SECTION_NAMES = {
    "own_news": "Ajankohtaista yhdistykseltä ja hankkeista",
    "events": "Tapahtumat",
    "member_news": "Jäsenkuulumisia",
    "highlights": "Nostoja kentältä",
}
SECTION_ORDER = list(SECTION_NAMES)

# How much the AI reads: enough to know what each article is about, little
# enough that a whole newsletter is a few thousand tokens.
ISSUE_ARTICLES = 20
TREND_ARTICLES = 6


class WritingProblem(Exception):
    """Says what went wrong, as a code the pages translate and a message in
    English."""

    def __init__(self, code, message, http=502, **params):
        super().__init__(message)
        self.code = code
        self.http = http
        self.params = params


def subject(issue_id, attempt=1):
    answer = _ask({"task": "subject", "attempt": attempt, **_issue_material(issue_id, 240)})
    return {"subjects": answer.get("subjects") or [], "preheaders": answer.get("preheaders") or [], **_usage(answer)}


def greeting(issue_id, attempt=1):
    answer = _ask({"task": "greeting", "attempt": attempt, **_issue_material(issue_id, 320)})
    return {"text": answer.get("text") or "", **_usage(answer)}


def trend(signal_id, attempt=1):
    signal = signal_queries.one(signal_id)
    if not signal:
        raise WritingProblem("no_such_signal", "There is no signal with that number.", 404)
    articles = [{"title": a["title"], "publisher": a["publisher"], "summary": _short(a["summary"], 600)}
                for a in signal_queries.for_writing(signal_id, TREND_ARTICLES)]
    if not articles:
        raise WritingProblem("ai_no_articles", "This signal has no articles to write from.", 409)
    days = (signal["period_end"] - signal["period_start"]).days
    answer = _ask({"task": "trend", "attempt": attempt, "topic": signal["topic"], "count": signal["articles"],
                   "days": days, "articles": articles})
    return {"text": answer.get("text") or "", "signal": signal, **_usage(answer)}


# ---------- what the AI reads ----------

def _issue_material(issue_id, summary_chars):
    try:
        issue = issues.get(issue_id)
    except issues.NotFound:
        raise WritingProblem("no_such_issue", "There is no newsletter with that number.", 404)
    picked = sorted(issue.articles, key=lambda a: SECTION_ORDER.index(a.section) if a.section in SECTION_ORDER else 9)
    if not picked:
        raise WritingProblem("ai_no_articles", "Pick articles for this newsletter first.", 409)
    return {
        "newsletter": issue.name,
        "articles": [{
            "section": SECTION_NAMES.get(a.section, a.section),
            "title": a.title_fi or a.title,
            "publisher": a.publisher,
            "event": a.event_line,
            "summary": _short(a.summary or a.excerpt, summary_chars),
        } for a in picked[:ISSUE_ARTICLES]],
    }


def _short(text, limit):
    """text cut to about limit characters, at the end of a sentence where
    there is one."""
    text = " ".join(str(text or "").split())
    if len(text) <= limit:
        return text
    cut = text[:limit]
    end = cut.rfind(". ")
    return cut[:end + 1] if end > limit // 2 else cut.rstrip() + "…"


def _usage(answer):
    return {"tokens": answer.get("tokens"), "cost_eur": answer.get("cost_eur"), "truncated": bool(answer.get("truncated"))}


# ---------- asking n8n ----------

def _ask(payload, timeout=150):
    """Sends the material to the writing help workflow and waits for its
    answer: a few seconds, or longer when the model is busy."""
    if not config.INGEST_TOKEN:
        raise WritingProblem("ai_not_set_up", "INGEST_TOKEN is missing from .env, so the dashboard cannot ask n8n.", 503)
    request = urllib.request.Request(
        f"{config.N8N_URL}/webhook/writing", data=json.dumps(payload).encode("utf-8"), method="POST",
        headers={"Content-Type": "application/json", "X-Ingest-Token": config.INGEST_TOKEN})
    try:
        with urllib.request.urlopen(request, timeout=timeout) as response:
            answer = json.loads(response.read() or b"{}")
    except urllib.error.HTTPError as e:
        if e.code == 404:
            raise WritingProblem("ai_not_set_up", "n8n has no writing help workflow switched on. "
                                 "Import n8n/workflows/writing-help.json.", 503)
        raise WritingProblem("ai_failed", f"n8n answered {e.code}.", 502, status=e.code)
    except TimeoutError:
        raise WritingProblem("ai_slow", "The AI took too long to answer. Try again in a moment.", 504)
    except (urllib.error.URLError, OSError, ValueError):
        raise WritingProblem("n8n_unreachable", "Could not reach n8n. Is it running?", 503)
    if not answer.get("ok"):
        raise WritingProblem(answer.get("code") or "ai_failed", answer.get("message") or "The AI did not answer.", 502)
    return answer
