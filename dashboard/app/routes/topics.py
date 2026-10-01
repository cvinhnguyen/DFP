"""The topic endpoints, and searching YSO for a tag to add.
Jira: DM42-31
"""

from typing import Annotated

from fastapi import APIRouter, Depends, Query

from ..dependencies import current_user
from ..errors import ApiError
from ..schemas.auth import User
from ..schemas.topics import FollowIn, Topic, TopicList, YsoTerm
from ..services import topics, yso

router = APIRouter(tags=["topics"])

FINTO_DOWN = (502, "finto_unreachable", "Finto, where the subject terms come from, did not answer. Try again in a moment.")


@router.get("/topics", response_model=TopicList, summary="The topics, their terms, and how many articles each has")
def list_topics():
    return topics.list_topics()


@router.put("/topics/{topic_id}/follow", response_model=Topic, summary="Follow a topic, or stop following it")
def follow(topic_id: int, body: FollowIn, user: User = Depends(current_user)):
    """A followed topic brings its theses into the Uudet list. Shared by the
    editors: they make one newsletter together."""
    try:
        return topics.follow(topic_id, body.followed, user.id)
    except topics.NoSuchTopic:
        raise ApiError(404, "no_such_topic", "There is no topic with that number.")


@router.get("/yso", response_model=list[YsoTerm], summary="Search YSO for a subject term")
def search_terms(q: Annotated[str, Query(min_length=2, max_length=100, description="The start of a term's name")]):
    """Finds YSO terms by their Finnish name or by another name YSO gives the
    same term, for the editor adding a tag to an article."""
    try:
        return topics.search_terms(q)
    except yso.Unreachable:
        raise ApiError(*FINTO_DOWN)
