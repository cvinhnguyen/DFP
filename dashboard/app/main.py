"""The editors' dashboard: the pages and the API behind them, in one service.
Jira: DM42-31, DM42-33, DM42-80

  /           the pages, plain HTML, CSS and JavaScript from web/
  /api/...    JSON for the pages, and for anything else that needs it
  /api/docs   every endpoint, documented from this code

This file only puts the parts together. A request goes through
middleware.py, then a route in routes/, which calls services/, which run the
SQL in queries/. The shapes going in and out are in schemas/.
"""

import logging
from contextlib import asynccontextmanager
from pathlib import Path

from fastapi import APIRouter, Depends, FastAPI
from fastapi.staticfiles import StaticFiles

from . import database, errors, middleware
from .dependencies import current_user
from .routes import (archive, auth, comments, costs, images, issues, items, mailchimp, overview, retention,
                     signals, telegram, templates, topics, writing)

log = logging.getLogger("uvicorn.error")
WEB = Path(__file__).resolve().parent.parent / "web"


@asynccontextmanager
async def lifespan(app):
    database.pool.open(wait=True, timeout=30)
    app.state.schema_problem = database.schema_problem()
    if app.state.schema_problem:
        log.error(app.state.schema_problem)
    yield
    database.pool.close()


app = FastAPI(
    title="Jäsenkirje dashboard",
    summary="The articles the tool collects and summarises, for the editors and for "
            "anything else that needs them. Log in with POST /api/login first.",
    version="1",
    docs_url="/api/docs",
    redoc_url=None,
    openapi_url="/api/openapi.json",
    lifespan=lifespan,
)

# Everything on this router needs a login. An endpoint added to it cannot be
# left open by forgetting to ask for one.
private = APIRouter(prefix="/api", dependencies=[Depends(current_user)])
private.include_router(items.router)
private.include_router(topics.router)
private.include_router(overview.router)
private.include_router(issues.router)
private.include_router(templates.router)
private.include_router(comments.router)
private.include_router(images.router)
private.include_router(mailchimp.router)
private.include_router(costs.router)
private.include_router(retention.router)
private.include_router(signals.router)
private.include_router(archive.router)
private.include_router(writing.router)

app.include_router(auth.router, prefix="/api")
app.include_router(private)
# Only n8n, with its token: the bot's account commands.
app.include_router(telegram.router, prefix="/api")
# Open to anyone with the address: newsletter images, for the readers.
app.include_router(images.public)
app.middleware("http")(middleware.guard)
app.add_exception_handler(errors.ApiError, errors.handle)
app.mount("/", StaticFiles(directory=WEB, html=True), name="web")
