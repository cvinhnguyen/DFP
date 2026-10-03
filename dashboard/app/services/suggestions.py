"""What the editors' picks say about the suggested sections: how often each
rule was right, and the sources whose articles keep going to another section
than the one suggested. For such a source Artikkelit asks whether to suggest
that section from now on, and the answer is the editors'
(30-section-suggestions.sql). Nothing changes without it: a source's articles
can be of many kinds, and three picks are few.
Jira: DM42-32

Each pick keeps what was suggested when it was made, and its section follows
the article if it is moved in the email editor (services/issues.py).
"""

from ..queries import suggest as queries
from . import suggest

# How many picks in a row it takes to ask.
STREAK = 3


class NotFound(Exception):
    pass


class MixedSource(Exception):
    """The Telegram capture: links from all kinds of sites, which no one
    section fits."""


def offer(chosen, sections, suggested):
    """What to ask about a source, from its last picks, newest first: the
    section they all went to though none was suggested there, or, when the
    section chosen for the source was passed over each time, whether to stop
    suggesting it. None when there is nothing to ask."""
    if len(sections) < STREAK:
        return None
    first = sections[0]
    if first != chosen and all(s == first for s in sections) and all(x != first for x in suggested):
        same = all(x == suggested[0] for x in suggested)
        return {"kind": "set", "section": first, "suggested": suggested[0] if same else None}
    if chosen and all(s != chosen for s in sections):
        return {"kind": "stop", "section": chosen, "suggested": None}
    return None


def offers():
    found = []
    reasons = [r or "" for r in suggest.SOURCE_DECIDES]
    for row in queries.recent_picks(reasons, STREAK):
        what = offer(row["chosen"], row["sections"], row["suggested"])
        if what:
            found.append({"source_id": row["source_id"], "source": row["source"], "picks": STREAK, **what})
    return {"offers": found}


def _source(source_id):
    found = queries.source(source_id)
    if not found:
        raise NotFound()
    if found["type"] == "manual":
        raise MixedSource()
    return found


def choose(source_id, section, user_id):
    """The section to suggest for the source's articles, or None to stop."""
    _source(source_id)
    queries.set_section(source_id, section, user_id)
    found = queries.source(source_id)
    return {"source_id": found["source_id"], "source": found["source"], "section": found["section"]}


def decline(source_id, user_id):
    _source(source_id)
    queries.declined(source_id, user_id)


def _tally(entry, row):
    entry["picks"] += row["n"]
    if row["section"] == row["suggested"]:
        entry["kept"] += row["n"]
    else:
        entry["moved"][row["section"]] = entry["moved"].get(row["section"], 0) + row["n"]


def _moved_to(entry):
    """The section the picks not kept went to most often."""
    moved = entry.pop("moved")
    if not moved:
        return {**entry, "moved_to": None, "moved_to_picks": 0}
    section = max(suggest.SECTIONS, key=lambda s: (moved.get(s, 0), -suggest.SECTIONS.index(s)))
    return {**entry, "moved_to": section, "moved_to_picks": moved[section]}


def stats():
    """How often the section suggested was the one chosen: in all, for each
    reason it was suggested, and for each source, with the sections the
    editors chose for sources."""
    total = {"picks": 0, "kept": 0, "moved": {}}
    reasons, sources = {}, {}
    for row in queries.pick_counts():
        _tally(total, row)
        _tally(reasons.setdefault(row["reason"] or "none", {"picks": 0, "kept": 0, "moved": {}}), row)
        _tally(sources.setdefault(row["source_id"], {
            "source_id": row["source_id"], "source": row["source"], "mixed": row["source_type"] == "manual",
            "section": None, "chosen_by": None, "chosen_at": None, "picks": 0, "kept": 0, "moved": {}}), row)
    for chosen in queries.chosen_sections():
        entry = sources.setdefault(chosen["source_id"], {
            "source_id": chosen["source_id"], "source": chosen["source"], "mixed": chosen["source_type"] == "manual",
            "picks": 0, "kept": 0, "moved": {}})
        entry.update(section=chosen["section"], chosen_by=chosen["chosen_by"], chosen_at=chosen["chosen_at"])
    return {
        "picks": total["picks"],
        "kept": total["kept"],
        "reasons": sorted((_moved_to({"reason": k, **v}) for k, v in reasons.items()),
                          key=lambda r: (-r["picks"], r["reason"])),
        "sources": sorted((_moved_to(v) for v in sources.values()),
                          key=lambda s: (s["section"] is None, -s["picks"], (s["source"] or "").lower())),
    }
