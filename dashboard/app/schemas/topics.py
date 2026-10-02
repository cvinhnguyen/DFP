"""What the topic and tag endpoints take and return."""

from pydantic import BaseModel, Field


class TopicTerm(BaseModel):
    id: int
    label: str = Field(description="The term's Finnish name in YSO")
    uri: str = Field(description="The term's address in YSO")


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


class TopicIn(BaseModel):
    name: str = Field(min_length=1, max_length=80)


class TopicUpdate(BaseModel):
    name: str | None = Field(default=None, min_length=1, max_length=80)
    followed: bool | None = None


class TermIn(BaseModel):
    uri: str = Field(pattern=r"^http://www\.yso\.fi/onto/yso/p\d{1,9}$",
                     description="A YSO term, from GET /api/yso")


class PreviewThesis(BaseModel):
    id: int
    title: str
    url: str
    publisher: str | None
    kept: bool = Field(description="It has a learning tag, so it is in the topic")


class TopicPreview(BaseModel):
    news: int = Field(description="News in the topic, from the days the Uudet list covers")
    theses: int = Field(description="Theses that arrived in the last 7 days and are in the topic")
    theses_without_rule: int = Field(description="Theses of the last 7 days with one of its terms, learning tag or not")
    window_days: int
    theses_list: list[PreviewThesis] = Field(description="Those theses, the ones in the topic first")


class YsoTerm(BaseModel):
    uri: str = Field(description="The term's address in YSO")
    label: str = Field(description="Its Finnish name")
    also: str | None = Field(default=None, description="The other name that matched what was typed, if not the Finnish name")


class TagIn(BaseModel):
    uri: str = Field(pattern=r"^http://www\.yso\.fi/onto/yso/p\d{1,9}$",
                     description="A YSO term, from GET /api/yso")
