"""SQL for the Mailchimp settings and for the pictures already copied into
Mailchimp."""

from .. import database


def set_setting(key, value):
    database.run("UPDATE app_settings SET value = %s WHERE key = %s", (value, key))


def file_url(account_id, sha256):
    found = database.row("SELECT url FROM mailchimp_files WHERE account_id = %s AND sha256 = %s", (account_id, sha256))
    return found["url"] if found else None


def remember_file(account_id, sha256, url, file_id, name):
    database.run(
        """INSERT INTO mailchimp_files (account_id, sha256, url, file_id, name)
           VALUES (%s, %s, %s, %s, %s)
           ON CONFLICT (account_id, sha256) DO UPDATE SET url = EXCLUDED.url, file_id = EXCLUDED.file_id""",
        (account_id, sha256, url, file_id, name))
