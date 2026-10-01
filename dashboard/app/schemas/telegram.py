"""What the Telegram workflow sends for an account command, and gets back."""

from pydantic import BaseModel, Field


class AccountCommand(BaseModel):
    telegram_user_id: str = Field(max_length=40, description="message.from.id, as Telegram gave it to n8n")
    name: str | None = Field(default=None, max_length=200, description="The sender's first and last name on Telegram")
    command: str = Field(max_length=40, description="login, invite, people, remove or start, without the /")
    args: str = Field(default="", max_length=200, description="Whatever followed the command")
    chat_type: str | None = Field(default=None, max_length=20, description="private, group, supergroup or channel")


class AccountReply(BaseModel):
    reply: str = Field(description="What the bot should answer, in plain words")
