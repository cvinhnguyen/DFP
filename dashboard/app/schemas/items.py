"""What the article endpoints return."""

from datetime import datetime
from typing import Literal

from pydantic import BaseModel, Field

# The buttons above the list.
#   review     summarised, and nobody has decided about it yet
#   picked     in the newsletter being prepared
#   later      kept for later
#   dismissed  not for the newsletter
#   used       in a newsletter that has been sent
#   waiting, skipped, attention: by what the AI step did with it
View = Literal["review", "picked", "later", "dismissed", "used", "waiting", "skipped", "attention", "all"]
Sort = Literal["collected", "published", "relevance"]
# The newsletter sections an article can be picked into.
Section = Literal["highlights", "events", "own_news", "member_news"]


class Summary(BaseModel):
    text: str
    model: str | None = None
    made_at: datetime


class SignalRef(BaseModel):
    id: int
    topic: str


class Copy(BaseModel):
    id: int
    url: str
    source: str | None = None
    publisher: str | None = None


class Item(BaseModel):
    id: int
    title: str
    url: str
    publisher: str | None = Field(description="Who wrote it. Printed with the summary in the newsletter.")
    source_id: int | None
    source: str | None = Field(description="Where we found it: a feed, a site, or Telegram capture")
    source_type: str | None = Field(description="rss, crossref, webpage, or manual for links sent on Telegram")
    sent_by: str | None = Field(description="Who sent the link on Telegram, if someone did")
    published_at: datetime | None
    collected_at: datetime
    language: str | None = Field(description="Language of the original: fi, en, no, or null if not known")
    status: str = Field(description="new, queued, summarised, filtered_out, summary_failed or manual")
    status_reason: str | None = Field(description="Why it has that status, in plain words")
    section: str | None = Field(description="events, member_news or highlights, once an editor picks one")
    excerpt: str | None = Field(description="The publisher's own short description")
    text_length: int = Field(description="Characters of article text we have")
    summary: Summary | None
    duplicate_of: int | None = Field(description="The article this one repeats, if it is the same story")
    duplicate_of_title: str | None
    copies: list[Copy] = Field(description="The same story collected from other places")
    signals: list[SignalRef] = Field(description="Topics the signal detection linked to this article")
    can_request_summary: bool = Field(description="Whether POST /api/items/{id}/summarise would accept it")
    decision: str | None = Field(description="picked, later or dismissed, or null if nobody has decided")
    pick_section: str | None = Field(description="For a picked article: own_news, events, member_news or highlights")
    pick_issue_id: int | None
    pick_issue_name: str | None
    pick_issue_status: str | None = Field(description="draft, or sent once that newsletter has gone out")
    decided_by: str | None
    decided_at: datetime | None
    suggested_section: str = Field(description="The section it most likely belongs in, as the default when picking")


class Counts(BaseModel):
    review: int
    picked: int
    later: int
    dismissed: int
    used: int
    waiting: int
    skipped: int
    attention: int
    all: int


class ItemPage(BaseModel):
    items: list[Item]
    total: int = Field(description="Articles in the chosen view that match the filters")
    page: int
    per_page: int
    counts: Counts = Field(description="How many match the filters in each view, for the buttons")


class SourceOption(BaseModel):
    id: int
    name: str
    items: int


class LanguageOption(BaseModel):
    code: str | None
    items: int


class SignalOption(BaseModel):
    id: int
    topic: str
    items: int


class FilterOptions(BaseModel):
    sources: list[SourceOption]
    languages: list[LanguageOption]
    signals: list[SignalOption]
