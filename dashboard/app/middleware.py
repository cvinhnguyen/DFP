"""What happens to every request before and after its endpoint: a missing
migration is reported, requests from other websites are refused, and every
answer carries the security headers.
"""

from urllib.parse import urlsplit

from fastapi import Request
from fastapi.responses import JSONResponse

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

# The one request that is not JSON: images arrive as a file upload. The
# Origin check above covers it the same way.
UPLOADS = {"/api/images": "multipart/form-data"}

# The documentation page loads its own scripts from a CDN, so it is left out
# of the policy above. It shows how the API works, never any data.
DOCS = ("/api/docs", "/api/openapi.json")


async def guard(request: Request, call_next):
    path = request.url.path
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

    response = await call_next(request)
    response.headers["X-Content-Type-Options"] = "nosniff"
    response.headers["Referrer-Policy"] = "no-referrer"
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
    return response
