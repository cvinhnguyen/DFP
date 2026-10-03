"""The association's member organisations, as the dashboard shows them on
Asetukset. n8n reads them from the association's members page every Monday
(n8n/workflows/members.json); an article from a member's website, or naming a
member in its title, is suggested for Jäsenkuulumisia (services/suggest.py).
Jira: DM42-32
"""

from ..queries import members as queries


def listed():
    rows = queries.listed()
    return {"members": rows, "read_at": max((r["last_seen"] for r in rows), default=None)}
