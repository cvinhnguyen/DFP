"""How long the text of collected articles is kept."""

from datetime import datetime

from pydantic import BaseModel, Field


class RetentionRun(BaseModel):
    ran_at: datetime
    items_cleared: int = Field(description="Articles whose text went")
    chars_removed: int
    cache_removed: int = Field(description="Old answers taken out of the AI's cache")
    kept_in_use: int = Field(description="Old articles kept whole, because a newsletter or an editor has them")
    pictures_removed: int = Field(default=0, description="Pictures from the articles' pages that went with their text")


class Retention(BaseModel):
    keep_days: int = Field(description="Days an article's text is kept after it was collected")
    removed: int = Field(description="Articles whose text has gone so far")
    next_night: int = Field(description="Articles whose text the next night takes, at this period")
    last_run: RetentionRun | None


class RetentionChange(BaseModel):
    days: int = Field(ge=30, le=365, description="Days to keep an article's text, 30 to 365")
