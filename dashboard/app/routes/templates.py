"""Saved templates and sections, for the newsletter editor.
Jira: DM42-37
"""

from fastapi import APIRouter, Depends, Response

from ..dependencies import current_user
from ..errors import ApiError
from ..schemas.auth import User
from ..schemas.templates import Template, TemplateIn, TemplateKind, TemplateUpdate
from ..services import templates

router = APIRouter(prefix="/templates", tags=["newsletter"])

NOT_FOUND = (404, "no_such_template", "There is no saved template or section with that number.")
TOO_BIG = (413, "design_too_big", "That design is too big to save.")


@router.get("", response_model=list[Template], summary="Saved templates, or saved sections, newest first")
def list_templates(kind: TemplateKind = "template"):
    return templates.listed(kind)


@router.get("/{template_id}", response_model=Template, summary="One saved template or section")
def get_template(template_id: int):
    try:
        return templates.get(template_id)
    except templates.NotFound:
        raise ApiError(*NOT_FOUND)


@router.post("", response_model=Template, status_code=201, summary="Save a design or a section for reuse")
def add_template(body: TemplateIn, user: User = Depends(current_user)):
    try:
        return templates.add(body.kind, body.name, body.design, user.id)
    except templates.TooBig:
        raise ApiError(*TOO_BIG)


@router.patch("/{template_id}", response_model=Template, summary="Rename a saved template or section, or replace its design")
def update_template(template_id: int, body: TemplateUpdate, user: User = Depends(current_user)):
    try:
        return templates.update(template_id, body.name, body.design, user.id)
    except templates.NotFound:
        raise ApiError(*NOT_FOUND)
    except templates.TooBig:
        raise ApiError(*TOO_BIG)


@router.delete("/{template_id}", status_code=204, summary="Delete a saved template or section")
def delete_template(template_id: int):
    try:
        templates.remove(template_id)
    except templates.NotFound:
        raise ApiError(*NOT_FOUND)
    return Response(status_code=204)
