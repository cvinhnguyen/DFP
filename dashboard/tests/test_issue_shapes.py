"""The shapes a newsletter's page is built from (schemas/issues.py) take what
the database gives them.

  docker compose exec dashboard python -m unittest discover -s tests -v
"""

import unittest
from datetime import datetime, timezone

from app.schemas.issues import PickedArticle


class PickedArticles(unittest.TestCase):
    def test_a_drive_document_has_no_address(self):
        # The article query gives a document from the association's Drive
        # folder no address, since readers could not open it (33-drive.sql).
        picked = PickedArticle(id=1, section="events", title="Työpaja", url=None, publisher="EOK", source="Google Drive",
                               language="fi", summary="Tiivistelmä", excerpt=None, published_at=None,
                               decided_by="Kaisa", decided_at=datetime(2026, 10, 5, tzinfo=timezone.utc),
                               withdrawn=True, withdrawn_reason="gone")
        self.assertIsNone(picked.url)
        self.assertTrue(picked.withdrawn)


if __name__ == "__main__":
    unittest.main()
