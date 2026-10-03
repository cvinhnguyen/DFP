"""The association's past newsletters, as reference data: what the editors
chose by hand, compared with what the system finds, and for a newsletter
made in the dashboard what was picked for it. An admin gives the archive's
address on Uutiskirjeet → Arkisto, and new newsletters are brought in from
there every Monday by n8n (n8n/workflows/archive.json) or with a button;
python -m app.cli.archive does the same from the command line.
Jira: DM42-47
"""

from fastapi import APIRouter, Depends

from ..dependencies import admin_only, n8n_only
from ..errors import ApiError
from ..queries import archive
from ..schemas.archive import ArchiveComparison, ArchiveImport, ArchiveIssue, ArchiveSource, ArchiveSourceIn
from ..services import archive as service

router = APIRouter(tags=["archive"])
# n8n's weekly run, with its token rather than a login.
token_router = APIRouter(tags=["archive"])

UNREACHABLE = (502, "archive_unreachable", "Could not read the newsletter archive. Try again in a moment.")


@router.get("/archive", response_model=list[ArchiveIssue], summary="The past newsletters, with how many of their links the system had")
def issues():
    return archive.issues()


# Declared before /archive/{issue_id}, which would otherwise take "source".
@router.get("/archive/source", response_model=ArchiveSource, summary="Where the past newsletters come from")
def source():
    return service.source()


@router.put("/archive/source", response_model=ArchiveSource, dependencies=[Depends(admin_only)],
            summary="Give the archive's address (admins)", responses={422: {"description": "Not an archive's home page"}})
def set_source(body: ArchiveSourceIn):
    try:
        return service.set_source(body.url)
    except service.BadArchive:
        raise ApiError(422, "not_an_archive", "That is not the address of a Mailchimp newsletter archive. "
                       "It is the \"past newsletters\" link in any of the newsletters, "
                       "https://….campaign-archive.com/home/?u=…&id=…")


@router.post("/archive/import", response_model=ArchiveImport, dependencies=[Depends(admin_only)],
             summary="Bring in the newsletters sent since the archive was last read (admins)",
             responses={409: {"description": "No archive address yet"}, 502: {"description": "The archive did not answer"}})
def import_new():
    try:
        return service.import_new()
    except service.NoArchive:
        raise ApiError(409, "no_archive", "Give the archive's address first.")
    except service.Unreachable:
        raise ApiError(*UNREACHABLE)


@router.get("/archive/{issue_id}", response_model=ArchiveComparison, summary="One past newsletter compared with the system",
            responses={404: {"description": "No such newsletter"}})
def comparison(issue_id: int):
    """Each link it chose: on a site the system follows or not, and the
    article if the system collected it, in time or later. And what the system
    summarised in the 30 days before it went out that it did not use. For a
    newsletter made in the dashboard, also which picks went out."""
    try:
        return service.comparison(issue_id)
    except service.NotFound:
        raise ApiError(404, "no_such_archive_issue", "There is no past newsletter with that number.")


@token_router.post("/archive/refresh", response_model=ArchiveImport, dependencies=[Depends(n8n_only)],
                   summary="Bring in the newsletters sent since last time (n8n only, with its token)")
def refresh():
    """Nothing to do, rather than an error, until an admin gives the address."""
    try:
        return service.import_new(quiet=True)
    except service.Unreachable:
        raise ApiError(*UNREACHABLE)
