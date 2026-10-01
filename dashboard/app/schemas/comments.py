"""What the comment endpoints take and return."""

from datetime import datetime

from pydantic import BaseModel, Field


class Comment(BaseModel):
    id: int
    issue_id: int
    block_id: str | None = Field(description="The block of the email the comment is about, if any")
    block_label: str | None = Field(description="What that block was, for when it has since been deleted")
    body: str
    created_by: str | None
    created_by_id: int | None
    created_at: datetime
    resolved_at: datetime | None
    resolved_by: str | None


class CommentIn(BaseModel):
    body: str = Field(min_length=1, max_length=2000)
    block_id: str | None = Field(default=None, max_length=40)
    block_label: str | None = Field(default=None, max_length=200)


class CommentUpdate(BaseModel):
    resolved: bool
