"""The bot's account commands. The Telegram workflow in n8n passes them on and
sends back the reply, so who may do what, and the wording, live here, next
to the rest of the account code.
Jira: DM42-33

  /login          everyone on the list: a one-time link to the dashboard
  /invite         admins: a one-time join link for a new colleague
  /invite admin   admins: the same, for a new admin
  /people         admins: who can use the bot and the dashboard
  /remove Name    admins: ends someone's access
  /start <code>   anyone: what opening an invite link sends
"""

from ..queries import settings, users
from ..queries import telegram as links
from . import auth

GROUP_WARNING = ("Send that to me in a private chat, not in a group. "
                 "Everyone in the group would see the link.")


def handle(telegram_user_id, name, command, args, chat_type):
    command = (command or "").lower()
    args = (args or "").strip()
    if command == "start":
        return _join(telegram_user_id, name, args)

    person = users.by_telegram_id(telegram_user_id)
    if not person:
        return ("I only answer people on the list. "
                "Ask an admin to send you an invite link: they get one with /invite.")
    if command in ("login", "invite") and chat_type not in (None, "", "private"):
        return GROUP_WARNING
    if command == "login":
        return _login_link(person)
    if person["role"] != "admin":
        return "Only an admin can do that."
    if command == "invite":
        return _invite(person, args)
    if command == "people":
        return _people()
    if command == "remove":
        return _remove(person, args)
    return "I do not know that command. Send /help to see what I can do."


def _login_link(person):
    minutes = settings.get_int("login_link_minutes", 15)
    token = auth.new_token()
    links.create_login_link(auth.token_hash(token), person["id"], minutes)
    base = (settings.get("dashboard_url") or "http://localhost:8000").rstrip("/")
    return (f"Here is your link to the dashboard. It works once, in the next {minutes} minutes:\n\n"
            f"{base}/#/link/{token}\n\n"
            "Asking for a new one with /login cancels this one.")


def _invite(person, args):
    role = "admin" if args.lower() == "admin" else "editor"
    hours = settings.get_int("invite_hours", 24)
    # 128 bits, and only letters, digits, - and _, which is what Telegram
    # allows after ?start=
    code = auth.new_token()[:22]
    links.create_invite(auth.token_hash(code), role, person["id"], hours)
    bot = settings.get("telegram_bot_username") or "DFP_Mazhar4_bot"
    who = "an admin" if role == "admin" else "an editor"
    return (f"Send this link to your colleague. It works once, in the next {hours} hours, "
            f"and makes them {who}:\n\n"
            f"https://t.me/{bot}?start={code}\n\n"
            "When they open it and press Start, they can send me links and log in to the dashboard.")


def _join(telegram_user_id, name, code):
    if users.by_telegram_id(telegram_user_id):
        return "You are already on the list. Send /help to see what I can do."
    if not code:
        return ("I only answer people on the list. "
                "Ask an admin to send you an invite link: they get one with /invite.")
    member = links.use_invite(auth.token_hash(code), telegram_user_id, name or "New editor")
    if not member:
        return "That invite link has expired or was already used. Ask an admin for a new one."
    first = (member["display_name"] or "").split(" ")[0]
    greeting = f"Welcome, {first}!" if first else "Welcome!"
    extra = " As an admin you can also invite and remove people." if member["role"] == "admin" else ""
    return (f"{greeting} You can now send me links for the newsletter, "
            f"and /login gives you a link to the dashboard.{extra} Send /help to see everything I can do.")


def _people():
    lines = []
    for p in users.active_people():
        where = "" if p["on_telegram"] else ", dashboard only"
        lines.append(f"• {p['name']} ({p['role']}{where})")
    return ("These people can use me and the dashboard:\n\n" + "\n".join(lines)
            + "\n\nTo take someone off: /remove Name")


def _remove(person, args):
    if not args:
        return "Who? For example: /remove Kaisa. /people shows the names."
    found = users.find_active(args)
    if not found:
        return f"I do not know anyone called {args}. /people shows the names."
    if len(found) > 1:
        options = "\n".join(f"• {p['name']}: /remove {p['telegram_user_id']}" for p in found if p["telegram_user_id"])
        return f"More than one person is called {args}. Use their Telegram ID instead:\n\n{options}"
    target = found[0]
    if target["id"] == person["id"]:
        return "You cannot remove yourself. Ask another admin to do it."
    if target["role"] == "admin" and users.count_admins() <= 1:
        return "That is the last admin. Make someone else an admin first, with /invite admin."
    users.remove(target["id"])
    return (f"{target['name']} can no longer use me or the dashboard. "
            "The articles they sent keep their name.")
