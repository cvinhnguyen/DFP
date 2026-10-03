"""The picture from an article's own page, which n8n finds and downloads
(n8n/workflows/article-pictures.json) and the dashboard keeps: shown with the
article on Artikkelit, and the picture its entry in the newsletter starts
with. An editor removes or replaces it in the editor.
Jira: DM42-37, DM42-31

Kept the way an uploaded picture is (services/images.py): opened and saved
again, shrunk for email, without its metadata. Kept with it: whose it is,
from the source's picture_rights (28-article-pictures.sql), and the name the
credit under it gives.

Not kept: the same picture another article of the source came with, which
is the site's logo or placeholder rather than this article's photo, and an
icon too small to be the article's picture.
"""

import base64
import binascii
import hashlib

from ..queries import pictures as queries
from . import images

# Smaller than this is an icon or a spacer, not the article's picture.
MIN_WIDTH = 300
MIN_HEIGHT = 150


class NotFound(Exception):
    pass


def receive(item_id, url, alt, data):
    """Keeps the picture n8n found for the article, or says why not: stored,
    generic, small, failed, or none for a source whose pictures are not
    fetched."""
    found = queries.article(item_id)
    if not found:
        raise NotFound()
    alt = (alt or "").strip()[:300] or None
    if found["rights"] == "none":
        queries.mark(item_id, "none", url, alt, None)
        return {"status": "none"}
    try:
        raw = base64.b64decode(data, validate=True)
    except (binascii.Error, ValueError):
        queries.mark(item_id, "failed", url, alt, None)
        return {"status": "failed"}
    digest = hashlib.sha256(raw).hexdigest()
    if _shared(found, digest):
        queries.mark(item_id, "generic", url, alt, digest)
        queries.mark_generic(found["source_id"], digest)
        return {"status": "generic"}
    try:
        mime, kept, width, height = images.prepare(raw)
    except images.BadImage:
        queries.mark(item_id, "failed", url, alt, digest)
        return {"status": "failed"}
    if width < MIN_WIDTH or height < MIN_HEIGHT:
        queries.mark(item_id, "small", url, alt, digest)
        return {"status": "small"}
    key = queries.store(item_id, mime, kept, width, height, found["credit"], found["rights"], url, alt, digest)
    # Pictures can arrive at the same moment: a logo shared with an article
    # stored meanwhile shows only now.
    if _shared(found, digest):
        queries.mark_generic(found["source_id"], digest)
        return {"status": "generic"}
    return {"status": "stored", "src": f"/media/{key}", "width": width, "height": height}


def _shared(found, digest):
    """Whether another article of the same source came with this picture."""
    return bool(found["source_id"]) and bool(queries.same_picture(found["source_id"], digest, found["id"]))
