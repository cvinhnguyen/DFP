"""The way into the association's Mailchimp. n8n holds the Mailchimp key and is
the only thing that talks to Mailchimp; the dashboard asks it through one
webhook, /webhook/mailchimp, with the ingest token, the way "check now" does.
Jira: DM42-37, DM42-74

    account   is the key set, which account is it, which audiences it has
    upload    one picture into Mailchimp's Content Studio
    draft     create the issue's draft campaign, or update it
    status    what Mailchimp says about a draft: still a draft, scheduled, sent
    test      send a test of a draft to the given addresses

Nothing here sends the newsletter. n8n's workflow has no step that could:
the send itself is an editor's click in Mailchimp.

On Mailchimp's Essentials plan an email made outside Mailchimp's own builder
can be created but not sent, so the dashboard also prepares the email for
copying into the association's own Mailchimp template; mailchimp_plan in
app_settings says which way is offered first.
"""

import base64
import hashlib
import json
import re
import threading
import time
import urllib.error
import urllib.request
from datetime import datetime, timezone

from .. import config
from ..queries import issues as issue_queries
from ..queries import mailchimp as queries
from ..queries import settings
from . import issues

SETTINGS = ("mailchimp_server", "mailchimp_audience_id", "mailchimp_plan", "newsletter_from_name", "newsletter_reply_to")
PLANS = ("essentials", "standard", "unknown")
# How long the answer to "is it connected" is kept, so every page load does
# not ask Mailchimp again.
ACCOUNT_CACHE_SECONDS = 120
_account_cache = {"at": 0.0, "value": None}
# One copying of pictures at a time. Opening the way into Mailchimp starts
# one, and creating the draft straight after starts another; without this
# both would upload the same pictures before either had remembered them.
_pictures_lock = threading.Lock()


class MailchimpProblem(Exception):
    """Says what went wrong, as a code the pages translate and a message in
    English."""

    def __init__(self, code, message, **params):
        super().__init__(message)
        self.code = code
        self.params = params


def _settings():
    return {key: (settings.get(key) or "").strip() for key in SETTINGS}


def _call(action, payload, timeout=60):
    if not config.INGEST_TOKEN:
        raise MailchimpProblem("mailchimp_not_set_up", "INGEST_TOKEN is missing from .env, so the dashboard cannot ask n8n.")
    s = _settings()
    if not re.fullmatch(r"[a-z]{2,4}\d{1,3}", s["mailchimp_server"]):
        raise MailchimpProblem("mailchimp_no_server", "Set the Mailchimp data centre (like us4) in the settings first.")
    body = json.dumps({"action": action, "server": s["mailchimp_server"], **payload}).encode("utf-8")
    request = urllib.request.Request(
        f"{config.N8N_URL}/webhook/mailchimp", data=body, method="POST",
        headers={"Content-Type": "application/json", "X-Ingest-Token": config.INGEST_TOKEN})
    try:
        with urllib.request.urlopen(request, timeout=timeout) as response:
            answer = json.loads(response.read() or b"{}")
    except urllib.error.HTTPError as e:
        if e.code == 404:
            raise MailchimpProblem("mailchimp_no_workflow", "n8n has no Mailchimp workflow switched on. Import n8n/workflows/mailchimp.json.")
        raise MailchimpProblem("mailchimp_n8n_error", f"n8n answered {e.code}.", status=e.code)
    except (urllib.error.URLError, OSError, ValueError):
        raise MailchimpProblem("n8n_unreachable", "Could not reach n8n. Is it running?")
    if not answer.get("ok"):
        code = answer.get("code") or "mailchimp_failed"
        raise MailchimpProblem(code, answer.get("message") or "Mailchimp said no.", detail=(answer.get("detail") or "")[:300])
    return answer


# ---------- the connection ----------

def account(refresh=False):
    """Whether Mailchimp is connected, as the pages show it. Never raises: a
    missing key or a stopped n8n is a state to show, not an error."""
    s = _settings()
    state = {
        "server": s["mailchimp_server"],
        "audience_id": s["mailchimp_audience_id"],
        "plan": s["mailchimp_plan"] or "unknown",
        "from_name": s["newsletter_from_name"],
        "reply_to": s["newsletter_reply_to"],
        "dashboard_url": (settings.get("dashboard_url") or "").rstrip("/"),
        "connected": False,
        "account_name": None,
        "audiences": [],
        "problem": None,
    }
    now = time.monotonic()
    if not refresh and _account_cache["value"] and now - _account_cache["at"] < ACCOUNT_CACHE_SECONDS:
        return {**state, **_account_cache["value"]}
    try:
        answer = _call("account", {}, timeout=20)
        found = {
            "connected": True,
            "account_id": answer.get("account_id"),
            "account_name": answer.get("account_name"),
            "audiences": answer.get("audiences") or [],
            "problem": None,
        }
    except MailchimpProblem as e:
        found = {"connected": False, "problem": e.code, "audiences": []}
    _account_cache.update(at=now, value=found)
    return {**state, **found}


def save_settings(changes):
    for key, value in changes.items():
        if key in SETTINGS and value is not None:
            queries.set_setting(key, value.strip())
    _account_cache.update(at=0.0, value=None)
    return account(refresh=True)


# ---------- pictures ----------

def _account_id():
    found = account()
    if not found.get("connected"):
        raise MailchimpProblem(found.get("problem") or "mailchimp_not_connected", "Mailchimp is not connected.")
    return found.get("account_id") or found.get("account_name") or "mailchimp"


def upload_pictures(html):
    """Copies every picture the email shows into Mailchimp's Content Studio,
    once each, and returns where Mailchimp keeps each: {"/media/<key>": url}."""
    account_id = _account_id()
    with _pictures_lock:
        return _upload_pictures(html, account_id)


def _upload_pictures(html, account_id):
    mapping = {}
    for path in issues.local_images(html):
        data, mime = issues.picture_bytes(path)
        if data is None:
            continue
        digest = hashlib.sha256(data).hexdigest()
        known = queries.file_url(account_id, digest)
        if known:
            mapping[path] = known
            continue
        ext = {"image/jpeg": "jpg", "image/png": "png", "image/gif": "gif"}.get(mime, "jpg")
        name = f"dfp-{digest[:12]}.{ext}"
        answer = _call("upload", {"name": name, "file_data": base64.b64encode(data).decode("ascii")}, timeout=90)
        queries.remember_file(account_id, digest, answer["url"], answer.get("id"), name)
        mapping[path] = answer["url"]
    return mapping


def with_pictures(html, mapping):
    def swap(m):
        return f'{m.group(1)}="{mapping.get(m.group(2), m.group(2))}"'
    return issues.LOCAL_IMAGE.sub(swap, html)


# ---------- the draft ----------

def _audience(s):
    """The audience a draft goes to, and the address it comes from. With no
    audience chosen in the settings, the account's only audience; with
    several, the editors are asked to choose one. The address is the one in
    the settings, or the audience's own default."""
    found = account()
    if not found.get("connected"):
        raise MailchimpProblem(found.get("problem") or "mailchimp_not_connected", "Mailchimp is not connected.")
    audiences = found.get("audiences") or []
    audience_id = s["mailchimp_audience_id"]
    if not audience_id:
        if not audiences:
            raise MailchimpProblem("mailchimp_no_audience", "The Mailchimp account has no audience yet.")
        if len(audiences) > 1:
            raise MailchimpProblem("mailchimp_choose_audience", "Choose the Mailchimp audience in the settings first.")
        audience_id = audiences[0]["id"]
    chosen = next((a for a in audiences if a["id"] == audience_id), None)
    if audiences and not chosen:
        raise MailchimpProblem("mailchimp_audience", "The audience chosen in the settings is not in Mailchimp.")
    reply_to = s["newsletter_reply_to"] or (chosen or {}).get("from_email") or None
    return audience_id, reply_to


def export_draft(issue_id, user_id):
    """Creates the issue's draft campaign in Mailchimp, or updates the one
    made before, with the finished email, its pictures copied into Mailchimp,
    the subject line, the preview text and the sender. Returns the issue."""
    issue = issues.get(issue_id)
    if issue.status != "draft":
        raise issues.Locked()
    if not issue.html:
        raise MailchimpProblem("not_designed_yet", "Open the newsletter in the editor and save it first.")
    s = _settings()
    audience_id, reply_to = _audience(s)
    html = issues.without_notes(issue.html) if issue.html.lstrip().lower().startswith("<!doctype") else issues.export_document(issue_id)
    html = with_pictures(html, upload_pictures(html))
    payload = {
        "campaign_id": issue.mailchimp_campaign_id,
        "audience_id": audience_id,
        "title": issue.name,
        "subject": issue.subject,
        "preview_text": issue.preheader,
        "from_name": s["newsletter_from_name"] or None,
        "reply_to": reply_to,
        "html": html,
    }
    answer = _call("draft", payload, timeout=120)
    found = issue_queries.one(issue_id)
    issue_queries.set_mailchimp(issue_id, {
        "mailchimp_campaign_id": answer["campaign_id"],
        "mailchimp_web_id": answer.get("web_id"),
        "mailchimp_status": answer.get("status") or "save",
        "mailchimp_exported_at": datetime.now(timezone.utc),
        "mailchimp_exported_by": user_id,
        "mailchimp_exported_hash": issues.content_hash(found),
        "mailchimp_checked_at": datetime.now(timezone.utc),
    })
    return issues.get(issue_id)


def refresh_status(issue_id, user_id):
    """Asks Mailchimp what became of the draft. A draft Mailchimp has sent is
    marked sent here too, which moves its articles to "sent"."""
    issue = issues.get(issue_id)
    if not issue.mailchimp_campaign_id:
        return issue
    answer = _call("status", {"campaign_id": issue.mailchimp_campaign_id}, timeout=30)
    if answer.get("missing"):
        issue_queries.set_mailchimp(issue_id, {"mailchimp_status": "deleted", "mailchimp_checked_at": datetime.now(timezone.utc)})
        return issues.get(issue_id)
    fields = {"mailchimp_status": answer.get("status"), "mailchimp_checked_at": datetime.now(timezone.utc),
              "mailchimp_emails_sent": answer.get("emails_sent")}
    if answer.get("send_time"):
        fields["mailchimp_send_time"] = answer["send_time"]
    issue_queries.set_mailchimp(issue_id, fields)
    if answer.get("status") == "sent" and issue.status == "draft":
        issues.mark_sent(issue_id, user_id)
    return issues.get(issue_id)


def refresh_all(user_id):
    """Every draft exported to Mailchimp, checked again. For the list of
    newsletters, so an issue sent in Mailchimp shows as sent here. Quiet when
    Mailchimp cannot be reached."""
    for row in issue_queries.drafts_in_mailchimp():
        try:
            refresh_status(row["id"], user_id)
        except (MailchimpProblem, issues.NotFound, issues.Locked):
            continue


def send_test(issue_id, emails, user_id):
    """Brings the draft up to date in Mailchimp, then has Mailchimp send a
    test of it to the given addresses."""
    issue = issues.get(issue_id)
    if not issue.mailchimp_campaign_id or issue.mailchimp_changed:
        issue = export_draft(issue_id, user_id)
    _call("test", {"campaign_id": issue.mailchimp_campaign_id, "emails": emails}, timeout=60)
    return issue
