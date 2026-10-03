"""The picture from an article's own page, handed over by n8n.
Jira: DM42-37, DM42-31
"""

from fastapi import APIRouter, Depends

from ..dependencies import admin_only, n8n_only
from ..errors import ApiError
from ..schemas.pictures import PictureIn, PictureOut, RightsIn, RightsOut, SourcesPictures
from ..services import pictures

router = APIRouter(tags=["pictures"])
# What each source's pictures are, for admins on Asetukset.
admin_router = APIRouter(tags=["pictures"], dependencies=[Depends(admin_only)])


@router.post("/items/{item_id}/picture", response_model=PictureOut, dependencies=[Depends(n8n_only)],
             summary="Keep the picture n8n found on an article's page (n8n only, with its token)")
def receive(item_id: int, body: PictureIn):
    try:
        return pictures.receive(item_id, body.url, body.alt, body.data)
    except pictures.NotFound:
        raise ApiError(404, "no_such_item", "There is no article with that number.")


@admin_router.get("/sources/pictures", response_model=SourcesPictures,
                  summary="What each source's pictures are, and how many it has kept (admins)")
def sources():
    return pictures.sources()


@admin_router.put("/sources/{source_id}/pictures", response_model=RightsOut,
                  summary="Say what a source's pictures are (admins)", responses={404: {"description": "No such source"}})
def set_rights(source_id: int, body: RightsIn):
    """The pictures already kept say so too. With none, n8n fetches no more,
    and the ones no article, email or template uses are taken away."""
    try:
        return pictures.set_rights(source_id, body.rights)
    except pictures.NotFound:
        raise ApiError(404, "no_such_source", "There is no source with that number.")
