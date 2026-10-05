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

Every answer is in Finnish for someone whose Telegram is in Finnish, and in
English for everyone else: n8n passes on the language Telegram gives.
"""

import ipaddress
from urllib.parse import urlsplit

from ..queries import settings, users
from ..queries import telegram as links
from ..schemas.telegram import AccountReply, Button, Message
from . import auth

EXAMPLE = "/adduser kaisa@example.fi Kaisa Virtanen"

# Commands that hand out a link, so never in a group.
LINKS = ("login", "adduser", "password")


def _say(lang, en, fi):
    """The answer in the person's language."""
    return fi if lang == "fi" else en


def handle(telegram_user_id, name, command, args, chat_type, chat_id=None, language=None):
    """What the bot answers, as an AccountReply. language is Telegram's code
    for the person's language: Finnish for fi, English for anything else."""
    lang = "fi" if (language or "").strip().lower().startswith("fi") else "en"
    answer = _answer(telegram_user_id, (command or "").lower(), (args or "").strip(), chat_type, chat_id, lang)
    message = answer if isinstance(answer, Message) else Message(text=answer)
    reply = message.text if not message.button else f"{message.text}\n\n{message.button.url}"
    return AccountReply(reply=reply, messages=[message])


def _answer(telegram_user_id, command, args, chat_type, chat_id, lang):
    person = users.by_telegram_id(telegram_user_id)
    if not person:
        return _say(lang, "I only work for the newsletter team, and only answer people on its list.",
                    "Palvelen vain uutiskirjetiimiä ja vastaan vain sen listalla oleville.")
    if command in LINKS and chat_type not in (None, "", "private"):
        return _say(lang, "Send that to me in a private chat, not in a group. "
                          "Everyone in the group would see the link.",
                    "Lähetä tämä minulle yksityisviestinä, älä ryhmässä. "
                    "Kaikki ryhmän jäsenet näkisivät linkin.")
    if command == "login":
        return _login_link(person, lang)
    if command == "password" and not args:
        return _own_password(person, lang)
    if person["role"] != "admin":
        if command == "password":
            return _say(lang, "Only an admin can do that for someone else. "
                              "/password on its own gives you a link for your own.",
                        "Vain ylläpitäjä voi tehdä sen toisen puolesta. "
                        "Pelkkä /password antaa linkin omaan salasanaasi.")
        return _say(lang, "Only an admin can do that.", "Vain ylläpitäjä voi tehdä tämän.")
    if command == "adduser":
        return _add_user(person, args, lang)
    if command == "password":
        return _new_password(person, args, lang)
    if command == "people":
        return _people(lang)
    if command == "remove":
        return _remove(person, args, lang)
    if command == "alerts":
        return _alerts(args, chat_type, chat_id, lang)
    return _say(lang, "I do not know that command. Send /help to see what I can do.",
                "En tunne tätä komentoa. Lähetä /help, niin näet, mitä osaan.")


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


def _login_link(person, lang):
    minutes = settings.get_int("login_link_minutes", 15)
    token = auth.new_token()
    links.create_login_link(auth.token_hash(token), person["id"], minutes)
    return _opens(_say(lang, f"Here is your link to the dashboard. It works once, in the next {minutes} minutes, "
                             "and a new /login cancels it.",
                       f"Tässä on kirjautumislinkkisi dashboardiin. Se toimii kerran seuraavan {minutes} minuutin "
                       "aikana, ja uusi /login mitätöi sen."),
                  _say(lang, "Open the dashboard", "Avaa dashboard"), _dashboard(f"link/{token}"))


def _new_password_link(person, member, hours):
    """The address of a new link for member to choose a password."""
    token = auth.new_token()
    links.create_password_link(auth.token_hash(token), member["id"], person["id"], hours)
    return _dashboard(f"password/{token}")


# ---------- accounts ----------

def _add_user(person, args, lang):
    words = args.split()
    role, role_given = "editor", False
    if words and words[0].lower() in ("admin", "editor"):
        role, role_given, words = words[0].lower(), True, words[1:]
    if not words or not auth.EMAIL.match(words[0]):
        return _say(lang, f"Give an email address and a name, for example:\n{EXAMPLE}",
                    f"Anna sähköpostiosoite ja nimi, esimerkiksi:\n{EXAMPLE}")
    email = words[0].lower()
    name = " ".join(words[1:])[:80].strip()
    found = users.by_email(email, include_removed=True)
    active = bool(found and not found["removed_at"])
    # Someone already using the bot or the dashboard keeps their name and role.
    if active and (found["password_hash"] or found["telegram_user_id"]):
        return _say(lang, f"{email} already has an account. If they forgot their password, "
                          f"/password {email} gives them a link to choose a new one.",
                    f"Osoitteella {email} on jo tili. Jos salasana on unohtunut, "
                    f"/password {email} antaa linkin uuden salasanan valitsemiseen.")
    # Someone who never chose their password gets a new link, and keeps their
    # name and role unless the admin gives new ones.
    if active:
        name = name or found["display_name"] or ""
        role = role if role_given else found["role"]
    if not name:
        return _say(lang, f"And their name? For example:\n/adduser {email} Kaisa Virtanen",
                    f"Entä nimi? Esimerkiksi:\n/adduser {email} Kaisa Virtanen")
    member = users.create_account(email, name, role)
    if active:
        opening = _say(lang, f"{member['display_name']} ({email}) has not chosen a password yet, so here is a new link.",
                       f"{member['display_name']} ({email}) ei ole vielä valinnut salasanaa, joten tässä on uusi linkki.")
    else:
        opening = _say(lang, f"{member['display_name']} ({email}) has an account now, as "
                             f"{'an admin' if role == 'admin' else 'an editor'}.",
                       f"{member['display_name']} ({email}) on nyt lisätty "
                       f"{'ylläpitäjäksi' if role == 'admin' else 'toimittajaksi'}.")
    return _password_link(person, member, opening, lang)


def _own_password(person, lang):
    """A link to choose your own password, and your email if you have none
    yet, as someone who has only ever used Telegram."""
    hours = settings.get_int("password_link_hours", 72)
    if not person["email"]:
        text = _say(lang, "Here is your link to choose an email address and a password. With them you can log in to "
                          f"the dashboard on any computer, without Telegram. It works once, in the next {hours} hours.",
                    "Tässä on linkki, jolla valitset sähköpostiosoitteen ja salasanan. Niillä kirjaudut dashboardiin "
                    f"millä tahansa koneella ilman Telegramia. Linkki toimii kerran seuraavan {hours} tunnin aikana.")
    elif not person["has_password"]:
        text = _say(lang, f"Here is your link to choose a password. With it you log in to the dashboard with "
                          f"{person['email']}, on any computer. It works once, in the next {hours} hours.",
                    f"Tässä on linkki, jolla valitset salasanan. Sillä kirjaudut dashboardiin osoitteella "
                    f"{person['email']} millä tahansa koneella. Linkki toimii kerran seuraavan {hours} tunnin aikana.")
    else:
        text = _say(lang, f"Here is your link to choose a new password for {person['email']}. It works once, in the "
                          f"next {hours} hours, and saving the new password logs you out everywhere else.",
                    f"Tässä on linkki, jolla valitset uuden salasanan tilillesi {person['email']}. Se toimii kerran "
                    f"seuraavan {hours} tunnin aikana. Kun tallennat uuden salasanan, muut kirjautumisesi päättyvät.")
    return _opens(text, _say(lang, "Choose a password", "Valitse salasana"), _new_password_link(person, person, hours))


def _new_password(person, args, lang):
    email = args.strip().lower()
    if not auth.EMAIL.match(email):
        return _say(lang, "Whose? For example: /password kaisa@example.fi. /people shows everyone's email. "
                          "/password on its own is for your own.",
                    "Kenen? Esimerkiksi: /password kaisa@example.fi. /people näyttää kaikkien sähköpostiosoitteet. "
                    "Pelkkä /password on omaa salasanaasi varten.")
    found = users.by_email(email)
    if not found:
        return _say(lang, f"Nobody has the email {email}. To make an account: /adduser {email} Name",
                    f"Kenelläkään ei ole sähköpostiosoitetta {email}. Tilin saa näin: /adduser {email} Nimi")
    if found["id"] == person["id"]:
        return _own_password(person, lang)
    who = found["display_name"] or email
    return _password_link(person, found, _say(lang, f"Here is a new link for {who} ({email}).",
                                              f"Tässä on uusi linkki henkilölle {who} ({email})."), lang)


def _password_link(person, member, opening, lang):
    """For an admin to pass on to someone else, by email or chat: the address
    in the text, and no button, so the admin does not open it by mistake."""
    hours = settings.get_int("password_link_hours", 72)
    url = _new_password_link(person, member, hours)
    return _say(lang,
                f"{opening} Send them this link. It works once, in the next {hours} hours, "
                f"and lets them choose their own password:\n\n"
                f"{url}\n\n"
                f"After that they log in to the dashboard with {member['email']} and that password. "
                f"A new link with /password {member['email']} cancels this one.",
                f"{opening} Lähetä hänelle tämä linkki. Se toimii kerran seuraavan {hours} tunnin aikana, "
                f"ja sillä hän valitsee itse salasanansa:\n\n"
                f"{url}\n\n"
                f"Sen jälkeen hän kirjautuu dashboardiin osoitteella {member['email']} ja tällä salasanalla. "
                f"Uusi linkki komennolla /password {member['email']} mitätöi tämän.")


def _people(lang):
    lines = []
    for p in users.active_people():
        ways = [way for way, has in (("Telegram", p["on_telegram"]),
                                     (_say(lang, "password", "salasana"), p["has_password"])) if has]
        how = (_say(lang, " and ", " ja ").join(ways) if ways
               else _say(lang, "has not chosen a password yet", "ei ole vielä valinnut salasanaa"))
        role = p["role"] if lang != "fi" else ("ylläpitäjä" if p["role"] == "admin" else "toimittaja")
        lines.append(f"• {p['name']}, {role}: {how}" + (f", {p['email']}" if p["email"] else ""))
    return _say(lang,
                "These people can use me and the dashboard, and this is how each of them logs in:\n\n"
                + "\n".join(lines) + "\n\nTo add someone: /adduser email Name. To take someone off: /remove Name",
                "Nämä henkilöt voivat käyttää minua ja dashboardia, ja näin kukin heistä kirjautuu:\n\n"
                + "\n".join(lines) + "\n\nLisää henkilö: /adduser sähköposti Nimi. Poista henkilö: /remove Nimi")


def _remove(person, args, lang):
    if not args:
        return _say(lang, "Who? For example: /remove Kaisa. /people shows the names.",
                    "Kenet? Esimerkiksi: /remove Kaisa. /people näyttää nimet.")
    found = users.find_active(args)
    if not found:
        return _say(lang, f"I do not know anyone called {args}. /people shows the names.",
                    f"En tunne ketään nimeltä {args}. /people näyttää nimet.")
    if len(found) > 1:
        options = "\n".join(f"• {p['name']}: /remove {p['telegram_user_id'] or p['email']}"
                            for p in found if p["telegram_user_id"] or p["email"])
        return _say(lang, f"More than one person is called {args}. Send one of these instead:\n\n{options}",
                    f"Nimellä {args} löytyy useampi henkilö. Lähetä sen sijaan jokin näistä:\n\n{options}")
    target = found[0]
    if target["id"] == person["id"]:
        return _say(lang, "You cannot remove yourself. Ask another admin to do it.",
                    "Et voi poistaa itseäsi. Pyydä toista ylläpitäjää tekemään se.")
    if target["role"] == "admin" and users.count_admins() <= 1:
        return _say(lang, "That is the last admin. Make someone else an admin first, with /adduser admin.",
                    "Hän on viimeinen ylläpitäjä. Tee ensin joku toinen ylläpitäjäksi komennolla /adduser admin.")
    users.remove(target["id"])
    return _say(lang, f"{target['name']} can no longer use me or the dashboard. "
                      "The articles they sent keep their name.",
                f"{target['name']} ei voi enää käyttää minua eikä dashboardia. "
                "Hänen lähettämänsä artikkelit säilyttävät hänen nimensä.")


def _alerts(args, chat_type, chat_id, lang):
    """Where n8n/workflows/alerts.json reports a source that stops working or
    a workflow that fails: alert_chat_id in app_settings. The reports
    themselves are in English, for the whole team."""
    word = args.strip().lower()
    if chat_type in ("group", "supergroup") and word in ("", "here") and chat_id:
        settings.put("alert_chat_id", str(chat_id))
        return _say(lang, "From now on I report problems in this group: a source that stops working, "
                          "or a step that fails. /alerts private sends them to the admins again.",
                    "Tästä lähtien ilmoitan ongelmista tässä ryhmässä: lähteestä, joka lakkaa toimimasta, "
                    "tai vaiheesta, joka epäonnistuu. /alerts private lähettää ne taas ylläpitäjille.")
    if word == "private":
        settings.put("alert_chat_id", "")
        return _say(lang, "From now on I report problems to each admin privately.",
                    "Tästä lähtien ilmoitan ongelmista jokaiselle ylläpitäjälle yksityisesti.")
    if word == "off":
        settings.put("alert_chat_id", "off")
        return _say(lang, "I will not report problems to anyone now. The dashboard still shows the sources "
                          "that fail. /alerts private turns the reports back on.",
                    "En ilmoita nyt ongelmista kenellekään. Dashboard näyttää silti lähteet, jotka eivät toimi. "
                    "/alerts private ottaa ilmoitukset taas käyttöön.")
    now = settings.get("alert_chat_id") or ""
    if now and now != "off":
        here = str(chat_id) == now
        where = _say(lang, "this group" if here else "the team's group", "tähän ryhmään" if here else "tiimin ryhmään")
        return _say(lang, f"I report problems to {where}. /alerts private sends them to each admin "
                          "privately instead, and /alerts off stops them.",
                    f"Ilmoitan ongelmista {where}. /alerts private lähettää ne sen sijaan jokaiselle "
                    "ylläpitäjälle yksityisesti, ja /alerts off lopettaa ne.")
    where = _say(lang, "I report problems to nobody: the reports are off." if now == "off"
                       else "I report problems to each admin privately.",
                 "Ilmoitukset ovat pois päältä, joten en ilmoita ongelmista kenellekään." if now == "off"
                 else "Ilmoitan ongelmista jokaiselle ylläpitäjälle yksityisesti.")
    return where + _say(lang,
                        "\n\nTo have them in the team's group, add me to the group and choose /alerts from the / menu "
                        "there. /alerts private sends them to each admin privately, and /alerts off stops them.",
                        "\n\nJos haluat ne tiimin ryhmään, lisää minut ryhmään ja valitse siellä /alerts /-valikosta. "
                        "/alerts private lähettää ne jokaiselle ylläpitäjälle yksityisesti, ja /alerts off lopettaa ne.")
