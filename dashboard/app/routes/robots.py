"""robots.txt, for search engines and AI crawlers: nothing here is for them.
Everything is behind a login, and every answer says noindex as well
(middleware.py), which also covers the pictures under /media.
"""

from fastapi import APIRouter
from fastapi.responses import PlainTextResponse

router = APIRouter(include_in_schema=False)


@router.get("/robots.txt")
def robots():
    return PlainTextResponse("User-agent: *\nDisallow: /\n")
