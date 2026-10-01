"""Notes Kaisa and Niina leave each other on an issue, like the comments in
Mailchimp's editor. Anyone can resolve or reopen one; only whoever wrote a
comment, or an admin, can delete it.
Jira: DM42-37
"""

from ..queries import comments as queries
from ..queries import issues as issue_queries
from ..schemas.comments import Comment


class NotFound(Exception):
    pass


class NotYours(Exception):
    pass


def listed(issue_id):
    if not issue_queries.one(issue_id):
        raise NotFound()
    return [Comment(**row) for row in queries.listed(issue_id)]


def add(issue_id, body, block_id, block_label, user_id):
    if not issue_queries.one(issue_id):
        raise NotFound()
    return Comment(**queries.one(queries.add(issue_id, body.strip(), block_id, block_label, user_id)))


def resolve(comment_id, resolved, user_id):
    if not queries.resolve(comment_id, resolved, user_id):
        raise NotFound()
    return Comment(**queries.one(comment_id))


def remove(comment_id, user):
    found = queries.one(comment_id)
    if not found:
        raise NotFound()
    if found["created_by_id"] != user.id and user.role != "admin":
        raise NotYours()
    queries.remove(comment_id)
