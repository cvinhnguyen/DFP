"""Help from the AI with the newsletter's own text. Each answer is a
suggestion: the pages show it for an editor to choose, edit and check.
Every request for the AI waits its turn in one line (services/ai_line.py),
and the work itself runs in a thread, so a long line ties up nothing.
Jira: DM42-25, DM42-37, DM42-40
"""

from fastapi import APIRouter, Depends, Response
from starlette.concurrency import run_in_threadpool

from ..dependencies import current_user, is_demo
from ..errors import ApiError
from ..schemas.auth import User
from ..schemas.writing import (AskAnswer, AskIn, Attempt, Draft, Followups, FollowupsIn, LinePlace, RecentQuestion,
                               Subjects, TrendDraft)
from ..services import writing
from ..services.ai_line import Busy, line

router = APIRouter(tags=["writing help"])

PROBLEMS = {404: {"description": "No such newsletter or signal"},
            409: {"description": "Nothing to write from: no articles picked"},
            502: {"description": "The AI did not answer"},
            503: {"description": "n8n cannot be reached, the workflow is not switched on, or the AI's line is full"},
            504: {"description": "The AI took too long"}}


def _run(fn, *args):
    try:
        return fn(*args)
    except writing.WritingProblem as e:
        raise ApiError(e.http, e.code, str(e), **e.params)


async def _in_turn(fn, *args, key=None):
    """fn(*args) once it is this request's turn with the AI."""
    try:
        async with line.place(key):
            return await run_in_threadpool(_run, fn, *args)
    except Busy:
        raise ApiError(503, "ai_busy", "Too many questions for the AI at once. Try again in a moment.")


@router.post("/issues/{issue_id}/ai/subject", response_model=Subjects, responses=PROBLEMS,
             summary="Subject lines and preview texts to choose from")
async def subject(issue_id: int, body: Attempt):
    """Three subject lines and two preview texts, from the articles picked
    for the newsletter. Nothing is saved: the editor chooses one."""
    return await _in_turn(writing.subject, issue_id, body.attempt)


@router.post("/issues/{issue_id}/ai/greeting", response_model=Draft, responses=PROBLEMS,
             summary="A draft of the greeting, from the picked articles")
async def greeting(issue_id: int, body: Attempt):
    """A few lines on what the newsletter has in it. The editor puts it in the
    email, where it waits unchecked until someone has read it."""
    return await _in_turn(writing.greeting, issue_id, body.attempt)


@router.post("/signals/{signal_id}/ai/trend", response_model=TrendDraft, responses=PROBLEMS,
             summary="A draft of why a trend matters, from its articles")
async def trend(signal_id: int, body: Attempt):
    """Two or three sentences for the trend's box in Nostoja kentältä, and
    the signal itself, so the box can be made again around them."""
    return await _in_turn(writing.trend, signal_id, body.attempt)


@router.post("/ask", response_model=AskAnswer, responses=PROBLEMS, summary="Ask the articles a question")
async def ask(body: AskIn, user: User = Depends(current_user)):
    """The answer comes from the summaries of the articles that fit the
    question best, at most eight, and cites them by number. When none fits,
    the answer is null and the AI is not asked. With the question before
    it, a follow-up is first written out whole, and the articles are found
    for that."""
    # The shared demo login's questions are the whole room's: none is kept.
    return await _in_turn(writing.ask, body.question, body.days, user.id, body.previous, is_demo(user),
                          not is_demo(user), key=body.line)


@router.post("/ask/followups", response_model=Followups, responses=PROBLEMS,
             summary="Questions to ask next, after an answer")
async def followups(body: FollowupsIn):
    """Up to three, about the same articles or subject. Nothing is kept;
    the same answer gives the same questions from the AI's cache. Only nice
    to have, so they are not asked for while others wait for the AI: then
    the list is empty."""
    try:
        async with line.place(optional=True):
            return await run_in_threadpool(_run, writing.followups, body.question, body.answer, body.titles)
    except Busy:
        return {"questions": [], "tokens": None, "cost_eur": None, "truncated": False}


@router.get("/ai/line/{key}", response_model=LinePlace, summary="Where a question is in the AI's line",
            responses={422: {"description": "Not a key a page makes"}})
def where(key: str):
    """For the key a question was sent with (AskIn.line): answering, or
    waiting with how many ahead, or unknown when it is not in line."""
    if not 8 <= len(key) <= 64:
        raise ApiError(422, "bad_key", "Not a key a page makes.")
    place = line.where(key)
    return {"state": place[0], "ahead": place[1]} if place else {"state": "unknown", "ahead": 0}


@router.get("/ask/recent", response_model=list[RecentQuestion], summary="The questions you have asked, newest first")
def recent(user: User = Depends(current_user)):
    return writing.recent(user.id)


@router.delete("/ask/recent/{history_id}", status_code=204, summary="Forget one of your questions")
def forget(history_id: int, user: User = Depends(current_user)):
    if not writing.forget(user.id, history_id):
        raise ApiError(404, "no_such_question", "There is no question of yours with that number.")
    return Response(status_code=204)
