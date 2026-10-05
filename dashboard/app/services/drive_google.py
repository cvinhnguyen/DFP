"""The one place that talks to Google Drive, for services/drive.py.

It knows the few requests the guard needs and no others: who the tool is,
one file's details, a folder's contents, everything the tool's account can
see, a file's text, a new folder and a new file. There is no request here
that deletes, moves, renames, changes or shares anything, so no mistake
anywhere else can make one.

The tool is a Google service account, a Google identity made for this tool
alone, with no person, password or Drive of its own behind it. Its key is a
JSON file on the server (DRIVE_KEY_FILE, see secrets/README.md), read here
and nowhere else. The key never leaves this module, and the AI never sees
it. A token made from it lasts an hour and is kept in memory only.

For tests, DRIVE_TEST_SERVER points every request at a stand-in for Drive
(tests/fake_drive.py) and no key or token is used at all, so a test can
never send a real token anywhere.
Jira: DM42-43
"""

import json
import secrets
import threading
import time
import urllib.error
import urllib.parse
import urllib.request

from .. import config

GOOGLE_API = "https://www.googleapis.com/drive/v3"
GOOGLE_UPLOAD = "https://www.googleapis.com/upload/drive/v3"
TOKEN_URL = "https://oauth2.googleapis.com/token"
# The scope cannot be narrowed to one folder: reading a file someone else
# made needs this one. What the account can reach is decided by what is
# shared with it, which is one folder.
SCOPE = "https://www.googleapis.com/auth/drive"

FILE_FIELDS = ("id,name,mimeType,parents,size,createdTime,modifiedTime,webViewLink,trashed,driveId,"
               "appProperties,capabilities(canAddChildren),shortcutDetails(targetId)")
FOLDER = "application/vnd.google-apps.folder"


class DriveError(Exception):
    """What went wrong talking to Google, as a code the guard logs and the
    pages translate: not_found, no_access, no_quota, bad_key, too_big,
    unreachable or google_error."""

    def __init__(self, code, message, status=None):
        super().__init__(message)
        self.code = code
        self.status = status


class Drive:
    def __init__(self, key_file=None, test_server=None):
        self.key_file = key_file
        self.test_server = (test_server or "").rstrip("/") or None
        self._token = None
        self._expires = 0
        self._lock = threading.Lock()
        if self.test_server:
            self.api = f"{self.test_server}/drive/v3"
            self.upload_api = f"{self.test_server}/upload/drive/v3"
        else:
            self.api, self.upload_api = GOOGLE_API, GOOGLE_UPLOAD

    @classmethod
    def from_config(cls):
        return cls(key_file=config.DRIVE_KEY_FILE, test_server=config.DRIVE_TEST_SERVER)

    # --- the key ------------------------------------------------------------

    def _key(self):
        try:
            with open(self.key_file, encoding="utf-8") as f:
                info = json.load(f)
        except (OSError, TypeError):
            return None
        except ValueError:
            raise DriveError("bad_key", "The key file is not valid JSON.")
        if info.get("type") != "service_account" or not info.get("client_email") or not info.get("private_key"):
            raise DriveError("bad_key", "The key file is not a Google service account key.")
        return info

    def account(self):
        """The tool's own Google address, which the folder is shared with, or
        None when there is no key."""
        if self.test_server:
            return self._call("GET", f"{self.api}/about", {"fields": "user(emailAddress)"})["user"]["emailAddress"]
        info = self._key()
        return info["client_email"] if info else None

    def _bearer(self):
        if self.test_server:
            return None
        with self._lock:
            if self._token and time.time() < self._expires - 60:
                return self._token
            info = self._key()
            if not info:
                raise DriveError("no_key", "There is no Google key on the server.")
            from google.auth import crypt, jwt  # only with a real key
            now = int(time.time())
            assertion = jwt.encode(crypt.RSASigner.from_service_account_info(info), {
                "iss": info["client_email"], "scope": SCOPE, "aud": TOKEN_URL, "iat": now, "exp": now + 3600})
            body = urllib.parse.urlencode({"grant_type": "urn:ietf:params:oauth:grant-type:jwt-bearer",
                                           "assertion": assertion.decode()}).encode()
            request = urllib.request.Request(TOKEN_URL, data=body, method="POST",
                                             headers={"Content-Type": "application/x-www-form-urlencoded"})
            try:
                with urllib.request.urlopen(request, timeout=20) as r:
                    answer = json.load(r)
            except urllib.error.HTTPError as e:
                raise DriveError("bad_key", "Google did not accept the key: it may have been deleted.", e.code)
            except (urllib.error.URLError, OSError):
                raise DriveError("unreachable", "Could not reach Google.")
            self._token, self._expires = answer["access_token"], time.time() + int(answer.get("expires_in", 3600))
            return self._token

    # --- requests -----------------------------------------------------------

    def _call(self, method, url, params=None, body=None, headers=None, raw=False, limit=None):
        query = dict(params or {})
        query["supportsAllDrives"] = "true"
        full = f"{url}?{urllib.parse.urlencode(query)}"
        sent = dict(headers or {})
        token = self._bearer()
        if token:
            sent["Authorization"] = f"Bearer {token}"
        request = urllib.request.Request(full, data=body, method=method, headers=sent)
        try:
            with urllib.request.urlopen(request, timeout=60) as r:
                data = r.read(limit + 1) if limit else r.read()
        except urllib.error.HTTPError as e:
            raise _error(e)
        except (urllib.error.URLError, OSError):
            raise DriveError("unreachable", "Could not reach Google Drive.")
        if limit and len(data) > limit:
            raise DriveError("too_big", "The file is larger than the tool reads.")
        return data if raw else json.loads(data or b"{}")

    def get(self, file_id):
        """One file's or folder's details, as they are now."""
        return self._call("GET", f"{self.api}/files/{urllib.parse.quote(file_id)}", {"fields": FILE_FIELDS})

    def children(self, folder_id, limit=1000):
        """What is directly in a folder, not in the bin."""
        return self._list({"q": f"'{_quoted(folder_id)}' in parents and trashed = false"}, limit)

    def visible(self, limit=2000):
        """Everything the tool's account can see anywhere in Drive. For the
        check: it should be the folder and what is in it, and nothing else."""
        return self._list({"q": "trashed = false", "corpora": "allDrives"}, limit)

    def _list(self, params, limit):
        found, token = [], None
        while len(found) < limit:
            page = dict(params, fields=f"nextPageToken,files({FILE_FIELDS})", pageSize="200",
                        includeItemsFromAllDrives="true")
            if token:
                page["pageToken"] = token
            answer = self._call("GET", f"{self.api}/files", page)
            found.extend(answer.get("files") or [])
            token = answer.get("nextPageToken")
            if not token:
                break
        return found[:limit]

    def export(self, file_id, mime, limit):
        """A Google Docs, Sheets or Slides file as text."""
        return self._call("GET", f"{self.api}/files/{urllib.parse.quote(file_id)}/export",
                          {"mimeType": mime}, raw=True, limit=limit)

    def download(self, file_id, limit):
        """Any other file's content."""
        return self._call("GET", f"{self.api}/files/{urllib.parse.quote(file_id)}", {"alt": "media"},
                          raw=True, limit=limit)

    def create_folder(self, name, parent, marks):
        body = json.dumps({"name": name, "mimeType": FOLDER, "parents": [parent], "appProperties": marks}).encode()
        return self._call("POST", f"{self.api}/files", {"fields": FILE_FIELDS}, body,
                          {"Content-Type": "application/json; charset=UTF-8"})

    def upload(self, name, parent, data, mime, marks, convert_to=None):
        """A new file in a folder. With convert_to, Google turns it into its
        own kind of file, a Doc from HTML or a Sheet from CSV."""
        meta = {"name": name, "parents": [parent], "appProperties": marks}
        if convert_to:
            meta["mimeType"] = convert_to
        boundary = f"eok-{secrets.token_hex(12)}"
        body = (f"--{boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n{json.dumps(meta)}\r\n"
                f"--{boundary}\r\nContent-Type: {mime}\r\n\r\n").encode() + data + f"\r\n--{boundary}--\r\n".encode()
        return self._call("POST", f"{self.upload_api}/files", {"uploadType": "multipart", "fields": FILE_FIELDS},
                          body, {"Content-Type": f"multipart/related; boundary={boundary}"})


def _quoted(value):
    """A value inside a Drive query string."""
    return str(value).replace("\\", "\\\\").replace("'", "\\'")


def _error(e):
    """Google's answer to a failed request, as a DriveError."""
    try:
        answer = json.loads(e.read() or b"{}").get("error") or {}
    except ValueError:
        answer = {}
    reasons = {x.get("reason") for x in answer.get("errors") or []}
    message = str(answer.get("message") or "")
    if e.code == 404:
        return DriveError("not_found", "Google Drive has no such file, or it is not shared with the tool.", 404)
    if "storageQuotaExceeded" in reasons or "storage quota" in message.lower():
        return DriveError("no_quota", "A service account cannot save in My Drive: the folder must be on a shared drive.",
                          e.code)
    if e.code in (401,):
        return DriveError("bad_key", "Google did not accept the tool's key.", e.code)
    if e.code == 403:
        return DriveError("no_access", "The tool's account may not do this in the folder.", e.code)
    return DriveError("google_error", f"Google Drive answered {e.code}.", e.code)
