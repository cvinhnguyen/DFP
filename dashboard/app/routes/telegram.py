"""The bot's account commands, for n8n's Telegram workflow only.
Jira: DM42-33
"""

from fastapi import APIRouter, Depends

from ..dependencies import n8n_only
from ..schemas.telegram import AccountCommand, AccountReply
from ..services import telegram

router = APIRouter(prefix="/telegram", tags=["telegram"], dependencies=[Depends(n8n_only)])


@router.post("/account", response_model=AccountReply, summary="Answer an account command sent to the bot")
def account(body: AccountCommand):
    """/login, /password, /adduser, /people, /remove and /alerts. The
    Telegram id comes from Telegram through n8n, which is why only n8n may
    call this. The answer can have a button that opens a link."""
    return telegram.handle(body.telegram_user_id, body.name, body.command, body.args, body.chat_type, body.chat_id,
                           language=body.language)
