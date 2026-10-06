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

Asking the articles a question works the same way: the dashboard finds the
articles that fit (queries/ask.py), and the AI answers from their summaries
only, saying which article each thing is from. A follow-up is first written
out whole from the question before it, and the articles are found for that.
Each answered question is kept for the editor who asked it, so the monthly
one is a click away (38-ask-history.sql), and once the answer is on the page
the AI suggests what to ask next (followups below).
"""

import json
import time
import urllib.error
import urllib.request

from .. import config
from ..queries import ask as ask_queries
from ..queries import signals as signal_queries
from . import issues, items

SECTION_NAMES = {
    "own_news": "Ajankohtaista yhdistykseltä ja hankkeista",
    "events": "Tapahtumat",
    "member_news": "Jäsenkuulumisia",
    "highlights": "Nostoja kentältä",
    "training": "Learning Factory: koulutukset",
}
SECTION_ORDER = list(SECTION_NAMES)

# How much the AI reads: enough to know what each article is about, little
# enough that a whole newsletter is a few thousand tokens.
ISSUE_ARTICLES = 20
TREND_ARTICLES = 6
ASK_ARTICLES = 8


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


def ask(question, days, user_id=None, previous=None, hide_drive=False, keep=True):
    """The answer to an editor's question from the articles that fit it, and
    those articles, as the list shows them, numbered as the answer cites
    them. None as the answer when no article fits: then nothing is asked.

    previous is the question before in the conversation, with its answer and
    the titles of its articles. A follow-up such as "Entä lukioissa?" has
    few words to find articles by, so the AI first writes it out whole
    ("Mitä on kerrottu oppimistulosten laskusta lukioissa?"), and that is
    what the articles are found for and answered."""
    question = " ".join(str(question or "").split())
    asked_as, spent = question, []
    if previous and previous.question and previous.answer:
        whole = _standalone(question, previous)
        spent.append(whole)
        asked_as = whole["text"] or question
    found = ask_queries.relevant(asked_as, days, ASK_ARTICLES, hide_drive)
    sources = items.items_by_ids([f["id"] for f in found], user_id, hide_drive=hide_drive)
    rewritten = asked_as if asked_as != question else None
    if not sources:
        return {"answer": None, "sources": [], "asked_as": rewritten, **_usage_of(spent)}
    articles = [{
        "title": s.title_fi or s.title,
        "publisher": s.publisher,
        "date": _day(s.published_at or s.collected_at),
        "summary": _short(s.summary or s.excerpt, 700),
    } for s in sources]
    answer = _ask({"task": "ask", "attempt": 1, "question": asked_as, "articles": articles})
    if keep and user_id:
        # As it was searched: a follow-up such as "Entä lukioissa?" means
        # nothing on its own later.
        ask_queries.remember(user_id, asked_as[:300], days)
    return {"answer": answer.get("text") or "", "sources": sources, "asked_as": rewritten,
            **_usage_of([*spent, answer])}


FOLLOWUPS = 3


def followups(question, answer, titles):
    """Up to three short questions to ask next about the same articles or
    subject, in Finnish; none when the AI gives nothing usable."""
    found = _ask({"task": "followups", "attempt": 1, "question": question, "answer": answer[:2500],
                  "titles": titles[:ASK_ARTICLES]})
    return {"questions": clean_questions(found.get("questions"), question), **_usage(found)}


def clean_questions(questions, asked):
    """The AI's questions as the page shows them: one line each, at most 120
    characters, none twice and not the one just asked."""
    seen = {" ".join(str(asked or "").lower().split())}
    out = []
    for q in questions if isinstance(questions, list) else []:
        text = " ".join(str(q or "").split()).strip(" -•\"'")[:120]
        key = text.lower()
        if len(text) >= 8 and key not in seen:
            seen.add(key)
            out.append(text if text.endswith("?") else text + "?")
        if len(out) == FOLLOWUPS:
            break
    return out


def recent(user_id):
    return ask_queries.recent(user_id)


def forget(user_id, history_id):
    return ask_queries.forget(user_id, history_id)


def _standalone(question, previous):
    """A follow-up written out whole from the conversation, one line of at
    most 300 characters; its text is empty when the AI gave nothing usable."""
    answer = _ask({"task": "standalone", "attempt": 1, "question": question,
                   "previous_question": previous.question, "previous_answer": previous.answer,
                   "previous_titles": previous.titles[:ASK_ARTICLES]})
    text = " ".join(str(answer.get("text") or "").split())[:300]
    return {**answer, "text": text if len(text) >= 3 else ""}


def _day(value):
    return f"{value.day}.{value.month}.{value.year}" if value else ""


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


def _usage_of(answers):
    """What several calls spent together; none when nothing was asked."""
    if not answers:
        return {"tokens": None, "cost_eur": None, "truncated": False}
    # n8n gives the cost as text, "0.0000", which the answer's schema reads as a number.
    tokens = [int(a["tokens"]) for a in answers if a.get("tokens") is not None]
    costs = [float(a["cost_eur"]) for a in answers if a.get("cost_eur") is not None]
    return {"tokens": sum(tokens) if tokens else None, "cost_eur": sum(costs) if costs else None,
            "truncated": any(bool(a.get("truncated")) for a in answers)}


# ---------- asking n8n ----------

def _ask(payload, timeout=150):
    """Sends the material to the writing help workflow and waits for its
    answer: a few seconds, or longer when the model is busy. A model that
    did not answer is asked once more after a pause: a cloud model that
    refused because of a burst usually answers a moment later."""
    try:
        return _ask_once(payload, timeout)
    except WritingProblem as e:
        if e.code != "ai_failed":
            raise
    time.sleep(RETRY_AFTER)
    return _ask_once(payload, timeout)


RETRY_AFTER = 3


def _ask_once(payload, timeout):
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
