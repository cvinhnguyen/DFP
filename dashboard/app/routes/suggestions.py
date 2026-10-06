"""How the suggested sections fare, and the section the editors choose for a
source's articles when they keep going to another one.
Jira: DM42-32
"""

from fastapi import APIRouter, Depends

from ..dependencies import current_user, is_demo
from ..errors import ApiError
from ..schemas.auth import User
from ..schemas.suggestions import Offers, SourceSection, SourceSectionIn, SuggestionStats
from ..services import items, suggestions

router = APIRouter(tags=["suggestions"])

NO_SUCH_SOURCE = (404, "no_such_source", "There is no source with that number.")


@router.get("/suggestions", response_model=SuggestionStats, summary="How often the suggested section was the one chosen")
def stats():
    return suggestions.stats()


@router.get("/suggestions/waiting", response_model=dict[str, int],
            summary="How many articles in Uudet each section is suggested for")
def waiting(user: User = Depends(current_user)):
    """What a newsletter's page shows beside a section with nothing picked
    yet: {"events": 3, "member_news": 0, …}."""
    return items.waiting_by_section(hide_drive=is_demo(user))


@router.get("/suggestions/offers", response_model=Offers,
            summary="Sources whose last three articles went to another section than the one suggested")
def offers():
    """What Artikkelit asks the editors: whether to suggest that section for
    the source from now on, or to stop suggesting the one chosen before."""
    return suggestions.offers()


@router.put("/sources/{source_id}/section", response_model=SourceSection,
            summary="Choose the section to suggest for a source's articles, or stop suggesting one",
            responses={404: {"description": "No such source"}, 409: {"description": "The Telegram capture"}})
def choose(source_id: int, body: SourceSectionIn, user: User = Depends(current_user)):
    """An event with a date and the association's member posts keep their own
    sections; this decides the rest of the source's articles."""
    try:
        return suggestions.choose(source_id, body.section, user.id)
    except suggestions.NotFound:
        raise ApiError(*NO_SUCH_SOURCE)
    except suggestions.MixedSource:
        raise ApiError(409, "mixed_source", "The links sent to the bot come from all kinds of sites, so no one section fits them.")


@router.post("/sources/{source_id}/section/declined", status_code=204,
             summary="The editors said no to the section suggested for a source",
             responses={404: {"description": "No such source"}})
def decline(source_id: int, user: User = Depends(current_user)):
    """The source's section stays as it is, and Artikkelit asks again only
    after three more picks."""
    try:
        suggestions.decline(source_id, user.id)
    except suggestions.NotFound:
        raise ApiError(*NO_SUCH_SOURCE)
    except suggestions.MixedSource:
        raise ApiError(409, "mixed_source", "The links sent to the bot come from all kinds of sites, so no one section fits them.")
