"""Newsletter issues: the one being prepared, saving its layout, marking it
sent, and the finished email for Mailchimp.
Jira: DM42-37

Issues are listed like Mailchimp's campaigns: drafts and sent ones. The
newest draft is the current one, which new picks go into; one is made, named
after the month, the first time someone picks an article with no draft
there. Sending happens in Mailchimp, by a person; marking an issue sent
here, by hand or when Mailchimp says so, records that it went out.
"""

import base64
import hashlib
import re
import zipfile
from datetime import datetime
from html import escape
from io import BytesIO
from pathlib import Path

from ..queries import images as image_queries
from ..queries import issues as queries
from ..queries import settings
from ..schemas.issues import Issue, IssueSummary, PickedArticle
from . import events
from .collection import HELSINKI

WEB = Path(__file__).resolve().parent.parent.parent / "web"

MONTHS = ["Tammikuu", "Helmikuu", "Maaliskuu", "Huhtikuu", "Toukokuu", "Kesäkuu",
          "Heinäkuu", "Elokuu", "Syyskuu", "Lokakuu", "Marraskuu", "Joulukuu"]

EDITABLE = ("name", "subject", "preheader")


class NotFound(Exception):
    pass


class Locked(Exception):
    """The issue has been sent, so it is no longer changed."""


class EditedElsewhere(Exception):
    def __init__(self, saved_at, saved_by):
        super().__init__("Someone else saved the newsletter after you opened it.")
        self.saved_at = saved_at
        self.saved_by = saved_by


class NotReady(Exception):
    """Tarkistus still lists something that keeps the email in the dashboard.
    problems counts each kind, by the codes Tarkistus uses."""

    def __init__(self, problems):
        listed = ", ".join(f"{n} {code}" for code, n in problems.items())
        super().__init__(f"Fix what Tarkistus lists before the email leaves the dashboard: {listed}.")
        self.problems = problems


def month_name(year, month):
    return f"{MONTHS[month - 1]} {year}"


def default_name(now=None):
    """This month's name, or next month's once this month's issue exists: the
    issue prepared after one is sent is the next month's."""
    now = now or datetime.now(HELSINKI)
    year, month = now.year, now.month
    while queries.name_taken(month_name(year, month)):
        year, month = (year + 1, 1) if month == 12 else (year, month + 1)
    return month_name(year, month)


def current_id(user_id):
    """The issue in preparation, made now if there is none."""
    return queries.current_draft_id() or queries.create(default_name(), user_id)


def content_hash(found):
    """What makes the email what it is, as one value: the finished email,
    its subject and preview text, and its name. Mailchimp's draft is out of
    date when this differs from what was exported."""
    text = "\x1f".join([found.get("html") or "", found.get("subject") or "", found.get("preheader") or "", found.get("name") or ""])
    return hashlib.sha256(text.encode("utf-8")).hexdigest()


def mailchimp_url(web_id):
    server = (settings.get("mailchimp_server") or "").strip()
    if not web_id or not re.fullmatch(r"[a-z]{2,4}\d{1,3}", server):
        return None
    return f"https://{server}.admin.mailchimp.com/campaigns/edit?id={int(web_id)}"


def get(issue_id):
    found = queries.one(issue_id)
    if not found:
        raise NotFound()
    current = queries.current_draft_id()
    changed = bool(found["mailchimp_exported_hash"]) and found["mailchimp_exported_hash"] != content_hash(found)
    return Issue(**found, current=found["id"] == current, mailchimp_changed=changed,
                 mailchimp_url=mailchimp_url(found["mailchimp_web_id"]),
                 articles=[PickedArticle(**a, event_line=events.line(a["event_starts"], a["event_ends"],
                                                                     a["event_time"], a["event_place"]))
                           for a in queries.articles(issue_id)])


def summaries():
    current = queries.current_draft_id()
    return [IssueSummary(**s, current=s["id"] == current) for s in queries.summaries()]


def create(name, template, user_id):
    """A new draft, which becomes the current one."""
    name = (name or "").strip() or default_name()
    return get(queries.create(name, user_id, template))


def remove(issue_id):
    found = queries.one(issue_id)
    if not found:
        raise NotFound()
    if found["status"] != "draft":
        raise Locked()
    queries.remove(issue_id)


def _draft(issue_id):
    found = queries.one(issue_id)
    if not found:
        raise NotFound()
    if found["status"] != "draft":
        raise Locked()
    return found


def update(issue_id, changes, user_id):
    _draft(issue_id)
    changes = {k: v.strip() for k, v in changes.items() if k in EDITABLE and v is not None}
    if changes:
        queries.update(issue_id, changes, user_id)
    return get(issue_id)


def design(issue_id):
    found = queries.design(issue_id)
    if not found:
        raise NotFound()
    return found


def save_design(issue_id, design, html, user_id, based_on, force):
    _draft(issue_id)
    saved_at = queries.save_design(issue_id, design, html, user_id, based_on, force)
    if saved_at is None:
        latest = queries.one(issue_id)
        raise EditedElsewhere(latest["design_saved_at"], latest["design_saved_by"])
    return saved_at


def mark_sent(issue_id, user_id):
    _draft(issue_id)
    queries.mark_sent(issue_id, user_id)
    return get(issue_id)


# What keeps an email in the dashboard, the way Tarkistus counts it
# (web/js/newsletter/checks.js): an article or a text the AI drafted that no
# person has ticked as read, a picture from a source's page that nobody has
# said may be used, the template's sample text, no subject line.
# The pages stop there before the email goes to Mailchimp, as a draft, a test
# or a file; this is the same rule for a request that comes some other way.
# The four sections of picked articles go out only with an article in them.
ARTICLE_SECTIONS = ("own_news", "events", "member_news", "highlights")
# The layouts that show an article's picture; in "text" it stays out.
PICTURE_LAYOUTS = ("image-left", "image-right", "image-top")


def _blocks(blocks):
    for block in blocks or []:
        yield block
        if block.get("type") == "columns":
            for column in block.get("columns") or []:
                yield from _blocks(column.get("blocks"))


def _goes_out(section):
    if section.get("role") in ARTICLE_SECTIONS:
        return any(b.get("type") == "article" for b in _blocks(section.get("blocks")))
    return bool(section.get("blocks"))


def not_ready(issue_id):
    """What still keeps the issue's email in the dashboard, counted by kind.
    Empty when it may go to Mailchimp."""
    found = queries.one(issue_id)
    if not found:
        raise NotFound()
    design = (queries.design(issue_id) or {}).get("design") or {}
    problems = {}
    for section in design.get("sections") or []:
        if not _goes_out(section):
            continue
        for block in _blocks(section.get("blocks")):
            if block.get("type") == "article" and not block.get("checked"):
                problems["unchecked"] = problems.get("unchecked", 0) + 1
            if block.get("type") == "text" and block.get("ai") and not block.get("checked"):
                problems["uncheckedDraft"] = problems.get("uncheckedDraft", 0) + 1
            if block.get("placeholder"):
                problems["placeholders"] = problems.get("placeholders", 0) + 1
            picture = block.get("image") or {}
            if (block.get("type") == "article" and picture.get("src") and block.get("layout") in PICTURE_LAYOUTS
                    and picture.get("rights") == "check" and not picture.get("allowed")):
                problems["pictureRights"] = problems.get("pictureRights", 0) + 1
    if not (found.get("subject") or "").strip():
        problems["subject"] = 1
    return problems


def check_ready(issue_id):
    problems = not_ready(issue_id)
    if problems:
        raise NotReady(problems)


# The dashboard's own markers on the email, from the old editor: which
# article an entry came from, whether an editor checked it. No use to a
# reader, so they are left out of what goes to Mailchimp.
MARKERS = re.compile(r'\sdata-[a-z0-9-]+="[^"]*"')

# Pictures the email points at on the dashboard: uploaded ones, the social
# icons, and the association's banners and logo.
LOCAL_IMAGE = re.compile(r'(src|href)="(/media/[0-9a-f-]{36}|/img/(?:social|brand)/[a-z0-9-]+\.png)"')


# Where a picture has not been added yet, the editor saves the block twice:
# as it goes out, and as the preview inside the dashboard shows it, with a
# wireframe where the picture will be, in a note around it.
PREVIEW_NOTE = re.compile(r"<!--dfp-preview:([A-Za-z0-9+/=]*)-->(.*?)<!--/dfp-preview-->", re.DOTALL)


def without_notes(html):
    """The email as it goes out: the blocks kept, the notes dropped."""
    return PREVIEW_NOTE.sub(lambda m: m.group(2), html or "")


def with_wireframes(html):
    """The email as the dashboard previews it: each noted block as the
    preview shows it."""
    def shown(m):
        try:
            return base64.b64decode(m.group(1)).decode("utf-8")
        except (ValueError, UnicodeDecodeError):
            return m.group(2)
    return PREVIEW_NOTE.sub(shown, html or "")


def _base():
    return (settings.get("dashboard_url") or "").rstrip("/")


def absolute(html):
    """The email with its pictures at the dashboard's full address, so they
    show wherever the dashboard can be reached."""
    base = _base()
    return LOCAL_IMAGE.sub(lambda m: f'{m.group(1)}="{base}{m.group(2)}"', html)


def export_document(issue_id, preview=False):
    """The finished email as a complete HTML document, ready for Mailchimp or
    for saving as a file. preview=True keeps the wireframes of pictures not
    added yet, for the preview inside the dashboard."""
    issue = get(issue_id)
    if not issue.html:
        return None
    if issue.html.lstrip().lower().startswith("<!doctype"):
        return absolute(with_wireframes(issue.html) if preview else without_notes(issue.html))
    # An email saved by the old editor: only its body was kept.
    body = absolute(MARKERS.sub("", issue.html))
    preheader = (f'<div style="display:none;max-height:0;overflow:hidden;mso-hide:all;">{escape(issue.preheader)}</div>'
                 if issue.preheader else "")
    if body.startswith("<body"):
        body = re.sub(r"^<body([^>]*)>", lambda m: f"<body{m.group(1)}>{preheader}", body, count=1)
    else:
        body = f"<body>{preheader}{body}</body>"
    title = escape(issue.subject or issue.name)
    return ('<!doctype html>\n<html lang="fi">\n<head>\n<meta charset="utf-8">\n'
            '<meta name="viewport" content="width=device-width, initial-scale=1">\n'
            f"<title>{title}</title>\n</head>\n{body}\n</html>\n")


def file_name(issue):
    """The issue's name as a file name Mailchimp accepts: letters, numbers
    and hyphens."""
    plain = issue.name.lower()
    for a, b in (("ä", "a"), ("ö", "o"), ("å", "a"), ("é", "e"), ("ü", "u")):
        plain = plain.replace(a, b)
    return re.sub(r"[^a-z0-9]+", "-", plain).strip("-") or f"uutiskirje-{issue.id}"


def local_images(html):
    """The dashboard's own pictures in an email, in order of first use."""
    seen = []
    for m in LOCAL_IMAGE.finditer(html or ""):
        if m.group(1) == "src" and m.group(2) not in seen:
            seen.append(m.group(2))
    return seen


def picture_bytes(path):
    """The bytes and type of one of the dashboard's pictures, by its address."""
    if path.startswith("/media/"):
        found = image_queries.by_key(path.rsplit("/", 1)[1])
        return (bytes(found["data"]), found["mime"]) if found else (None, None)
    file = WEB / path.lstrip("/")
    if file.is_file() and file.resolve().is_relative_to(WEB.resolve()):
        return file.read_bytes(), "image/png"
    return None, None


def export_zip(issue_id):
    """The email as a ZIP for Mailchimp's Import ZIP: one HTML file and its
    pictures beside it, every name letters, numbers and hyphens, the way
    Mailchimp asks. Mailchimp uploads the pictures itself, so the email does
    not depend on the dashboard being reachable from the internet."""
    issue = get(issue_id)
    if not issue.html:
        return None, None
    html = without_notes(issue.html) if issue.html.lstrip().lower().startswith("<!doctype") else export_document(issue_id)
    names = {}
    out = BytesIO()
    with zipfile.ZipFile(out, "w", zipfile.ZIP_DEFLATED) as z:
        for n, path in enumerate(local_images(html), start=1):
            data, mime = picture_bytes(path)
            if data is None:
                continue
            ext = {"image/jpeg": "jpg", "image/png": "png", "image/gif": "gif"}.get(mime, "jpg")
            name = path.rsplit("/", 1)[1].replace(".png", "") + ".png" if path.startswith("/img/") else f"kuva-{n}.{ext}"
            names[path] = name
            z.writestr(name, data)
        html = LOCAL_IMAGE.sub(lambda m: f'{m.group(1)}="{names.get(m.group(2), _base() + m.group(2))}"', html)
        z.writestr("index.html", html)
    return f"{file_name(issue)}.zip", out.getvalue()
