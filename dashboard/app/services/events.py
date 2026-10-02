"""An event's dates, time and place as the association's newsletter writes
them, the line every event in it starts with:

  17.9.2026 | Tampere
  21.–23.4.2027 | Tampere
  6.10.2026 klo 9.30–16 | Tampere
  6.11.2026 | Verkko

The details come from the AI's reading of the article (summarisation.json,
db/init/21-titles-events.sql). What the article did not say stays out.
Jira: DM42-8, DM42-80
"""

import re


def dates(starts, ends=None):
    """17.9.2026, or 21.–23.4.2027 for an event of several days."""
    if not starts:
        return None
    if not ends or ends <= starts:
        return f"{starts.day}.{starts.month}.{starts.year}"
    if starts.year != ends.year:
        return f"{starts.day}.{starts.month}.{starts.year}–{ends.day}.{ends.month}.{ends.year}"
    if starts.month != ends.month:
        return f"{starts.day}.{starts.month}.–{ends.day}.{ends.month}.{ends.year}"
    return f"{starts.day}.–{ends.day}.{ends.month}.{ends.year}"


def clock(time):
    """A time the Finnish way: 09:30-16 becomes 9.30–16, and 15.00-16.00 15–16."""
    text = time.replace(":", ".").replace("-", "–")
    text = re.sub(r"\.00(?!\d)", "", text)
    text = re.sub(r"(?<![\d.])0(\d)", r"\1", text)
    return text.rstrip("– ")


def line(starts=None, ends=None, time=None, place=None):
    """The whole line, or None without a date: the newsletter's line always
    starts with one, and a place alone is left for the editor to word."""
    when = dates(starts, ends)
    if not when:
        return None
    if time:
        when = f"{when} klo {clock(time)}"
    return " | ".join(part for part in (when, place) if part)


def details(found):
    """The event fields of a summary row as the API gives them, or None for an
    article that is not about an event."""
    starts, ends = found.get("event_starts"), found.get("event_ends")
    time, place, deadline = found.get("event_time"), found.get("event_place"), found.get("event_deadline")
    if not any((starts, place, deadline)):
        return None
    return {"starts": starts, "ends": ends, "time": time, "place": place, "deadline": deadline,
            "line": line(starts, ends, time, place)}
