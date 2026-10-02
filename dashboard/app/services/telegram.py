"""The bot's account commands. The Telegram workflow in n8n passes them on and
sends back the reply, so who may do what, and the wording, live here, next
to the rest of the account code.
Jira: DM42-33

  /login                 everyone on the list: a one-time link to the dashboard
  /password              everyone: a link to choose their own password, and
                         their email if they have none, to log in without Telegram
  /adduser email Name    admins: an account that logs in to the dashboard with
                         that email, and a link for the person to choose a password
  /adduser admin email Name   the same, as an admin
  /password email        admins: a new link to choose a password, for someone else
  /people                admins: who can use the bot and the dashboard
  /remove Name           admins: ends someone's access (or /remove email)
  /alerts                admins: where the bot reports problems. In a group:
                         there. /alerts private: each admin; /alerts off: nobody

No password goes through Telegram: the links open a page in the dashboard
where the person types it.
"""

import ipaddress
from urllib.parse import urlsplit

from ..queries import settings, users
from ..queries import telegram as links
from ..schemas.telegram import AccountReply, Button, Message
from . import auth

GROUP_WARNING = ("Send that to me in a private chat, not in a group. "
                 "Everyone in the group would see the link.")
NOT_ON_THE_LIST = "I only work for the newsletter team, and only answer people on its list."
EXAMPLE = "/adduser kaisa@example.fi Kaisa Virtanen"

# Commands that hand out a link, so never in a group.
LINKS = ("login", "adduser", "password")


def handle(telegram_user_id, name, command, args, chat_type, chat_id=None):
    """What the bot answers, as an AccountReply."""
    answer = _answer(telegram_user_id, (command or "").lower(), (args or "").strip(), chat_type, chat_id)
    message = answer if isinstance(answer, Message) else Message(text=answer)
    reply = message.text if not message.button else f"{message.text}\n\n{message.button.url}"
    return AccountReply(reply=reply, messages=[message])


def _answer(telegram_user_id, command, args, chat_type, chat_id):
    person = users.by_telegram_id(telegram_user_id)
    if not person:
        return NOT_ON_THE_LIST
    if command in LINKS and chat_type not in (None, "", "private"):
        return GROUP_WARNING
    if command == "login":
        return _login_link(person)
    if command == "password" and not args:
        return _own_password(person)
    if person["role"] != "admin":
        if command == "password":
            return "Only an admin can do that for someone else. /password on its own gives you a link for your own."
        return "Only an admin can do that."
    if command == "adduser":
        return _add_user(person, args)
    if command == "password":
        return _new_password(person, args)
    if command == "people":
        return _people()
    if command == "remove":
        return _remove(person, args)
    if command == "alerts":
        return _alerts(args, chat_type, chat_id)
    return "I do not know that command. Send /help to see what I can do."


# ---------- links ----------

def _opens(text, label, url):
    """A message with a button under it that opens url. Telegram only takes a
    button to an https address on the internet, so while the dashboard runs
    on one computer, at http://localhost, the address goes in the text
    instead."""
    host = urlsplit(url).hostname or ""
    if not url.startswith("https://") or host == "localhost" or _is_ip(host):
        return Message(text=f"{text}\n\n{url}")
    return Message(text=text, button=Button(text=label, url=url))


def _is_ip(host):
    try:
        ipaddress.ip_address(host)
    except ValueError:
        return False
    return True


def _dashboard(path):
    base = (settings.get("dashboard_url") or "http://localhost:8000").rstrip("/")
    return f"{base}/#/{path}"


def _login_link(person):
    minutes = settings.get_int("login_link_minutes", 15)
    token = auth.new_token()
    links.create_login_link(auth.token_hash(token), person["id"], minutes)
    return _opens(f"Here is your link to the dashboard. It works once, in the next {minutes} minutes, "
                  "and a new /login cancels it.", "Open the dashboard", _dashboard(f"link/{token}"))


def _new_password_link(person, member, hours):
    """The address of a new link for member to choose a password."""
    token = auth.new_token()
    links.create_password_link(auth.token_hash(token), member["id"], person["id"], hours)
    return _dashboard(f"password/{token}")


# ---------- accounts ----------

def _add_user(person, args):
    words = args.split()
    role, role_given = "editor", False
    if words and words[0].lower() in ("admin", "editor"):
        role, role_given, words = words[0].lower(), True, words[1:]
    if not words or not auth.EMAIL.match(words[0]):
        return f"Give an email address and a name, for example:\n{EXAMPLE}"
    email = words[0].lower()
    name = " ".join(words[1:])[:80].strip()
    found = users.by_email(email, include_removed=True)
    active = bool(found and not found["removed_at"])
    # Someone already using the bot or the dashboard keeps their name and role.
    if active and (found["password_hash"] or found["telegram_user_id"]):
        return (f"{email} already has an account. If they forgot their password, "
                f"/password {email} gives them a link to choose a new one.")
    # Someone who never chose their password gets a new link, and keeps their
    # name and role unless the admin gives new ones.
    if active:
        name = name or found["display_name"] or ""
        role = role if role_given else found["role"]
    if not name:
        return f"And their name? For example:\n/adduser {email} Kaisa Virtanen"
    member = users.create_account(email, name, role)
    who = "an admin" if role == "admin" else "an editor"
    opening = (f"{member['display_name']} ({email}) has not chosen a password yet, so here is a new link."
               if active else f"{member['display_name']} ({email}) has an account now, as {who}.")
    return _password_link(person, member, opening)


def _own_password(person):
    """A link to choose your own password, and your email if you have none
    yet, as someone who has only ever used Telegram."""
    hours = settings.get_int("password_link_hours", 72)
    if not person["email"]:
        text = ("Here is your link to choose an email address and a password. With them you can log in to "
                f"the dashboard on any computer, without Telegram. It works once, in the next {hours} hours.")
    elif not person["has_password"]:
        text = (f"Here is your link to choose a password. With it you log in to the dashboard with "
                f"{person['email']}, on any computer. It works once, in the next {hours} hours.")
    else:
        text = (f"Here is your link to choose a new password for {person['email']}. It works once, in the "
                f"next {hours} hours, and saving the new password logs you out everywhere else.")
    return _opens(text, "Choose a password", _new_password_link(person, person, hours))


def _new_password(person, args):
    email = args.strip().lower()
    if not auth.EMAIL.match(email):
        return ("Whose? For example: /password kaisa@example.fi. /people shows everyone's email. "
                "/password on its own is for your own.")
    found = users.by_email(email)
    if not found:
        return f"Nobody has the email {email}. To make an account: /adduser {email} Name"
    if found["id"] == person["id"]:
        return _own_password(person)
    return _password_link(person, found, f"Here is a new link for {found['display_name'] or email} ({email}).")


def _password_link(person, member, opening):
    """For an admin to pass on to someone else, by email or chat: the address
    in the text, and no button, so the admin does not open it by mistake."""
    hours = settings.get_int("password_link_hours", 72)
    url = _new_password_link(person, member, hours)
    return (f"{opening} Send them this link. It works once, in the next {hours} hours, "
            f"and lets them choose their own password:\n\n"
            f"{url}\n\n"
            f"After that they log in to the dashboard with {member['email']} and that password. "
            f"A new link with /password {member['email']} cancels this one.")


def _people():
    lines = []
    for p in users.active_people():
        ways = [way for way, has in (("Telegram", p["on_telegram"]), ("password", p["has_password"])) if has]
        how = " and ".join(ways) if ways else "has not chosen a password yet"
        lines.append(f"• {p['name']}, {p['role']}: {how}" + (f", {p['email']}" if p["email"] else ""))
    return ("These people can use me and the dashboard, and this is how each of them logs in:\n\n"
            + "\n".join(lines) + "\n\nTo add someone: /adduser email Name. To take someone off: /remove Name")


def _remove(person, args):
    if not args:
        return "Who? For example: /remove Kaisa. /people shows the names."
    found = users.find_active(args)
    if not found:
        return f"I do not know anyone called {args}. /people shows the names."
    if len(found) > 1:
        options = "\n".join(f"• {p['name']}: /remove {p['telegram_user_id'] or p['email']}"
                            for p in found if p["telegram_user_id"] or p["email"])
        return f"More than one person is called {args}. Send one of these instead:\n\n{options}"
    target = found[0]
    if target["id"] == person["id"]:
        return "You cannot remove yourself. Ask another admin to do it."
    if target["role"] == "admin" and users.count_admins() <= 1:
        return "That is the last admin. Make someone else an admin first, with /adduser admin."
    users.remove(target["id"])
    return (f"{target['name']} can no longer use me or the dashboard. "
            "The articles they sent keep their name.")


def _alerts(args, chat_type, chat_id):
    """Where n8n/workflows/alerts.json reports a source that stops working or
    a workflow that fails: alert_chat_id in app_settings."""
    word = args.strip().lower()
    if chat_type in ("group", "supergroup") and word in ("", "here") and chat_id:
        settings.put("alert_chat_id", str(chat_id))
        return ("From now on I report problems in this group: a source that stops working, "
                "or a step that fails. /alerts private sends them to the admins again.")
    if word == "private":
        settings.put("alert_chat_id", "")
        return "From now on I report problems to each admin privately."
    if word == "off":
        settings.put("alert_chat_id", "off")
        return ("I will not report problems to anyone now. The dashboard still shows the sources "
                "that fail. /alerts private turns the reports back on.")
    now = settings.get("alert_chat_id") or ""
    if now and now != "off":
        where = "this group" if str(chat_id) == now else "the team's group"
        return (f"I report problems to {where}. /alerts private sends them to each admin "
                "privately instead, and /alerts off stops them.")
    where = "nobody: the reports are off" if now == "off" else "each admin privately"
    return (f"I report problems to {where}.\n\n"
            "To have them in the team's group, add me to the group and choose /alerts from the / menu there. "
            "/alerts private sends them to each admin privately, and /alerts off stops them.")
