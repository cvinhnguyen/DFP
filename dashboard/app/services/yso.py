"""YSO, the general Finnish ontology, through Finto, the National Library of
Finland's public vocabulary service. Editors search it when they add a tag by
hand, and the dashboard asks it for a term's Finnish name, so a tag always
carries the name YSO gives it.
Jira: DM42-31

Only api.finto.fi is fetched from, with the address built here, so the
dashboard cannot be made to fetch anything else. Answers are kept in memory:
YSO changes a few times a year, not between two keystrokes.
"""

import json
import re
import urllib.error
import urllib.parse
import urllib.request
from functools import lru_cache

API = "https://api.finto.fi/rest/v1/yso/"
TERM = re.compile(r"^http://www\.yso\.fi/onto/yso/p\d{1,9}$")
HEADERS = {"User-Agent": "DFP newsletter bot (HAMK student project)", "Accept": "application/json"}


class Unreachable(Exception):
    pass


class NotATerm(Exception):
    pass


def _get(path, params):
    url = API + path + "?" + urllib.parse.urlencode(params)
    try:
        with urllib.request.urlopen(urllib.request.Request(url, headers=HEADERS), timeout=8) as response:
            return json.loads(response.read(2_000_000))
    except urllib.error.HTTPError as e:
        if e.code == 404:
            return None
        raise Unreachable(f"Finto answered {e.code}.") from e
    except (urllib.error.URLError, OSError, ValueError) as e:
        raise Unreachable("Finto did not answer.") from e


@lru_cache(maxsize=512)
def search(text, limit=10):
    """Terms whose Finnish name, or another name YSO gives the same term,
    starts with the text. Typing jatkuva oppiminen finds elinikäinen
    oppiminen, and says which name matched. An exact name comes first."""
    words = " ".join(text.split())
    if len(words) < 2:
        return ()
    found = _get("search", {"query": words.replace("*", "") + "*", "lang": "fi",
                            "labellang": "fi", "maxhits": 40}) or {}
    terms, seen = [], set()
    for r in found.get("results", []):
        uri, label = r.get("uri"), r.get("prefLabel")
        if not uri or not label or uri in seen or not TERM.match(uri):
            continue
        seen.add(uri)
        also = r.get("altLabel") or r.get("hiddenLabel")
        terms.append({"uri": uri, "label": label,
                      "also": also if also and also.lower() != label.lower() else None})
    typed = words.lower()
    terms.sort(key=lambda t: (t["label"].lower() != typed and (t["also"] or "").lower() != typed,
                              not t["label"].lower().startswith(typed), len(t["label"])))
    return tuple(terms[:limit])


@lru_cache(maxsize=1024)
def label(uri):
    """The term's Finnish name in YSO. NotATerm when YSO has no such term."""
    if not TERM.match(uri or ""):
        raise NotATerm()
    found = _get("label", {"uri": uri, "lang": "fi"})
    name = (found or {}).get("prefLabel")
    if not name:
        raise NotATerm()
    return name
