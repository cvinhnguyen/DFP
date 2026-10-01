"""Dashboard accounts from the command line. Editors normally join through an
invite from the Telegram bot (/invite) and log in with /login. This is for
the first admin, for the team, and for anyone who wants a password.
Jira: DM42-33

  docker compose exec dashboard python -m app.cli.users list
  docker compose exec dashboard python -m app.cli.users add kaisa@example.fi --name Kaisa
  docker compose exec dashboard python -m app.cli.users add you@example.fi --name You --role admin
  docker compose exec dashboard python -m app.cli.users password kaisa@example.fi
  docker compose exec dashboard python -m app.cli.users telegram you@example.fi 123456789
  docker compose exec dashboard python -m app.cli.users remove kaisa@example.fi --yes

The password is asked for twice and never shown. A script can pipe it in with
--password-stdin instead. A new password logs that person out everywhere, and
gives a removed account its access back.

Someone already allowed to use the Telegram bot has a row in users without a
password. Give them one with "password" rather than adding them again.

Removing someone ends their access, and the articles they sent keep their
name.

"telegram" puts an account on the bot's list, which is how the first admin
gets there: message the bot once, and it answers with your Telegram ID.
After that, admins bring in everyone else with /invite.
"""

import argparse
import getpass
import sys

from .. import database
from ..queries import users
from ..services.auth import hash_password

MIN_LENGTH = 10
ROLES = ("editor", "admin")
COMMAND = "python -m app.cli.users"


def read_password(from_stdin):
    if from_stdin:
        password = sys.stdin.readline().rstrip("\r\n")
    else:
        password = getpass.getpass("Password: ")
        if getpass.getpass("Same again: ") != password:
            sys.exit("The two passwords are different. Nothing was changed.")
    if len(password) < MIN_LENGTH:
        sys.exit(f"Use at least {MIN_LENGTH} characters. Nothing was changed.")
    return password


def list_accounts(args):
    people = users.everyone()
    if not people:
        print("No accounts yet.")
        return
    width = max(5, *(len(p["email"] or "-") for p in people))
    print(f"{'email':<{width}}  {'name':<18} {'role':<7} {'password':<9} {'bot':<4} last login")
    for p in people:
        last = "removed" if p["removed"] else (p["last_login"] or "never")
        print(f"{p['email'] or '-':<{width}}  {p['name'][:18]:<18} {p['role']:<7} "
              f"{'yes' if p['can_log_in'] else 'no':<9} {'yes' if p['on_telegram'] else 'no':<4} {last}")


def add(args):
    if users.by_email(args.email, include_removed=True):
        sys.exit(f"{args.email} already has an account. To give it a password, run: "
                 f"{COMMAND} password {args.email}")
    password = read_password(args.password_stdin)
    users.add(args.email, args.name, args.role, hash_password(password))
    print(f"Added {args.email} as {args.role}. They can log in now.")


def set_password(args):
    person = users.by_email(args.email, include_removed=True)
    if not person:
        sys.exit(f"There is no account for {args.email}.")
    password = read_password(args.password_stdin)
    users.set_password_hash(person["id"], hash_password(password))
    users.end_all_sessions(person["id"])
    back = " Their access is back." if person["removed_at"] else ""
    print(f"New password set for {person['email']}. Any open login of theirs has ended.{back}")


def link_telegram(args):
    person = users.by_email(args.email)
    if not person:
        sys.exit(f"There is no account for {args.email}.")
    if not args.telegram_id.isdigit():
        sys.exit("A Telegram ID is a number. Message the bot once and it tells you yours.")
    other = users.by_telegram_id(args.telegram_id, include_removed=True)
    if other and other["id"] != person["id"]:
        sys.exit(f"That Telegram ID already belongs to {other['display_name'] or other['email']}.")
    users.set_telegram(person["id"], args.telegram_id)
    print(f"{person['email']} can now use the Telegram bot, and log in with /login.")


def remove(args):
    person = users.by_email(args.email)
    if not person:
        sys.exit(f"There is no account for {args.email}.")
    if person["role"] == "admin" and users.count_admins() <= 1:
        sys.exit(f"{person['email']} is the last admin. Make someone else an admin first.")
    if not args.yes:
        sys.exit(f"This ends {person['email']}'s access to the dashboard and the Telegram bot. "
                 "The articles they sent keep their name. Run again with --yes to do it.")
    users.remove(person["id"])
    print(f"Removed {person['email']}.")


def main():
    parser = argparse.ArgumentParser(prog=COMMAND, description="Dashboard accounts.")
    commands = parser.add_subparsers(dest="command", required=True)

    commands.add_parser("list", help="show every account").set_defaults(run=list_accounts)

    p = commands.add_parser("add", help="make a new account")
    p.add_argument("email")
    p.add_argument("--name", required=True, help="the name shown in the dashboard")
    p.add_argument("--role", choices=ROLES, default="editor")
    p.add_argument("--password-stdin", action="store_true", help="read the password from standard input")
    p.set_defaults(run=add)

    p = commands.add_parser("password", help="set a new password")
    p.add_argument("email")
    p.add_argument("--password-stdin", action="store_true", help="read the password from standard input")
    p.set_defaults(run=set_password)

    p = commands.add_parser("telegram", help="put an account on the Telegram bot's list")
    p.add_argument("email")
    p.add_argument("telegram_id", help="the number the bot tells you when you message it")
    p.set_defaults(run=link_telegram)

    p = commands.add_parser("remove", help="remove an account")
    p.add_argument("email")
    p.add_argument("--yes", action="store_true", help="really remove it")
    p.set_defaults(run=remove)

    args = parser.parse_args()
    database.pool.open(wait=True, timeout=10)
    try:
        args.run(args)
    finally:
        database.pool.close()


if __name__ == "__main__":
    main()
