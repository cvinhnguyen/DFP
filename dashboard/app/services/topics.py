"""Topics, and the tags on articles: listing and editing the topics, following
one, what a topic would bring, and an editor adding or taking off a tag.
Jira: DM42-31

A tag is a YSO term. Most come from the tagging workflow in n8n; an editor
adds one when an article has none, or takes off one that is wrong.
"""

from ..queries import settings
from ..queries import topics as queries
from ..schemas.topics import Topic, TopicCounts, TopicList, TopicPreview, YsoTerm
from . import items, yso


class NoSuchTopic(Exception):
    pass


class NoSuchTag(Exception):
    pass


class NoSuchTerm(Exception):
    pass


NameTaken = queries.NameTaken


def list_topics():
    return TopicList(topics=[Topic(**t) for t in queries.topics()],
                     untopiced=TopicCounts(**queries.untopiced()),
                     window_days=settings.get_int("filter_max_age_days", 30))


def follow(topic_id, followed, user_id):
    if not queries.follow(topic_id, followed, user_id):
        raise NoSuchTopic()
    return Topic(**queries.topic(topic_id))


def _topic(topic_id):
    found = queries.topic(topic_id)
    if not found:
        raise NoSuchTopic()
    return Topic(**found)


def create(name, user_id):
    made = queries.create(" ".join(name.split()), user_id)
    if not made:
        raise NameTaken()
    return _topic(made["id"])


def update(topic_id, name, followed, user_id):
    """Renames the topic, follows it or stops following it; what is not given
    stays as it was."""
    _topic(topic_id)
    if name is not None:
        queries.rename(topic_id, " ".join(name.split()), user_id)
    if followed is not None:
        queries.follow(topic_id, followed, user_id)
    return _topic(topic_id)


def delete(topic_id):
    if not queries.delete(topic_id):
        raise NoSuchTopic()


def add_term(topic_id, uri, user_id):
    """The term's Finnish name comes from YSO. Raises yso.NotATerm or
    yso.Unreachable."""
    _topic(topic_id)
    queries.add_term(topic_id, uri, yso.label(uri), user_id)
    return _topic(topic_id)


def remove_term(topic_id, tag_id, user_id):
    _topic(topic_id)
    if not queries.remove_term(topic_id, tag_id, user_id):
        raise NoSuchTerm()
    return _topic(topic_id)


def preview(topic_id):
    _topic(topic_id)
    return TopicPreview(**queries.preview(topic_id), window_days=settings.get_int("filter_max_age_days", 30))


def search_terms(text):
    """Raises yso.Unreachable when Finto does not answer."""
    return [YsoTerm(**t) for t in yso.search(text)]


def add_tag(item_id, uri, user_id):
    """The name comes from YSO itself, not from the page, so a tag cannot be
    stored under a wrong name. Raises yso.NotATerm or yso.Unreachable."""
    items.get_item(item_id, user_id)   # raises NotFound
    queries.add_tag(item_id, uri, yso.label(uri), user_id)
    return items.get_item(item_id, user_id)


def remove_tag(item_id, tag_id, user_id):
    items.get_item(item_id, user_id)   # raises NotFound
    if not queries.remove_tag(item_id, tag_id, user_id):
        raise NoSuchTag()
    return items.get_item(item_id, user_id)
