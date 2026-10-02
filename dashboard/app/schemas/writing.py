"""Help from the AI with the newsletter's own text."""

from pydantic import BaseModel, Field

from .items import Item
from .signals import Signal


class Attempt(BaseModel):
    attempt: int = Field(default=1, ge=1, le=50, description="1 for the first suggestion, then 2, 3… for new ones. "
                         "The same material and attempt give the same answer from the AI's cache, at no cost")


class Usage(BaseModel):
    tokens: int | None = Field(description="Tokens read and written, as llm_usage counts them")
    cost_eur: float | None = Field(description="What it cost, 0 on a free model; null without a price on file")
    truncated: bool = Field(default=False, description="The model ran out of room, so the text stops mid-sentence")


class Subjects(Usage):
    subjects: list[str] = Field(description="Subject lines to choose from, in Finnish")
    preheaders: list[str] = Field(description="Preview texts to choose from, in Finnish")


class Draft(Usage):
    text: str = Field(description="Plain text in Finnish, paragraphs separated by a blank line")


class TrendDraft(Draft):
    signal: Signal = Field(description="The signal, as /api/signals gives it, so the box can be made again around the text")


class AskIn(BaseModel):
    question: str = Field(min_length=3, max_length=300, description="In Finnish, as the summaries are")
    days: int = Field(default=90, ge=7, le=3650, description="How far back to look, by the article's date")


class AskAnswer(Usage):
    answer: str | None = Field(description="The AI's answer, citing the articles as [1], [2]…; "
                               "null when no article fits the question, and nothing was asked")
    sources: list[Item] = Field(description="The articles it read, in the order the numbers cite them")
