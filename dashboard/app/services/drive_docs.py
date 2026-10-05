"""What the tool writes into the association's Drive folder when an editor
saves an article or a list of them: the Google Doc's text, its name, and
which folder it goes in. Nothing here talks to Drive or the database, so it
can be read and tested on its own (tests/test_drive_docs.py); the guard in
services/drive.py does the saving.
Jira: DM42-43

A saved article is what the tool itself keeps of it for good: the title,
where it came from, the link, the AI's Finnish summary, the event's details,
its topics and tags. The original article's full text is not saved: it is
someone else's, and the tool deletes its own copy after 90 days for that
reason (25-retention.sql). A picture goes along only when it is the
association's own or openly licensed (services/drive.py).
"""

import csv
import html
import io
from datetime import date, datetime

from .collection import HELSINKI

SECTION_NAMES = {
    "own_news": "Ajankohtaista yhdistykseltä",
    "events": "Tapahtumat",
    "member_news": "Jäsenkuulumisia",
    "highlights": "Nostoja kentältä",
    "training": "Learning Factory",
}
# Where an article no topic or section names goes, and lists other than a
# topic's.
OTHER_FOLDER = "Muut"
LISTS_FOLDER = "Koosteet"


def suggested_folder(item):
    """The folder an article goes in unless the editor chooses another: its
    first topic, the section it was picked for or is suggested for, or Muut.
    Named by the tool's own topics and sections, never by the AI, so the
    same subject always lands in the same folder."""
    topics = item.get("topics") or []
    if topics and topics[0].get("name"):
        return topics[0]["name"]
    section = item.get("pick_section") or item.get("suggested_section")
    return SECTION_NAMES.get(section, OTHER_FOLDER)


def _day(value):
    if not value:
        return ""
    if isinstance(value, str):
        value = datetime.fromisoformat(value.replace("Z", "+00:00"))
    if isinstance(value, datetime):
        value = value.astimezone(HELSINKI).date()
    return f"{value.day}.{value.month}.{value.year}" if isinstance(value, date) else ""


def _link(url):
    """An address that may be a link: http or https only."""
    url = (url or "").strip()
    return url if url.lower().startswith(("http://", "https://")) else ""


def title_of(item):
    return (item.get("title_fi") or item.get("title") or "Nimetön").strip()


def doc_name(item, when):
    """The saved Doc's name: the day it was saved and the title, so the
    folder lists them in order."""
    return f"{when.astimezone(HELSINKI):%Y-%m-%d} {title_of(item)}"


def _event(item):
    event = item.get("event") or {}
    rows = []
    if event.get("starts"):
        when = _day(event["starts"])
        if event.get("ends") and event["ends"] != event["starts"]:
            when = f"{when}–{_day(event['ends'])}"
        if event.get("time"):
            when = f"{when} klo {event['time']}"
        rows.append(("Milloin", when))
    if event.get("place"):
        rows.append(("Missä", event["place"]))
    if event.get("deadline"):
        rows.append(("Ilmoittautuminen viimeistään", _day(event["deadline"])))
    return rows


def _source_line(item):
    parts = [item.get("publisher")]
    if item.get("source") and item.get("source") != item.get("publisher"):
        parts.append(item["source"])
    parts.append(_day(item.get("published_at") or item.get("collected_at")))
    return " · ".join(p for p in parts if p)


def article_html(item, *, saved_by, saved_at, picture_name=None, picture_credit=None):
    """The Google Doc of one saved article, as HTML for Google to turn into
    a Doc. Every value is escaped: titles and summaries come from other
    people's websites and from a language model."""
    e = html.escape
    title = title_of(item)
    out = [f"<h1>{e(title)}</h1>"]
    if item.get("title_fi") and item.get("title") and item["title"] != item["title_fi"]:
        out.append(f"<p><i>Alkuperäinen otsikko: {e(item['title'])}</i></p>")
    out.append(f"<p>{e(_source_line(item))}</p>")
    link = _link(item.get("url"))
    if link:
        out.append(f'<p>Alkuperäinen artikkeli: <a href="{e(link)}">{e(link)}</a></p>')
    summary = (item.get("summary") or {}).get("text")
    out.append("<h2>Tiivistelmä</h2>")
    if summary:
        out.extend(f"<p>{e(part)}</p>" for part in summary.split("\n") if part.strip())
        out.append("<p><i>Tiivistelmän kirjoitti tekoäly artikkelin pohjalta. Tarkista se ennen käyttöä.</i></p>")
    else:
        out.append("<p>Artikkelista ei ole tiivistelmää.</p>")
    event = _event(item)
    if event:
        out.append("<h2>Tapahtuma</h2>")
        out.append("<p>" + "<br>".join(f"{e(k)}: {e(v)}" for k, v in event) + "</p>")
        out.append("<p><i>Tekoäly poimi nämä artikkelista. Tarkista ne ennen käyttöä.</i></p>")
    topics = [t["name"] for t in item.get("topics") or [] if t.get("name")]
    tags = [t["label"] for t in item.get("tags") or [] if t.get("label")]
    if topics or tags:
        out.append("<h2>Aiheet ja asiasanat</h2>")
        if topics:
            out.append(f"<p>Aiheet: {e(', '.join(topics))}</p>")
        if tags:
            out.append(f"<p>Asiasanat: {e(', '.join(tags))}</p>")
    if picture_name:
        credit = f" Kuva: {picture_credit}." if picture_credit else ""
        out.append(f"<p>Artikkelin kuva on samassa kansiossa nimellä {e(picture_name)}.{e(credit)}</p>")
    out.append(f"<hr><p><small>Tallensi {e(saved_by or 'uutiskirjetyökalu')} "
               f"{e(_day(saved_at))} uutiskirjetyökalusta.</small></p>")
    return _page(title, out)


def list_html(name, items, *, saved_by, saved_at, total):
    """One Google Doc for a list of articles: each one's title, where it
    came from, the link and the summary."""
    e = html.escape
    out = [f"<h1>{e(name)}</h1>",
           f"<p>{len(items)} artikkelia, tallennettu {e(_day(saved_at))}"
           + (f" (listalla oli {total}, tähän tuli {len(items)} uusinta)" if total > len(items) else "")
           + ".</p>"]
    for n, item in enumerate(items, 1):
        out.append(f"<h2>{n}. {e(title_of(item))}</h2>")
        out.append(f"<p>{e(_source_line(item))}</p>")
        link = _link(item.get("url"))
        if link:
            out.append(f'<p><a href="{e(link)}">{e(link)}</a></p>')
        summary = (item.get("summary") or {}).get("text")
        if summary:
            out.extend(f"<p>{e(part)}</p>" for part in summary.split("\n") if part.strip())
    out.append("<hr><p><small>Tiivistelmät kirjoitti tekoäly artikkelien pohjalta. "
               f"Tallensi {e(saved_by or 'uutiskirjetyökalu')} uutiskirjetyökalusta.</small></p>")
    return _page(name, out)


def list_csv(items):
    """The same list as a sheet: one row an article."""
    out = io.StringIO()
    writer = csv.writer(out)
    writer.writerow(["Otsikko", "Julkaisija", "Päivä", "Linkki", "Aiheet", "Valinta"])
    for item in items:
        choice = SECTION_NAMES.get(item.get("pick_section")) if item.get("decision") == "picked" else None
        choice = choice or {"later": "Myöhemmin", "dismissed": "Ei käytetä"}.get(item.get("decision"), "")
        writer.writerow([_cell(title_of(item)), _cell(item.get("publisher") or ""),
                         _day(item.get("published_at") or item.get("collected_at")), _link(item.get("url")),
                         _cell(", ".join(t["name"] for t in item.get("topics") or [] if t.get("name"))),
                         choice])
    return out.getvalue().encode("utf-8")


def _cell(text):
    """A cell a spreadsheet will not run as a formula."""
    text = str(text or "")
    return "'" + text if text[:1] in ("=", "+", "-", "@", "\t", "\r") else text


def _page(title, parts):
    return ('<!doctype html><html lang="fi"><head><meta charset="utf-8">'
            f"<title>{html.escape(title)}</title></head><body>" + "\n".join(parts) + "</body></html>")
