"""The association's member organisations, read from its members page.
Jira: DM42-32
"""

from fastapi import APIRouter

from ..schemas.members import Members
from ..services import members

router = APIRouter(tags=["members"])


@router.get("/members", response_model=Members,
            summary="The member organisations whose articles are suggested for Jäsenkuulumisia")
def listed():
    return members.listed()
