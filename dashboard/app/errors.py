"""Errors the API answers with: a status, a code and a message in English.

The pages show their own words for each code, in Finnish or English, and
fall back to the message when they have none. Anything else calling the API
gets a readable message either way:

  {"detail": "Wrong email or password.", "code": "wrong_password"}

Every error takes this shape, also the ones FastAPI and Starlette raise
themselves: a wrong address, a method an address does not take, a request
that does not match what the endpoint expects. None of them repeats what was
sent, and none shows a stack trace.
"""

from fastapi import HTTPException, Request
from fastapi.exceptions import RequestValidationError
from fastapi.responses import HTMLResponse, JSONResponse
from starlette.exceptions import HTTPException as StarletteHTTPException


class ApiError(HTTPException):
    def __init__(self, status, code, message, **params):
        super().__init__(status_code=status, detail=message)
        self.code = code
        self.params = params


def body(code, message, params=None):
    out = {"detail": message, "code": code}
    if params:
        out["params"] = params
    return out


async def handle(request: Request, error: ApiError):
    return JSONResponse(body(error.code, error.detail, error.params), status_code=error.status_code,
                        headers=getattr(error, "headers", None))


# What a status means when it comes from the framework rather than from our
# own code. The message is ours, so the framework's wording never decides
# what a page shows.
_STATUS = {
    400: ("bad_request", "The request could not be read."),
    401: ("not_logged_in", "Log in first."),
    403: ("forbidden", "This is not allowed."),
    404: ("not_found", "There is nothing at this address."),
    405: ("method_not_allowed", "This address does not take that kind of request."),
    413: ("too_big", "The request is too big."),
    429: ("too_many", "Too many requests. Wait a moment and try again."),
}

# A wrong page address is a person in a browser, so it gets a page with a way
# back rather than JSON. It has no style or script of its own, which the
# pages' Content-Security-Policy would not allow anyway.
_NO_PAGE = """<!doctype html>
<html lang="fi">
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Sivua ei löydy</title>
<h1>Sivua ei löydy</h1>
<p>Tässä osoitteessa ei ole mitään. There is nothing at this address.</p>
<p><a href="/">Uutiskirjeen etusivulle · To the dashboard</a></p>
"""


def _is_page(request):
    path = request.url.path
    return request.method in ("GET", "HEAD") and not path.startswith(("/api/", "/media/"))


async def handle_http(request: Request, error: StarletteHTTPException):
    """Errors raised by FastAPI and Starlette themselves: no such address, a
    method the address does not take, a body that could not be read."""
    if error.status_code == 404 and _is_page(request):
        return HTMLResponse(_NO_PAGE, status_code=404)
    code, message = _STATUS.get(error.status_code, ("http_error", "The request could not be handled."))
    params = {"status": error.status_code} if code == "http_error" else None
    return JSONResponse(body(code, message, params), status_code=error.status_code,
                        headers=getattr(error, "headers", None))


def _field(location):
    """Where in the request the problem is, without the part it came in:
    ("query", "per_page") is per_page, ("body", "articles", 0, "title") is
    articles.0.title. Kept short, since a deeply nested body has a long
    path."""
    parts = [str(p) for p in location if p not in ("body", "query", "path", "header", "cookie")]
    return ".".join(parts)[:80]


async def handle_invalid(request: Request, error: RequestValidationError):
    """A request that does not match what the endpoint expects. FastAPI's own
    answer copies everything that was sent back into the error, which for a
    big or deeply nested body is big or fails altogether, so this one names
    the first problem and leaves the input out."""
    problems = error.errors()
    first = problems[0] if problems else {}
    if first.get("type") == "json_invalid":
        return JSONResponse(body("bad_json", "The request is not valid JSON."), status_code=422)
    field = _field(first.get("loc", ()))
    reason = str(first.get("msg", "is not valid"))
    if str(first.get("type", "")).endswith("_parsing"):
        # A parser's own note can quote a piece of what was sent: "Input
        # should be a valid UUID, invalid character: found `n` at 1".
        reason = reason.split(", ")[0]
    reason = reason[:160]
    message = f"{field}: {reason}" if field else reason
    params = {"field": field, "problems": len(problems)}
    return JSONResponse(body("invalid_request", f"Check the request. {message}", params), status_code=422)


async def handle_too_deep(request: Request, error: RecursionError):
    """A body nested thousands of levels deep, which passes for a valid
    shape where an endpoint takes any JSON (an email's design) and then
    breaks whatever walks through it. Refused instead of failing."""
    return JSONResponse(body("too_deep", "The request is nested too deeply to read."), status_code=400)


async def handle_unexpected(request: Request, error: Exception):
    """Anything else that went wrong. The traceback goes to the log, not to
    whoever asked; server is the code the pages already have words for."""
    return JSONResponse(body("server", "Something went wrong on the server.", {"status": 500}), status_code=500)
