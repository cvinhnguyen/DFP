"""The picture from an article's own page, handed over by n8n.
Jira: DM42-37, DM42-31
"""

from fastapi import APIRouter, Depends

from ..dependencies import n8n_only
from ..errors import ApiError
from ..schemas.pictures import PictureIn, PictureOut
from ..services import pictures

router = APIRouter(tags=["pictures"])


@router.post("/items/{item_id}/picture", response_model=PictureOut, dependencies=[Depends(n8n_only)],
             summary="Keep the picture n8n found on an article's page (n8n only, with its token)")
def receive(item_id: int, body: PictureIn):
    try:
        return pictures.receive(item_id, body.url, body.alt, body.data)
    except pictures.NotFound:
        raise ApiError(404, "no_such_item", "There is no article with that number.")
