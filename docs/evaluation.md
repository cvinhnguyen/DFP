# Checking the system against the association's own newsletters

Jira: DM42-47

The association keeps a public archive of every newsletter it has sent, in
Mailchimp. Each link in a newsletter is something Kaisa and Niina chose by
hand, which makes the archive an answer key: would the system have found
what they found?

## What is compared

Each newsletter is imported as an archive issue, and each link it chose as an
entry with the heading it stood under. Mailchimp's own links, the
association's social media and its membership page are left out, because
every newsletter has them. The archive is kept apart from the articles the
sources bring in (`archive_issues`, `archive_entries`, see
`db/init/26-archive.sql`), and nothing in it is collected, summarised or
picked.

For each entry the comparison says:

- whether a source the system follows is on the same site;
- whether the system collected the article, and whether it did so by the day
  the newsletter went out.

And the other way round: what the system summarised in the 30 days before the
newsletter went out that the newsletter did not use.

## Running it

```bash
docker compose exec dashboard python -m app.cli.archive import "<archive address>"
docker compose exec dashboard python -m app.cli.archive list
```

The archive address is the "past newsletters" link in any of the
association's newsletters, https://us11.campaign-archive.com/home/?u=...&id=...
Importing again replaces what was there, so it can be run after every
newsletter.
`GET /api/archive` lists the newsletters with their numbers, and
`GET /api/archive/{id}` gives one newsletter entry by entry, with the
articles the system surfaced that it did not use.

## First comparison, 2 October 2026

20 newsletters, from September 2024 to 25 September 2026, with 169 links.

**The newsletter of 25 September 2026** had 10 links.

- Found: none of them. This newsletter cannot really test what the system
  finds: the association's own news pages had been read for eight days, and
  the news feeds started the day after it went out.
- Missed: 9 of the 10 are on sites the system does not read. They are event
  organisers' pages (the remote teaching day, the ITK conference and its
  webinars, Mindtrek, Digikilta's anniversary, Digioppimisen areena) and
  Learning Factory's courses. The tenth is the association's own project
  page.
- Surfaced and not used: 23 summarised articles from the 30 days before,
  all from the association's own news pages and from links the team sent the
  bot while testing it.

**Across all 20 newsletters**, a third of the links (56 of 169) are on a site
the system reads, nearly all of them the association's own site, which is the
most linked of all (50 links in 12 newsletters). Being on that site is not
the same as being collected: the system reads its news, while many of those
links go to project and event pages. The sites linked most that the system
does not read:

| Site | Links | Newsletters |
|---|---|---|
| learningfactory.fi, and its learningfactory.hub.howspace.com | 31 | 11 |
| itk-konferenssi.fi | 11 | 8 |
| kansanvalistusseura.fi | 11 | 9 |
| mindtrek.org | 5 | 2 |
| digikilta.fi | 4 | 4 |
| tekoalyoppimisentukena.wordpress.com | 4 | 4 |
| educa.messukeskus.com | 4 | 2 |

## What it means

The newsletter is mostly events and the association's own and its partners'
news, and much less the general education news the sources bring in. To find
what the editors pick, the system would need the event organisers as
sources: ITK, Kansanvalistusseura's remote teaching day, Mindtrek, Digikilta,
OPH's events, and Learning Factory. Several of them have no feed and would be
read the way the association's own pages are. Which of them to follow is for
the client to say.

The October newsletter is the first fair test: by the time it goes out every
source will have been read for a month. Import the archive again after it is
sent and compare.
