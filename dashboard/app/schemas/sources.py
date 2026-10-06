"""What the source endpoints take and return (Asetukset → Lähteet)."""

from datetime import date, datetime
from typing import Literal

from pydantic import BaseModel, Field

from .issues import SectionKey

# How a source is read:
#   rss       its feed
#   crossref  a journal, through api.crossref.org
#   webpage   the association's own site, by its crawler
#   dspace    an archive such as Theseus
#   watch     one of its pages, watched for new links (services/watch.py)
#   drive     the association's Drive folder
#   manual    the links the team sends to the Telegram bot
SourceType = Literal["rss", "crossref", "webpage", "dspace", "watch", "drive", "manual"]
FilterMode = Literal["always", "keywords", "on_request"]
PictureRights = Literal["own", "open", "check", "none"]
# How a source is doing:
#   ok        its last check went well, and it brings articles
#   failed    its last check ended in an error
#   quiet     checked, but nothing new for 60 days, or nothing at all
#             after two weeks
#   waiting   added, not checked yet
#   checking  being checked now
#   unread    switched on, but nothing reads it: a site that would need a
#             reader of its own
#   off       switched off
Health = Literal["ok", "failed", "quiet", "waiting", "checking", "unread", "off"]


class SourceCan(BaseModel):
    check: bool = Field(description="Can be checked now: switched on, and read by the collection schedule")
    switch: bool = Field(description="Can be switched on and off here")
    edit_address: bool = Field(description="Can be given a new address")
    filter: bool = Field(description="What comes in from it can be chosen")
    section: bool = Field(description="A section can be suggested for its articles")
    delete: bool = Field(description="Can be deleted: it never brought an article")


class SourceRow(BaseModel):
    id: int
    name: str
    url: str
    homepage: str | None
    type: str
    language: str | None
    publisher: str | None
    active: bool
    filter_mode: str
    fetch_full_text: bool
    picture_rights: str
    suggested_section: str | None
    notes: str | None
    created_at: datetime
    last_checked_at: datetime | None
    changed_at: datetime | None
    changed_by: str | None
    added_by: str | None
    total: int = Field(description="Articles it has brought")
    new_30: int = Field(description="Of those, in the last 30 days")
    last_item_at: datetime | None
    picked: int = Field(description="Its articles picked into a newsletter")
    sent: int = Field(description="Its articles in a newsletter that went out")
    runs_30: int = Field(description="Checks in the last 30 days")
    errors_30: int = Field(description="Of those, ended in an error")
    running: bool
    last_run_at: datetime | None
    last_found: int | None
    last_new: int | None
    last_error: str | None
    weeks: list[int] = Field(description="New articles a week for the last twelve weeks, the oldest first")
    health: Health
    can: SourceCan


class SourceList(BaseModel):
    sources: list[SourceRow]
    collection_times: str = Field(description="When the sources are checked, Finnish time, or off")
    next_check_at: datetime | None


class SourceRun(BaseModel):
    started_at: datetime
    finished_at: datetime | None
    items_found: int | None
    items_new: int | None
    error: str | None


class SourceArticle(BaseModel):
    id: int
    title: str
    url: str
    created_at: datetime
    status: str
    decision: str | None


class SiteSource(BaseModel):
    id: int
    name: str
    active: bool
    type: str


class SourceDetail(SourceRow):
    runs: list[SourceRun]
    latest: list[SourceArticle]
    on_site: list[SiteSource] = Field(description="Other sources read from the same site")


class LookupIn(BaseModel):
    address: str = Field(min_length=3, max_length=500, description="A site's or a feed's address, or a journal's ISSN")


class LookupArticle(BaseModel):
    title: str
    url: str
    published_at: datetime | None


class ListingPage(BaseModel):
    url: str
    title: str


class LookupOut(BaseModel):
    kind: Literal["feed", "journal", "page", "none", "blocked"]
    type: Literal["rss", "crossref", "watch"] | None = None
    url: str | None = Field(default=None, description="The address the source would be read from")
    homepage: str | None = None
    name: str | None = None
    publisher: str | None = None
    language: str | None = None
    items: list[LookupArticle] = []
    links: int | None = Field(default=None, description="For a page: how many article links it has now")
    per_month: float | None = Field(default=None, description="About how many articles a month")
    full_text: bool = Field(default=False, description="Its articles' own pages may be read in full")
    issn: str | None = None
    message: str | None = None
    via: str | None = Field(default=None, description="The site's news or events page the feed was found from")
    listings: list[ListingPage] = Field(default=[], description="The site's pages that list its news and events, "
                                                                  "to watch or look at instead")
    existing: SiteSource | None = Field(default=None, description="A source already read from this address")
    on_site: list[SiteSource] = Field(default=[], description="Sources already read from the same site")
    section: SectionKey | None = Field(default=None, description="The section to start from")
    filter_mode: FilterMode | None = Field(default=None, description="What comes in, to start from")
    picture_rights: PictureRights | None = None


class SourceIn(BaseModel):
    url: str = Field(min_length=10, max_length=500)
    type: Literal["rss", "crossref", "watch"]
    name: str = Field(min_length=1, max_length=120)
    homepage: str | None = Field(default=None, max_length=500)
    publisher: str | None = Field(default=None, max_length=120)
    language: str | None = Field(default=None, pattern=r"^[a-z]{2}$")
    filter_mode: FilterMode = "keywords"
    fetch_full_text: bool = False
    picture_rights: PictureRights = "check"
    section: SectionKey | None = None
    import_existing: bool = Field(default=False, description="For a watched page: its articles now become "
                                                              "articles too, instead of only the new ones")


class SourceUpdate(BaseModel):
    name: str | None = Field(default=None, min_length=1, max_length=120)
    publisher: str | None = Field(default=None, max_length=120)
    language: str | None = Field(default=None, pattern=r"^[a-z]{2}$")
    filter_mode: FilterMode | None = None
    notes: str | None = Field(default=None, max_length=1000)
    active: bool | None = None
    url: str | None = Field(default=None, min_length=10, max_length=500, description="A new address, from a lookup")
    type: Literal["rss", "crossref", "watch"] | None = Field(default=None, description="With a new address")
    homepage: str | None = Field(default=None, max_length=500)
    fetch_full_text: bool | None = None


class Suggestion(BaseModel):
    host: str
    website: str | None
    member: str | None = Field(description="The member organisation whose site it is")
    links: int = Field(description="Links to it in the past newsletters")
    newsletters: int = Field(description="Past newsletters that linked to it")
    last_sent: date | None
    result: Literal["feed", "page", "none", "blocked", "failed"] | None = Field(
        description="What looking at it found; null before it has been looked at")
    feed_url: str | None
    feed_title: str | None
    feed_items: int | None
    per_month: float | None
    checked_at: datetime | None
    dismissed: bool
    dismissed_by: str | None


class SuggestionList(BaseModel):
    suggestions: list[Suggestion]
    looking: bool = Field(description="The sites are being looked at now; the list changes as they are")


class Dismissed(BaseModel):
    dismissed: bool = True


class WatchResult(BaseModel):
    items_found: int
    items_new: int
    error: str | None
