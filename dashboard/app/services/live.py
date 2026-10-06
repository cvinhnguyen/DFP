"""Live pages: what changed in the database, passed to the open pages as it
happens, so an editor sees new articles, a summary or tags arriving, another
editor's decision or save, or the Drive folder being read, without a reload.
Jira: DM42-80

The database says what changed (db/init/35-live.sql): one short notice per
statement, such as {"k": "items", "ids": [6073]}, on the channel dfp_live.
One connection here listens for them (listen() below, started with the app)
and the hub passes each to every open page that may know of it. A page gets
only the kind and the ids, never a title or a text, and asks the API again
for what it shows, under the same login rules as any other request. So what
a page may see is decided where it always was, and this adds no way around
it.

What each login may hear:
  the shared demo login   no Drive notices, and no ids for articles, since
                          the association's Drive articles are not for it
  everyone else           every notice

A burst of notices, such as n8n storing a run's articles, reaches a page as
one message: the hub waits a moment and merges what came, the ids of each
kind together.
"""

import asyncio
import json
import logging

import psycopg

log = logging.getLogger("uvicorn.error")

CHANNEL = "dfp_live"
# How long a burst is gathered before it goes to the pages, in seconds.
GATHER = 0.3
# More ids than this for one kind is "many": the page refreshes what it shows.
MAX_IDS = 200
# resync is the hub's own: notices may have been missed, refresh everything.
# sources is a source changed or checked, or a suggested one looked at
# (36-sources.sql).
KINDS = {"items", "picks", "issues", "comments", "signals", "topics", "images", "drive", "sources", "resync"}
# Kinds the shared demo login hears without ids, and kinds it does not hear.
DEMO_NO_IDS = {"items", "picks"}
DEMO_NEVER = {"drive"}


class Listener:
    """One open page's stream. pending holds what has come since the last
    message: for each kind, the ids, or None for "many" or "no ids"."""

    def __init__(self, demo=False):
        self.demo = demo
        self.pending = {}
        self.ready = asyncio.Event()

    def add(self, kind, ids):
        if self.demo:
            if kind in DEMO_NEVER:
                return
            if kind in DEMO_NO_IDS:
                ids = None
        if kind in self.pending and self.pending[kind] is None:
            pass  # already "many"
        elif ids is None:
            self.pending[kind] = None
        else:
            merged = (self.pending.get(kind) or set()) | set(ids)
            self.pending[kind] = merged if len(merged) <= MAX_IDS else None
        self.ready.set()

    async def next(self, timeout):
        """What came, as a list of {"k", "ids"}, or None when nothing came
        within timeout seconds."""
        try:
            await asyncio.wait_for(self.ready.wait(), timeout)
        except asyncio.TimeoutError:
            return None
        await asyncio.sleep(GATHER)
        self.ready.clear()
        found, self.pending = self.pending, {}
        return [{"k": kind, "ids": sorted(ids) if ids is not None else None} for kind, ids in sorted(found.items())]


class Hub:
    def __init__(self):
        self.listeners = set()

    def join(self, demo=False):
        listener = Listener(demo)
        self.listeners.add(listener)
        return listener

    def leave(self, listener):
        self.listeners.discard(listener)

    def publish(self, notice):
        """A notice from the database, as its JSON text or as a dict."""
        if isinstance(notice, str):
            try:
                notice = json.loads(notice)
            except ValueError:
                return
        kind = notice.get("k")
        if kind not in KINDS:
            return
        ids = notice.get("ids")
        if ids is not None:
            ids = [int(i) for i in ids if isinstance(i, int) or str(i).isdigit()]
        for listener in list(self.listeners):
            listener.add(kind, ids)

    def everything_changed(self):
        """After the listening connection was lost and found again: notices
        may have been missed, so every page refreshes what it shows."""
        for listener in list(self.listeners):
            listener.add("resync", None)


hub = Hub()


async def listen():
    """Listens on dfp_live for as long as the app runs (main.py cancels it on
    the way out), and connects again whenever the database goes away,
    telling the pages to refresh once it is back. The connection's details
    come from the same PG* settings as the pool's."""
    delay, first = 1, True
    while True:
        try:
            async with await psycopg.AsyncConnection.connect(autocommit=True) as conn:
                await conn.execute(f"LISTEN {CHANNEL}")
                if not first:
                    hub.everything_changed()
                first, delay = False, 1
                async for note in conn.notifies():
                    hub.publish(note.payload)
        except asyncio.CancelledError:
            raise
        except Exception as e:  # the database restarting, or not up yet
            log.warning("Live updates: lost the database (%s), trying again in %s s", e, delay)
        await asyncio.sleep(delay)
        delay = min(delay * 2, 30)
