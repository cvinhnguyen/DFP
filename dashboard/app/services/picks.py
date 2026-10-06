"""What an editor decides about an article: put it in the newsletter, keep it
for later, or not use it. A pick, a move to another section and a pick taken
out are written into the newsletter's history (37-planning.sql).
Jira: DM42-32, DM42-37
"""

from ..queries import issues as issue_queries
from ..queries import items as item_queries
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
    # What the dashboard suggests for the article right now goes with the
    # decision, so it can be seen later how often the suggestion was right
    # (services/suggestions.py).
    item = items.get_item(item_id, user.id)   # raises NotFound
    suggested = (item.suggested_section, item.suggestion_reason)
    current = queries.current(item_id)
    if current and current["decision"] == "picked" and current["issue_status"] == "sent":
        raise AlreadyUsed(current["issue_name"])
    target = None
    if decision is None:
        queries.clear(item_id)
    elif decision == "picked":
        if not section:
            raise NeedSection()
        if issue_id is not None:
            found = issues.get(issue_id)
            if found.status != "draft":
                raise NotADraft()
        target = issue_id or issues.current_id(user.id)
        queries.decide(item_id, "picked", target, section, user.id, *suggested)
        # A thesis waits without an AI summary until it is picked. Now it is,
        # so it goes to the AI, in the editor's name, within 15 minutes.
        if items.get_item(item_id, user.id).status == "on_request":
            item_queries.request_summary(item_id, user.name)
    else:
        queries.decide(item_id, decision, None, None, user.id, *suggested)
    entries = history(current, decision, target, section, item.title_fi or item.title, item_id)
    if entries:
        issue_queries.log(None, user.id, entries)
    return items.get_item(item_id, user.id)


def history(before, decision, issue_id, section, title, item_id):
    """What a decision says in the newsletters' histories: taken out of the
    one it was in, picked into one, or moved to another section of the same.
    before is the pick as it was, or None."""
    was = before if before and before["decision"] == "picked" else None
    entries = []
    if was and (decision != "picked" or was["issue_id"] != issue_id):
        entries.append({"issue_id": was["issue_id"], "kind": "removed", "section": was["section"]})
    if decision == "picked":
        if was and was["issue_id"] == issue_id:
            if was["section"] != section:
                entries.append({"issue_id": issue_id, "kind": "moved", "section": section,
                                "from_section": was["section"]})
        else:
            entries.append({"issue_id": issue_id, "kind": "picked", "section": section})
    return [{**e, "item_id": item_id, "title": title} for e in entries]
