"""The pictures from the articles' own pages."""

from typing import Literal

from pydantic import BaseModel, Field


class Picture(BaseModel):
    src: str = Field(description="Its address, /media/<key>, readable without a login like any picture in an email")
    width: int | None = None
    height: int | None = None
    alt: str | None = Field(default=None, description="The page's own description of the picture, if it gave one")
    credit: str | None = Field(default=None, description="Whose it is, for the line under it: Kuva: <credit>")
    rights: str = Field(description="own, open or check, from the source: a check picture needs an editor's "
                        "\"Saa käyttää\" before the newsletter can go to Mailchimp")


class PictureIn(BaseModel):
    url: str = Field(max_length=2000, description="Where n8n found the picture")
    alt: str | None = Field(default=None, max_length=1000, description="The page's description of it")
    data: str = Field(max_length=14_000_000, description="The picture as downloaded, in base64, at most 10 MB")


class PictureOut(BaseModel):
    status: str = Field(description="stored; generic, the source's logo rather than a photo; small, an icon; "
                        "failed, not a picture; none, the source's pictures are not fetched")
    src: str | None = None
    width: int | None = None
    height: int | None = None


Rights = Literal["own", "open", "check", "none"]


class SourcePictures(BaseModel):
    id: int
    name: str
    type: str | None
    active: bool
    rights: Rights = Field(description="own: the association's own; open: an open licence, credited; check: an "
                           "editor ticks \"Saa käyttää\" before export; none: no pictures are fetched")
    pictures: int = Field(description="Pictures kept from its articles' pages")


class SourcesPictures(BaseModel):
    sources: list[SourcePictures]


class RightsIn(BaseModel):
    rights: Rights


class RightsOut(BaseModel):
    source: SourcePictures
    changed: int = Field(description="Pictures already kept that now say what the source's pictures are")
    removed: int = Field(description="With none: the pictures nobody used, taken away")
