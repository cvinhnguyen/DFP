"""What an editor decides about an article: put it in the newsletter, keep it
for later, or not use it.
Jira: DM42-32
"""

from ..queries import picks as queries
from . import issues
from . import items


class AlreadyUsed(Exception):
    def __init__(self, issue_name):
        super().__init__(f"This article went out in {issue_name}, so the decision stays.")
        self.issue_name = issue_name


class NeedSection(Exception):
    pass


class NotADraft(Exception):
    pass


def decide(item_id, decision, section, user, issue_id=None):
    items.get_item(item_id)   # raises NotFound
    current = queries.current(item_id)
    if current and current["decision"] == "picked" and current["issue_status"] == "sent":
        raise AlreadyUsed(current["issue_name"])
    if decision is None:
        queries.clear(item_id)
    elif decision == "picked":
        if not section:
            raise NeedSection()
        if issue_id is not None:
            found = issues.get(issue_id)
            if found.status != "draft":
                raise NotADraft()
        queries.decide(item_id, "picked", issue_id or issues.current_id(user.id), section, user.id)
    else:
        queries.decide(item_id, decision, None, None, user.id)
    return items.get_item(item_id)
