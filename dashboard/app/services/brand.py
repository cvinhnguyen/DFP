"""The banners and logo new emails start with. The association's own are
the editor's defaults (web/js/newsletter/brand.js); an admin can put other
pictures from Kuvapankki in their place, and go back to the association's
own, on Asetukset. Kept in app_settings, db/init/27-brand.sql.
Jira: DM42-37
"""

import json
import re

from ..queries import images as image_queries
from ..queries import settings

KEYS = {"newsletter": "brand_newsletter_banner", "members": "brand_members_banner", "logo": "brand_logo"}
# What Kuvapankki calls them, when a picture cannot be deleted because of one.
NAMES = {"newsletter": "Uutiskirjeen banneri", "members": "Jäsenkirjeen banneri", "logo": "Logo"}
MEDIA = re.compile(r"^/media/([0-9a-f-]{36})$")


class NoSuchImage(Exception):
    pass


def current():
    """The picture chosen for each, or None for the association's own."""
    return {which: _read(settings.get(key) or "") for which, key in KEYS.items()}


def _read(value):
    try:
        found = json.loads(value) if value else None
    except ValueError:
        return None
    if not isinstance(found, dict) or not MEDIA.match(str(found.get("src", ""))):
        return None
    return {"src": found["src"], "width": int(found.get("width") or 0), "height": int(found.get("height") or 0)}


def choose(which, src):
    """Puts a picture from Kuvapankki in the place of one. Raises NoSuchImage
    for an address that is not one."""
    m = MEDIA.match(src or "")
    found = image_queries.by_key(m.group(1)) if m else None
    if not found:
        raise NoSuchImage()
    settings.put(KEYS[which], json.dumps({"src": src, "width": found["width"], "height": found["height"]}))
    return current()


def reset(which):
    """Back to the association's own."""
    settings.put(KEYS[which], "")
    return current()


def used_for(key):
    """What the uploaded picture with this key is chosen for, by name."""
    return [NAMES[which] for which, chosen in current().items() if chosen and chosen["src"] == f"/media/{key}"]
