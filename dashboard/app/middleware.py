"""What happens to every request before and after its endpoint: a request
for a name the dashboard does not answer to is refused, a missing migration
is reported, requests from other websites and JSON nested too deep are
refused, and every answer carries the security headers.
"""

import re
from urllib.parse import urlsplit

from fastapi import Request
from fastapi.responses import JSONResponse

from . import config
from .errors import body

# Only the dashboard's own files may run or load on its pages. Titles and
# summaries come from other people's websites and from a language model, so
# this backs up the escaping in web/js/format.js.
CSP = ("default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data:; "
       "connect-src 'self'; frame-ancestors 'none'; base-uri 'none'; form-action 'self'")

# The newsletter editor gets the same policy with one addition: styles inside
# the page. An email is styled inline, so an editor for one has to set styles
# as the editor works. Scripts stay limited to the dashboard's own files.
# Images may come from https addresses, for pictures already hosted in
# Mailchimp.
CSP_EDITOR = ("default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; "
              "img-src 'self' data: blob: https:; connect-src 'self'; frame-src 'self'; "
              "frame-ancestors 'self'; base-uri 'none'; form-action 'self'")
EDITOR_PAGES = ("/editor.html",)

# The features a page could ask the browser for, all switched off: the
# dashboard uses none of them. Writing to the clipboard, which copies an
# answer from Kysy or the email for Mailchimp, is not on the list and keeps
# working.
PERMISSIONS = ("accelerometer=(), camera=(), display-capture=(), geolocation=(), gyroscope=(), hid=(), "
               "magnetometer=(), microphone=(), midi=(), payment=(), serial=(), usb=(), xr-spatial-tracking=()")

# Search engines and AI crawlers have nothing to find here: the pages are
# behind a login, and the pictures under /media belong in the emails, not in
# search results. /robots.txt says the same (main.py).
ROBOTS = "noindex, nofollow"

# Once the dashboard is served over https, which is when the login cookie is
# made secure too, browsers are told to use nothing but https for a year.
HSTS = "max-age=31536000"

# How deep a JSON body may nest. An email's design, the deepest thing sent
# here, goes about ten levels down. One nested hundreds of levels deep is
# saved and then cannot be read back, so it is refused at the door.
MAX_DEPTH = 64
_STRINGS = re.compile(rb'"[^"\\]*(?:\\.[^"\\]*)*"')
_NOT_BRACKETS = re.compile(rb"[^\[\]{}]+")

# The one request that is not JSON: images arrive as a file upload. The
# Origin check below covers it the same way.
UPLOADS = {"/api/images": "multipart/form-data"}

# The documentation page loads its own scripts from a CDN, so it is left out
# of the policy above. It shows how the API works, never any data.
DOCS = ("/api/docs", "/api/openapi.json")


def _host(request):
    """The name the request was sent to, without the port."""
    host = (request.headers.get("host") or "").strip().lower()
    if host.startswith("["):  # an IPv6 address, [::1]:8000
        return host[1:].split("]", 1)[0]
    return host.rsplit(":", 1)[0] if host.count(":") == 1 else host


def _allowed_host(request):
    """Whether the request was sent to a name the dashboard answers to
    (ALLOWED_HOSTS in config.py). A web page on another site can point its
    own name at this computer (DNS rebinding); its requests carry that name,
    and get nothing."""
    host = _host(request)
    for allowed in config.ALLOWED_HOSTS:
        if allowed == "*" or host == allowed or (allowed.startswith("*.") and host.endswith(allowed[1:])):
            return True
    return False


def _refused(request, path):
    """The answer for a request that goes no further, or None."""
    if not _allowed_host(request):
        return JSONResponse(body("unknown_host", "The dashboard does not answer to this address. "
                                 "Add it to ALLOWED_HOSTS in .env."), status_code=400)
    if path.startswith("/api/") and not path.startswith(DOCS):
        if request.app.state.schema_problem:
            return JSONResponse(body("schema_missing", request.app.state.schema_problem), status_code=503)
        if request.method not in ("GET", "HEAD", "OPTIONS"):
            # The browser sends Origin with every request that changes
            # something, and another website cannot fake it. Together with the
            # SameSite cookie this stops another site acting as a logged-in
            # editor. A body must be JSON, which a plain form cannot send.
            origin = request.headers.get("origin")
            if origin and urlsplit(origin).netloc != request.headers.get("host"):
                return JSONResponse(body("other_site", "Requests from other websites are refused."), status_code=403)
            has_body = request.headers.get("content-length", "0") != "0" or "transfer-encoding" in request.headers
            allowed = UPLOADS.get(path, "application/json")
            if has_body and not request.headers.get("content-type", "").startswith(allowed):
                return JSONResponse(body("send_json", "Send the request as JSON."), status_code=415)
    return None


def _too_deep(raw):
    """Whether a JSON body nests deeper than MAX_DEPTH. Brackets inside
    strings do not count, such as the braces of the email's own styles. A
    body with too few brackets to get that deep is not looked at further."""
    if raw.count(b"[") + raw.count(b"{") <= MAX_DEPTH:
        return False
    depth = 0
    for bracket in _NOT_BRACKETS.sub(b"", _STRINGS.sub(b"", raw)):
        depth += 1 if bracket in b"[{" else -1
        if depth > MAX_DEPTH:
            return True
    return False


async def _nested(request, path):
    """The answer for a JSON body nested too deep, or None. Read here, the
    body is kept for the endpoint, which reads it again."""
    if (path.startswith("/api/") and request.method not in ("GET", "HEAD", "OPTIONS")
            and request.headers.get("content-type", "").startswith("application/json")):
        if _too_deep(await request.body()):
            return JSONResponse(body("too_deep", "The request is nested too deeply to read."), status_code=400)
    return None


def _secure(response, path):
    """The headers every answer carries, refusals included."""
    response.headers["X-Content-Type-Options"] = "nosniff"
    response.headers["Referrer-Policy"] = "no-referrer"
    response.headers["X-Robots-Tag"] = ROBOTS
    response.headers["Permissions-Policy"] = PERMISSIONS
    if config.COOKIE_SECURE:
        response.headers["Strict-Transport-Security"] = HSTS
    # Article data is private, so the browser keeps no copy of it. Pages are
    # checked for changes on every load, so an edit shows without a hard
    # refresh.
    if "cache-control" not in response.headers:
        response.headers["Cache-Control"] = "no-store" if path.startswith("/api/") else "no-cache"
    # A response that sets its own policy keeps it: the newsletter preview
    # does, to show the email's own styles inside the dashboard.
    if "content-security-policy" not in response.headers:
        if path in EDITOR_PAGES:
            response.headers["Content-Security-Policy"] = CSP_EDITOR
            response.headers["X-Frame-Options"] = "SAMEORIGIN"
        elif not path.startswith(DOCS):
            response.headers["Content-Security-Policy"] = CSP
            response.headers["X-Frame-Options"] = "DENY"


async def guard(request: Request, call_next):
    path = request.url.path
    response = _refused(request, path) or await _nested(request, path) or await call_next(request)
    _secure(response, path)
    return response
