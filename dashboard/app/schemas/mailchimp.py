"""What the Mailchimp endpoints take and return."""

from typing import Literal

from pydantic import BaseModel, Field


class Audience(BaseModel):
    id: str
    name: str
    members: int | None = None
    from_name: str | None = None
    from_email: str | None = None


class MailchimpState(BaseModel):
    connected: bool = Field(description="n8n reached Mailchimp with its key just now")
    problem: str | None = Field(description="Why not, as a code the pages translate")
    account_name: str | None = None
    audiences: list[Audience] = []
    server: str = Field(description="The data centre, like us4")
    audience_id: str
    plan: str = Field(description="essentials, standard or unknown")
    from_name: str
    reply_to: str
    dashboard_url: str


class MailchimpSettings(BaseModel):
    server: str | None = Field(default=None, pattern=r"^([a-z]{2,4}\d{1,3})?$")
    audience_id: str | None = Field(default=None, pattern=r"^[a-z0-9]{0,20}$")
    plan: Literal["essentials", "standard", "unknown"] | None = None
    from_name: str | None = Field(default=None, max_length=100)
    reply_to: str | None = Field(default=None, max_length=200, pattern=r"^([^@\s]+@[^@\s]+\.[^@\s]+)?$")


class TestIn(BaseModel):
    emails: list[str] = Field(min_length=1, max_length=10)


class PicturesOut(BaseModel):
    mapping: dict[str, str] = Field(description="Each picture's address in the dashboard, and where Mailchimp keeps its copy")
