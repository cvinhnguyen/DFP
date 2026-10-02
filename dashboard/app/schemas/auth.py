"""What logging in sends and gets back."""

from pydantic import BaseModel, Field


class Credentials(BaseModel):
    email: str = Field(max_length=200)
    password: str = Field(max_length=200)


class LinkToken(BaseModel):
    token: str = Field(min_length=20, max_length=100, description="The part after #/link/ in the link from the bot")


class PasswordLink(BaseModel):
    token: str = Field(min_length=20, max_length=100, description="The part after #/password/ in the link from the bot")


class NewPassword(PasswordLink):
    password: str = Field(max_length=200)
    email: str | None = Field(default=None, max_length=200,
                              description="Only for an account without an email yet, as for someone who joined "
                                          "through Telegram: the email to log in with from now on")


class LinkOwner(BaseModel):
    id: int
    name: str
    email: str | None = Field(description="What they will log in with. Empty for someone who joined through "
                                          "Telegram, who chooses it on the same page")
    has_password: bool = Field(description="Whether the new password replaces one they have")
    min_length: int = Field(description="The shortest password the dashboard takes")


class User(BaseModel):
    id: int
    email: str | None = Field(description="Empty for someone who joined through Telegram")
    name: str
    role: str = Field(description="editor, or admin, who can also add and remove people")

    @classmethod
    def from_row(cls, found):
        return cls(id=found["id"], email=found["email"],
                   name=found["display_name"] or found["email"] or "Editor", role=found["role"])
