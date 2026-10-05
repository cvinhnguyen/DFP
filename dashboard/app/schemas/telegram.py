"""What the Telegram workflow sends for an account command, and gets back."""

from pydantic import BaseModel, Field


class AccountCommand(BaseModel):
    telegram_user_id: str = Field(max_length=40, description="message.from.id, as Telegram gave it to n8n")
    name: str | None = Field(default=None, max_length=200, description="The sender's first and last name on Telegram")
    command: str = Field(max_length=40, description="login, password, adduser, people, remove or alerts, without the /")
    args: str = Field(default="", max_length=200, description="Whatever followed the command")
    chat_type: str | None = Field(default=None, max_length=20, description="private, group, supergroup or channel")
    chat_id: str | None = Field(default=None, max_length=40, description="The chat the command came from: a group's, for /alerts")
    language: str | None = Field(default=None, max_length=35,
                                 description="message.from.language_code: the answer is in Finnish for fi, "
                                             "and in English for anything else or nothing")


class Button(BaseModel):
    text: str = Field(description="What the button says")
    url: str = Field(description="The https address it opens")


class Message(BaseModel):
    text: str
    button: Button | None = Field(default=None, description="A button under the message that opens a link. "
                                  "If Telegram turns it down, the workflow puts the address in the text instead")


class AccountReply(BaseModel):
    reply: str = Field(description="What the bot should answer, as one text with the address in it")
    messages: list[Message] = Field(description="The same, as the message to send, with its button")
