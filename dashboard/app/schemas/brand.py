"""The banners and logo new emails start with."""

from pydantic import BaseModel, Field


class BrandImage(BaseModel):
    src: str = Field(description="The picture's address in Kuvapankki, /media/<key>")
    width: int
    height: int


class Brand(BaseModel):
    newsletter: BrandImage | None = Field(description="The newsletter's banner; null for the association's own green one")
    members: BrandImage | None = Field(description="The member letter's banner; null for the association's own magenta one")
    logo: BrandImage | None = Field(description="The logo; null for the association's own")


class BrandChoice(BaseModel):
    src: str = Field(pattern=r"^/media/[0-9a-f-]{36}$", description="A picture uploaded to Kuvapankki")
