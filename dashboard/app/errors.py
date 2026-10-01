"""Errors the API answers with: a status, a code and a message in English.

The pages show their own words for each code, in Finnish or English, and
fall back to the message when they have none. Anything else calling the API
gets a readable message either way:

  {"detail": "Wrong email or password.", "code": "wrong_password"}
"""

from fastapi import HTTPException, Request
from fastapi.responses import JSONResponse


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
