"""Google Drive: the association's one folder, read for the newsletter's
material and written to for what the editors keep. Everything here goes
through the guard below, and nothing else in the dashboard talks to Drive.
docs/drive.md explains it for the association.
Jira: DM42-43

Three things keep the tool, and the AI in it, in that one folder. They do
not depend on each other, so if one fails the other two still hold:

  1. Google. The tool is a Google account of its own, a service account, and
     the association shares only this folder with it, to read, and one
     folder inside it to save in. Google shows the account nothing else,
     whatever any code asks for.
  2. This guard. Every file it touches comes from its own listing of that
     folder, never from a request, a document or the AI, and is checked
     again just before it is read. It reads documents only, opens no file
     whose name says it holds people's details, keeps out a document with a
     personal identity code, and takes contact details and bank accounts out
     of the text before it goes further. It saves new files in the tool's
     own folder only, and has no way to delete, move, change or share
     anything (drive_google.py has no such request). Every action, allowed
     or refused, is a row in drive_log, which Asetukset shows.
  3. The AI's instructions. The AI gets the text the guard gives it, never
     the key, a file's address or a way to ask for a file, and its
     instructions for a document from Drive say it is material, not orders
     (n8n/workflows/summarisation.json).

What it does with the folder (34-drive-library.sql):
  - reads it every 15 minutes: new and changed documents become articles;
  - follows the documents it read: when one leaves the folder, is renamed to
    say it holds people's details, or gets a personal identity code, its
    article is taken out of the tool; when one changes after its article
    went into a newsletter, Tarkistus holds the email until an editor looks;
  - saves, when an editor asks: an article, a list of articles, a finished
    newsletter, each into a folder of the tool's own inside its save folder,
    and each sent newsletter by itself when an admin switches that on;
  - shows the folder's pictures in Kuvapankki, and brings in the one an
    editor picks.
"""

import csv
import io
import json
import threading
import urllib.error
import urllib.request
from datetime import datetime, timedelta, timezone

from .. import config
from ..queries import drive as queries
from . import drive_docs as docs
from . import drive_rules as rules
from .collection import HELSINKI
from .drive_google import Drive, DriveError

# How many documents one run reads at most. The rest wait for the next run.
MAX_READS = 25
MAX_VISIBLE = 2000
# When n8n reads the folder, as minutes past the hour (n8n/workflows/drive.json).
# The file list tells when a document waiting will be read.
READ_MINUTES = (10, 25, 40, 55)
# A check this recent is trusted for a save; an older one is made again.
CHECK_FRESH = timedelta(minutes=15)
# The folders the tool makes inside its save folder.
ARTICLES = "Artikkelit"
NEWSLETTERS = "Uutiskirjeet"
# How many articles one saved list holds at most.
MAX_LIST = 100
# How many sent newsletters one run saves by itself at most.
MAX_AUTOSAVES = 3
# Making a folder is looked up and done by one request at a time, so two
# editors saving at once never make two folders of the same name.
_folders = threading.Lock()


class Refused(Exception):
    """A request the guard says no to, with a code the pages translate."""

    def __init__(self, code, message, **params):
        super().__init__(message)
        self.code = code
        self.params = params


class Guard:
    """store is queries.drive, drive is drive_google.Drive and ingest hands
    articles to the ingest API. articles, pictures and newsletters are what
    the guard saves and brings in from the rest of the dashboard. Tests give
    stand-ins for all of them."""

    def __init__(self, store=queries, drive=None, ingest=None, now=None, articles=None, pictures=None,
                 newsletters=None):
        self.store = store
        self.drive = drive or Drive.from_config()
        self.ingest = ingest or _ingest
        self.now = now or (lambda: datetime.now(timezone.utc))
        self.articles = articles or Articles()
        self.pictures = pictures or Pictures()
        self.newsletters = newsletters or _newsletter

    # --- the log --------------------------------------------------------------

    def _log(self, user, action, outcome, reason=None, file=None, detail=None):
        self.store.log(user_id=user.id if user else None, actor=user.name if user else "n8n", action=action,
                       outcome=outcome, reason=reason, drive_id=(file or {}).get("id"),
                       name=(file or {}).get("name"), detail=detail)

    def _refuse(self, user, action, code, message, file=None, **params):
        self._log(user, action, "refused", code, file, params or None)
        raise Refused(code, message, **params)

    # --- what the pages show ----------------------------------------------------

    def account(self):
        """The tool's Google address, and why there is none."""
        try:
            return self.drive.account(), None
        except DriveError as e:
            return None, e.code

    def state(self, admin):
        s = self.store.settings()
        account, problem = self.account()
        check = s["check"] or {}
        on = bool(account) and s["enabled"] and bool(s["folder_id"])
        state = {
            "configured": bool(account),
            "enabled": on,
            "folder_name": s["folder_name"],
            "can_save": on and check.get("save") in ("subfolder", "whole_folder"),
            "save": check.get("save") if on else None,
            "save_folder": (check.get("output") or {}).get("name"),
            "autosave": s["autosave"],
            "synced": s["synced"],
        }
        if admin:
            state.update(account=account, problem=problem, switched_on=s["enabled"], folder_id=s["folder_id"],
                         check=s["check"], counts=self.store.counts(), log=self.store.recent_log(40))
        return state

    # --- the admin's settings ---------------------------------------------------------

    def set_folder(self, link, user):
        folder = rules.folder_id(link)
        if not folder:
            self._refuse(user, "settings", "bad_link", "That is not the address of a Drive folder.")
        s = self.store.settings()
        if folder != s["folder_id"]:
            # Another folder: what was listed of the old one no longer counts.
            self.store.reset()
            self.store.put("drive_output_folder_id", "")
            self.store.put("drive_folder_name", "")
            self.store.put("drive_check", "")
        self.store.put("drive_folder_id", folder)
        self._log(user, "settings", "allowed", "folder", {"id": folder})
        try:
            self.check(user)
        except (Refused, DriveError):
            pass  # the check says what is wrong, and the page shows it
        return self.state(admin=True)

    def set_enabled(self, on, user):
        self.store.put("drive_enabled", "true" if on else "false")
        self.store.set_source_active(on)
        self._log(user, "settings", "allowed", "on" if on else "off")
        return self.state(admin=True)

    def set_autosave(self, on, user):
        """Each newsletter sent from now on is saved into the folder by
        itself, within a quarter of an hour of being marked sent."""
        self.store.put("drive_autosave_sent", "true" if on else "false")
        if on:
            self.store.put("drive_autosave_since", self.now().isoformat())
        self._log(user, "settings", "allowed", "autosave_on" if on else "autosave_off")
        return self.state(admin=True)

    def withdraw_all(self, user):
        """An admin taking every article made from the folder out of the tool
        at once, by the same rules as when their documents leave the folder:
        one a newsletter has stays for it, without its text."""
        done = {"deleted": 0, "withdrawn": 0}
        for item_id in self.store.drive_item_ids():
            result = self.store.withdraw(item_id, "removed")
            if result:
                done[result] += 1
        self._log(user, "withdraw", "allowed", "all", None, done)
        return done

    # --- the check ----------------------------------------------------------------------

    def check(self, user=None, quiet=False):
        """What the tool's Google account can reach: the folder, how much is
        in it, where it may save, and anything it can see outside the folder,
        which should be nothing. Kept in app_settings for the page. quiet is
        the scheduled run's check, logged only when its answer has changed."""
        s = self.store.settings()
        if not s["folder_id"]:
            self._refuse(user, "check", "no_folder", "No folder has been chosen.")
        account, problem = self.account()
        if not account:
            self._refuse(user, "check", problem or "no_key", "The tool has no Google key on the server.")
        result = {"account": account, "at": self.now().isoformat()}
        before = s["check"] or {}
        try:
            root = self.drive.get(s["folder_id"])
        except DriveError as e:
            result["problem"] = "folder_not_found" if e.code in ("not_found", "no_access") else e.code
            self._finish_check(result, before, user, quiet, "failed", result["problem"])
            return result
        if root.get("mimeType") != rules.FOLDER or root.get("trashed"):
            result["problem"] = "not_a_folder"
            self._finish_check(result, before, user, quiet, "failed", "not_a_folder")
            return result

        try:
            visible = self.drive.visible(limit=MAX_VISIBLE)
        except DriveError as e:
            result["problem"] = e.code
            self._finish_check(result, before, user, quiet, "failed", e.code)
            return result
        if root["id"] not in {f["id"] for f in visible} and len(visible) < MAX_VISIBLE:
            # Google opened the folder because anyone with its link may, not
            # because it was shared with the tool: a folder shared with the
            # account is in what the account sees. Such a folder is open to
            # the whole internet, and the tool stays out of it until it is
            # shared with the tool and its link is restricted again.
            result["problem"] = "link_only"
            self._finish_check(result, before, user, quiet, "refused", "link_only")
            return result
        ins, outs = rules.split_visible(visible + [root], root["id"])
        ins = [f for f in ins if f["id"] != root["id"]]
        save, output = self._save_place(root, ins)
        result.update(
            folder={"id": root["id"], "name": root.get("name"), "shared_drive": bool(root.get("driveId"))},
            files=sum(1 for f in ins if f.get("mimeType") != rules.FOLDER),
            folders=sum(1 for f in ins if f.get("mimeType") == rules.FOLDER),
            outside=[f.get("name") or f["id"] for f in outs][:20],
            outside_count=len(outs),
            more=len(visible) >= MAX_VISIBLE,
            save=save,
            output={"id": output["id"], "name": output.get("name"), "link": output.get("webViewLink")}
            if output else None,
        )
        self.store.put("drive_folder_name", root.get("name") or "")
        self.store.put("drive_output_folder_id", output["id"] if output else "")
        self._finish_check(result, before, user, quiet, "allowed", "outside" if outs else None)
        return result

    SUMMARY = ("problem", "outside_count", "save", "files", "folders")

    def _finish_check(self, result, before, user, quiet, outcome, reason):
        self.store.put("drive_check", json.dumps(result, ensure_ascii=False))
        detail = {k: result.get(k) for k in self.SUMMARY if k in result}
        changed = any(result.get(k) != before.get(k) for k in ("problem", "outside_count", "save"))
        if not quiet or changed:
            self._log(user, "check", outcome, reason, (result.get("folder") or {}), detail)

    def _save_place(self, root, ins):
        """Where the tool may save, without making anything yet:
          subfolder     the one folder in the root shared with it to edit, as
                        recommended: the rest of the folder is read only
          whole_folder  it may edit the whole folder, and saves in a folder of
                        its own made there on the first save
          my_drive      the folder is in someone's My Drive, where a service
                        account cannot save (Google's rule): only reading
          ambiguous     several folders may be edited, and none is the tool's
          read_only     nothing may be edited: only reading"""
        ours = [f for f in ins if f.get("mimeType") == rules.FOLDER and rules.is_tool_made(f)
                and root["id"] in (f.get("parents") or ())]
        writable = [f for f in ins if f.get("mimeType") == rules.FOLDER
                    and root["id"] in (f.get("parents") or ())
                    and (f.get("capabilities") or {}).get("canAddChildren")
                    and not rules.personal_name(f.get("name"))]
        named = [f for f in writable if (f.get("name") or "").strip().lower() == rules.OUTPUT_NAME.lower()]
        can_edit_root = (root.get("capabilities") or {}).get("canAddChildren")
        if not root.get("driveId"):
            # Whatever is shared to edit there: Google gives a service account
            # no storage of its own, so it never saves in a My Drive.
            return "my_drive", None
        if can_edit_root:
            return "whole_folder", (ours or named or [None])[0]
        if len(writable) == 1:
            return "subfolder", writable[0]
        if writable:
            return ("subfolder", named[0]) if len(named) == 1 else ("ambiguous", None)
        return "read_only", None

    # --- reading the folder -----------------------------------------------------------------

    def sync(self, user=None):
        """Lists the folder, reads what is new or changed in it, and hands the
        documents to the ingest API as articles of the source Google Drive;
        takes out of the tool the articles whose documents have left; saves
        the newsletters sent since the last run, when that is switched on.
        n8n asks every 15 minutes (n8n/workflows/drive.json); an admin can
        ask now."""
        s = self.store.settings()
        account, problem = self.account()
        if not (s["enabled"] and s["folder_id"] and account):
            if user:
                self._refuse(user, "sync", "off" if account else (problem or "no_key"),
                             "Reading the folder is switched off or not set up.")
            return {"ran": False, "reason": "off" if account else (problem or "no_key")}
        check = self.check(user, quiet=user is None)
        if check.get("problem"):
            # Nothing is taken out of the tool while the folder cannot be
            # reached: a folder Google cannot show for a while has not lost
            # its files.
            return {"ran": False, "reason": check["problem"]}
        root = check["folder"]["id"]
        output_id = (check.get("output") or {}).get("id")
        try:
            summary = self._sync(user, check, root, output_id)
        except DriveError as e:
            self._log(user, "sync", "failed", e.code, check.get("folder"))
            raise
        summary["saved"] = self._autosave(check)
        return summary

    def _sync(self, user, check, root, output_id):
        listed, folders, complete = self._walk(root, output_id)
        known = self.store.catalogue()
        self.store.remember([_entry(f, path, status, reason) for f, path, status, reason in listed])
        withdrawn = 0
        # Only a listing that got to the end says what has left the folder.
        if complete:
            gone = self.store.gone([f["id"] for f, *_ in listed])
            for g in gone:
                if g.get("item_id"):
                    withdrawn += self._withdraw(g["item_id"], "gone", {"id": g["drive_id"], "name": g["name"]}, user)
            if gone:
                self._let_pictures_go([g["drive_id"] for g in gone])

        to_read, waiting = [], 0
        settle = self.now() - timedelta(minutes=rules.SETTLE_MINUTES)
        for f, path, status, reason in listed:
            if status != "file":
                continue
            before = known.get(f["id"]) or {}
            if before.get("gone_at"):
                # Back in the folder after it was gone: read it again.
                before = {**before, "status": "new", "read_modified_at": None}
            why = rules.refusal(f, output_id=output_id)
            if why:
                self.store.mark(f["id"], "skipped", why)
                if before.get("reason") != why:
                    self._log(user, "read", "refused", why, f)
                if why == "personal_name" and before.get("item_id"):
                    # Renamed to say it holds people's details: the article
                    # made of it before goes.
                    withdrawn += self._withdraw(before["item_id"], "personal_name", f, user)
                continue
            changed = _when(f.get("modifiedTime"))
            if before.get("status") in ("read", "refused") and before.get("read_modified_at") \
                    and changed and changed <= before["read_modified_at"]:
                continue  # read already, as it is now
            # The scheduled read leaves a document changed in the last half
            # hour until it is done; an admin reading now has it read now.
            if user is None and changed and changed > settle:
                waiting += 1
                self.store.mark(f["id"], "waiting", None)
                continue
            to_read.append((f, path, before))

        items, read = [], []
        for f, path, before in to_read[:MAX_READS]:
            item, gone_item = self._read(f, path, folders, output_id, user, before)
            withdrawn += gone_item
            if item:
                items.append(item)
                read.append((f, before))
        if items:
            try:
                results = self.ingest(items)
            except DriveError as e:
                self._log(user, "sync", "failed", e.code)
                raise
            for (f, before), answer in zip(read, results):
                if answer.get("accepted"):
                    item_id = int(answer["item_id"])
                    self.store.mark(f["id"], "read", None, item_id=item_id, read_modified_at=_when(f.get("modifiedTime")))
                    self.store.restore(item_id)
                    if before.get("item_id") == item_id and not answer.get("new"):
                        # The document changed: its new text gets a new
                        # summary, and a newsletter that has the article
                        # waits for an editor to look.
                        self.store.requeue(item_id)
                        if self.store.in_a_newsletter(item_id):
                            self.store.changed(item_id, _when(f.get("modifiedTime")) or self.now())
                else:
                    self.store.mark(f["id"], "failed", answer.get("reason"))

        cleaned = self.store.clean_up_withdrawn()
        self.store.put("drive_synced_at", self.now().isoformat())
        summary = {"ran": True, "listed": len(listed), "read": len(items), "waiting": waiting,
                   "later": max(0, len(to_read) - MAX_READS), "outside_count": check.get("outside_count", 0),
                   "withdrawn": withdrawn + cleaned, "complete": complete}
        # A scheduled run that finds nothing new leaves no row; one that reads
        # or takes something away, or is asked for by an admin, does.
        if user or items or withdrawn:
            self._log(user, "sync", "allowed", None, check.get("folder"), summary)
        return summary

    def _walk(self, root, output_id):
        """The folder and the folders in it, down to MAX_DEPTH, as (file,
        path, status, reason), and whether the listing got to the end. A
        folder is not opened when it is the tool's own, or its name says it
        holds people's details."""
        listed, folders, queue = [], {root: []}, [root]
        while queue and len(listed) < rules.MAX_ITEMS:
            parent = queue.pop(0)
            path = folders[parent]
            for f in self.drive.children(parent):
                if f.get("mimeType") != rules.FOLDER:
                    listed.append((f, path, "file", None))
                    continue
                if f["id"] == output_id or rules.is_tool_made(f):
                    listed.append((f, path, "own", "own_output"))
                elif rules.personal_name(f.get("name")):
                    listed.append((f, path, "skipped", "personal_name"))
                elif len(path) + 1 > rules.MAX_DEPTH:
                    listed.append((f, path, "skipped", "depth"))
                else:
                    listed.append((f, path, "folder", None))
                    folders[f["id"]] = path + [f.get("name") or ""]
                    queue.append(f["id"])
        complete = not queue and len(listed) <= rules.MAX_ITEMS
        return listed[:rules.MAX_ITEMS], folders, complete

    def _read(self, f, path, folders, output_id, user, before):
        """One document as an article for the ingest API, or None, and how
        many articles this took away. Google is asked about the file again
        first: it may have moved since the listing."""
        try:
            now = self.drive.get(f["id"])
        except DriveError as e:
            self.store.mark(f["id"], "failed", e.code)
            self._log(user, "read", "failed", e.code, f)
            return None, 0
        if not rules.inside(now, folders):
            self.store.mark(f["id"], "refused", "moved")
            self._log(user, "read", "refused", "moved", f)
            gone = self._withdraw(before["item_id"], "gone", f, user) if before.get("item_id") else 0
            return None, gone
        why = rules.refusal(now, output_id=output_id)
        if why:
            self.store.mark(f["id"], "skipped", why)
            self._log(user, "read", "refused", why, f)
            gone = (self._withdraw(before["item_id"], why, f, user)
                    if why == "personal_name" and before.get("item_id") else 0)
            return None, gone
        how, mime = rules.READABLE[now["mimeType"]]
        try:
            if how == "export":
                data = self.drive.export(now["id"], mime, rules.MAX_READ_BYTES)
            else:
                data = self.drive.download(now["id"], rules.MAX_READ_BYTES)
        except DriveError as e:
            self.store.mark(f["id"], "skipped" if e.code == "too_big" else "failed", e.code)
            self._log(user, "read", "refused" if e.code == "too_big" else "failed", e.code, f)
            return None, 0
        text = rules.text_of(data, mime)
        if not text or not text.strip():
            self.store.mark(f["id"], "failed", "no_text")
            self._log(user, "read", "failed", "no_text", f)
            return None, 0
        ids = rules.personal_ids(text)
        if ids:
            # Not one word of it goes further: not to the database, not to the
            # AI. An article made of the document before goes too.
            self.store.mark(f["id"], "refused", "personal_id", read_modified_at=_when(now.get("modifiedTime")))
            self._log(user, "read", "refused", "personal_id", f, {"count": ids})
            gone = self._withdraw(before["item_id"], "personal_id", f, user) if before.get("item_id") else 0
            return None, gone
        text, redacted = rules.redact(text)
        flagged = rules.ai_instructions(text)
        text = rules.tidy(text)
        detail = {k: v for k, v in (("redacted", redacted), ("ai_instructions", flagged)) if v}
        self._log(user, "read", "allowed", "ai_instructions" if flagged else None, f, detail or None)
        source = self.store.source()
        return {
            "source_id": source["id"],
            "url": now.get("webViewLink") or f"https://drive.google.com/file/d/{now['id']}/view",
            "title": rules.title_of(now.get("name")),
            "published_at": _published(now),
            "excerpt": text[:280],
            "raw_text": text,
            "section": rules.section_for(path),
            "details": {"kind": "drive", "folder": "/".join(path), "redacted": redacted or None,
                        "ai_instructions": flagged or None},
        }, 0

    def _withdraw(self, item_id, reason, file, user):
        """Takes an article out of the tool: deleted, or kept without its
        text for the newsletter that has it. 1 when it was there."""
        result = self.store.withdraw(item_id, reason)
        if result:
            self._log(user, "withdraw", "allowed", reason, file, {"item": item_id, "result": result})
        return 1 if result else 0

    def _let_pictures_go(self, drive_ids):
        """Files gone from the folder: their previews go, and so do pictures
        brought into Kuvapankki from them, unless a newsletter uses one."""
        self.store.drop_thumbs(drive_ids)
        keys = self.store.pictures_from(drive_ids)
        if keys:
            self.pictures.let_go(keys)

    # --- what the folder holds, for the pages ------------------------------------------------------

    def files(self):
        """Every file and folder the last listing found, with what became of
        each, and when one still to be read will be."""
        s = self.store.settings()
        now = self.now()
        out = []
        for f in self.store.file_list():
            entry = dict(f)
            if not f["is_folder"] and f["status"] in ("new", "waiting"):
                after = now
                if f["status"] == "waiting" and f.get("modified_at"):
                    after = max(now, _when(f["modified_at"]) + timedelta(minutes=rules.SETTLE_MINUTES))
                entry["next_read_at"] = next_read(after)
            out.append(entry)
        source = self.store.source() or {}
        return {"files": out, "synced": s["synced"], "folder_name": s["folder_name"], "source_id": source.get("id")}

    def picture_list(self):
        """The pictures in the folder, from the last listing: no request to
        Google."""
        out = []
        for p in self.store.pictures():
            entry = dict(p)
            entry["usable"] = (p["mime_type"] in rules.PICTURES and not rules.personal_name(p["name"])
                               and (p["size"] or 0) <= rules.MAX_READ_BYTES)
            out.append(entry)
        return out

    def _picture_file(self, drive_id, user, action):
        """A picture an editor asked for, checked the way a document is: it
        must be in the guard's own listing of the folder, and Google must
        say it is still there now."""
        s = self.store.settings()
        if not (s["enabled"] and s["folder_id"]):
            self._refuse(user, action, "off", "Drive is switched off.")
        row = self.store.catalogue_file(drive_id)
        if not row or row.get("gone_at") or row.get("status") in ("folder", "own"):
            self._refuse(user, action, "not_in_folder", "That file is not in the folder.")
        meta = self.drive.get(drive_id)
        if not rules.inside(meta, self.store.folder_ids() | {s["folder_id"]}):
            self._refuse(user, action, "moved", "The file has left the folder.", meta)
        why = rules.picture_refusal(meta, output_id=s["output_id"] or None)
        if why:
            self._refuse(user, action, why, "That file is not a picture the tool may open.", meta)
        return row, meta

    def thumbnail(self, drive_id, user):
        """A small preview of one of the folder's pictures, for Kuvapankki.
        Made once from the picture and kept; made again when it changes."""
        row = self.store.catalogue_file(drive_id)
        if row and not row.get("gone_at"):
            kept = self.store.thumb(drive_id, row.get("modified_at"))
            if kept:
                return kept
        row, meta = self._picture_file(drive_id, user, "read")
        data = self.drive.download(drive_id, rules.MAX_READ_BYTES)
        small = self.pictures.thumbnail(data)
        self.store.put_thumb(drive_id, row.get("modified_at"), small)
        self._log(user, "read", "allowed", "thumbnail", meta)
        return small

    def import_picture(self, drive_id, user):
        """The picture into Kuvapankki, shrunk for email and without its
        camera details, where the newsletter can use it."""
        row, meta = self._picture_file(drive_id, user, "import")
        found = self.pictures.find(drive_id, _when(meta.get("modifiedTime")))
        if found:
            return found
        data = self.drive.download(drive_id, rules.MAX_READ_BYTES)
        image = self.pictures.bring_in(data, meta.get("name"), drive_id, user.id if user else None)
        self._log(user, "import", "allowed", None, meta, {"image": image.get("key")})
        return image

    # --- saving -----------------------------------------------------------------------------------

    def _fresh_check(self, user):
        """The last check, when it is recent and found the folder; else a new one."""
        s = self.store.settings()
        check = s["check"] or {}
        at = _when(check.get("at"))
        if (check and not check.get("problem") and at and self.now() - at < CHECK_FRESH
                and (check.get("folder") or {}).get("id") == s["folder_id"]):
            return check
        return self.check(user)

    def _save_here(self, user):
        """The check, and the folder saves go in, or a refusal saying why
        nothing can be saved."""
        s = self.store.settings()
        if not (s["enabled"] and s["folder_id"]):
            self._refuse(user, "save", "off", "Saving to Drive is switched off.")
        check = self._fresh_check(user)
        if check.get("problem"):
            self._refuse(user, "save", check["problem"], "The folder cannot be reached.")
        return check, self._output_folder(check, user)

    def _tool_folder(self, parent_id, name, user, make=True):
        """The folder of that name in parent, a folder of the tool's own,
        made the first time it is needed. Found by listing the parent each
        time, so one renamed or deleted in Drive is simply made again."""
        with _folders:
            found = [f for f in self.drive.children(parent_id) if f.get("mimeType") == rules.FOLDER
                     and (f.get("name") or "").strip().casefold() == name.casefold()]
            found.sort(key=lambda f: not rules.is_tool_made(f))
            if found:
                return found[0]
            if not make:
                return None
            made = self.drive.create_folder(name, parent_id, rules.TOOL_MARK)
            self._log(user, "save", "allowed", "folder", made)
            return made

    def save_options(self, item_id, user):
        """What the save window offers for one article: the folder it would
        go in, the folders saved into before, whether its picture goes along,
        and whether saving is possible at all."""
        item = self.articles.one(item_id)
        if not item:
            raise Refused("no_article", "There is no such article.")
        s = self.store.settings()
        check = s["check"] or {}
        folders = []
        output = check.get("output")
        if s["enabled"] and output and check.get("save") in ("subfolder", "whole_folder"):
            try:
                articles = self._tool_folder(output["id"], ARTICLES, user, make=False)
                if articles:
                    folders = sorted({f.get("name") for f in self.drive.children(articles["id"])
                                      if f.get("mimeType") == rules.FOLDER and f.get("name")}, key=str.casefold)
            except DriveError:
                folders = []
        picture = item.get("picture") or {}
        return {
            "suggested": rules.folder_name(docs.suggested_folder(item)) or docs.OTHER_FOLDER,
            "folders": folders,
            "picture": picture.get("rights") if picture.get("src") else None,
            "summary": bool(item.get("summary")),
            "from_drive": item.get("source_type") == "drive",
            "save": check.get("save") if s["enabled"] else "off",
            "saved": item.get("drive_saved"),
            "path": [(output or {}).get("name") or rules.OUTPUT_NAME, ARTICLES],
        }

    def save_article(self, item_id, folder, user):
        """One article as a Google Doc in Artikkelit/<folder> inside the
        tool's save folder, with its picture beside it when the picture is
        the association's own or openly licensed. Only new files."""
        item = self.articles.one(item_id)
        if not item:
            self._refuse(user, "save", "no_article", "There is no such article.")
        if item.get("source_type") == "drive":
            self._refuse(user, "save", "from_drive", "This article is a document in the folder already.")
        name = self._folder_called(folder, docs.suggested_folder(item), user)
        check, output = self._save_here(user)
        articles = self._tool_folder(output["id"], ARTICLES, user)
        where = self._tool_folder(articles["id"], name, user)
        stamp = self.now()
        doc = rules.safe_name(docs.doc_name(item, stamp))
        picture = self._picture_of(item)
        picture_name = rules.safe_name(f"{doc}{_ending(picture['mime'])}", limit=140) if picture else None
        page = docs.article_html(item, saved_by=user.name if user else None, saved_at=stamp,
                                 picture_name=picture_name, picture_credit=(picture or {}).get("credit"))
        made = self.drive.upload(doc, where["id"], page.encode("utf-8"), "text/html", rules.TOOL_MARK,
                                 convert_to=rules.GOOGLE_DOC)
        files = [_file(made)]
        if picture:
            files.append(_file(self.drive.upload(picture_name, where["id"], picture["data"], picture["mime"],
                                                 rules.TOOL_MARK)))
        self._log(user, "save", "allowed", "article", made, {"item": item_id, "folder": name,
                                                             "picture": bool(picture)})
        self.store.saved("article", made.get("name") or doc, name, made["id"], made.get("webViewLink"),
                         where.get("webViewLink"), user.id if user else None, item_id=item_id)
        return {"folder": {"name": name, "link": where.get("webViewLink")}, "files": files}

    def save_list(self, place, title, folder, user):
        """The articles of a list on Artikkelit, up to MAX_LIST of them, as
        one Google Doc and the same as a Google Sheet, in Artikkelit/<folder>."""
        items, total = self.articles.listed(place, user.id if user else None)
        if not items:
            self._refuse(user, "save", "empty_list", "The list has no articles.")
        name = self._folder_called(folder, docs.LISTS_FOLDER, user)
        check, output = self._save_here(user)
        articles = self._tool_folder(output["id"], ARTICLES, user)
        where = self._tool_folder(articles["id"], name, user)
        stamp = self.now()
        title = (title or "").strip() or "Artikkelit"
        doc = rules.safe_name(f"{stamp.astimezone(HELSINKI):%Y-%m-%d} Kooste {title}")
        page = docs.list_html(f"Kooste: {title}", items, saved_by=user.name if user else None, saved_at=stamp,
                              total=total)
        made = self.drive.upload(doc, where["id"], page.encode("utf-8"), "text/html", rules.TOOL_MARK,
                                 convert_to=rules.GOOGLE_DOC)
        sheet = self.drive.upload(doc, where["id"], docs.list_csv(items), "text/csv", rules.TOOL_MARK,
                                  convert_to=rules.GOOGLE_SHEET)
        self._log(user, "save", "allowed", "list", made, {"articles": len(items), "folder": name})
        self.store.saved("list", made.get("name") or doc, name, made["id"], made.get("webViewLink"),
                         where.get("webViewLink"), user.id if user else None)
        return {"folder": {"name": name, "link": where.get("webViewLink")}, "files": [_file(made), _file(sheet)],
                "count": len(items), "total": total}

    def _folder_called(self, asked, default, user):
        name = rules.folder_name(asked) or rules.folder_name(default) or docs.OTHER_FOLDER
        if rules.personal_name(name):
            # The guard never opens such a folder, so nothing should be
            # saved under such a name either.
            self._refuse(user, "save", "personal_name", "A folder with that name would look like people's details.")
        return name

    def _picture_of(self, item):
        picture = item.get("picture") or {}
        if not picture.get("src") or picture.get("rights") not in ("own", "open"):
            return None
        found = self.store.picture_of(item["id"])
        if not found or found.get("rights") not in ("own", "open"):
            return None
        return found

    def save_newsletter(self, issue, html, articles, user, issue_id=None, check=None):
        """The finished newsletter into the folder: a folder of its own in
        Uutiskirjeet inside the tool's save folder, holding the email as an
        HTML file, the same as a Google Doc to read and comment, and its
        articles as a Google Sheet. Only new files; nothing already there is
        changed."""
        if check is None:
            s = self.store.settings()
            if not (s["enabled"] and s["folder_id"]):
                self._refuse(user, "save", "off", "Saving to Drive is switched off.")
            check = self.check(user)
            if check.get("problem"):
                self._refuse(user, "save", check["problem"], "The folder cannot be reached.")
        output = self._output_folder(check, user)
        newsletters = self._tool_folder(output["id"], NEWSLETTERS, user)
        stamp = self.now().astimezone(HELSINKI)
        name = rules.safe_name(issue.get("name"))
        where = self.drive.create_folder(rules.safe_name(f"{name} {stamp:%Y-%m-%d %H.%M}"), newsletters["id"],
                                         rules.TOOL_MARK)
        self._log(user, "save", "allowed", "newsletter", where, {"issue": issue_id} if issue_id else None)
        saved = []
        for file_name, data, mime, convert in (
                (f"{name}.html", html.encode("utf-8"), "text/html", None),
                (name, html.encode("utf-8"), "text/html", rules.GOOGLE_DOC),
                ("Artikkelit", _articles_csv(articles), "text/csv", rules.GOOGLE_SHEET)):
            made = self.drive.upload(rules.safe_name(file_name), where["id"], data, mime, rules.TOOL_MARK,
                                     convert_to=convert)
            self._log(user, "save", "allowed", None, made, {"bytes": len(data)})
            saved.append({"name": made.get("name"), "link": made.get("webViewLink"), "type": made.get("mimeType"),
                          "id": made.get("id")})
        doc = saved[1]
        self.store.saved("newsletter", doc["name"] or name, f"{NEWSLETTERS}/{where.get('name')}", doc["id"],
                         doc["link"], where.get("webViewLink"), user.id if user else None, issue_id=issue_id)
        return {"folder": {"name": where.get("name"), "link": where.get("webViewLink")},
                "files": [{k: v for k, v in f.items() if k != "id"} for f in saved]}

    def _autosave(self, check):
        """Each newsletter sent since the switch was turned on, saved once,
        a few a run."""
        s = self.store.settings()
        if not (s["autosave"] and s["autosave_since"]) or check.get("save") not in ("subfolder", "whole_folder"):
            return 0
        saved = 0
        for issue_id in self.store.unsaved_sent(s["autosave_since"], MAX_AUTOSAVES):
            issue, html, articles = self.newsletters(issue_id)
            if not html:
                continue
            try:
                self.save_newsletter(issue, html, articles, None, issue_id=issue_id, check=check)
                saved += 1
            except (Refused, DriveError) as e:
                self._log(None, "save", "failed", getattr(e, "code", None), None, {"issue": issue_id})
                break
        return saved

    def _output_folder(self, check, user):
        """The folder saves go in, as the check found it, or the tool's own
        made now in a folder it may edit in full."""
        save = check.get("save")
        if save == "subfolder" or (save == "whole_folder" and check.get("output")):
            return check["output"]
        if save == "whole_folder":
            made = self.drive.create_folder(rules.OUTPUT_NAME, check["folder"]["id"], rules.TOOL_MARK)
            self.store.put("drive_output_folder_id", made["id"])
            # The check kept for the next save knows the folder now, so the
            # next save does not make another.
            check["output"] = {"id": made["id"], "name": made.get("name"), "link": made.get("webViewLink")}
            self.store.put("drive_check", json.dumps(check, ensure_ascii=False))
            self._log(user, "save", "allowed", "output_folder", made)
            return made
        messages = {
            "my_drive": "The folder is in a My Drive, where Google does not let a service account save.",
            "ambiguous": "Several folders may be edited by the tool; share only one.",
            "read_only": "The tool may only read the folder.",
        }
        self._refuse(user, "save", save or "read_only", messages.get(save, messages["read_only"]))


# --- what the guard saves and brings in, from the rest of the dashboard ---------------------------


class Articles:
    """The articles, as the API shows them (services/items.py)."""

    def one(self, item_id):
        from . import items  # here, so items never needs Drive to load
        try:
            return items.get_item(item_id).model_dump()
        except items.NotFound:
            return None

    def listed(self, place, user_id):
        from . import items
        found = items.list_items(place.get("view") or "all", place.get("sort") or "collected", 1, MAX_LIST,
                                 user_id, **(place.get("filters") or {}))
        return [i.model_dump() for i in found.items], found.total


class Pictures:
    """Kuvapankki (services/images.py)."""

    def thumbnail(self, data):
        from . import images
        return images.thumbnail(data)

    def find(self, drive_id, since):
        from . import images
        return images.from_drive_already(drive_id, since)

    def bring_in(self, data, name, drive_id, user_id):
        from . import images
        return images.from_drive(data, name, drive_id, user_id)

    def let_go(self, keys):
        from . import images
        for key in keys:
            try:
                images.remove(key)
            except (images.InUse, images.ArticlePicture):
                pass  # a newsletter uses it, so it stays


def _newsletter(issue_id):
    """A sent newsletter, for saving it by itself: its name, the email and
    its articles."""
    from . import issues
    issue = issues.get(issue_id)
    return {"name": issue.name}, issues.export_document(issue_id), [a.model_dump() for a in issue.articles]


# --- helpers ---------------------------------------------------------------------------------


def next_read(after):
    """When n8n next reads the folder, at or after this time."""
    at = after.astimezone(HELSINKI).replace(second=0, microsecond=0)
    if at < after:
        at += timedelta(minutes=1)
    for _ in range(61):
        if at.minute in READ_MINUTES:
            return at.isoformat()
        at += timedelta(minutes=1)
    return None


def _when(value):
    if not value:
        return None
    if isinstance(value, datetime):
        return value
    return datetime.fromisoformat(str(value).replace("Z", "+00:00"))


def _published(meta):
    """When the document arrived or last changed, whichever is later: a file
    added today counts as new even when it was written long ago."""
    times = [t for t in (_when(meta.get("createdTime")), _when(meta.get("modifiedTime"))) if t]
    return max(times).astimezone(HELSINKI).date().isoformat() if times else None


def _entry(f, path, status, reason):
    return {
        "drive_id": f["id"],
        "name": f.get("name") or "",
        "mime_type": f.get("mimeType") or "",
        "parent_id": (f.get("parents") or [None])[0],
        "path": "/".join(path),
        "is_folder": f.get("mimeType") == rules.FOLDER,
        "size": int(f["size"]) if f.get("size") else None,
        "modified_at": _when(f.get("modifiedTime")),
        "web_link": f.get("webViewLink"),
        "status": {"file": None, "folder": "folder", "own": "own"}.get(status, "skipped"),
        "reason": reason,
    }


def _file(made):
    return {"name": made.get("name"), "link": made.get("webViewLink"), "type": made.get("mimeType")}


def _ending(mime):
    return {"image/png": ".png", "image/gif": ".gif", "image/webp": ".webp"}.get(mime, ".jpg")


def _articles_csv(articles):
    out = io.StringIO()
    writer = csv.writer(out)
    writer.writerow(["Osio", "Otsikko", "Lähde", "Linkki", "Valitsija"])
    for a in articles:
        writer.writerow([a.get("section") or "", docs._cell(a.get("title_fi") or a.get("title") or ""),
                         docs._cell(a.get("source") or ""), a.get("url") or "", docs._cell(a.get("decided_by") or "")])
    return out.getvalue().encode("utf-8")


def _ingest(items):
    """Hands the documents to the ingest API, the one way articles enter the
    database (docs/ingest-api.md)."""
    if not config.INGEST_TOKEN:
        raise DriveError("no_ingest_token", "INGEST_TOKEN is missing from .env.")
    results = []
    for start in range(0, len(items), 50):
        body = json.dumps({"items": items[start:start + 50]}).encode()
        request = urllib.request.Request(f"{config.N8N_URL}/webhook/ingest", data=body, method="POST",
                                         headers={"Content-Type": "application/json",
                                                  "X-Ingest-Token": config.INGEST_TOKEN})
        try:
            with urllib.request.urlopen(request, timeout=60) as r:
                results.extend(json.load(r).get("results") or [])
        except (urllib.error.URLError, OSError, ValueError):
            raise DriveError("ingest_failed", "The ingest API did not take the documents. Is n8n running?")
    return results
