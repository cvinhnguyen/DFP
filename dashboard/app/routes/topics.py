"""The topic endpoints, and searching YSO for a tag to add.
Jira: DM42-31
"""

from typing import Annotated

from fastapi import APIRouter, Depends, Query

from ..dependencies import current_user
from ..errors import ApiError
from ..schemas.auth import User
from ..schemas.topics import FollowIn, TermIn, Topic, TopicIn, TopicList, TopicPreview, TopicUpdate, YsoTerm
from ..services import topics, yso

router = APIRouter(tags=["topics"])

FINTO_DOWN = (502, "finto_unreachable", "Finto, where the subject terms come from, did not answer. Try again in a moment.")
NO_TOPIC = (404, "no_such_topic", "There is no topic with that number.")
NAME_TAKEN = (409, "topic_name_taken", "There is a topic with that name already.")


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


@router.post("/topics", response_model=Topic, status_code=201, summary="Start a new topic",
             responses={409: {"description": "The name is taken"}})
def create(body: TopicIn, user: User = Depends(current_user)):
    """It goes last in the list, not followed, with no terms yet."""
    try:
        return topics.create(body.name, user.id)
    except topics.NameTaken:
        raise ApiError(*NAME_TAKEN)


@router.patch("/topics/{topic_id}", response_model=Topic, summary="Rename a topic, or follow it")
def update(topic_id: int, body: TopicUpdate, user: User = Depends(current_user)):
    try:
        return topics.update(topic_id, body.name, body.followed, user.id)
    except topics.NoSuchTopic:
        raise ApiError(*NO_TOPIC)
    except topics.NameTaken:
        raise ApiError(*NAME_TAKEN)


@router.delete("/topics/{topic_id}", status_code=204, summary="Delete a topic")
def delete(topic_id: int):
    """Its list of terms goes with it. The articles and their tags stay."""
    try:
        topics.delete(topic_id)
    except topics.NoSuchTopic:
        raise ApiError(*NO_TOPIC)


@router.post("/topics/{topic_id}/terms", response_model=Topic, summary="Add a YSO term to a topic")
def add_term(topic_id: int, body: TermIn, user: User = Depends(current_user)):
    try:
        return topics.add_term(topic_id, body.uri, user.id)
    except topics.NoSuchTopic:
        raise ApiError(*NO_TOPIC)
    except yso.NotATerm:
        raise ApiError(422, "not_a_term", "YSO has no such term.")
    except yso.Unreachable:
        raise ApiError(*FINTO_DOWN)


@router.delete("/topics/{topic_id}/terms/{tag_id}", response_model=Topic, summary="Take a term off a topic")
def remove_term(topic_id: int, tag_id: int, user: User = Depends(current_user)):
    try:
        return topics.remove_term(topic_id, tag_id, user.id)
    except topics.NoSuchTopic:
        raise ApiError(*NO_TOPIC)
    except topics.NoSuchTerm:
        raise ApiError(404, "no_such_term", "The topic has no such term.")


@router.get("/topics/{topic_id}/preview", response_model=TopicPreview, summary="What a topic brings")
def preview(topic_id: int):
    """Its news from the days the Uudet list covers, and the theses of the last
    seven days, with and without the learning rule."""
    try:
        return topics.preview(topic_id)
    except topics.NoSuchTopic:
        raise ApiError(*NO_TOPIC)


@router.get("/yso", response_model=list[YsoTerm], summary="Search YSO for a subject term")
def search_terms(q: Annotated[str, Query(min_length=2, max_length=100, description="The start of a term's name")]):
    """Finds YSO terms by their Finnish name or by another name YSO gives the
    same term, for the editor adding a tag to an article."""
    try:
        return topics.search_terms(q)
    except yso.Unreachable:
        raise ApiError(*FINTO_DOWN)
