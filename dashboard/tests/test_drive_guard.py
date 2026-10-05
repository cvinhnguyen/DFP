"""The Drive guard against a stand-in for the association's Drive
(tests/fake_drive.py): what it reads, what it refuses, where it saves, what
it takes out of the tool when a document leaves the folder, and above all
what it never touches.

  docker compose exec dashboard python -m unittest discover -s tests -v
"""

import inspect
import json
import unittest
from datetime import datetime, timedelta, timezone
from types import SimpleNamespace

from app.services import drive_google, drive_rules
from app.services.drive import Guard, Refused, next_read
from tests.fake_drive import FOLDER, association

NOW = datetime(2026, 10, 5, 12, 0, tzinfo=timezone.utc)
ADMIN = SimpleNamespace(id=1, name="Vinh", role="admin")
EDITOR = SimpleNamespace(id=2, name="Kaisa", role="editor")
OUTSIDE = {"board00001", "minutes001", "money00001", "budget0001"}
NEVER_OPENED = {"register01", "txt0000004", "txt0000003", "png0000001", "short00001", "pdf0000001"}


class Store:
    """queries.drive, in memory, with the few articles and newsletters the
    guard asks about."""

    def __init__(self, folder="root000001", enabled=True):
        self.values = {"drive_enabled": "true" if enabled else "false", "drive_folder_id": folder,
                       "drive_folder_name": "", "drive_output_folder_id": "", "drive_check": "",
                       "drive_synced_at": "", "drive_autosave_sent": "false", "drive_autosave_since": ""}
        self.files, self.logged, self.requeued, self.active = {}, [], [], enabled
        # articles: the ids a newsletter has, those taken out, those deleted
        self.kept, self.withdrawn, self.deleted, self.restored = set(), {}, set(), []
        self.changes, self.saves, self.thumbs = {}, [], {}
        self.sent = {}            # newsletter id: when it was sent
        self.item_pictures = {}   # article id: its own picture
        self.imported = []        # (Kuvapankki key, Drive id)

    def settings(self):
        v = self.values
        return {"enabled": v["drive_enabled"] == "true", "folder_id": v["drive_folder_id"],
                "folder_name": v["drive_folder_name"], "output_id": v["drive_output_folder_id"],
                "check": json.loads(v["drive_check"] or "null"), "synced": v["drive_synced_at"],
                "autosave": v["drive_autosave_sent"] == "true", "autosave_since": v["drive_autosave_since"] or None}

    def put(self, key, value):
        self.values[key] = value

    def source(self):
        return {"id": 99, "active": self.active}

    def set_source_active(self, on):
        self.active = on

    def catalogue(self):
        return {k: dict(v) for k, v in self.files.items()}

    def remember(self, entries):
        for e in entries:
            old = self.files.get(e["drive_id"], {})
            if old.get("gone_at") and not e["status"]:
                old = {**old, "status": "new", "reason": None, "read_modified_at": None}
            status = e["status"] or old.get("status") or "new"
            self.files[e["drive_id"]] = {**old, **e, "status": status, "gone_at": None,
                                         "reason": e["reason"] if e["status"] else old.get("reason")}

    def gone(self, seen):
        newly = []
        for k, v in self.files.items():
            if k not in seen and not v.get("gone_at"):
                v["gone_at"] = NOW
                newly.append({"drive_id": k, "name": v["name"], "mime_type": v["mime_type"],
                              "item_id": v.get("item_id")})
        return newly

    def mark(self, drive_id, status, reason, item_id=None, read_modified_at=None):
        f = self.files[drive_id]
        f.update(status=status, reason=reason)
        if item_id:
            f["item_id"] = item_id
        if read_modified_at:
            f["read_modified_at"] = read_modified_at

    def reset(self):
        self.files = {}
        self.thumbs = {}

    def requeue(self, item_id):
        self.requeued.append(item_id)

    def log(self, **row):
        self.logged.append(row)

    def recent_log(self, limit):
        return self.logged[-limit:]

    def counts(self):
        return {}

    # following the documents

    def withdraw(self, item_id, reason):
        if item_id in self.deleted:
            return None
        if item_id in self.kept:
            self.withdrawn[item_id] = reason
            return "withdrawn"
        self.deleted.add(item_id)
        return "deleted"

    def restore(self, item_id):
        if self.withdrawn.pop(item_id, None):
            self.restored.append(item_id)

    def clean_up_withdrawn(self):
        loose = [i for i in self.withdrawn if i not in self.kept]
        for i in loose:
            del self.withdrawn[i]
            self.deleted.add(i)
        return len(loose)

    def drive_item_ids(self):
        return sorted({f["item_id"] for f in self.files.values() if f.get("item_id")} - self.deleted
                      - set(self.withdrawn))

    def in_a_newsletter(self, item_id):
        return item_id in self.kept

    def changed(self, item_id, at):
        self.changes[item_id] = at

    # saves

    def saved(self, kind, name, folder, file_id, link, folder_link, user_id, item_id=None, issue_id=None):
        self.saves.append({"kind": kind, "name": name, "folder": folder, "file_id": file_id, "item_id": item_id,
                           "issue_id": issue_id, "user_id": user_id})

    def unsaved_sent(self, since, limit=3):
        since = datetime.fromisoformat(since)
        done = {s["issue_id"] for s in self.saves if s["kind"] == "newsletter"}
        return [i for i, at in sorted(self.sent.items(), key=lambda x: x[1]) if at >= since and i not in done][:limit]

    # what the pages list

    def file_list(self):
        return [dict(f) for f in self.files.values() if not f.get("gone_at")]

    def catalogue_file(self, drive_id):
        f = self.files.get(drive_id)
        return dict(f) if f else None

    def folder_ids(self):
        return {k for k, v in self.files.items() if v["status"] == "folder" and not v.get("gone_at")}

    def pictures(self):
        return [{"drive_id": k, "name": v["name"], "mime_type": v["mime_type"], "path": v["path"],
                 "size": v["size"], "modified_at": v["modified_at"], "image_key": None}
                for k, v in self.files.items() if v["mime_type"].startswith("image/") and not v.get("gone_at")]

    def thumb(self, drive_id, modified_at):
        kept = self.thumbs.get(drive_id)
        return kept[1] if kept and kept[0] == modified_at else None

    def put_thumb(self, drive_id, modified_at, data):
        self.thumbs[drive_id] = (modified_at, data)

    def drop_thumbs(self, drive_ids):
        for d in drive_ids:
            self.thumbs.pop(d, None)

    def picture_of(self, item_id):
        return self.item_pictures.get(item_id)

    def pictures_from(self, drive_ids):
        return [key for key, d in self.imported if d in drive_ids]


class Ingest:
    """The ingest API: takes every item, the same address the same item."""

    def __init__(self):
        self.items, self.ids = [], {}

    def __call__(self, items):
        self.items.extend(items)
        out = []
        for item in items:
            new = item["url"] not in self.ids
            self.ids.setdefault(item["url"], 100 + len(self.ids))
            out.append({"accepted": True, "item_id": str(self.ids[item["url"]]), "new": new})
        return out


class Articles:
    """Articles as the API gives them."""

    def __init__(self):
        self.by_id = {
            7: {"id": 7, "title": "AI in schools", "title_fi": "Tekoäly kouluissa", "url": "https://example.org/ai",
                "publisher": "Example", "source": "Example feed", "source_type": "rss",
                "published_at": "2026-10-01T09:00:00+00:00", "summary": {"text": "Tiivistelmä tekoälystä."},
                "topics": [{"id": 1, "name": "Tekoäly"}], "tags": [{"label": "tekoäly"}], "picture": None,
                "raw_text": "THE WHOLE ORIGINAL ARTICLE", "suggested_section": "highlights"},
            8: {"id": 8, "title": "Seminaari", "url": "https://example.org/seminaari", "publisher": "EOK",
                "source_type": "webpage", "summary": {"text": "Seminaari 19.11."},
                "topics": [{"id": 1, "name": "Tekoäly"}], "tags": [], "picture": {"src": "/media/x", "rights": "own"},
                "event": {"starts": "2026-11-19", "place": "Hämeenlinna"}},
            9: {"id": 9, "title": "Uutinen", "url": "https://news.example/9", "source_type": "rss", "summary": None,
                "topics": [], "tags": [], "picture": {"src": "/media/y", "rights": "check"},
                "suggested_section": "events"},
            10: {"id": 10, "title": "Muistiinpanot", "url": "https://docs.google.com/x", "source_type": "drive",
                 "topics": [], "tags": []},
        }

    def one(self, item_id):
        return self.by_id.get(item_id)

    def listed(self, place, user_id):
        found = [a for a in self.by_id.values() if a["source_type"] != "drive"]
        return found, len(found)


class Pictures:
    """Kuvapankki."""

    def __init__(self):
        self.brought, self.let = [], []

    def thumbnail(self, data):
        return b"small:" + data[:4]

    def find(self, drive_id, since):
        return next(({"key": k} for k, d in self.brought if d == drive_id), None)

    def bring_in(self, data, name, drive_id, user_id):
        key = f"key-{len(self.brought) + 1}"
        self.brought.append((key, drive_id))
        return {"key": key, "name": name}

    def let_go(self, keys):
        self.let.extend(keys)


def guard(drive=None, store=None):
    drive = drive or association(NOW)
    store = store or Store()
    ingest = Ingest()
    g = Guard(store=store, drive=drive, ingest=ingest, now=lambda: NOW, articles=Articles(), pictures=Pictures(),
              newsletters=lambda issue_id: ({"name": f"Kirje {issue_id}"}, "<html>kirje</html>", []))
    return g, drive, store, ingest


def made_by_tool(drive):
    return [f["meta"] for f in drive.files.values() if f["meta"].get("appProperties")]


def under(drive, file_id):
    """The names of the folders a file is in, from the top down."""
    chain, meta = [], drive.files[file_id]["meta"]
    while meta["parents"] and meta["parents"][0] in drive.files:
        meta = drive.files[meta["parents"][0]]["meta"]
        chain.append(meta["name"])
    return list(reversed(chain))


class TheBoundary(unittest.TestCase):
    def test_nothing_outside_the_folder_is_ever_opened(self):
        g, drive, store, ingest = guard()
        g.check(ADMIN)
        g.sync(ADMIN)
        g.save_newsletter({"name": "Lokakuu"}, "<html>kirje</html>", [], ADMIN)
        g.save_article(7, None, EDITOR)
        g.import_picture("png0000002", EDITOR)
        touched = {file_id for call, file_id in drive.calls if call != "visible"}
        self.assertFalse(touched & OUTSIDE, touched & OUTSIDE)
        # The board's minutes are only ever seen as a name in the account's list.
        self.assertFalse([c for c in drive.calls if c[1] == "minutes001"])

    def test_folders_and_files_it_must_not_open_stay_closed(self):
        g, drive, store, ingest = guard()
        g.sync(ADMIN)
        opened = {file_id for call, file_id in drive.calls if call in ("children", "get", "export", "download")}
        self.assertFalse(opened & NEVER_OPENED, opened & NEVER_OPENED)
        self.assertEqual(store.files["register01"]["reason"], "personal_name")
        self.assertEqual(store.files["short00001"]["reason"], "shortcut")
        self.assertEqual(store.files["pdf0000001"]["reason"], "too_big")
        self.assertEqual(store.files["png0000001"]["reason"], "type")
        self.assertEqual(store.files["txt0000003"]["reason"], "personal_name")
        self.assertNotIn("txt0000004", store.files)  # inside the register: never even listed
        # Reading the folder opens no picture: only an editor's look in Kuvapankki does.
        self.assertFalse([c for c in drive.calls if c[0] == "download" and c[1].startswith(("png", "heic"))])

    def test_the_client_offers_no_way_to_delete_move_change_or_share(self):
        names = {n.lower() for n, _ in inspect.getmembers(drive_google.Drive, inspect.isfunction)}
        for word in ("delete", "trash", "update", "patch", "move", "rename", "copy", "permission", "share"):
            self.assertFalse([n for n in names if word in n], word)
        source = inspect.getsource(drive_google)
        for method in ('"DELETE"', '"PATCH"', '"PUT"', "/permissions"):
            self.assertNotIn(method, source)

    def test_a_file_moved_out_after_the_listing_is_not_read(self):
        g, drive, store, ingest = guard()

        def move_out(file_id):
            if file_id == "doc0000001":
                drive.move("doc0000001", "board00001")
        drive.on_get = move_out
        g.sync(ADMIN)
        self.assertEqual(store.files["doc0000001"]["reason"], "moved")
        self.assertNotIn("Mindtrek 2026 kutsu", [i["title"] for i in ingest.items])
        self.assertNotIn(("export", "doc0000001"), drive.calls)

    def test_another_folder_shared_by_mistake_is_named_by_the_check(self):
        g, drive, store, ingest = guard()
        result = g.check(ADMIN)
        self.assertEqual(result["outside_count"], 2)
        self.assertEqual(set(result["outside"]), {"Hallitus", "Pöytäkirja 9-2026"})
        self.assertEqual(result["folder"]["name"], "Uutiskirjeen aineisto")

    def test_a_folder_open_to_anyone_with_the_link_is_refused(self):
        drive = association(NOW)
        for f in drive.files.values():  # not shared with the account at all
            f["visible"] = False
        drive.files["root000001"]["public"] = True  # but anyone with the link may open it
        g, drive, store, ingest = guard(drive)
        self.assertEqual(g.check(ADMIN)["problem"], "link_only")
        self.assertEqual(g.sync(None), {"ran": False, "reason": "link_only"})
        with self.assertRaises(Refused) as e:
            g.save_newsletter({"name": "x"}, "<html></html>", [], ADMIN)
        self.assertEqual(e.exception.code, "link_only")
        with self.assertRaises(Refused) as e:
            g.save_article(7, None, EDITOR)
        self.assertEqual(e.exception.code, "link_only")
        self.assertFalse([c for c in drive.calls if c[0] in ("children", "export", "download", "upload")])


class Reading(unittest.TestCase):
    def test_what_becomes_an_article(self):
        g, drive, store, ingest = guard()
        summary = g.sync(None)  # the scheduled read
        by_title = {i["title"]: i for i in ingest.items}
        self.assertEqual(set(by_title), {"Mindtrek 2026 kutsu", "Sanoma Pro", "Muistiinpanot"})
        self.assertEqual(summary["read"], 3)
        self.assertEqual(summary["waiting"], 1)  # Luonnos.txt changed five minutes ago

    def test_an_admin_reading_now_does_not_wait(self):
        g, drive, store, ingest = guard()
        summary = g.sync(ADMIN)
        self.assertIn("Luonnos", [i["title"] for i in ingest.items])
        self.assertEqual(summary["waiting"], 0)

    def test_contact_details_never_reach_the_ai(self):
        g, drive, store, ingest = guard()
        g.sync(ADMIN)
        event = next(i for i in ingest.items if i["title"] == "Mindtrek 2026 kutsu")
        self.assertNotIn("info@mindtrek.org", event["raw_text"])
        self.assertNotIn("040 123 4567", event["raw_text"])
        self.assertEqual(event["details"]["redacted"], {"email": 1, "phone": 1})
        self.assertEqual(event["section"], "events")

    def test_a_document_with_an_identity_code_is_kept_out_whole(self):
        g, drive, store, ingest = guard()
        g.sync(ADMIN)
        self.assertEqual(store.files["txt0000002"]["reason"], "personal_id")
        self.assertFalse([i for i in ingest.items if "Meikäläinen" in i["raw_text"]])
        logged = [r for r in store.logged if r["drive_id"] == "txt0000002"]
        self.assertEqual(logged[-1]["outcome"], "refused")
        self.assertNotIn("Meikäläinen", str(store.logged))  # names in the log, never contents

    def test_orders_to_the_ai_are_flagged_and_the_text_still_goes_in(self):
        g, drive, store, ingest = guard()
        g.sync(ADMIN)
        notes = next(i for i in ingest.items if i["title"] == "Muistiinpanot")
        self.assertTrue(notes["details"]["ai_instructions"])
        self.assertTrue([r for r in store.logged if r["reason"] == "ai_instructions"])

    def test_word_documents_and_sections_from_folders(self):
        g, drive, store, ingest = guard()
        g.sync(ADMIN)
        sanoma = next(i for i in ingest.items if i["title"] == "Sanoma Pro")
        self.assertIn("oppimisalustan", sanoma["raw_text"])
        self.assertEqual(sanoma["section"], "member_news")
        self.assertEqual(sanoma["details"]["folder"], "Jäsenkuulumisia")

    def test_read_once_and_again_only_when_changed(self):
        g, drive, store, ingest = guard()
        g.sync(ADMIN)
        first = len(ingest.items)
        g.sync(ADMIN)
        self.assertEqual(len(ingest.items), first)
        drive.files["txt0000001"]["meta"]["modifiedTime"] = "2026-10-05T11:00:00Z"
        g.sync(ADMIN)
        self.assertEqual(len(ingest.items), first + 1)
        self.assertEqual(store.requeued, [ingest.ids[drive.files["txt0000001"]["meta"]["webViewLink"]]])

    def test_its_own_saves_are_never_read_back(self):
        g, drive, store, ingest = guard()
        g.save_newsletter({"name": "Lokakuu"}, "<html>kirje</html>", [], ADMIN)
        g.save_article(7, None, EDITOR)
        ingest.items.clear()
        g.sync(ADMIN)
        self.assertFalse([i for i in ingest.items if "kirje" in i["raw_text"] or "Tiivistelmä" in i["raw_text"]])
        self.assertEqual(store.files["output0001"]["status"], "own")


class FollowingTheDocuments(unittest.TestCase):
    """What happens to an article when its document leaves the folder,
    becomes one the guard does not read, or changes."""

    def read(self):
        g, drive, store, ingest = guard()
        g.sync(ADMIN)
        return g, drive, store, ingest, store.files["txt0000001"]["item_id"]

    def test_a_document_deleted_from_the_folder_takes_its_article_away(self):
        g, drive, store, ingest, notes = self.read()
        drive.trash("txt0000001")
        summary = g.sync(None)
        self.assertIn(notes, store.deleted)
        self.assertEqual(summary["withdrawn"], 1)
        self.assertTrue([r for r in store.logged if r["action"] == "withdraw" and r["reason"] == "gone"])

    def test_one_a_newsletter_has_stays_for_it(self):
        g, drive, store, ingest, notes = self.read()
        store.kept.add(notes)
        drive.move("txt0000001", "board00001")  # moved out of the folder
        g.sync(None)
        self.assertEqual(store.withdrawn.get(notes), "gone")
        self.assertNotIn(notes, store.deleted)

    def test_renamed_to_say_it_holds_peoples_details(self):
        g, drive, store, ingest, notes = self.read()
        drive.rename("txt0000001", "Ilmoittautuneet syksy.txt")
        g.sync(None)
        self.assertIn(notes, store.deleted)
        self.assertEqual(store.files["txt0000001"]["reason"], "personal_name")

    def test_an_identity_code_added_later(self):
        g, drive, store, ingest, notes = self.read()
        drive.write("txt0000001", "Syksyn webinaarit. Puhuja 131052-308T.".encode())
        g.sync(None)
        self.assertIn(notes, store.deleted)
        self.assertEqual(store.files["txt0000001"]["reason"], "personal_id")

    def test_a_listing_that_stopped_early_takes_nothing_away(self):
        g, drive, store, ingest, notes = self.read()
        drive.trash("txt0000001")
        limit = drive_rules.MAX_ITEMS
        drive_rules.MAX_ITEMS = 3
        try:
            summary = g.sync(None)
        finally:
            drive_rules.MAX_ITEMS = limit
        self.assertFalse(summary["complete"])
        self.assertFalse(store.deleted)

    def test_a_folder_that_cannot_be_reached_takes_nothing_away(self):
        g, drive, store, ingest, notes = self.read()
        drive.files["root000001"]["visible"] = False
        self.assertEqual(g.sync(None)["ran"], False)
        self.assertFalse(store.deleted)
        self.assertFalse(store.withdrawn)

    def test_a_document_back_in_the_folder_is_read_again(self):
        g, drive, store, ingest, notes = self.read()
        store.kept.add(notes)
        drive.trash("txt0000001")
        g.sync(None)
        self.assertIn(notes, store.withdrawn)
        drive.trash("txt0000001", False)
        before = len(ingest.items)
        g.sync(None)
        self.assertEqual(len(ingest.items), before + 1)
        self.assertNotIn(notes, store.withdrawn)
        self.assertIn(notes, store.restored)

    def test_a_change_after_its_article_went_into_a_newsletter_waits_for_an_editor(self):
        g, drive, store, ingest, notes = self.read()
        store.kept.add(notes)
        drive.write("txt0000001", "Syksyn webinaarien aiheet muuttuivat.".encode())
        g.sync(None)
        self.assertIn(notes, store.changes)
        self.assertIn(notes, store.requeued)

    def test_a_change_before_that_only_brings_a_new_summary(self):
        g, drive, store, ingest, notes = self.read()
        drive.write("txt0000001", "Syksyn webinaarien aiheet muuttuivat.".encode())
        g.sync(None)
        self.assertFalse(store.changes)
        self.assertIn(notes, store.requeued)

    def test_an_admin_can_take_every_drive_article_out(self):
        g, drive, store, ingest, notes = self.read()
        store.kept.add(notes)
        everything = len(store.drive_item_ids())
        done = g.withdraw_all(ADMIN)
        self.assertEqual(done, {"withdrawn": 1, "deleted": everything - 1})


class SavingArticles(unittest.TestCase):
    def test_an_article_goes_into_its_topics_folder_made_once(self):
        g, drive, store, ingest = guard()
        store.item_pictures[8] = {"data": b"\xff\xd8own", "mime": "image/jpeg", "credit": None, "rights": "own"}
        first = g.save_article(7, None, EDITOR)
        second = g.save_article(8, None, EDITOR)
        self.assertEqual((first["folder"]["name"], second["folder"]["name"]), ("Tekoäly", "Tekoäly"))
        folders = [m for m in made_by_tool(drive) if m["mimeType"] == FOLDER]
        self.assertEqual(sorted(m["name"] for m in folders), ["Artikkelit", "Tekoäly"])
        topic = next(m for m in folders if m["name"] == "Tekoäly")
        self.assertEqual(under(drive, topic["id"]), ["Uutiskirjeen aineisto", "Uutiskirjetyökalu", "Artikkelit"])
        inside = [m for m in made_by_tool(drive) if m["parents"] == [topic["id"]]]
        self.assertEqual(len(inside), 3)  # two Docs, and the second article's own picture
        self.assertEqual([s["item_id"] for s in store.saves], [7, 8])

    def test_the_editor_names_the_folder(self):
        g, drive, store, ingest = guard()
        saved = g.save_article(7, "  Syysseminaari / tausta ", EDITOR)
        self.assertEqual(saved["folder"]["name"], "Syysseminaari tausta")

    def test_a_folder_named_like_peoples_details_is_refused(self):
        g, drive, store, ingest = guard()
        with self.assertRaises(Refused) as e:
            g.save_article(7, "Jäsenrekisteri", EDITOR)
        self.assertEqual(e.exception.code, "personal_name")
        self.assertFalse([c for c in drive.calls if c[0] in ("create_folder", "upload")])

    def test_a_document_from_the_folder_is_not_saved_again(self):
        g, drive, store, ingest = guard()
        with self.assertRaises(Refused) as e:
            g.save_article(10, None, EDITOR)
        self.assertEqual(e.exception.code, "from_drive")

    def test_the_picture_goes_along_only_when_it_may(self):
        g, drive, store, ingest = guard()
        store.item_pictures[8] = {"data": b"\xff\xd8own", "mime": "image/jpeg", "credit": None, "rights": "own"}
        store.item_pictures[9] = {"data": b"\xff\xd8pub", "mime": "image/jpeg", "credit": "Lehti", "rights": "check"}
        with_picture = g.save_article(8, None, EDITOR)
        without = g.save_article(9, None, EDITOR)
        self.assertEqual(len(with_picture["files"]), 2)
        self.assertEqual(len(without["files"]), 1)
        self.assertEqual(without["folder"]["name"], "Tapahtumat")  # no topic: its suggested section

    def test_the_original_full_text_is_never_saved(self):
        g, drive, store, ingest = guard()
        g.save_article(7, None, EDITOR)
        saved = b"".join(f["content"] for f in drive.files.values() if f["meta"].get("appProperties"))
        self.assertNotIn(b"THE WHOLE ORIGINAL ARTICLE", saved)
        self.assertIn("Tiivistelmä tekoälystä.".encode(), saved)

    def test_writes_stay_inside_the_tools_own_folder(self):
        g, drive, store, ingest = guard()
        g.save_article(7, None, EDITOR)
        g.save_list({"view": "all", "sort": "collected", "filters": {}}, "Tekoäly", "Tekoäly", EDITOR)
        g.save_newsletter({"name": "Lokakuu"}, "<html>kirje</html>", [], ADMIN)
        writes = [parent for call, parent in drive.calls if call in ("create_folder", "upload")]
        self.assertTrue(writes)
        for parent in writes:
            self.assertIn("Uutiskirjetyökalu", [drive.files[parent]["meta"]["name"]] + under(drive, parent))

    def test_a_list_is_one_doc_and_one_sheet(self):
        g, drive, store, ingest = guard()
        saved = g.save_list({"view": "all", "sort": "collected", "filters": {}}, "Tekoäly", None, EDITOR)
        self.assertEqual(saved["folder"]["name"], "Koosteet")
        self.assertEqual([f["type"] for f in saved["files"]],
                         ["application/vnd.google-apps.document", "application/vnd.google-apps.spreadsheet"])
        self.assertEqual(saved["count"], 3)

    def test_a_recent_check_is_trusted_for_the_next_save(self):
        g, drive, store, ingest = guard()
        g.save_article(7, None, EDITOR)
        g.save_article(8, None, EDITOR)
        self.assertEqual(len([c for c in drive.calls if c[0] == "visible"]), 1)

    def test_a_newsletter_goes_into_uutiskirjeet(self):
        g, drive, store, ingest = guard()
        saved = g.save_newsletter({"name": "Lokakuun uutiskirje"}, "<html>kirje</html>",
                                  [{"section": "events", "title": "=HYPERLINK(1)", "source": "Drive"}], ADMIN,
                                  issue_id=5)
        folder = next(m for m in made_by_tool(drive) if m["name"].startswith("Lokakuun uutiskirje"))
        self.assertEqual(under(drive, folder["id"])[-1], "Uutiskirjeet")
        self.assertEqual(len(saved["files"]), 3)
        self.assertEqual(store.saves[-1]["issue_id"], 5)
        sheet = next(f for f in drive.files.values() if f["meta"]["parents"] == [folder["id"]]
                     and f["meta"]["mimeType"].endswith("spreadsheet"))
        self.assertIn(b"'=HYPERLINK", sheet["content"])  # never a formula in the sheet

    def test_no_save_when_it_may_only_read(self):
        drive = association(NOW)
        drive.files["output0001"]["meta"]["capabilities"]["canAddChildren"] = False
        g, drive, store, ingest = guard(drive)
        with self.assertRaises(Refused) as e:
            g.save_newsletter({"name": "x"}, "<html></html>", [], ADMIN)
        self.assertEqual(e.exception.code, "read_only")
        with self.assertRaises(Refused) as e:
            g.save_article(7, None, EDITOR)
        self.assertEqual(e.exception.code, "read_only")
        self.assertFalse([c for c in drive.calls if c[0] in ("create_folder", "upload")])

    def test_no_save_from_a_my_drive_folder(self):
        drive = association(NOW)
        for f in drive.files.values():
            f["meta"].pop("driveId", None)
        g, drive, store, ingest = guard(drive)
        self.assertEqual(g.check(ADMIN)["save"], "my_drive")
        with self.assertRaises(Refused) as e:
            g.save_newsletter({"name": "x"}, "<html></html>", [], ADMIN)
        self.assertEqual(e.exception.code, "my_drive")
        self.assertEqual(g.save_options(7, EDITOR)["save"], "my_drive")

    def test_a_whole_folder_to_edit_gets_a_folder_of_the_tools_own(self):
        drive = association(NOW)
        drive.files["root000001"]["meta"]["capabilities"]["canAddChildren"] = True
        del drive.files["output0001"]
        g, drive, store, ingest = guard(drive)
        self.assertEqual(g.check(ADMIN)["save"], "whole_folder")
        g.save_newsletter({"name": "x"}, "<html></html>", [], ADMIN)
        g.save_article(7, None, EDITOR)
        own = [m for m in made_by_tool(drive) if m["name"] == "Uutiskirjetyökalu"]
        self.assertEqual(len(own), 1)
        self.assertEqual(own[0]["parents"], ["root000001"])


class PicturesForKuvapankki(unittest.TestCase):
    def listed(self):
        g, drive, store, ingest = guard()
        g.sync(ADMIN)
        return g, drive, store

    def test_the_folders_pictures_are_listed_without_opening_them(self):
        g, drive, store = self.listed()
        calls = len(drive.calls)
        pictures = {p["name"]: p["usable"] for p in g.picture_list()}
        self.assertEqual(pictures, {"Logo.png": True, "Syysseminaari.png": True, "IMG_2041.heic": False,
                                    "Osallistujalista.png": False})
        self.assertEqual(len(drive.calls), calls)

    def test_a_preview_is_made_once(self):
        g, drive, store = self.listed()
        first = g.thumbnail("png0000002", EDITOR)
        self.assertEqual(g.thumbnail("png0000002", EDITOR), first)
        self.assertEqual(len([c for c in drive.calls if c == ("download", "png0000002")]), 1)

    def test_only_a_picture_in_the_guards_own_listing_is_opened(self):
        g, drive, store = self.listed()
        drive.calls.clear()
        for drive_id, code in (("budget0001", "not_in_folder"), ("minutes001", "not_in_folder"),
                               ("png0000003", "personal_name"), ("heic000001", "type"),
                               ("pictures01", "not_in_folder")):
            with self.assertRaises(Refused) as e:
                g.import_picture(drive_id, EDITOR)
            self.assertEqual(e.exception.code, code, drive_id)
        self.assertFalse([c for c in drive.calls if c[0] == "download"])

    def test_a_picture_moved_out_is_not_opened(self):
        g, drive, store = self.listed()
        drive.move("png0000002", "board00001")
        with self.assertRaises(Refused) as e:
            g.thumbnail("png0000002", EDITOR)
        self.assertEqual(e.exception.code, "moved")
        self.assertNotIn(("download", "png0000002"), drive.calls)

    def test_a_picture_is_brought_in_once(self):
        g, drive, store = self.listed()
        first = g.import_picture("png0000002", EDITOR)
        second = g.import_picture("png0000002", EDITOR)
        self.assertEqual(first["key"], second["key"])
        self.assertEqual(len(g.pictures.brought), 1)
        self.assertTrue([r for r in store.logged if r["action"] == "import"])

    def test_a_picture_that_left_the_folder_leaves_kuvapankki(self):
        g, drive, store = self.listed()
        g.thumbnail("png0000002", EDITOR)
        store.imported.append(("key-1", "png0000002"))
        drive.trash("png0000002")
        g.sync(None)
        self.assertEqual(g.pictures.let, ["key-1"])
        self.assertNotIn("png0000002", store.thumbs)


class SavingSentNewsletters(unittest.TestCase):
    def test_each_sent_newsletter_is_saved_once(self):
        g, drive, store, ingest = guard()
        g.set_autosave(True, ADMIN)
        store.sent = {3: NOW - timedelta(days=30), 4: NOW + timedelta(minutes=1)}
        self.assertEqual(g.sync(None)["saved"], 1)
        self.assertEqual(g.sync(None)["saved"], 0)
        self.assertEqual([s["issue_id"] for s in store.saves], [4])

    def test_nothing_is_saved_by_itself_while_it_is_off(self):
        g, drive, store, ingest = guard()
        store.sent = {4: NOW}
        self.assertEqual(g.sync(None)["saved"], 0)
        self.assertFalse(store.saves)


class Switches(unittest.TestCase):
    def test_off_means_nothing_happens(self):
        g, drive, store, ingest = guard(store=Store(enabled=False))
        self.assertEqual(g.sync(None), {"ran": False, "reason": "off"})
        self.assertEqual(drive.calls, [])
        self.assertEqual(store.logged, [])  # the scheduled run leaves no row when off
        for attempt in (lambda: g.sync(ADMIN), lambda: g.save_newsletter({"name": "x"}, "<html></html>", [], ADMIN),
                        lambda: g.save_article(7, None, EDITOR), lambda: g.import_picture("png0000002", EDITOR)):
            with self.assertRaises(Refused):
                attempt()
        self.assertEqual([r["outcome"] for r in store.logged], ["refused"] * 4)
        self.assertEqual(drive.calls, [])

    def test_a_folder_is_chosen_by_its_address_only(self):
        g, drive, store, ingest = guard(store=Store(folder=""))
        with self.assertRaises(Refused) as e:
            g.set_folder("https://evil.example/drive/folders/root000001", ADMIN)
        self.assertEqual(e.exception.code, "bad_link")
        state = g.set_folder("https://drive.google.com/drive/folders/root000001", ADMIN)
        self.assertEqual(state["folder_name"], "Uutiskirjeen aineisto")
        self.assertTrue(state["can_save"])

    def test_the_scheduled_run_logs_only_what_matters(self):
        g, drive, store, ingest = guard()
        g.sync(None)
        rows = len(store.logged)
        g.sync(None)  # nothing new
        self.assertEqual(len(store.logged), rows)


class WhenItReads(unittest.TestCase):
    def test_the_next_read(self):
        helsinki = timezone(timedelta(hours=3))
        self.assertEqual(next_read(datetime(2026, 10, 5, 14, 3, tzinfo=helsinki))[:16], "2026-10-05T14:10")
        self.assertEqual(next_read(datetime(2026, 10, 5, 14, 10, tzinfo=helsinki))[:16], "2026-10-05T14:10")
        self.assertEqual(next_read(datetime(2026, 10, 5, 14, 10, 1, tzinfo=helsinki))[:16], "2026-10-05T14:25")
        self.assertEqual(next_read(datetime(2026, 10, 5, 14, 56, tzinfo=helsinki))[:16], "2026-10-05T15:10")

    def test_the_file_list_says_when_a_waiting_document_is_read(self):
        g, drive, store, ingest = guard()
        g.sync(None)
        listed = {f["name"]: f for f in g.files()["files"]}
        # Luonnos.txt changed five minutes before noon UTC, 14.55 in Helsinki:
        # half an hour after that is 15.25, a time the folder is read.
        self.assertEqual(listed["Luonnos.txt"]["next_read_at"][11:16], "15:25")
        self.assertNotIn("next_read_at", listed["Muistiinpanot.txt"])


if __name__ == "__main__":
    unittest.main()
