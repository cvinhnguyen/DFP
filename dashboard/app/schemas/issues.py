"""What the newsletter endpoints take and return."""

from datetime import datetime
from typing import Literal

from pydantic import BaseModel, Field

# The parts of the newsletter the tool fills from collected articles. The
# rest (the greeting, tips, the calendar) the editors write themselves.
SectionKey = Literal["highlights", "events", "own_news"]
DecisionKind = Literal["picked", "later", "dismissed"]


class DecisionIn(BaseModel):
    decision: DecisionKind | None = Field(description="picked, later or dismissed; null takes the decision back")
    section: SectionKey | None = Field(default=None, description="Where a picked article goes: highlights, events or own_news")
    issue_id: int | None = Field(default=None, description="Which draft a picked article goes into; the current one when left out")


class PickedArticle(BaseModel):
    id: int
    section: str
    title: str
    url: str
    publisher: str | None
    source: str | None
    language: str | None
    summary: str | None
    excerpt: str | None
    published_at: datetime | None
    decided_by: str | None
    decided_at: datetime


class IssueSummary(BaseModel):
    id: int
    name: str
    status: str = Field(description="draft, or sent once it has gone out from Mailchimp")
    subject: str
    template: str | None = Field(description="What the issue started from: builtin:<key>, saved:<id>, issue:<id>")
    picked: int = Field(description="Articles picked for it")
    has_design: bool
    design_saved_at: datetime | None
    design_saved_by: str | None
    updated_by: str | None
    open_comments: int
    mailchimp_status: str | None = Field(description="Mailchimp's word for its draft: save, schedule, sending, sent")
    mailchimp_exported_at: datetime | None
    mailchimp_web_id: int | None
    current: bool = Field(default=False, description="New picks go into this one")
    created_at: datetime
    updated_at: datetime
    sent_at: datetime | None


class Issue(IssueSummary):
    preheader: str
    html: str | None = Field(description="The finished email from the editor's last save, or null before the first")
    mailchimp_campaign_id: str | None
    mailchimp_exported_by: str | None
    mailchimp_checked_at: datetime | None
    mailchimp_send_time: datetime | None
    mailchimp_emails_sent: int | None
    mailchimp_changed: bool = Field(default=False, description="Changed in the dashboard since it was exported to Mailchimp")
    mailchimp_url: str | None = Field(default=None, description="The draft in Mailchimp, for an editor to open")
    articles: list[PickedArticle]


class IssueCreate(BaseModel):
    name: str | None = Field(default=None, max_length=120, description="Named after the month when left out")
    template: str | None = Field(default=None, pattern=r"^(builtin:[a-z]{2,20}|saved:\d{1,9}|issue:\d{1,9})$",
                                 description="What it starts from: builtin:<key>, saved:<id> or issue:<id>")


class IssueUpdate(BaseModel):
    name: str | None = Field(default=None, min_length=1, max_length=120)
    subject: str | None = Field(default=None, max_length=200)
    preheader: str | None = Field(default=None, max_length=200)


class DesignOut(BaseModel):
    design: dict | None
    saved_at: datetime | None = Field(description="Send this back as based_on when saving")


class DesignIn(BaseModel):
    design: dict
    html: str = Field(max_length=3_000_000, description="The finished email as a whole HTML document")
    based_on: datetime | None = Field(default=None, description="saved_at of the layout this was edited from")
    force: bool = Field(default=False, description="Save even if someone else has saved since")


class DesignSaved(BaseModel):
    saved_at: datetime
