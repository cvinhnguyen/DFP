"""Whether the AI is answering, so the editors hear about it from the
dashboard instead of wondering where the summaries went."""

import time
import urllib.error
import urllib.request

from ..queries import settings

_last = {"checked": 0.0, "answering": None}


def answering():
    """Asks the model server for its version, the same check the summarisation
    workflow makes before each run. The answer is kept for a minute, so a page
    that asks every few seconds does not become a stream of requests. None
    means this provider cannot be checked this way."""
    if time.monotonic() - _last["checked"] < 60:
        return _last["answering"]
    result = None
    base = (settings.get("llm_base_url") or "").rstrip("/")
    if settings.get("llm_provider") == "ollama" and base:
        try:
            with urllib.request.urlopen(base + "/api/version", timeout=3):
                result = True
        except (urllib.error.URLError, OSError, ValueError):
            result = False
    _last.update(checked=time.monotonic(), answering=result)
    return result
