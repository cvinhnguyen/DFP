"""Uploading images for the newsletter, finding them again, and showing them.

Uploading needs a login. Showing an image does not: once the newsletter is
sent, its readers' email programs have to be able to load the pictures. Each
address carries a random key, so an image cannot be found by guessing.
"""

from uuid import UUID

from fastapi import APIRouter, Depends, File, Form, Query, Response, UploadFile
from pydantic import BaseModel, Field

from ..dependencies import current_user, not_demo
from ..errors import ApiError
from ..schemas.auth import User
from ..services import images, videos

router = APIRouter(tags=["images"])
public = APIRouter(tags=["images"])


@router.post("/images", summary="Upload images for the newsletter editor")
def upload(files: list[UploadFile] | None = File(None),
           files_from_editor: list[UploadFile] | None = File(None, alias="files[]"),
           issue_id: int | None = Form(None), user: User = Depends(current_user)):
    """Files arrive as files, or as files[]. Answers with the images as the
    image library lists them: {"data": [{"key", "src": "/media/<key>", ...}]}"""
    files = (files or []) + (files_from_editor or [])
    if not files:
        raise ApiError(400, "no_image", "Choose an image to upload.")
    added = []
    for f in files[:10]:
        raw = f.file.read(images.MAX_BYTES + 1)
        try:
            added.append(images.upload(raw, f.filename, issue_id, user.id))
        except images.BadImage as e:
            raise ApiError(400, e.code, str(e), name=f.filename or "")
    return {"data": added}


@router.get("/images", summary="The image library: one page of images, newest first")
def list_images(q: str | None = Query(None, max_length=100), issue_id: int | None = None,
                page: int = Query(1, ge=1), per_page: int = Query(24, ge=1, le=100)):
    return images.listed(q, issue_id, page, per_page)


@router.delete("/images/{key}", status_code=204, summary="Delete an image no newsletter uses",
               responses={403: {"description": "The shared demo login"},
                          409: {"description": "Used in a newsletter, or an article's own picture"}})
def delete_image(key: UUID, user: User = Depends(not_demo)):
    """Only what Kuvapankki lists: a picture an editor uploaded. The shared
    demo login deletes nothing, and an article's own picture is the
    article's, so neither goes through here."""
    try:
        if not images.remove(key):
            raise ApiError(404, "no_such_image", "There is no such image.")
    except images.InUse as e:
        raise ApiError(409, "image_in_use", str(e), names=", ".join(e.names[:5]))
    except images.ArticlePicture as e:
        raise ApiError(409, "article_picture", str(e))
    return Response(status_code=204)


class VideoIn(BaseModel):
    url: str = Field(min_length=10, max_length=500)
    issue_id: int | None = None


@router.post("/images/video", summary="A video's preview image with a play button, for a video block")
def video_thumbnail(body: VideoIn, user: User = Depends(current_user)):
    try:
        return videos.thumbnail(body.url, body.issue_id, user.id)
    except videos.BadVideo as e:
        raise ApiError(400, e.code, str(e))
    except images.BadImage as e:
        raise ApiError(400, e.code, str(e))


@public.get("/media/{key}", summary="An uploaded image", include_in_schema=False)
def media(key: UUID):
    found = images.get(key)
    if not found:
        raise ApiError(404, "no_such_image", "There is no such image.")
    # An image never changes under its key, so browsers and email programs
    # may keep it as long as they like.
    return Response(bytes(found["data"]), media_type=found["mime"],
                    headers={"Cache-Control": "public, max-age=31536000, immutable"})
