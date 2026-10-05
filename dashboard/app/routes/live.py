"""Live pages: one stream per browser of what changed, as Server-Sent
Events. services/live.py explains what travels on it, and what does not.
Jira: DM42-80
"""

import json

from fastapi import APIRouter, Depends, Request
from fastapi.responses import StreamingResponse
from starlette.concurrency import run_in_threadpool

from ..dependencies import COOKIE, current_user, is_demo
from ..schemas.auth import User
from ..services import auth
from ..services.live import hub

router = APIRouter(tags=["live"])

# A line every so often keeps proxies from closing a quiet stream, and is
# when the login is checked again: a login that has ended, or a person
# removed meanwhile, closes the stream.
QUIET = 25


@router.get("/live", summary="What changes, as it happens (Server-Sent Events)",
            response_class=StreamingResponse,
            responses={200: {"content": {"text/event-stream": {}},
                             "description": 'One message per change: data: [{"k": "items", "ids": [6073]}]'}})
async def live(request: Request, user: User = Depends(current_user)):
    """Each message is a list of what changed: k, the kind (items, picks,
    issues, comments, signals, topics, images, drive, or resync after
    notices may have been missed), and the ids it concerns, or null. Never
    any content: a page asks the API again for what it shows. The stream
    ends with event: bye when the login does."""
    token = request.cookies.get(COOKIE)
    listener = hub.join(demo=is_demo(user))

    async def stream():
        try:
            # The browser connects again by itself after three seconds when
            # the stream breaks.
            yield "retry: 3000\nevent: hello\ndata: {}\n\n"
            while True:
                changed = await listener.next(QUIET)
                if changed is None:
                    if not await run_in_threadpool(auth.user_for, token):
                        yield "event: bye\ndata: {}\n\n"
                        return
                    yield ": still here\n\n"
                    continue
                yield f"data: {json.dumps(changed)}\n\n"
        finally:
            hub.leave(listener)

    return StreamingResponse(stream(), media_type="text/event-stream",
                             headers={"Cache-Control": "no-store", "X-Accel-Buffering": "no"})
