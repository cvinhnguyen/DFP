# Ingest API

One endpoint for submitting collected items. Jira: DM42-27.

Every collection workflow posts here instead of writing to Postgres itself.
That way a workflow with a bug cannot put bad rows in the database, and the
schema can change without silently breaking four people's workflows.

It runs as an n8n workflow (`workflows/ingest-api.json`) rather than a separate
service. The criteria ask for one endpoint, not one more container for the
association to keep running.

## Calling it

```
POST http://localhost:5678/webhook/ingest
Content-Type: application/json
X-Ingest-Token: <the shared token>
```

The token is a Header Auth credential in n8n called "DFP ingest token". Without
it the endpoint answers 403. Create it once per n8n instance; it is not in the
repository.

## What to send

```json
{
  "items": [
    {
      "source_id": 1,
      "url": "https://eoppimiskeskus.fi/jokin-artikkeli/",
      "title": "Otsikko",
      "publisher": "Suomen eOppimiskeskus ry",
      "published_at": "2026-09-10",
      "excerpt": "Julkaisijan oma lyhyt kuvaus.",
      "raw_text": "Koko artikkelin teksti.",
      "source_language": "fi",
      "section": "events"
    }
  ]
}
```

`source_id`, `url` and `title` are required. Everything else may be left out.
`source_language` falls back to whatever language the source publishes in, and
`fetched_at` is set for you. At most 200 items per request.

## What comes back

```json
{
  "received": 6,
  "accepted": 2,
  "rejected": 4,
  "results": [
    { "url": "https://example.invalid/a", "accepted": true,  "item_id": "76" },
    { "url": "https://example.invalid/b", "accepted": true,  "item_id": "77" },
    { "url": "",                          "accepted": false, "reason": "url is required" },
    { "url": "https://example.invalid/c", "accepted": false, "reason": "title is required" },
    { "url": "https://example.invalid/d", "accepted": false, "reason": "unknown or inactive source_id" },
    { "url": "https://example.invalid/a", "accepted": false, "reason": "duplicate of an earlier item in this batch" }
  ]
}
```

There is one result per item you sent, in the order you sent them, so answers
can be matched to the request without guessing. A bad item is rejected on its
own and the rest of the batch is stored.

Rejection reasons are one of:

- `url is required`
- `title is required`
- `unknown or inactive source_id`
- `duplicate of an earlier item in this batch`

A malformed body answers 400 with `{"error": "..."}` and stores nothing.

## Things worth knowing

Sending the same URL again updates the existing item rather than creating a
second one, matched on `canonical_url`. Title, publisher, excerpt, text and
publication date are refreshed and `fetched_at` is moved on. The item keeps its
id, so summaries and signals stay attached.

The same URL twice inside one batch is rejected the second time rather than
silently collapsed, so the response still has a line for it.

The whole batch is one SQL statement. Either the accepted items are all stored
or none are, and a failure cannot leave half a batch behind.
