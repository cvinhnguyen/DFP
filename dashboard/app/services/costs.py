"""What the AI costs, and the monthly budget (db/init/24-ai-budget.sql).
Jira: DM42-39
"""

from ..queries import costs as queries
from ..schemas.costs import Budget, Costs, IssueCost, Month


def budget():
    found = queries.budget()
    state = ("none" if not found["budget_eur"]
             else "over" if found["over"] else "warn" if found["warn"] else "ok")
    return Budget(budget_eur=found["budget_eur"], spent_eur=found["spent_eur"], share=found["share"],
                  state=state, next_month=found["next_month"],
                  waiting=queries.waiting_for_budget() if found["over"] else 0)


def report():
    used = queries.model()
    return Costs(budget=budget(), provider=used["provider"], model=used["model"],
                 paid_rate_model=used["paid_rate_model"],
                 months=[Month(**m) for m in queries.months()],
                 issues=[IssueCost(**i) for i in queries.issues()])


def set_budget(eur):
    # Cents are enough; the setting is text, so keep it tidy.
    queries.set_budget(f"{round(eur, 2):g}")
    return report()
