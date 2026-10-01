"""What logging in sends and gets back."""

from pydantic import BaseModel, Field


class Credentials(BaseModel):
    email: str = Field(max_length=200)
    password: str = Field(max_length=200)


class LinkToken(BaseModel):
    token: str = Field(min_length=20, max_length=100, description="The part after #/link/ in the link from the bot")


class User(BaseModel):
    id: int
    email: str | None = Field(description="Empty for someone who joined through Telegram")
    name: str
    role: str = Field(description="editor, or admin, who can also invite and remove people")

    @classmethod
    def from_row(cls, found):
        return cls(id=found["id"], email=found["email"],
                   name=found["display_name"] or found["email"] or "Editor", role=found["role"])
