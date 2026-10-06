"""Help from the AI with the newsletter's own text. Each answer is a
suggestion: the pages show it for an editor to choose, edit and check.
Jira: DM42-25, DM42-37, DM42-40
"""

from fastapi import APIRouter, Depends, Response

from ..dependencies import current_user, is_demo
from ..errors import ApiError
from ..schemas.auth import User
from ..schemas.writing import (AskAnswer, AskIn, Attempt, Draft, Followups, FollowupsIn, RecentQuestion, Subjects,
                               TrendDraft)
from ..services import writing

router = APIRouter(tags=["writing help"])

PROBLEMS = {404: {"description": "No such newsletter or signal"},
            409: {"description": "Nothing to write from: no articles picked"},
            502: {"description": "The AI did not answer"},
            503: {"description": "n8n cannot be reached, or the workflow is not switched on"},
            504: {"description": "The AI took too long"}}


def _run(fn, *args):
    try:
        return fn(*args)
    except writing.WritingProblem as e:
        raise ApiError(e.http, e.code, str(e), **e.params)


@router.post("/issues/{issue_id}/ai/subject", response_model=Subjects, responses=PROBLEMS,
             summary="Subject lines and preview texts to choose from")
def subject(issue_id: int, body: Attempt):
    """Three subject lines and two preview texts, from the articles picked
    for the newsletter. Nothing is saved: the editor chooses one."""
    return _run(writing.subject, issue_id, body.attempt)


@router.post("/issues/{issue_id}/ai/greeting", response_model=Draft, responses=PROBLEMS,
             summary="A draft of the greeting, from the picked articles")
def greeting(issue_id: int, body: Attempt):
    """A few lines on what the newsletter has in it. The editor puts it in the
    email, where it waits unchecked until someone has read it."""
    return _run(writing.greeting, issue_id, body.attempt)


@router.post("/signals/{signal_id}/ai/trend", response_model=TrendDraft, responses=PROBLEMS,
             summary="A draft of why a trend matters, from its articles")
def trend(signal_id: int, body: Attempt):
    """Two or three sentences for the trend's box in Nostoja kentältä, and
    the signal itself, so the box can be made again around them."""
    return _run(writing.trend, signal_id, body.attempt)


@router.post("/ask", response_model=AskAnswer, responses=PROBLEMS, summary="Ask the articles a question")
def ask(body: AskIn, user: User = Depends(current_user)):
    """The answer comes from the summaries of the articles that fit the
    question best, at most eight, and cites them by number. When none fits,
    the answer is null and the AI is not asked. With the question before
    it, a follow-up is first written out whole, and the articles are found
    for that."""
    # The shared demo login's questions are the whole room's: none is kept.
    return _run(writing.ask, body.question, body.days, user.id, body.previous, is_demo(user), not is_demo(user))


@router.post("/ask/followups", response_model=Followups, responses=PROBLEMS,
             summary="Questions to ask next, after an answer")
def followups(body: FollowupsIn):
    """Up to three, about the same articles or subject. Nothing is kept;
    the same answer gives the same questions from the AI's cache."""
    return _run(writing.followups, body.question, body.answer, body.titles)


@router.get("/ask/recent", response_model=list[RecentQuestion], summary="The questions you have asked, newest first")
def recent(user: User = Depends(current_user)):
    return writing.recent(user.id)


@router.delete("/ask/recent/{history_id}", status_code=204, summary="Forget one of your questions")
def forget(history_id: int, user: User = Depends(current_user)):
    if not writing.forget(user.id, history_id):
        raise ApiError(404, "no_such_question", "There is no question of yours with that number.")
    return Response(status_code=204)
