"""The picture a video block shows. Email cannot play video, so a video
block is its preview image with a play button on it, linked to the video,
the way Mailchimp's video block works.

Only YouTube and Vimeo addresses are read, and only their own image servers
are fetched from, so the dashboard cannot be made to fetch anything else.
"""

import json
import re
import urllib.error
import urllib.parse
import urllib.request
from io import BytesIO

from PIL import Image, ImageDraw

from . import images

YOUTUBE = re.compile(r"(?:youtube\.com/(?:watch\?(?:[^#]*&)?v=|embed/|shorts/|live/)|youtu\.be/)([A-Za-z0-9_-]{11})")
VIMEO = re.compile(r"vimeo\.com/(?:video/|channels/[^/]+/)?(\d{5,12})")
IMAGE_HOSTS = {"i.ytimg.com", "img.youtube.com", "i.vimeocdn.com"}
MAX_BYTES = 8 * 1024 * 1024


class BadVideo(Exception):
    def __init__(self, code, message):
        super().__init__(message)
        self.code = code


def _fetch(url, hosts):
    if urllib.parse.urlsplit(url).hostname not in hosts:
        raise BadVideo("video_unreachable", "The video's picture is somewhere the dashboard does not fetch from.")
    request = urllib.request.Request(url, headers={"User-Agent": "Mozilla/5.0 (newsletter dashboard)"})
    with urllib.request.urlopen(request, timeout=10) as response:
        if urllib.parse.urlsplit(response.geturl()).hostname not in hosts:
            raise BadVideo("video_unreachable", "The video's picture moved somewhere the dashboard does not fetch from.")
        data = response.read(MAX_BYTES + 1)
    if len(data) > MAX_BYTES:
        raise BadVideo("video_unreachable", "The video's picture is too big.")
    return data


def _youtube(video_id):
    title = None
    try:
        meta = _fetch(f"https://www.youtube.com/oembed?format=json&url=https%3A//www.youtube.com/watch%3Fv%3D{video_id}",
                      {"www.youtube.com"})
        title = json.loads(meta).get("title")
    except (urllib.error.URLError, OSError, ValueError, BadVideo):
        pass
    # The large picture exists for most videos; the smaller one for all.
    for name in ("maxresdefault.jpg", "hqdefault.jpg"):
        try:
            return _fetch(f"https://i.ytimg.com/vi/{video_id}/{name}", IMAGE_HOSTS), title
        except urllib.error.HTTPError:
            continue
    raise BadVideo("video_not_found", "YouTube has no picture for that video. Check the address.")


def _vimeo(video_id):
    try:
        meta = json.loads(_fetch(f"https://vimeo.com/api/oembed.json?width=1280&url=https%3A//vimeo.com/{video_id}", {"vimeo.com"}))
    except urllib.error.HTTPError:
        raise BadVideo("video_not_found", "Vimeo has no video at that address, or it is private.")
    thumb = meta.get("thumbnail_url")
    if not thumb:
        raise BadVideo("video_not_found", "Vimeo has no picture for that video.")
    return _fetch(thumb, IMAGE_HOSTS), meta.get("title")


def _with_play_button(raw):
    picture = Image.open(BytesIO(raw)).convert("RGBA")
    w, h = picture.size
    overlay = Image.new("RGBA", picture.size, (0, 0, 0, 0))
    draw = ImageDraw.Draw(overlay)
    r = max(24, int(min(w, h) * 0.13))
    cx, cy = w // 2, h // 2
    draw.ellipse((cx - r, cy - r, cx + r, cy + r), fill=(0, 0, 0, 165))
    side = r * 0.95
    draw.polygon([(cx - side * 0.38, cy - side * 0.55), (cx - side * 0.38, cy + side * 0.55), (cx + side * 0.6, cy)],
                 fill=(255, 255, 255, 240))
    out = BytesIO()
    Image.alpha_composite(picture, overlay).convert("RGB").save(out, "JPEG", quality=90)
    return out.getvalue()


def thumbnail(url, issue_id, user_id):
    """The video's preview image with a play button, saved like an uploaded
    image. Returns the image, and the video's title for its alt text."""
    url = (url or "").strip()
    match = YOUTUBE.search(url)
    try:
        if match:
            raw, title = _youtube(match.group(1))
            name = f"youtube-{match.group(1)}.jpg"
        else:
            match = VIMEO.search(url)
            if not match:
                raise BadVideo("not_a_video", "Use a YouTube or Vimeo address.")
            raw, title = _vimeo(match.group(1))
            name = f"vimeo-{match.group(1)}.jpg"
    except (urllib.error.URLError, OSError):
        raise BadVideo("video_unreachable", "Could not reach the video service. Try again in a moment.")
    image = images.upload(_with_play_button(raw), name, issue_id, user_id)
    return {**image, "title": title}
