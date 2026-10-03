"""The association's member organisations."""

from datetime import datetime

from pydantic import BaseModel, Field


class Member(BaseModel):
    name: str
    website: str
    kind: str = Field(description="voting or supporting: a päättävä or kannattava yhteisöjäsen")


class Members(BaseModel):
    members: list[Member]
    read_at: datetime | None = Field(description="When the members page was last read; null before the first time")
