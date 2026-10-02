"""The association's past newsletters, imported from their public archive in
Mailchimp as reference data for evaluation (db/init/26-archive.sql).
Jira: DM42-47

  docker compose exec dashboard python -m app.cli.archive import "<archive home address>"
  docker compose exec dashboard python -m app.cli.archive import "<one newsletter's address>"
  docker compose exec dashboard python -m app.cli.archive list

The archive's address is the "view past newsletters" link of any newsletter,
https://us11.campaign-archive.com/home/?u=...&id=... Importing again replaces
what was imported before. GET /api/archive compares the newsletters with
what the system has.
"""

import argparse
import sys
import urllib.error

from .. import database
from ..queries import archive as queries
from ..services import archive

COMMAND = "python -m app.cli.archive"


def run_import(args):
    try:
        n = archive.import_archive(args.url)
    except (urllib.error.URLError, OSError) as e:
        sys.exit(f"Could not read {args.url}: {e}")
    print(f"Imported {n} newsletter{'s' if n != 1 else ''}.")


def list_issues(args):
    found = queries.issues()
    if not found:
        print(f"Nothing imported yet. Run: {COMMAND} import <archive address>")
        return
    print(f"{'sent':<10}  {'links':>5} {'site we follow':>15} {'collected':>9} {'in time':>7}  subject")
    for i in found:
        print(f"{str(i['sent_on'] or '?'):<10}  {i['entries']:>5} {i['followed']:>15} {i['collected']:>9} "
              f"{i['in_time']:>7}  {i['subject'][:60]}")


def main():
    parser = argparse.ArgumentParser(prog=COMMAND, description="The association's past newsletters.")
    commands = parser.add_subparsers(dest="command", required=True)
    p = commands.add_parser("import", help="import the newsletters of an archive, or one newsletter")
    p.add_argument("url")
    p.set_defaults(run=run_import)
    commands.add_parser("list", help="show what was imported, compared with the system").set_defaults(run=list_issues)
    args = parser.parse_args()
    database.pool.open(wait=True, timeout=10)
    try:
        args.run(args)
    finally:
        database.pool.close()


if __name__ == "__main__":
    main()
