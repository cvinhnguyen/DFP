"""Designs the editors save to start from again: a whole email, from the
editor's Save as template, or one section, from Save section. Shared by
everyone; anyone can rename or delete one.
Jira: DM42-37
"""

import json

from ..queries import templates as queries
from ..schemas.templates import Template

# A saved design is the editor's JSON, without images (those are addresses).
# Anything far bigger than an email's design is a mistake.
MAX_DESIGN_BYTES = 1_000_000


class NotFound(Exception):
    pass


class TooBig(Exception):
    pass


def _check(design):
    if design is not None and len(json.dumps(design)) > MAX_DESIGN_BYTES:
        raise TooBig()


def listed(kind):
    return [Template(**row) for row in queries.listed(kind)]


def get(template_id):
    found = queries.one(template_id)
    if not found:
        raise NotFound()
    return Template(**found)


def add(kind, name, design, user_id):
    _check(design)
    return get(queries.add(kind, name.strip(), design, user_id))


def update(template_id, name, design, user_id):
    _check(design)
    if not queries.update(template_id, name.strip() if name else None, design, user_id):
        raise NotFound()
    return get(template_id)


def remove(template_id):
    if not queries.remove(template_id):
        raise NotFound()
