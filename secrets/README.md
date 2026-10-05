# secrets

Keys kept as files on the server. Nothing here but this README goes into git
(`.gitignore`), and the dashboard reads the folder read-only
(`docker-compose.yml`).

## google-drive.json

The Google service account key the dashboard reads the association's Drive
folder with. How to make it, and how the association shares the one folder
with it, is in `docs/drive.md`.

```bash
cp ~/Downloads/<the key Google gave you>.json secrets/google-drive.json
chmod 600 secrets/google-drive.json
docker compose restart dashboard
```

Then Asetukset → Google Drive shows the tool's Google address, and the
folder can be chosen there.

To take the access back, delete the key in Google Cloud (IAM → Service
accounts → the account → Keys) or stop sharing the folder with the account.
Either works at once. Deleting this file switches Drive off in the dashboard
at its next request.
