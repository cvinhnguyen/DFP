"""The status line above the list: what the database says, when the next
check is, and whether the AI is answering.
Jira: DM42-80
"""

from datetime import datetime

from ..queries import overview as queries
from ..queries import settings
from ..schemas.overview import Overview
from . import collection, model_server


def overview():
    times = settings.get("collection_times", "off")
    return Overview(
        **queries.status(),
        collection_times=times,
        next_check_at=collection.next_check(times, datetime.now(collection.HELSINKI)),
        ai_answering=model_server.answering(),
    )
