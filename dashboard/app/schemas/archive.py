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


class SurfacedItem(BaseModel):
    id: int
    title: str
    url: str | None
    source: str | None
    collected_at: datetime


class ArchiveComparison(BaseModel):
    issue: ArchiveIssue
    entries: list[ArchiveEntry]
    surfaced: list[SurfacedItem] = Field(
        description="Summarised in the 30 days before it went out, and not in it")
