"""The Drive guard against a stand-in for the association's Drive
(tests/fake_drive.py): what it reads, what it refuses, where it saves, and
above all what it never touches.

  docker compose exec dashboard python -m unittest discover -s tests -v
"""

import inspect
import unittest
from datetime import datetime, timezone
from types import SimpleNamespace

from app.services import drive_google
from app.services.drive import Guard, Refused
from tests.fake_drive import association

NOW = datetime(2026, 10, 5, 12, 0, tzinfo=timezone.utc)
ADMIN = SimpleNamespace(id=1, name="Vinh", role="admin")
OUTSIDE = {"board00001", "minutes001", "money00001", "budget0001"}
NEVER_OPENED = {"register01", "txt0000004", "txt0000003", "png0000001", "short00001", "pdf0000001"}


class Store:
    """queries.drive, in memory."""

    def __init__(self, folder="root000001", enabled=True):
        self.values = {"drive_enabled": "true" if enabled else "false", "drive_folder_id": folder,
                       "drive_folder_name": "", "drive_output_folder_id": "", "drive_check": "",
                       "drive_synced_at": ""}
        self.files, self.logged, self.requeued, self.active = {}, [], [], enabled

    def settings(self):
        import json
        return {"enabled": self.values["drive_enabled"] == "true", "folder_id": self.values["drive_folder_id"],
                "folder_name": self.values["drive_folder_name"], "output_id": self.values["drive_output_folder_id"],
                "check": json.loads(self.values["drive_check"] or "null"), "synced": self.values["drive_synced_at"]}

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
            status = e["status"] or old.get("status") or "new"
            self.files[e["drive_id"]] = {**old, **e, "status": status,
                                         "reason": e["reason"] if e["status"] else old.get("reason")}

    def gone(self, seen):
        for k, v in self.files.items():
            v["gone"] = k not in seen

    def mark(self, drive_id, status, reason, item_id=None, read_modified_at=None):
        f = self.files[drive_id]
        f.update(status=status, reason=reason)
        if item_id:
            f["item_id"] = item_id
        if read_modified_at:
            f["read_modified_at"] = read_modified_at

    def reset(self):
        self.files = {}

    def requeue(self, item_id):
        self.requeued.append(item_id)

    def log(self, **row):
        self.logged.append(row)

    def recent_log(self, limit):
        return self.logged[-limit:]

    def counts(self):
        return {}


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


def guard(drive=None, store=None):
    drive = drive or association(NOW)
    store = store or Store()
    ingest = Ingest()
    return Guard(store=store, drive=drive, ingest=ingest, now=lambda: NOW), drive, store, ingest


class TheBoundary(unittest.TestCase):
    def test_nothing_outside_the_folder_is_ever_opened(self):
        g, drive, store, ingest = guard()
        g.check(ADMIN)
        g.sync(ADMIN)
        g.save_newsletter({"name": "Lokakuu"}, "<html>kirje</html>", [], ADMIN)
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
        self.assertFalse([c for c in drive.calls if c[0] in ("children", "export", "download", "upload")])


class Reading(unittest.TestCase):
    def test_what_becomes_an_article(self):
        g, drive, store, ingest = guard()
        summary = g.sync(None)  # the hourly read
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
        ingest.items.clear()
        g.sync(ADMIN)
        self.assertFalse([i for i in ingest.items if "kirje" in i["raw_text"]])
        self.assertEqual(store.files["output0001"]["status"], "own")


class Saving(unittest.TestCase):
    def test_saves_go_into_the_tools_folder_only(self):
        g, drive, store, ingest = guard()
        saved = g.save_newsletter({"name": "Lokakuun uutiskirje"}, "<html>kirje</html>",
                                  [{"section": "events", "title": "Mindtrek", "source": "Drive"}], ADMIN)
        made = [f["meta"] for f in drive.files.values() if f["meta"].get("appProperties")]
        folder = next(m for m in made if m["mimeType"] == "application/vnd.google-apps.folder")
        self.assertEqual(folder["parents"], ["output0001"])
        self.assertEqual(len([m for m in made if m["parents"] == [folder["id"]]]), 3)
        self.assertEqual(len(saved["files"]), 3)
        writes = [(c, f) for c, f in drive.calls if c in ("create_folder", "upload")]
        self.assertTrue(all(f in ("output0001", folder["id"]) for c, f in writes), writes)

    def test_no_save_when_it_may_only_read(self):
        drive = association(NOW)
        drive.files["output0001"]["meta"]["capabilities"]["canAddChildren"] = False
        g, drive, store, ingest = guard(drive)
        with self.assertRaises(Refused) as e:
            g.save_newsletter({"name": "x"}, "<html></html>", [], ADMIN)
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

    def test_a_whole_folder_to_edit_gets_a_folder_of_the_tools_own(self):
        drive = association(NOW)
        drive.files["root000001"]["meta"]["capabilities"]["canAddChildren"] = True
        del drive.files["output0001"]
        g, drive, store, ingest = guard(drive)
        self.assertEqual(g.check(ADMIN)["save"], "whole_folder")
        g.save_newsletter({"name": "x"}, "<html></html>", [], ADMIN)
        own = [f["meta"] for f in drive.files.values() if f["meta"]["name"] == "Uutiskirjetyökalu"
               and f["meta"].get("appProperties")]
        self.assertEqual(len(own), 1)
        self.assertEqual(own[0]["parents"], ["root000001"])


class Switches(unittest.TestCase):
    def test_off_means_nothing_happens(self):
        g, drive, store, ingest = guard(store=Store(enabled=False))
        self.assertEqual(g.sync(None), {"ran": False, "reason": "off"})
        self.assertEqual(drive.calls, [])
        self.assertEqual(store.logged, [])  # the hourly run leaves no row when off
        with self.assertRaises(Refused):
            g.sync(ADMIN)
        with self.assertRaises(Refused):
            g.save_newsletter({"name": "x"}, "<html></html>", [], ADMIN)
        self.assertEqual([r["outcome"] for r in store.logged], ["refused", "refused"])

    def test_a_folder_is_chosen_by_its_address_only(self):
        g, drive, store, ingest = guard(store=Store(folder=""))
        with self.assertRaises(Refused) as e:
            g.set_folder("https://evil.example/drive/folders/root000001", ADMIN)
        self.assertEqual(e.exception.code, "bad_link")
        state = g.set_folder("https://drive.google.com/drive/folders/root000001", ADMIN)
        self.assertEqual(state["folder_name"], "Uutiskirjeen aineisto")
        self.assertTrue(state["can_save"])

    def test_the_hourly_run_logs_only_what_matters(self):
        g, drive, store, ingest = guard()
        g.sync(None)
        rows = len(store.logged)
        g.sync(None)  # nothing new
        self.assertEqual(len(store.logged), rows)


if __name__ == "__main__":
    unittest.main()
