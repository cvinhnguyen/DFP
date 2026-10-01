"""Comments on an issue, from the newsletter editor.
Jira: DM42-37
"""

from fastapi import APIRouter, Depends, Response

from ..dependencies import current_user
from ..errors import ApiError
from ..schemas.auth import User
from ..schemas.comments import Comment, CommentIn, CommentUpdate
from ..services import comments

router = APIRouter(tags=["newsletter"])

NOT_FOUND = (404, "no_such_comment", "There is no such comment.")


@router.get("/issues/{issue_id}/comments", response_model=list[Comment], summary="An issue's comments, oldest first")
def list_comments(issue_id: int):
    try:
        return comments.listed(issue_id)
    except comments.NotFound:
        raise ApiError(404, "no_such_issue", "There is no newsletter with that number.")


@router.post("/issues/{issue_id}/comments", response_model=Comment, status_code=201, summary="Comment on an issue or one of its blocks")
def add_comment(issue_id: int, body: CommentIn, user: User = Depends(current_user)):
    try:
        return comments.add(issue_id, body.body, body.block_id, body.block_label, user.id)
    except comments.NotFound:
        raise ApiError(404, "no_such_issue", "There is no newsletter with that number.")


@router.patch("/comments/{comment_id}", response_model=Comment, summary="Resolve a comment, or open it again")
def update_comment(comment_id: int, body: CommentUpdate, user: User = Depends(current_user)):
    try:
        return comments.resolve(comment_id, body.resolved, user.id)
    except comments.NotFound:
        raise ApiError(*NOT_FOUND)


@router.delete("/comments/{comment_id}", status_code=204, summary="Delete your own comment")
def delete_comment(comment_id: int, user: User = Depends(current_user)):
    try:
        comments.remove(comment_id, user)
    except comments.NotFound:
        raise ApiError(*NOT_FOUND)
    except comments.NotYours:
        raise ApiError(403, "not_your_comment", "Only whoever wrote a comment can delete it.")
    return Response(status_code=204)
