"""Asetukset → Lähteet without a network or a database: which addresses the
dashboard may fetch, reading feeds, finding them on a page, the links a
watched page counts as articles, and how a source is said to be doing.

  docker compose exec dashboard python -m unittest discover -s tests -v
"""

import socket
import unittest
from datetime import datetime, timedelta, timezone

from app.services import feeds, sources, watch

NOW = datetime(2026, 10, 6, 12, tzinfo=timezone.utc)


def resolving_to(address):
    def resolve(host, port, **kwargs):
        return [(socket.AF_INET, socket.SOCK_STREAM, 6, "", (address, port))]
    return resolve


class Addresses(unittest.TestCase):
    def test_a_public_site_is_fetched(self):
        feeds.check_address("https://kansanvalistusseura.fi/feed/", resolve=resolving_to("185.26.50.10"))

    def test_our_own_network_is_never_fetched(self):
        for address in ("10.0.0.5", "127.0.0.1", "169.254.169.254", "192.168.1.1", "100.64.0.1", "::1"):
            with self.subTest(address=address), self.assertRaises(feeds.FetchProblem) as caught:
                feeds.check_address("https://example.fi/", resolve=resolving_to(address))
            self.assertEqual(caught.exception.code, "private_address")

    def test_names_inside_docker_are_refused_before_asking(self):
        for url in ("http://dashboard:8000/api", "http://localhost/", "http://n8n:5678/webhook/collect"):
            with self.subTest(url=url), self.assertRaises(feeds.FetchProblem):
                feeds.check_address(url, resolve=resolving_to("8.8.8.8"))

    def test_only_web_addresses(self):
        for url in ("ftp://example.fi/feed", "file:///etc/passwd", "javascript:alert(1)", "https://user:pw@example.fi/"):
            with self.subTest(url=url), self.assertRaises(feeds.FetchProblem):
                feeds.check_address(url, resolve=resolving_to("8.8.8.8"))

    def test_what_an_admin_types(self):
        self.assertEqual(feeds.normalise(" kansanvalistusseura.fi "), "https://kansanvalistusseura.fi")
        self.assertEqual(feeds.host_of("https://www.Mindtrek.org/x"), "mindtrek.org")
        self.assertEqual(feeds.ISSN.match("ISSN 2227-7102").groups(), ("2227", "7102"))
        self.assertIsNone(feeds.ISSN.match("2227-71022"))


RSS = b"""<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0"><channel><title>Kvs-s\xc3\xa4\xc3\xa4ti\xc3\xb6</title><link>https://kansanvalistusseura.fi</link>
<language>fi-FI</language>
<item><title>Lukutaidon merkitys ei v\xc3\xa4hene</title><link>https://kansanvalistusseura.fi/a/</link>
<pubDate>Mon, 29 Sep 2026 09:54:28 +0000</pubDate></item>
<item><title>Tutki, kysy, ymm\xc3\xa4rr\xc3\xa4</title><guid isPermaLink="true">https://kansanvalistusseura.fi/b/</guid>
<pubDate>Fri, 18 Sep 2026 06:41:13 +0000</pubDate></item>
</channel></rss>"""

ATOM = b"""<?xml version="1.0" encoding="utf-8"?>
<feed xmlns="http://www.w3.org/2005/Atom" xml:lang="fi"><title>Ajankohtaista</title>
<link rel="alternate" href="https://itk-konferenssi.fi/blog/ajankohtaista-2"/>
<entry><title>ITK2027: Call for Presentations</title><link href="https://itk-konferenssi.fi/blog/cfp"/>
<published>2026-09-28T04:03:52Z</published></entry>
</feed>"""


class Feeds(unittest.TestCase):
    def test_rss(self):
        feed = feeds.parse_feed(RSS)
        self.assertEqual(feed["title"], "Kvs-säätiö")
        self.assertEqual([i["url"] for i in feed["items"]], ["https://kansanvalistusseura.fi/a/", "https://kansanvalistusseura.fi/b/"])
        self.assertEqual(feed["items"][0]["published_at"], datetime(2026, 9, 29, 9, 54, 28, tzinfo=timezone.utc))
        self.assertEqual(feeds.guess_language(feed["language"], []), "fi")

    def test_atom(self):
        feed = feeds.parse_feed(ATOM)
        self.assertEqual(feed["link"], "https://itk-konferenssi.fi/blog/ajankohtaista-2")
        self.assertEqual(feed["items"][0]["title"], "ITK2027: Call for Presentations")
        self.assertEqual(feed["language"], "fi")

    def test_not_a_feed(self):
        self.assertIsNone(feeds.parse_feed(b"<html><body>Hei</body></html>"))
        self.assertIsNone(feeds.parse_feed(b"not xml at all"))

    def test_a_feed_that_declares_entities_is_not_read(self):
        bomb = b'<?xml version="1.0"?><!DOCTYPE r [<!ENTITY a "aaaa">]><rss><channel><title>&a;</title></channel></rss>'
        self.assertIsNone(feeds.parse_feed(bomb))

    def test_how_often(self):
        dates = [NOW - timedelta(days=d) for d in (1, 4, 8, 12, 15)]
        self.assertEqual(feeds.per_month(dates, NOW), 10.0)
        self.assertIsNone(feeds.per_month([NOW], NOW))

    def test_names(self):
        self.assertEqual(feeds.tidy_name("Sitra – RSS"), "Sitra")
        self.assertEqual(feeds.tidy_name("Uutiset » Syöte"), "Uutiset")
        self.assertEqual(feeds.guess_language("", ["Tekoäly ja oppiminen kouluissa"]), "fi")
        self.assertEqual(feeds.guess_language("", ["How teachers use AI in the classroom"]), "en")


PAGE = """<html lang="fi"><head><title>Uutiset | Opetushallitus</title>
<link rel="alternate" type="application/rss+xml" href="/feed/" title="Uutiset">
<link rel="alternate" type="application/rss+xml" href="/comments/feed/" title="Kommentit">
<meta property="og:site_name" content="Opetushallitus"></head><body>
<header><nav><a href="/fi/uutiset">Uutiset</a><a href="/fi/tapahtumat">Tapahtumat</a></nav></header>
<main>
 <h1>Uutiset</h1>
 <article><h3><a href="/fi/uutiset/2026/seuraa-osaamistakuuta">Seuraa osaamistakuutyön etenemistä uudella verkkosivulla</a></h3>
   <a href="/fi/uutiset/2026/seuraa-osaamistakuuta">Lue lisää</a></article>
 <article><h3><a href="/fi/uutiset/2026/opiskelijat-tekoaly">Opiskelijat loivat tekoälyn avulla uusia ratkaisuja</a></h3></article>
 <article><h3><a href="https://www.oph.fi/fi/uutiset/2026/education-at-a-glance">Education at a Glance: valtaosa opettajista naisia</a></h3></article>
 <a href="/fi/uutiset?page=2">Seuraava sivu</a>
 <a href="/fi/uutiset/tiedote.pdf">Tiedote PDF-muodossa ladattavaksi</a>
 <a href="https://www.facebook.com/opetushallitus">Opetushallitus Facebookissa</a>
 <a href="mailto:kirjaamo@example.fi">kirjaamo@example.fi</a>
</main>
<footer><a href="/fi/saavutettavuusseloste-ja-tietosuoja">Saavutettavuusseloste ja tietosuoja</a></footer>
</body></html>"""


class Pages(unittest.TestCase):
    def test_feeds_a_page_names_comments_left_out(self):
        self.assertEqual(feeds.feed_links(PAGE, "https://www.oph.fi/fi/uutiset"), ["https://www.oph.fi/feed/"])

    def test_where_a_feed_may_be(self):
        guesses = feeds.guessed_feeds("https://itk-konferenssi.fi/blog/ajankohtaista-2")
        self.assertEqual(guesses[:2], ["https://itk-konferenssi.fi/blog/ajankohtaista-2/feed",
                                       "https://itk-konferenssi.fi/blog/ajankohtaista-2/feed/"])
        self.assertIn("https://itk-konferenssi.fi/feed/", guesses)

    def test_the_site_name(self):
        self.assertEqual(feeds.site_name(feeds.page_head(PAGE)), "Opetushallitus")

    def test_what_a_page_calls_itself_names_no_site(self):
        def named(head):
            return feeds.site_name(feeds.page_head(f"<html><head>{head}</head></html>"))
        self.assertIsNone(named("<title>Koti</title>"))
        self.assertEqual(named("<title>Koti | Qridi</title>"), "Qridi")
        self.assertEqual(named("<title>Opetushallitus – Uutiset</title>"), "Opetushallitus")
        self.assertEqual(named('<meta property="og:site_name" content="Etusivu"><title>Etusivu - Humak</title>'), "Humak")

    def test_a_feed_called_only_news_gets_the_site_s_name(self):
        def named(title, site):
            head = feeds.page_head(f'<html><head><meta property="og:site_name" content="{site}"></head></html>')
            feed = {"title": title, "link": None, "language": "fi", "items": []}
            return feeds._feed_result("https://example.fi/feed/", feed, None, "https://example.fi/", head)["name"]
        self.assertEqual(named("Ajankohtaista", "ITK-Konferenssi"), "ITK-Konferenssi, Ajankohtaista")
        self.assertEqual(named("FourFerries", "Interaktiivisuutta opiskeluun"), "FourFerries")
        self.assertEqual(named("TOT – Tekoäly oppimisen tukena", "TOT - Tekoäly oppimisen tukena"),
                         "TOT – Tekoäly oppimisen tukena")

    def test_a_listing_page_s_article_links(self):
        links = watch.extract_links(PAGE, "https://www.oph.fi/fi/uutiset")
        self.assertEqual([link["url"] for link in links], [
            "https://www.oph.fi/fi/uutiset/2026/seuraa-osaamistakuuta",
            "https://www.oph.fi/fi/uutiset/2026/opiskelijat-tekoaly",
            "https://www.oph.fi/fi/uutiset/2026/education-at-a-glance",
        ])
        # "Lue lisää" to the same address does not take the title's place.
        self.assertEqual(links[0]["title"], "Seuraa osaamistakuutyön etenemistä uudella verkkosivulla")

    def test_the_news_and_events_pages_of_a_front_page(self):
        found = feeds.listing_pages(PAGE, "https://www.oph.fi/")
        self.assertEqual([f["url"] for f in found], ["https://www.oph.fi/fi/uutiset", "https://www.oph.fi/fi/tapahtumat"])

    def test_an_article_page(self):
        page = """<html><head><meta property="og:title" content="Webinaari tekoälystä">
          <meta property="article:published_time" content="2026-10-01T09:00:00+03:00">
          <meta name="description" content="Lyhyt kuvaus."></head><body><nav><p>Valikko ja paljon muuta tekstiä joka ei kuulu juttuun mitenkään.</p></nav>
          <article><p>Ensimmäinen kappale, jossa kerrotaan webinaarista riittävän pitkästi.</p>
          <p>Toinen kappale, jossa on lisää asiaa siitä, kenelle webinaari sopii.</p></article></body></html>"""

        class Fake:
            text = page
        original = feeds.fetch
        feeds.fetch = lambda url, **kwargs: Fake()
        try:
            found = watch.read_article("https://example.fi/a")
        finally:
            feeds.fetch = original
        self.assertEqual(found["title"], "Webinaari tekoälystä")
        self.assertEqual(found["excerpt"], "Lyhyt kuvaus.")
        self.assertTrue(found["published_at"].startswith("2026-10-01T09:00:00"))
        self.assertTrue(found["text"].startswith("Ensimmäinen kappale"))
        self.assertNotIn("Valikko", found["text"])


def row(**changes):
    base = {"active": True, "type": "rss", "url": "https://example.fi/feed/", "running": False, "last_error": None,
            "last_run_at": NOW - timedelta(hours=4), "last_item_at": NOW - timedelta(days=3),
            "first_run": NOW - timedelta(days=30), "created_at": NOW - timedelta(days=40), "total": 12}
    return {**base, **changes}


class Health(unittest.TestCase):
    def test_how_a_source_is_doing(self):
        self.assertEqual(sources.health(row(), NOW), "ok")
        self.assertEqual(sources.health(row(active=False), NOW), "off")
        self.assertEqual(sources.health(row(running=True), NOW), "checking")
        self.assertEqual(sources.health(row(last_error="404"), NOW), "failed")
        self.assertEqual(sources.health(row(last_run_at=None, last_item_at=None, first_run=None), NOW), "waiting")

    def test_quiet(self):
        self.assertEqual(sources.health(row(last_item_at=NOW - timedelta(days=61)), NOW), "quiet")
        self.assertEqual(sources.health(row(last_item_at=None, first_run=NOW - timedelta(days=15)), NOW), "quiet")
        self.assertEqual(sources.health(row(last_item_at=None, first_run=NOW - timedelta(days=5)), NOW), "ok")

    def test_a_site_nothing_reads(self):
        self.assertEqual(sources.health(row(type="webpage", url="https://www.edu.fi/"), NOW), "unread")
        self.assertEqual(sources.health(row(type="webpage", url="https://eoppimiskeskus.fi/ajankohtaista/"), NOW), "ok")

    def test_the_drive_folder_and_the_bot_keep_their_own_schedules(self):
        self.assertEqual(sources.health(row(type="drive", last_run_at=None), NOW), "ok")
        self.assertEqual(sources._can(row(type="manual"))["switch"], False)

    def test_only_a_source_without_articles_can_be_deleted(self):
        self.assertFalse(sources._can(row())["delete"])
        self.assertTrue(sources._can(row(total=0))["delete"])

    def test_twelve_weeks_oldest_first(self):
        self.assertEqual(sources.weekly({"0": 3, "11": 1}), [1] + [0] * 10 + [3])


if __name__ == "__main__":
    unittest.main()
