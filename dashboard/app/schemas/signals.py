"""Weak signals, as the articles page lists them."""

from datetime import date, datetime

from pydantic import BaseModel, Field


class SignalArticle(BaseModel):
    id: int
    title: str
    url: str | None
    publisher: str | None
    published_at: datetime | None


class Signal(BaseModel):
    id: int
    topic: str = Field(description="One or two words in Finnish, such as tekoäly")
    kind: str
    reason: str = Field(description="Why, in one sentence, from the article that scored highest")
    score: float | None = Field(description="0 to 1, how clearly the model saw something new or growing")
    period_start: date = Field(description="The time window that was read")
    period_end: date
    detected_on: date
    articles: int
    items: list[SignalArticle] = Field(description="The articles it came from, newest first")


class Signals(BaseModel):
    latest: date | None = Field(description="The day of the latest run, whose signals are the current ones")
    signals: list[Signal]
