"""What the Drive guard allows, as rules with no network or database in them,
so each one can be read and tested on its own (tests/test_drive_rules.py).
services/drive.py applies them to every file before anything is read, handed
to the AI or saved. docs/drive.md explains why each one is there.
Jira: DM42-43
"""

import html
import re
import unicodedata
import zipfile
from io import BytesIO
from urllib.parse import parse_qs, urlparse

FOLDER = "application/vnd.google-apps.folder"
SHORTCUT = "application/vnd.google-apps.shortcut"
GOOGLE_DOC = "application/vnd.google-apps.document"
GOOGLE_SHEET = "application/vnd.google-apps.spreadsheet"
GOOGLE_SLIDES = "application/vnd.google-apps.presentation"
PDF = "application/pdf"
DOCX = "application/vnd.openxmlformats-officedocument.wordprocessingml.document"

# What can be read, and how: a Google file is exported as text, any other is
# downloaded. Everything else in the folder is listed and left closed:
# pictures, videos, spreadsheets in Excel, archives, programs.
READABLE = {
    GOOGLE_DOC: ("export", "text/plain"),
    GOOGLE_SHEET: ("export", "text/csv"),
    GOOGLE_SLIDES: ("export", "text/plain"),
    PDF: ("download", PDF),
    DOCX: ("download", DOCX),
    "text/plain": ("download", "text/plain"),
    "text/markdown": ("download", "text/markdown"),
    "text/csv": ("download", "text/csv"),
}
MAX_READ_BYTES = 10 * 1024 * 1024
# How much of one document the AI gets: a long report is summarised from its
# beginning, as an article is.
MAX_TEXT_CHARS = 40_000
# A file changed in the last half hour may still be being written.
SETTLE_MINUTES = 30
# How far down the folder's own folders are read, and how much at most.
MAX_DEPTH = 4
MAX_ITEMS = 2000

# Marks the folders and files the tool made itself, so it never reads its
# own saved newsletters back as material.
TOOL_MARK = {"eokTool": "newsletter"}
OUTPUT_NAME = "Uutiskirjetyökalu"

# A Drive id: letters, digits, - and _.
DRIVE_ID = re.compile(r"^[A-Za-z0-9_-]{10,100}$")


def folder_id(link):
    """The folder's id from what an admin pastes: its address in Drive
    (…/drive/folders/<id>, …/drive/u/0/folders/<id>, …/open?id=<id>) or the
    id itself. None when it is neither."""
    text = (link or "").strip()
    if DRIVE_ID.match(text):
        return text
    parsed = urlparse(text)
    if parsed.scheme != "https" or parsed.hostname != "drive.google.com":
        return None
    found = re.search(r"/folders/([A-Za-z0-9_-]{10,100})(?:/|$)", parsed.path)
    if found:
        return found.group(1)
    ids = parse_qs(parsed.query).get("id")
    return ids[0] if ids and DRIVE_ID.match(ids[0]) else None


# A folder or file whose name says it holds people's details is not opened
# at all, whatever is in it: a member register, a list of who signed up,
# salaries, passwords. The folder is for the newsletter's material, and
# these have no place there.
PERSONAL_NAMES = re.compile(
    r"jäsenrekister|jäsenluettel|jäsenlist|henkilötie|henkilötunn|\bhetu|palkka|palkat|palkkio|"
    r"salasan|tunnukset|ilmoittautune|osallistujalist|osallistujaluettel|terveystie|"
    r"password|credential|payroll|salar|member ?list|membership list|registrations?\b",
    re.IGNORECASE)


def personal_name(name):
    return bool(PERSONAL_NAMES.search(unicodedata.normalize("NFC", name or "")))


def refusal(meta, *, output_id=None):
    """Why a file in the folder is not read, as a code, or None when it may
    be. meta is the file as Google describes it."""
    mime = meta.get("mimeType") or ""
    if is_tool_made(meta) or (output_id and meta.get("id") == output_id):
        return "own_output"
    if mime == SHORTCUT:
        # A shortcut can point anywhere in Drive, the board's folder too.
        return "shortcut"
    if personal_name(meta.get("name")):
        return "personal_name"
    if mime not in READABLE:
        return "type"
    size = meta.get("size")
    if size is not None and int(size) > MAX_READ_BYTES:
        return "too_big"
    return None


def is_tool_made(meta):
    props = meta.get("appProperties") or {}
    return all(props.get(k) == v for k, v in TOOL_MARK.items())


def inside(meta, folders):
    """Whether a file Google describes now is still in the folder: not in
    the bin, and in the root or one of the folders under it as last listed.
    Checked again just before each read, so a file moved out of the folder
    after the listing is not read."""
    if meta.get("trashed"):
        return False
    return any(parent in folders for parent in meta.get("parents") or ())


def split_visible(visible, root):
    """What the tool's Google account can see, in two: the folder and what
    is in it, and everything else. Everything else should be nothing; when
    it is not, someone has shared more with the account than the folder."""
    by_id = {f["id"]: f for f in visible}
    known = {root: True}

    def reaches(file_id, depth=0):
        if file_id in known:
            return known[file_id]
        if depth > 60 or file_id not in by_id:
            return False
        known[file_id] = False  # a loop in the parents ends here
        known[file_id] = any(reaches(p, depth + 1) for p in by_id[file_id].get("parents") or ())
        return known[file_id]

    ins, outs = [], []
    for f in visible:
        (ins if reaches(f["id"]) else outs).append(f)
    return ins, outs


# --- personal data in the text ---------------------------------------------

# A Finnish personal identity code, 131052-308T, with its check character.
HETU = re.compile(r"(?<![0-9A-Za-z])(\d{2})(\d{2})(\d{2})([-+A-FU-Y])(\d{3})([0-9A-FHJ-NPR-Y])(?![0-9A-Za-z])")
HETU_CHECK = "0123456789ABCDEFHJKLMNPRSTUVWXY"


def personal_ids(text):
    """How many valid Finnish personal identity codes the text has. Only one
    whose check character is right counts, so a product code that looks like
    one does not."""
    count = 0
    for day, month, year, _sep, number, check in HETU.findall((text or "").upper()):
        if not (1 <= int(day) <= 31 and 1 <= int(month) <= 12 and 2 <= int(number) <= 999):
            continue
        if HETU_CHECK[int(day + month + year + number) % 31] == check:
            count += 1
    return count


EMAIL = re.compile(r"(?<![\w.+-])[A-Za-z0-9._%+-]+@[A-Za-z0-9-]+(?:\.[A-Za-z0-9-]+)*\.[A-Za-z]{2,}")
# A Finnish phone number: +358 40 123 4567, 040 123 4567, 09-123 4567.
PHONE = re.compile(r"(?<![\w+])(?:\+358[\s-]?|00358[\s-]?|0)(?:\(?\d\)?[\s-]?){6,11}\d(?!\w)")
IBAN = re.compile(r"(?<![A-Za-z0-9])([A-Z]{2}\d{2}(?:\s?[A-Z0-9]{4}){2,7}(?:\s?[A-Z0-9]{1,3})?)(?![A-Za-z0-9])")


def _iban_ok(text):
    code = text.replace(" ", "")
    if not 15 <= len(code) <= 34:
        return False
    moved = code[4:] + code[:4]
    digits = "".join(str(int(c, 36)) for c in moved)
    return int(digits) % 97 == 1


def redact(text):
    """The text with contact details and bank accounts replaced, and how many
    of each: [sähköposti], [puhelin], [tilinumero]. They are never needed to
    summarise a document, and the AI that summarises runs elsewhere."""
    counts = {"email": 0, "phone": 0, "iban": 0}

    def swap(kind, label):
        def replace(match):
            counts[kind] += 1
            return label
        return replace

    def iban(match):
        if not _iban_ok(match.group(1)):
            return match.group(0)
        counts["iban"] += 1
        return "[tilinumero]"

    text = IBAN.sub(iban, text or "")
    text = EMAIL.sub(swap("email", "[sähköposti]"), text)
    text = PHONE.sub(swap("phone", "[puhelin]"), text)
    return text, {k: v for k, v in counts.items() if v}


# Words a document uses when it speaks to an AI rather than to a reader:
# "ignore your previous instructions", "unohda aiemmat ohjeet". Such a
# document is still material and is still read; the AI's instructions say
# what to do with it, and the log shows it to the admins.
AI_INSTRUCTIONS = re.compile(
    r"\b(?:ignore|disregard|forget)\s+(?:all\s+|any\s+)?(?:the\s+|your\s+)?(?:previous|above|prior|earlier|former)\s+"
    r"(?:instructions?|rules|prompts?|messages?)|\bsystem\s+prompt\b|\byou\s+are\s+now\b|\bdeveloper\s+mode\b|"
    r"\bjailbreak|\bunohda\s+(?:kaikki\s+)?(?:aiemma|edellis|yllä\s+olev)\w*\s+ohje|\bälä\s+noudata\s+\w*\s*ohje|"
    r"\bohita\s+(?:kaikki\s+)?(?:aiemma|edellis)\w*\s+ohje|\bolet\s+nyt\b|\bjärjestelmäkehote|"
    r"\btekoäly(?:lle)?\s*[,:]?\s*(?:avaa|lue|jaa|lähetä|kopioi|poista)\b",
    re.IGNORECASE)


def ai_instructions(text):
    return bool(AI_INSTRUCTIONS.search(text or ""))


# --- the newsletter's sections, from the folder a file is in ----------------

# A file in a folder named after one of the newsletter's sections is
# suggested for that section: "Tapahtumat/Mindtrek.pdf" for Tapahtumat. Only
# the first folder under the root counts.
SECTION_FOLDERS = (
    ("events", re.compile(r"^(?:tapahtum|events?\b)", re.IGNORECASE)),
    ("member_news", re.compile(r"^(?:jäsenkuulumis|jäsenuutis|member news)", re.IGNORECASE)),
    ("own_news", re.compile(r"^(?:ajankohtais|yhdistykse|own news)", re.IGNORECASE)),
    ("highlights", re.compile(r"^(?:nostoj|highlights?\b)", re.IGNORECASE)),
    ("training", re.compile(r"^(?:learning factory|koulutuks|training)", re.IGNORECASE)),
)


def section_for(path):
    """The section the folder a file is in names, or None. path is the
    folders from the root down, ["Tapahtumat", "Syksy"]."""
    if not path:
        return None
    first = unicodedata.normalize("NFC", path[0]).strip()
    for section, pattern in SECTION_FOLDERS:
        if pattern.search(first):
            return section
    return None


# --- turning a file into text ------------------------------------------------


def text_of(data, mime):
    """The text of a downloaded or exported file, or None when it has none
    that can be read."""
    if mime == PDF:
        return _pdf_text(data)
    if mime == DOCX:
        return _docx_text(data)
    text = data.decode("utf-8", errors="replace").lstrip("\ufeff")
    return text


def _pdf_text(data):
    from pypdf import PdfReader  # only when a PDF is read
    try:
        reader = PdfReader(BytesIO(data))
        pages = [page.extract_text() or "" for page in reader.pages[:60]]
    except Exception:  # a broken or encrypted PDF is skipped, not fatal
        return None
    return "\n\n".join(p.strip() for p in pages if p.strip()) or None


def _docx_text(data):
    try:
        with zipfile.ZipFile(BytesIO(data)) as box:
            xml = box.read("word/document.xml").decode("utf-8", errors="replace")
    except (zipfile.BadZipFile, KeyError):
        return None
    xml = re.sub(r"</w:p>", "\n", xml)
    xml = re.sub(r"<w:tab/>", "\t", xml)
    parts = re.findall(r"<w:t(?:\s[^>]*)?>([^<]*)</w:t>|(\n|\t)", xml)
    text = "".join(t or brk for t, brk in parts)
    return html.unescape(text).strip() or None


def tidy(text):
    """The text as the AI gets it: no runs of blank lines or spaces, and no
    longer than MAX_TEXT_CHARS."""
    text = re.sub(r"[ \t\r\f\v]+", " ", text or "")
    text = re.sub(r"\n\s*\n\s*\n+", "\n\n", text)
    return text.strip()[:MAX_TEXT_CHARS]


def title_of(name):
    """A file's name without its ending, as the article's title."""
    base = re.sub(r"\.(?:pdf|docx?|txt|md|csv|rtf)$", "", (name or "").strip(), flags=re.IGNORECASE)
    return base.strip() or name or "Nimetön"


# --- what is saved -------------------------------------------------------------


def safe_name(name, limit=120):
    """A name for a file the tool saves: no slashes or control characters,
    no dot at the ends, not too long."""
    text = unicodedata.normalize("NFC", str(name or ""))
    text = re.sub(r"[\x00-\x1f\x7f/\\]", " ", text)
    text = re.sub(r"\s+", " ", text).strip(" .")
    return text[:limit].strip() or "Uutiskirje"
