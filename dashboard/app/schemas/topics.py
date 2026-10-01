"""What the topic and tag endpoints take and return."""

from pydantic import BaseModel, Field


class TopicTerm(BaseModel):
    id: int
    label: str = Field(description="The term's Finnish name in YSO")


class Topic(BaseModel):
    id: int
    name: str
    followed: bool = Field(description="Its theses come to the Uudet list. News comes there whatever its topic.")
    position: int
    tags: list[TopicTerm] = Field(description="The YSO terms: an article with any of them is in the topic")
    new: int = Field(description="Articles in it nobody has decided about, from the days the Uudet list covers")
    total: int = Field(description="Articles in it, left-out ones not counted")


class TopicCounts(BaseModel):
    new: int
    total: int


class TopicList(BaseModel):
    topics: list[Topic]
    untopiced: TopicCounts = Field(description="News no topic took, for the list Ei aihetta")
    window_days: int = Field(description="How many days back the Uudet list and the new counts reach")


class FollowIn(BaseModel):
    followed: bool


class YsoTerm(BaseModel):
    uri: str = Field(description="The term's address in YSO")
    label: str = Field(description="Its Finnish name")
    also: str | None = Field(default=None, description="The other name that matched what was typed, if not the Finnish name")


class TagIn(BaseModel):
    uri: str = Field(pattern=r"^http://www\.yso\.fi/onto/yso/p\d{1,9}$",
                     description="A YSO term, from GET /api/yso")
