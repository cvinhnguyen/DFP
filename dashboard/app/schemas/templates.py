"""What the saved templates and sections endpoints take and return."""

from datetime import datetime
from typing import Literal

from pydantic import BaseModel, Field

TemplateKind = Literal["template", "section"]


class Template(BaseModel):
    id: int
    kind: TemplateKind
    name: str
    design: dict = Field(description="The editor's own description: a whole email for a template, one section for a section")
    created_by: str | None
    updated_by: str | None
    created_at: datetime
    updated_at: datetime


class TemplateIn(BaseModel):
    kind: TemplateKind
    name: str = Field(min_length=1, max_length=120)
    design: dict


class TemplateUpdate(BaseModel):
    name: str | None = Field(default=None, min_length=1, max_length=120)
    design: dict | None = None
