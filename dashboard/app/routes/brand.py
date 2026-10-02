"""The banners and logo new emails start with: anyone can read them, the
editor does when it builds a template; admins change them.
Jira: DM42-37
"""

from typing import Literal

from fastapi import APIRouter, Depends

from ..dependencies import admin_only
from ..errors import ApiError
from ..schemas.brand import Brand, BrandChoice
from ..services import brand

router = APIRouter(tags=["brand"])

Which = Literal["newsletter", "members", "logo"]


@router.get("/brand", response_model=Brand, summary="The banners and logo new emails start with")
def current():
    """null for one means the association's own, which the editor has."""
    return brand.current()


@router.put("/brand/{which}", response_model=Brand, summary="Start new emails with another banner or logo (admins)",
            responses={404: {"description": "No such picture in Kuvapankki"}}, dependencies=[Depends(admin_only)])
def choose(which: Which, body: BrandChoice):
    """Emails already started keep theirs."""
    try:
        return brand.choose(which, body.src)
    except brand.NoSuchImage:
        raise ApiError(404, "no_such_image", "There is no such picture in Kuvapankki.")


@router.delete("/brand/{which}", response_model=Brand, summary="Go back to the association's own (admins)",
               dependencies=[Depends(admin_only)])
def reset(which: Which):
    return brand.reset(which)
