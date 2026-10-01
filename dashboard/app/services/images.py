"""Images the editors upload for the newsletter.

Every image is opened and saved again, which does three things: it proves the
file really is a picture, it shrinks big photos to what an email needs, and it
drops the camera's metadata, which can include where the photo was taken.
"""

from io import BytesIO

from PIL import Image, ImageOps, UnidentifiedImageError

from ..queries import images as queries

MAX_BYTES = 10 * 1024 * 1024
# Twice the newsletter's 660 pixels, so pictures stay sharp on phone screens.
MAX_WIDTH = 1320
# A guard against files that unpack into enormous images.
Image.MAX_IMAGE_PIXELS = 40_000_000

READABLE = {"JPEG", "PNG", "GIF", "WEBP"}


class BadImage(Exception):
    def __init__(self, code, message):
        super().__init__(message)
        self.code = code


def _prepare(raw):
    if len(raw) > MAX_BYTES:
        raise BadImage("image_too_big", "The image is over 10 MB. Save it smaller and try again.")
    try:
        picture = Image.open(BytesIO(raw))
        picture.load()
    except (UnidentifiedImageError, OSError, Image.DecompressionBombError):
        raise BadImage("not_an_image", "That file is not a picture the newsletter can use (JPEG, PNG, GIF or WebP).")
    if picture.format not in READABLE:
        raise BadImage("not_an_image", "That file is not a picture the newsletter can use (JPEG, PNG, GIF or WebP).")

    # An animated GIF keeps its animation; GIFs carry no camera metadata.
    if picture.format == "GIF" and getattr(picture, "is_animated", False):
        return "image/gif", raw, picture.width, picture.height

    # Phones store a photo sideways and say how to turn it; turn it now,
    # because the note saying so is dropped below.
    picture = ImageOps.exif_transpose(picture)
    if picture.width > MAX_WIDTH:
        picture.thumbnail((MAX_WIDTH, MAX_WIDTH * 20))
    out = BytesIO()
    see_through = picture.mode in ("RGBA", "LA") or (picture.mode == "P" and "transparency" in picture.info)
    # WebP is left out: Outlook cannot show it.
    if see_through:
        picture.save(out, "PNG", optimize=True)
        mime = "image/png"
    else:
        picture.convert("RGB").save(out, "JPEG", quality=85, optimize=True, progressive=True)
        mime = "image/jpeg"
    return mime, out.getvalue(), picture.width, picture.height


def upload(raw, filename, issue_id, user_id):
    mime, data, width, height = _prepare(raw)
    key = queries.add(issue_id, (filename or "")[:200] or None, mime, data, width, height, user_id)
    return _shape({"key": key, "filename": filename, "width": width, "height": height, "created_at": None})


def _shape(row):
    return {"key": str(row["key"]), "src": f"/media/{row['key']}", "type": "image",
            "width": row["width"], "height": row["height"], "name": row["filename"] or "image",
            "created_at": row["created_at"].isoformat() if row.get("created_at") else None,
            "bytes": row.get("bytes")}


def listed(query=None, issue_id=None, page=1, per_page=24):
    per_page = max(1, min(100, per_page))
    page = max(1, page)
    rows, total = queries.page((query or "").strip(), issue_id, per_page, (page - 1) * per_page)
    return {"data": [_shape(r) for r in rows], "total": total, "page": page, "per_page": per_page}


def get(key):
    return queries.by_key(key)


class InUse(Exception):
    def __init__(self, names):
        super().__init__("The image is used in a newsletter, so it stays.")
        self.names = names


def remove(key):
    """Deletes an image no newsletter or saved template uses. One that is
    used stays: deleting it would leave a hole in an email already sent."""
    names = queries.used_in(key) + queries.used_in_templates(key)
    if names:
        raise InUse(names)
    return queries.remove(key)
