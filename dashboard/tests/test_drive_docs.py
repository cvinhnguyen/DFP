"""What the tool writes into the Drive folder when an editor saves an article
or a list (services/drive_docs.py): the folder it goes in, and a Doc that
holds the tool's own summary and the link, safely, and never the original's
text.

  docker compose exec dashboard python -m unittest discover -s tests -v
"""

import unittest
from datetime import datetime, timezone

from app.services import drive_docs as docs

SAVED = datetime(2026, 10, 5, 9, 30, tzinfo=timezone.utc)


def article(**changes):
    item = {"id": 7, "title": "AI in schools", "title_fi": "Tekoäly kouluissa", "url": "https://example.org/ai",
            "publisher": "Example", "source": "Example feed", "published_at": "2026-10-01T09:00:00+00:00",
            "summary": {"text": "Ensimmäinen kappale.\nToinen kappale."}, "topics": [{"id": 1, "name": "Tekoäly"}],
            "tags": [{"label": "tekoäly"}, {"label": "opetus"}], "raw_text": "THE ORIGINAL TEXT"}
    item.update(changes)
    return item


class TheFolder(unittest.TestCase):
    def test_its_first_topic(self):
        self.assertEqual(docs.suggested_folder(article()), "Tekoäly")

    def test_its_section_without_a_topic(self):
        self.assertEqual(docs.suggested_folder(article(topics=[], pick_section="events")), "Tapahtumat")
        self.assertEqual(docs.suggested_folder(article(topics=[], suggested_section="member_news")), "Jäsenkuulumisia")

    def test_muut_otherwise(self):
        self.assertEqual(docs.suggested_folder(article(topics=[])), "Muut")


class TheDoc(unittest.TestCase):
    def test_what_it_holds(self):
        page = docs.article_html(article(event={"starts": "2026-11-19", "ends": "2026-11-19", "time": "13–16",
                                                "place": "Hämeenlinna", "deadline": "2026-11-12"}),
                                 saved_by="Kaisa", saved_at=SAVED)
        for part in ("<h1>Tekoäly kouluissa</h1>", "Alkuperäinen otsikko: AI in schools", "Example · Example feed",
                     'href="https://example.org/ai"', "<p>Ensimmäinen kappale.</p>", "<p>Toinen kappale.</p>",
                     "kirjoitti tekoäly", "Milloin: 19.11.2026 klo 13–16", "Missä: Hämeenlinna",
                     "Ilmoittautuminen viimeistään: 12.11.2026", "Aiheet: Tekoäly", "Asiasanat: tekoäly, opetus",
                     "Tallensi Kaisa 5.10.2026"):
            self.assertIn(part, page)

    def test_never_the_originals_text(self):
        self.assertNotIn("THE ORIGINAL TEXT", docs.article_html(article(), saved_by="Kaisa", saved_at=SAVED))

    def test_what_came_from_elsewhere_is_only_text(self):
        page = docs.article_html(article(title_fi='<script>alert(1)</script>', url="javascript:alert(1)",
                                         summary={"text": "<img src=x onerror=alert(1)>"}),
                                 saved_by="<b>x</b>", saved_at=SAVED)
        self.assertNotIn("<script>", page)
        self.assertNotIn("<img", page)
        self.assertNotIn("<b>x", page)
        self.assertNotIn("javascript:", page)
        self.assertIn("&lt;script&gt;", page)

    def test_without_a_summary(self):
        self.assertIn("Artikkelista ei ole tiivistelmää.", docs.article_html(article(summary=None), saved_by="Kaisa",
                                                                             saved_at=SAVED))

    def test_its_name_starts_with_the_day(self):
        self.assertEqual(docs.doc_name(article(), SAVED), "2026-10-05 Tekoäly kouluissa")


class TheList(unittest.TestCase):
    def test_one_doc_for_the_list(self):
        page = docs.list_html("Kooste: Tekoäly", [article(), article(id=8, title_fi="Toinen")], saved_by="Kaisa",
                              saved_at=SAVED, total=5)
        self.assertIn("<h2>1. Tekoäly kouluissa</h2>", page)
        self.assertIn("<h2>2. Toinen</h2>", page)
        self.assertIn("listalla oli 5", page)

    def test_the_sheet_runs_no_formulas(self):
        sheet = docs.list_csv([article(title_fi="=HYPERLINK(\"http://x\")", publisher="+1")]).decode()
        self.assertIn("'=HYPERLINK", sheet)
        self.assertIn("'+1", sheet)


if __name__ == "__main__":
    unittest.main()
