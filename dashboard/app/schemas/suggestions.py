"""How the suggested sections fare, and the sections the editors choose for
sources."""

from datetime import datetime
from typing import Literal

from pydantic import BaseModel, Field

from .items import Section


class ReasonStats(BaseModel):
    reason: str = Field(description="Why the section was suggested, as suggestion_reason on an article; "
                                    "none for Nostoja kentältä when nothing else fitted")
    picks: int
    kept: int = Field(description="How many of them went to the section suggested")
    moved_to: str | None = Field(description="The section the others went to most often")
    moved_to_picks: int


class SourceStats(BaseModel):
    source_id: int | None
    source: str | None
    picks: int
    kept: int
    moved_to: str | None
    moved_to_picks: int
    section: str | None = Field(description="The section the editors chose to suggest for the source's articles")
    chosen_by: str | None
    chosen_at: datetime | None
    mixed: bool = Field(description="The Telegram capture: links from all kinds of sites, so no section is "
                                    "chosen for it")


class SuggestionStats(BaseModel):
    picks: int = Field(description="Picks made since the dashboard began keeping what it suggested")
    kept: int = Field(description="How many of them went to the section suggested")
    reasons: list[ReasonStats]
    sources: list[SourceStats]


class Offer(BaseModel):
    source_id: int
    source: str
    kind: Literal["set", "stop"] = Field(description="set: suggest section for the source from now on; stop: stop "
                                                     "suggesting section, chosen for the source before")
    section: str
    suggested: str | None = Field(description="For set, the section suggested for each of the picks, when it "
                                              "was the same one")
    picks: int = Field(description="How many picks in a row the question is about")


class Offers(BaseModel):
    offers: list[Offer]


class SourceSectionIn(BaseModel):
    section: Section | None = Field(description="The section to suggest for the source's articles; null to stop "
                                                "suggesting one")


class SourceSection(BaseModel):
    source_id: int
    source: str
    section: str | None
