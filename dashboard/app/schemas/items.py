"""What the article endpoints return."""

from datetime import date, datetime
from typing import Literal

from pydantic import BaseModel, Field

from .pictures import Picture

# The places the list can show.
#   inbox      Uudet: summarised news nobody has decided about, and the theses
#              of the followed topics, from the last month
#   review     summarised, and nobody has decided about it yet
#   picked     in the newsletter being prepared
#   later      kept for later
#   dismissed  not for the newsletter
#   used       in a newsletter that has been sent
#   waiting, skipped, attention: by what the AI step did with it
#   open       everything not left out, for a topic, a tag or a source
View = Literal["inbox", "review", "picked", "later", "dismissed", "used", "waiting", "skipped", "attention",
               "open", "all"]
Sort = Literal["collected", "published", "relevance"]
# The newsletter sections an article can be picked into.
Section = Literal["highlights", "events", "own_news", "member_news", "training"]


class Summary(BaseModel):
    text: str
    model: str | None = None
    made_at: datetime


class SignalRef(BaseModel):
    id: int
    topic: str
    reason: str | None = Field(default=None, description="Why signal detection flagged it, in Finnish")


class EventInfo(BaseModel):
    starts: date | None = Field(description="The first day, as the article gives it")
    ends: date | None = Field(description="The last day, for an event of several days")
    time: str | None = Field(description="The time as written, 13–16")
    place: str | None = Field(description="The city, or Verkko for an online event")
    deadline: date | None = Field(description="The last day to sign up or to send a proposal")
    line: str | None = Field(description="The newsletter's event line: 17.9.2026 | Tampere")


class TagRef(BaseModel):
    id: int
    label: str = Field(description="The YSO term's Finnish name")
    uri: str = Field(description="The term's address in YSO")
    origin: str = Field(description="source (the article's own subject words), finto (Finto AI), signal or editor")


class TopicRef(BaseModel):
    id: int
    name: str


class Copy(BaseModel):
    id: int
    url: str
    source: str | None = None
    publisher: str | None = None


class Item(BaseModel):
    id: int
    title: str
    title_fi: str | None = Field(default=None, description="The AI's Finnish title, for an article in another language")
    url: str
    publisher: str | None = Field(description="Who wrote it. Printed with the summary in the newsletter.")
    source_id: int | None
    source: str | None = Field(description="Where we found it: a feed, a site, or Telegram capture")
    source_type: str | None = Field(description="rss, crossref, webpage, dspace for archives such as Theseus, "
                                                "or manual for links sent on Telegram")
    sent_by: str | None = Field(description="Who sent the link on Telegram, if someone did")
    published_at: datetime | None
    collected_at: datetime
    language: str | None = Field(description="Language of the original: fi, en, no, or null if not known")
    status: str = Field(description="new, queued, summarised, filtered_out, summary_failed, manual, or on_request "
                                    "for an archive item that is summarised only when an editor picks it")
    status_reason: str | None = Field(description="Why it has that status, in plain words")
    section: str | None = Field(description="events, member_news or highlights, once an editor picks one")
    excerpt: str | None = Field(description="The publisher's own short description")
    text_length: int = Field(description="Characters of article text we have")
    text_removed_at: datetime | None = Field(default=None, description="When the text went, after the retention period")
    summary: Summary | None
    details: dict | None = Field(description="What the source knows beyond the shared fields. For a thesis: "
                                             "kind, level, programme and licence")
    picture: Picture | None = Field(default=None, description="The picture from the article's own page, "
                                    "once n8n has found it")
    from_archive: bool = Field(description="From an archive such as Theseus: summarised only on request, "
                                           "and in a topic only with a learning tag")
    abstract: str | None = Field(description="The author's own abstract, for an archive item")
    duplicate_of: int | None = Field(description="The article this one repeats, if it is the same story")
    duplicate_of_title: str | None
    copies: list[Copy] = Field(description="The same story collected from other places")
    signals: list[SignalRef] = Field(description="Topics the signal detection linked to this article")
    tags: list[TagRef] = Field(description="YSO terms on the article, the most telling first")
    topics: list[TopicRef] = Field(description="The topics its tags put it in")
    needs_learning_tag: bool = Field(description="An archive item with no learning tag, so in no topic")
    tags_pending: bool = Field(description="Its tags are still being made, within 15 minutes")
    event: EventInfo | None = Field(default=None, description="For an event: when, where and the last day to sign up")
    seen: bool = Field(default=False, description="The editor asking has opened it")
    can_request_summary: bool = Field(description="Whether POST /api/items/{id}/summarise would accept it")
    decision: str | None = Field(description="picked, later or dismissed, or null if nobody has decided")
    pick_section: str | None = Field(description="For a picked article: own_news, events, member_news, highlights "
                                       "or training")
    pick_issue_id: int | None
    pick_issue_name: str | None
    pick_issue_status: str | None = Field(description="draft, or sent once that newsletter has gone out")
    decided_by: str | None
    decided_at: datetime | None
    suggested_section: str = Field(description="The section it most likely belongs in, as the default when picking "
                                   "(services/suggest.py)")
    suggestion_reason: str | None = Field(default=None, description="Why: chosen, event, deadline, invitation, "
                                          "member_post, source_section, own_site, member_site, association_named, "
                                          "member_named or drive_folder; none for Nostoja kentältä")
    suggestion_detail: str | None = Field(default=None, description="What the reason names: the member, or the day "
                                          "of the event or of the deadline")


class Counts(BaseModel):
    inbox: int
    unseen: int = Field(description="Of those in inbox, the ones the editor asking has not opened")
    review: int
    picked: int
    later: int
    dismissed: int
    used: int
    waiting: int
    skipped: int
    attention: int
    open: int
    all: int


class ItemPage(BaseModel):
    items: list[Item]
    total: int = Field(description="Articles in the chosen view that match the filters")
    page: int
    per_page: int
    counts: Counts = Field(description="How many match the filters in each view, for the buttons")
    tag_label: str | None = Field(default=None, description="The name of the tag filtered by, if one is")


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
