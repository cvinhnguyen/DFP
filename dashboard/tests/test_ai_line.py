"""The line for the AI (services/ai_line.py): turns in the order asked, a
place in line that can be looked up, nothing optional queued, and a full
line or a long wait turned away.

  docker compose exec dashboard python -m unittest discover -s tests -v
"""

import asyncio
import unittest

from app.services.ai_line import Busy, Line


class TheLine(unittest.IsolatedAsyncioTestCase):
    async def asks(self, line, key, log, gate):
        async with line.place(key):
            log.append(f"{key} in")
            await gate.wait()
            log.append(f"{key} out")

    async def test_two_at_once_and_the_rest_in_order(self):
        line, log, gate = Line(at_once=2, most=10, patience=5), [], asyncio.Event()
        tasks = [asyncio.create_task(self.asks(line, f"question-{n}", log, gate)) for n in range(1, 5)]
        await asyncio.sleep(0.01)
        self.assertEqual(log, ["question-1 in", "question-2 in"])
        self.assertEqual(line.where("question-1"), ("answering", 0))
        self.assertEqual(line.where("question-3"), ("waiting", 0))
        self.assertEqual(line.where("question-4"), ("waiting", 1))
        self.assertIsNone(line.where("question-9"))
        gate.set()
        await asyncio.gather(*tasks)
        self.assertEqual([x for x in log if x.endswith(" in")], [f"question-{n} in" for n in range(1, 5)])
        self.assertEqual((line.running, len(line.waiting)), (0, 0))

    async def test_something_optional_does_not_wait(self):
        line, gate = Line(at_once=1, most=10, patience=5), asyncio.Event()
        first = asyncio.create_task(self.asks(line, "question-1", [], gate))
        await asyncio.sleep(0.01)
        with self.assertRaises(Busy):
            async with line.place(optional=True):
                pass
        gate.set()
        await first
        async with line.place(optional=True):
            self.assertEqual(line.running, 1)

    async def test_a_full_line_turns_away(self):
        line, gate = Line(at_once=1, most=1, patience=5), asyncio.Event()
        tasks = [asyncio.create_task(self.asks(line, f"question-{n}", [], gate)) for n in (1, 2)]
        await asyncio.sleep(0.01)
        with self.assertRaises(Busy):
            async with line.place("question-3"):
                pass
        gate.set()
        await asyncio.gather(*tasks)

    async def test_a_long_wait_gives_up_and_the_next_still_gets_its_turn(self):
        line, gate, log = Line(at_once=1, most=5, patience=0.05), asyncio.Event(), []
        first = asyncio.create_task(self.asks(line, "question-1", log, gate))
        await asyncio.sleep(0.01)
        with self.assertRaises(Busy):
            async with line.place("question-2"):
                pass
        self.assertIsNone(line.where("question-2"))
        gate.set()
        await first
        async with line.place("question-3"):
            self.assertEqual(line.where("question-3"), ("answering", 0))
        self.assertEqual((line.running, len(line.waiting)), (0, 0))

    async def test_a_turn_is_handed_on_when_the_one_answered_fails(self):
        line = Line(at_once=1, most=5, patience=5)

        async def fails():
            async with line.place("question-1"):
                await asyncio.sleep(0.01)
                raise ValueError("the AI did not answer")

        failing = asyncio.create_task(fails())
        await asyncio.sleep(0)
        async with line.place("question-2"):
            self.assertEqual(line.where("question-2"), ("answering", 0))
        with self.assertRaises(ValueError):
            await failing
        self.assertEqual(line.running, 0)


if __name__ == "__main__":
    unittest.main()
