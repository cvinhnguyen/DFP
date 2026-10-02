"""What the AI costs, and the monthly budget.
Jira: DM42-39
"""

from fastapi import APIRouter, Depends

from ..dependencies import admin_only
from ..schemas.costs import BudgetChange, Costs
from ..services import costs

router = APIRouter(tags=["costs"])


@router.get("/costs", response_model=Costs, summary="AI costs this month, by month and by newsletter")
def report():
    """Every AI call is in llm_usage with its tokens and estimated price. The
    budget's state: warn at 80 %, over when used up, when articles from the
    sources wait and only what editors ask for is summarised."""
    return costs.report()


@router.put("/costs/budget", response_model=Costs, summary="Change the monthly AI budget (admins)",
            dependencies=[Depends(admin_only)])
def set_budget(body: BudgetChange):
    """Takes effect at once: raising a budget that is used up starts the
    summaries again at the next run, within 15 minutes."""
    return costs.set_budget(body.eur)
