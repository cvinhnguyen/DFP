"""What the AI costs, as the settings page shows it."""

from datetime import date, datetime

from pydantic import BaseModel, Field


class Budget(BaseModel):
    budget_eur: float = Field(description="The monthly budget. 0 means no cap.")
    spent_eur: float = Field(description="Spent this month, Finnish time")
    share: float | None = Field(description="spent / budget, or null without a budget")
    state: str = Field(description="ok, warn at 80 %, over when used up, or none without a budget")
    next_month: date = Field(description="When the month's spending starts again from nothing")
    waiting: int = Field(description="Articles held back by the budget")


class Month(BaseModel):
    month: str = Field(description="YYYY-MM, Finnish time")
    calls: int
    cached: int = Field(description="Answers that came from the cache, at no cost")
    tokens_in: int
    tokens_out: int
    eur: float
    paid_rate_eur: float | None = Field(description="The same tokens at the model's paid rate, when ours is free")
    filtered: int = Field(description="Articles the pre-filter left out before the AI")
    saved_tokens: int = Field(description="About what those would have taken, at that month's average per summary")
    on_request: int = Field(description="Theses that wait for an editor to ask before they are summarised")


class IssueCost(BaseModel):
    id: int
    name: str
    status: str
    date: datetime = Field(description="When it was sent, or made for a draft")
    articles: int
    tokens: int = Field(description="The AI work for the articles in it")
    eur: float
    period_since: datetime | None = Field(description="The newsletter before it, where the period starts")
    period_tokens: int = Field(description="All AI work from the newsletter before it until this one")
    period_eur: float


class Costs(BaseModel):
    budget: Budget
    provider: str | None
    model: str | None
    paid_rate_model: str | None = Field(description="The paid model whose rate paid_rate_eur uses")
    months: list[Month]
    issues: list[IssueCost]


class BudgetChange(BaseModel):
    eur: float = Field(ge=0, le=100000, description="The new monthly budget in euros. 0 means no cap.")
