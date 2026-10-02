"""The association's past newsletters, as reference data: what the editors
chose by hand, compared with what the system finds. Imported with
python -m app.cli.archive.
Jira: DM42-47
"""

from fastapi import APIRouter

from ..errors import ApiError
from ..queries import archive
from ..schemas.archive import ArchiveComparison, ArchiveIssue

router = APIRouter(tags=["archive"])


@router.get("/archive", response_model=list[ArchiveIssue], summary="The past newsletters, with how many of their links the system had")
def issues():
    return archive.issues()


@router.get("/archive/{issue_id}", response_model=ArchiveComparison, summary="One past newsletter compared with the system",
            responses={404: {"description": "No such newsletter"}})
def comparison(issue_id: int):
    """Each link it chose: on a site the system follows or not, and the
    article if the system collected it, in time or later. And what the system
    summarised in the 30 days before it went out that it did not use."""
    found = next((i for i in archive.issues() if i["id"] == issue_id), None)
    if not found:
        raise ApiError(404, "no_such_archive_issue", "There is no past newsletter with that number.")
    return ArchiveComparison(issue=found, entries=archive.entries(issue_id),
                             surfaced=archive.surfaced(issue_id) if found["sent_on"] else [])
