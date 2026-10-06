"""The line for the AI: the dashboard asks the model a few things at once
(AI_AT_ONCE) and lets the rest wait their turn, in the order they came,
instead of sending a whole room's questions at the same moment and having the
model refuse them. Everything the editors ask the AI for comes through here:
a question in Kysy, suggestions to ask next, subject lines, the greeting and
a trend's text (routes/writing.py).

A place in line costs nothing while it waits: it is a future on the event
loop, not a thread, so the rest of the dashboard stays quick however long the
line is. A question that brings a key can be asked about while it waits
(GET /api/ai/line/{key}), so Kysy can say how many are ahead of it.

When the line is full (AI_LINE_MAX waiting), or a question has waited
AI_LINE_PATIENCE seconds, it is turned away with Busy, and the page asks the
editor to try again in a moment. Something only nice to have, such as the
questions to ask next, does not queue at all: when anyone is waiting it is
left out.

One process, one line: the dashboard runs as one uvicorn worker.
"""

import asyncio
import re
from collections import deque
from contextlib import asynccontextmanager

from .. import config

KEY = re.compile(r"^[A-Za-z0-9-]{8,64}$")


class Busy(Exception):
    """The line is full, or the wait was too long."""


class Line:
    def __init__(self, at_once=None, most=None, patience=None):
        self.at_once = at_once or config.AI_AT_ONCE
        self.most = config.AI_LINE_MAX if most is None else most
        self.patience = patience or config.AI_LINE_PATIENCE
        self.running = 0
        self.waiting = deque()      # (key, future), first come first
        self.answering = set()      # keys of the questions being answered

    def busy(self):
        return bool(self.waiting) or self.running >= self.at_once

    def where(self, key):
        """("answering", 0), ("waiting", how many are ahead), or None for a
        key the line does not know: not yet come, or already answered."""
        if key in self.answering:
            return "answering", 0
        ahead = 0
        for k, future in self.waiting:
            if future.done():
                continue
            if k == key:
                return "waiting", ahead
            ahead += 1
        return None

    def _hand_on(self):
        """A place is free: the first still waiting gets it, or it is given
        back."""
        while self.waiting:
            _, future = self.waiting.popleft()
            if not future.done():
                future.set_result(True)
                return
        self.running -= 1

    @asynccontextmanager
    async def place(self, key=None, optional=False):
        """Waits for a turn, and holds it until the block ends. With
        optional, raises Busy at once rather than waiting."""
        key = key if key and KEY.match(key) else None
        if not self.busy():
            self.running += 1
        else:
            if optional or len([w for w in self.waiting if not w[1].done()]) >= self.most:
                raise Busy()
            future = asyncio.get_running_loop().create_future()
            entry = (key, future)
            self.waiting.append(entry)
            try:
                await asyncio.wait_for(asyncio.shield(future), self.patience)
            except (asyncio.TimeoutError, asyncio.CancelledError) as stop:
                if future.done() and not future.cancelled():
                    # The turn came at the very moment the wait ended: give
                    # it on rather than lose it.
                    self._hand_on()
                else:
                    future.cancel()
                    try:
                        self.waiting.remove(entry)
                    except ValueError:
                        pass
                if isinstance(stop, asyncio.CancelledError):
                    raise
                raise Busy() from None
        if key:
            self.answering.add(key)
        try:
            yield
        finally:
            if key:
                self.answering.discard(key)
            self._hand_on()


line = Line()
