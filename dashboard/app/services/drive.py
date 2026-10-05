"""Google Drive: the association's one folder, read for the newsletter's
material and written to for its finished newsletters. Everything here goes
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
"""

import csv
import io
import json
import urllib.error
import urllib.request
from datetime import datetime, timedelta, timezone

from .. import config
from ..queries import drive as queries
from . import drive_rules as rules
from .collection import HELSINKI
from .drive_google import Drive, DriveError

# How many documents one run reads at most. The rest wait for the next hour.
MAX_READS = 25
MAX_VISIBLE = 2000


class Refused(Exception):
    """A request the guard says no to, with a code the pages translate."""

    def __init__(self, code, message, **params):
        super().__init__(message)
        self.code = code
        self.params = params


class Guard:
    """store is queries.drive, drive is drive_google.Drive and ingest hands
    articles to the ingest API; tests give stand-ins for all three."""

    def __init__(self, store=queries, drive=None, ingest=None, now=None):
        self.store = store
        self.drive = drive or Drive.from_config()
        self.ingest = ingest or _ingest
        self.now = now or (lambda: datetime.now(timezone.utc))

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
            "save_folder": (check.get("output") or {}).get("name"),
        }
        if admin:
            state.update(account=account, problem=problem, switched_on=s["enabled"], folder_id=s["folder_id"],
                         check=s["check"], synced=s["synced"], counts=self.store.counts(),
                         log=self.store.recent_log(40))
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

    # --- the check ----------------------------------------------------------------------

    def check(self, user=None, quiet=False):
        """What the tool's Google account can reach: the folder, how much is
        in it, where it may save, and anything it can see outside the folder,
        which should be nothing. Kept in app_settings for the page. quiet is
        the hourly run's check, logged only when its answer has changed."""
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
            output={"id": output["id"], "name": output.get("name")} if output else None,
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
        documents to the ingest API as articles of the source Google Drive.
        n8n asks every hour (n8n/workflows/drive.json); an admin can ask now."""
        s = self.store.settings()
        account, problem = self.account()
        if not (s["enabled"] and s["folder_id"] and account):
            if user:
                self._refuse(user, "sync", "off" if account else (problem or "no_key"),
                             "Reading the folder is switched off or not set up.")
            return {"ran": False, "reason": "off" if account else (problem or "no_key")}
        check = self.check(user, quiet=user is None)
        if check.get("problem"):
            return {"ran": False, "reason": check["problem"]}
        root = check["folder"]["id"]
        output_id = (check.get("output") or {}).get("id")
        try:
            return self._sync(user, check, root, output_id)
        except DriveError as e:
            self._log(user, "sync", "failed", e.code, check.get("folder"))
            raise

    def _sync(self, user, check, root, output_id):
        listed, folders = self._walk(root, output_id)
        known = self.store.catalogue()
        self.store.remember([_entry(f, path, status, reason) for f, path, status, reason in listed])
        self.store.gone([f["id"] for f, *_ in listed])

        to_read, waiting = [], 0
        settle = self.now() - timedelta(minutes=rules.SETTLE_MINUTES)
        for f, path, status, reason in listed:
            if status != "file":
                continue
            before = known.get(f["id"]) or {}
            changed = _when(f.get("modifiedTime"))
            if before.get("status") in ("read", "refused") and before.get("read_modified_at") \
                    and changed and changed <= before["read_modified_at"]:
                continue  # read already, as it is now
            why = rules.refusal(f, output_id=output_id)
            if why:
                self.store.mark(f["id"], "skipped", why)
                if before.get("reason") != why:
                    self._log(user, "read", "refused", why, f)
                continue
            # The hourly read leaves a document changed in the last half hour
            # until it is done; an admin reading now has it read now.
            if user is None and changed and changed > settle:
                waiting += 1
                self.store.mark(f["id"], "waiting", None)
                continue
            to_read.append((f, path, before))

        items, read = [], []
        for f, path, before in to_read[:MAX_READS]:
            item = self._read(f, path, folders, output_id, user)
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
                    if before.get("item_id") == item_id and not answer.get("new"):
                        # The document changed: its new text gets a new summary.
                        self.store.requeue(item_id)
                else:
                    self.store.mark(f["id"], "failed", answer.get("reason"))

        self.store.put("drive_synced_at", self.now().isoformat())
        summary = {"ran": True, "listed": len(listed), "read": len(items), "waiting": waiting,
                   "later": max(0, len(to_read) - MAX_READS), "outside_count": check.get("outside_count", 0)}
        # The hourly run that finds nothing new leaves no row; one that reads
        # or is asked for by an admin does.
        if user or items:
            self._log(user, "sync", "allowed", None, check.get("folder"), summary)
        return summary

    def _walk(self, root, output_id):
        """The folder and the folders in it, down to MAX_DEPTH, as (file,
        path, status, reason). A folder is not opened when it is the tool's
        own, or its name says it holds people's details."""
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
        return listed[:rules.MAX_ITEMS], folders

    def _read(self, f, path, folders, output_id, user):
        """One document as an article for the ingest API, or None. Google is
        asked about the file again first: it may have moved since the
        listing."""
        try:
            now = self.drive.get(f["id"])
        except DriveError as e:
            self.store.mark(f["id"], "failed", e.code)
            self._log(user, "read", "failed", e.code, f)
            return None
        if not rules.inside(now, folders):
            self.store.mark(f["id"], "refused", "moved")
            self._log(user, "read", "refused", "moved", f)
            return None
        why = rules.refusal(now, output_id=output_id)
        if why:
            self.store.mark(f["id"], "skipped", why)
            self._log(user, "read", "refused", why, f)
            return None
        how, mime = rules.READABLE[now["mimeType"]]
        try:
            if how == "export":
                data = self.drive.export(now["id"], mime, rules.MAX_READ_BYTES)
            else:
                data = self.drive.download(now["id"], rules.MAX_READ_BYTES)
        except DriveError as e:
            self.store.mark(f["id"], "skipped" if e.code == "too_big" else "failed", e.code)
            self._log(user, "read", "refused" if e.code == "too_big" else "failed", e.code, f)
            return None
        text = rules.text_of(data, mime)
        if not text or not text.strip():
            self.store.mark(f["id"], "failed", "no_text")
            self._log(user, "read", "failed", "no_text", f)
            return None
        ids = rules.personal_ids(text)
        if ids:
            # Not one word of it goes further: not to the database, not to the AI.
            self.store.mark(f["id"], "refused", "personal_id", read_modified_at=_when(now.get("modifiedTime")))
            self._log(user, "read", "refused", "personal_id", f, {"count": ids})
            return None
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
        }

    # --- saving -----------------------------------------------------------------------------------

    def save_newsletter(self, issue, html, articles, user):
        """The finished newsletter into the folder: a folder of its own in
        the tool's save folder, holding the email as an HTML file, the same
        as a Google Doc to read and comment, and its articles as a Google
        Sheet. Only new files; nothing already there is changed."""
        s = self.store.settings()
        if not (s["enabled"] and s["folder_id"]):
            self._refuse(user, "save", "off", "Saving to Drive is switched off.")
        check = self.check(user)
        if check.get("problem"):
            self._refuse(user, "save", check["problem"], "The folder cannot be reached.")
        output = self._output_folder(check, user)
        stamp = self.now().astimezone(HELSINKI)
        name = rules.safe_name(issue.get("name"))
        where = self.drive.create_folder(rules.safe_name(f"{name} {stamp:%Y-%m-%d %H.%M}"), output["id"],
                                         rules.TOOL_MARK)
        self._log(user, "save", "allowed", None, where)
        saved = []
        for file_name, data, mime, convert in (
                (f"{name}.html", html.encode("utf-8"), "text/html", None),
                (name, html.encode("utf-8"), "text/html", rules.GOOGLE_DOC),
                ("Artikkelit", _articles_csv(articles), "text/csv", rules.GOOGLE_SHEET)):
            made = self.drive.upload(rules.safe_name(file_name), where["id"], data, mime, rules.TOOL_MARK,
                                     convert_to=convert)
            self._log(user, "save", "allowed", None, made, {"bytes": len(data)})
            saved.append({"name": made.get("name"), "link": made.get("webViewLink"), "type": made.get("mimeType")})
        return {"folder": {"name": where.get("name"), "link": where.get("webViewLink")}, "files": saved}

    def _output_folder(self, check, user):
        """The folder saves go in, as the check found it, or the tool's own
        made now in a folder it may edit in full."""
        save = check.get("save")
        if save == "subfolder" or (save == "whole_folder" and check.get("output")):
            return check["output"]
        if save == "whole_folder":
            made = self.drive.create_folder(rules.OUTPUT_NAME, check["folder"]["id"], rules.TOOL_MARK)
            self.store.put("drive_output_folder_id", made["id"])
            self._log(user, "save", "allowed", "output_folder", made)
            return made
        messages = {
            "my_drive": "The folder is in a My Drive, where Google does not let a service account save.",
            "ambiguous": "Several folders may be edited by the tool; share only one.",
            "read_only": "The tool may only read the folder.",
        }
        self._refuse(user, "save", save or "read_only", messages.get(save, messages["read_only"]))


# --- helpers ---------------------------------------------------------------------------------


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


def _articles_csv(articles):
    out = io.StringIO()
    writer = csv.writer(out)
    writer.writerow(["Osio", "Otsikko", "Lähde", "Linkki", "Valitsija"])
    for a in articles:
        writer.writerow([a.get("section") or "", a.get("title_fi") or a.get("title") or "", a.get("source") or "",
                         a.get("url") or "", a.get("decided_by") or ""])
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
