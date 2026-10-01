"""What the status line above the list is built from."""

from datetime import datetime

from pydantic import BaseModel, Field


class FailedSource(BaseModel):
    source: str
    error: str
    at: datetime


class Overview(BaseModel):
    last_check_at: datetime | None = Field(description="When a source check last finished")
    checking_now: bool = Field(description="A check of the sources is running")
    failed_sources: list[FailedSource] = Field(description="Active sources whose last check failed")
    next_check_at: datetime | None = Field(description="The next automatic check, or null when they are off")
    collection_times: str = Field(description="The editors' check times, Finnish time, or off")
    new_today: int = Field(description="Articles collected today, Finnish time")
    waiting: int = Field(description="Articles waiting for the AI")
    waiting_for_ai: int = Field(description="Of those, the ones the AI did not answer for last time")
    needs_attention: int = Field(description="Articles whose summary failed or whose source forbids AI summaries")
    ai_answering: bool | None = Field(description="Whether the model server answered just now. Null if it cannot be checked.")
