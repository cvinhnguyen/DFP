"""Live pages (services/live.py): which notices reach which open page, and
how a burst of them arrives as one message.

  docker compose exec dashboard python -m unittest discover -s tests -v
"""

import asyncio
import unittest

from app.services import live


class TheHub(unittest.IsolatedAsyncioTestCase):
    async def asyncSetUp(self):
        live.GATHER, self.gather = 0.01, live.GATHER
        self.hub = live.Hub()

    async def asyncTearDown(self):
        live.GATHER = self.gather

    async def test_a_burst_arrives_as_one_message(self):
        page = self.hub.join()
        self.hub.publish('{"k": "items", "ids": [3, 1]}')
        self.hub.publish('{"k": "items", "ids": [2, 3]}')
        self.hub.publish({"k": "drive", "ids": None})
        self.assertEqual(await page.next(1), [{"k": "drive", "ids": None}, {"k": "items", "ids": [1, 2, 3]}])

    async def test_too_many_ids_is_many(self):
        page = self.hub.join()
        self.hub.publish({"k": "items", "ids": list(range(150))})
        self.hub.publish({"k": "items", "ids": list(range(150, 300))})
        self.assertEqual(await page.next(1), [{"k": "items", "ids": None}])

    async def test_the_demo_login_hears_no_drive_and_no_article_ids(self):
        demo, editor = self.hub.join(demo=True), self.hub.join()
        self.hub.publish({"k": "drive", "ids": None})
        self.hub.publish({"k": "items", "ids": [6073]})
        self.hub.publish({"k": "issues", "ids": [5]})
        self.assertEqual(await demo.next(1), [{"k": "issues", "ids": [5]}, {"k": "items", "ids": None}])
        self.assertEqual(len(await editor.next(1)), 3)

    async def test_nothing_else_gets_through(self):
        page = self.hub.join()
        self.hub.publish("not json")
        self.hub.publish({"k": "users", "ids": [1]})
        self.hub.publish({"k": "items", "ids": ["7", "x"]})
        self.assertEqual(await page.next(1), [{"k": "items", "ids": [7]}])

    async def test_quiet_is_none(self):
        page = self.hub.join()
        self.assertIsNone(await page.next(0.05))

    async def test_a_page_that_left_hears_nothing(self):
        page = self.hub.join()
        self.hub.leave(page)
        self.hub.publish({"k": "items", "ids": [1]})
        self.assertFalse(page.pending)

    async def test_after_the_database_was_away_every_page_refreshes(self):
        page = self.hub.join(demo=True)
        self.hub.everything_changed()
        self.assertEqual(await page.next(1), [{"k": "resync", "ids": None}])


if __name__ == "__main__":
    unittest.main()
