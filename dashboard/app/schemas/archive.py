"""The association's past newsletters, compared with what the system has."""

from datetime import date, datetime

from pydantic import BaseModel, Field


class ArchiveIssue(BaseModel):
    id: int
    subject: str
    sent_on: date | None
    url: str = Field(description="The newsletter in the public archive")
    imported_at: datetime
    entries: int = Field(description="Links the newsletter chose")
    followed: int = Field(description="Of those, links on a site the system follows")
    collected: int = Field(description="Of those, articles the system has collected, at any time")
    in_time: int = Field(description="Of those, collected by the day the newsletter went out")
    made_here: int | None = Field(default=None, description="The newsletter made in the dashboard that this is, "
                                  "by its subject line or the day it was sent")


class ArchiveEntry(BaseModel):
    id: int
    position: int
    heading: str | None = Field(description="The heading the link stood under")
    link_text: str | None
    url: str
    host: str | None
    followed: bool = Field(description="A source the system follows is on this site")
    item_id: int | None = Field(description="The article, when the system collected it")
    item_title: str | None
    item_status: str | None
    item_source: str | None
    collected_at: datetime | None
    in_time: bool = Field(description="Collected by the day the newsletter went out")
    picked: bool = Field(default=False, description="Picked for it in the dashboard, for a newsletter made there")


class SurfacedItem(BaseModel):
    id: int
    title: str
    url: str | None
    source: str | None
    collected_at: datetime


class MadeHere(BaseModel):
    id: int
    name: str
    sent_at: datetime | None
    picked: int = Field(description="Articles picked for it in the dashboard")
    sent: int = Field(description="Of those, the ones whose link is in the email that went out")


class PickNotSent(BaseModel):
    id: int
    title: str
    section: str | None
    source: str | None


class ArchiveComparison(BaseModel):
    issue: ArchiveIssue
    entries: list[ArchiveEntry]
    surfaced: list[SurfacedItem] = Field(
        description="Summarised in the 30 days before it went out, and not in it")
    made_here: MadeHere | None = Field(default=None, description="The newsletter made in the dashboard that this is")
    picked_not_sent: list[PickNotSent] = Field(default=[], description="Picked for it in the dashboard, and not in "
                                               "the email that went out")


class ArchiveSource(BaseModel):
    url: str | None = Field(description="The archive's home page; null until an admin gives it")
    read_at: datetime | None = Field(default=None, description="When the archive was last read")
    imported_at: datetime | None = Field(description="When a newsletter was last brought in")
    newsletters: int = Field(description="How many have been brought in")


class ArchiveSourceIn(BaseModel):
    url: str = Field(max_length=500, description="https://<dc>.campaign-archive.com/home/?u=…&id=…")


class ArchiveImport(BaseModel):
    listed: int = Field(description="Newsletters the archive lists")
    imported: int = Field(description="Of those, the ones brought in now: the ones not here before")
    source: ArchiveSource
