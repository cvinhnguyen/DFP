"""Topics, and the tags on articles: listing the topics, following one, and an
editor adding or taking off a tag.
Jira: DM42-31

A tag is a YSO term. Most come from the tagging workflow in n8n; an editor
adds one when an article has none, or takes off one that is wrong.
"""

from ..queries import settings
from ..queries import topics as queries
from ..schemas.topics import Topic, TopicCounts, TopicList, YsoTerm
from . import items, yso


class NoSuchTopic(Exception):
    pass


class NoSuchTag(Exception):
    pass


def list_topics():
    return TopicList(topics=[Topic(**t) for t in queries.topics()],
                     untopiced=TopicCounts(**queries.untopiced()),
                     window_days=settings.get_int("filter_max_age_days", 30))


def follow(topic_id, followed, user_id):
    if not queries.follow(topic_id, followed, user_id):
        raise NoSuchTopic()
    return Topic(**queries.topic(topic_id))


def search_terms(text):
    """Raises yso.Unreachable when Finto does not answer."""
    return [YsoTerm(**t) for t in yso.search(text)]


def add_tag(item_id, uri, user_id):
    """The name comes from YSO itself, not from the page, so a tag cannot be
    stored under a wrong name. Raises yso.NotATerm or yso.Unreachable."""
    items.get_item(item_id)   # raises NotFound
    queries.add_tag(item_id, uri, yso.label(uri), user_id)
    return items.get_item(item_id)


def remove_tag(item_id, tag_id, user_id):
    items.get_item(item_id)   # raises NotFound
    if not queries.remove_tag(item_id, tag_id, user_id):
        raise NoSuchTag()
    return items.get_item(item_id)
