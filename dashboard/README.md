# The dashboard

The editors' web app, in Finnish with an English switch for the team.

- **Artikkelit**: everything the tool collected, read by topic. A column of
  topics and lists on the left, the list in the middle, the article on the
  right with its Finnish summary, its subject tags and the buttons that
  decide. The panel names the newsletter the article goes into, and each of
  its four sections says what belongs there; pressing one adds the article.
  "Säästä myöhemmäksi" keeps it for later and "Ei käytetä" leaves it out.
  The next article opens by itself, and keys do the same as the buttons.
  Both editors see who decided what. Skipped and failed articles say why,
  and can be summarised anyway.
- **Uutiskirjeet**: every newsletter, drafts first, like Mailchimp's list of
  campaigns. Each one opens to a checklist: articles, subject line and
  preview text, content, Mailchimp, with a preview beside it.
- **The editor**: an editor for the email itself, laid out like Mailchimp's
  so the editors find their way in both. Blocks, sections, styles, a check
  of everything that needs a look, a phone view, a preview, comments, and
  undo. It starts from a template with the picked articles in place.
- **Asetukset**, for admins: the Mailchimp connection, and what the AI costs
  against its monthly budget.

Jira: DM42-80, with DM42-31 for the article API, DM42-32 for decisions,
DM42-33 for logging in, DM42-37 for the newsletter and DM42-39 for the AI
costs.

It is one service: a small Python API (FastAPI) that also serves the pages.
The pages are plain HTML, CSS and JavaScript with no build step.

## Running it

It starts with everything else (`docker compose up -d`) at
http://localhost:8000. Every endpoint is documented at
http://localhost:8000/api/docs.

## Logging in

An admin adds people from the Telegram bot, and each person chooses their
own password. Nobody signs up.

| Command | Who | What it does |
|---|---|---|
| `/adduser email Name` | admins | an account that logs in with that email, and a link for the person to choose their password, once, for 72 hours |
| `/adduser admin email Name` | admins | the same, for a new admin |
| `/password` | everyone on the list | a link to choose your own password, once, for 72 hours. Someone who has only used Telegram chooses their email there too. Saving it ends your other logins |
| `/password email` | admins | a new link to choose a password, for someone else's forgotten one |
| `/login` | everyone on the list | a link to the dashboard that works once, for 15 minutes |
| `/people` | admins | who can use the bot and the dashboard, and how each of them logs in |
| `/remove Name` | admins | ends someone's access; the articles they sent keep their name. An email or a Telegram ID works too |
| `/alerts` | admins | where the bot reports problems: sent in the team's group, there. `/alerts private` sends them to each admin, `/alerts off` to nobody |

The links open a page in the dashboard where the person types the password,
at least 10 characters. No password goes through Telegram or n8n.

The bot only answers people whose Telegram is on their account. Someone it
does not know is told their Telegram ID, and the command line below puts it
on their account.

While the dashboard runs on one computer, at http://localhost:8000, the
links from the bot only open on that computer. Once `dashboard_url` in
`app_settings` is an https address, Telegram shows them as buttons, and they
open on any phone.

### The demo login

For showing the dashboard to people outside the team, everyone shares one
account: the one whose email is `demo_email` in `app_settings`,
demo@demo.com. It is made with `/adduser` like any other. It works as an
editor, except that it cannot send anything to Mailchimp, delete anything or
mark a newsletter sent, because its password is shown to the whole room.
What it changes otherwise is real, so try things in a draft made for the
demo. A room of people typing the same password makes typos, so it is only
locked out after 20 wrong passwords in a quarter of an hour, not 5. Take it
away with `/remove demo@demo.com` when the presentation is over.

The first admin is made from the command line, which can also set a password
directly:

```bash
docker compose exec dashboard python -m app.cli.users add you@example.fi --name You --role admin
docker compose exec dashboard python -m app.cli.users password you@example.fi
docker compose exec dashboard python -m app.cli.users telegram you@example.fi 123456789
docker compose exec dashboard python -m app.cli.users list
docker compose exec dashboard python -m app.cli.users remove someone@example.fi --yes
```

`telegram` puts an account on the bot's list. Message the bot once and it
answers with your Telegram ID. That is how anyone gets on the list, the
first admin included.

Someone already on the Telegram list has an account without a password.
Give them one with `password` rather than adding them again, or let them
choose one with `/password` in the bot.

## From articles to Mailchimp

1. Pick articles on Artikkelit, each into one of the newsletter's four
   sections: Ajankohtaista yhdistykseltä (the association's own news and
   projects), Tapahtumat, Jäsenkuulumisia and Nostoja kentältä. They go into
   the draft chosen under "Valinnat menevät" at the bottom of the left
   column: the newest draft, marked "Uudet valinnat tulevat tähän" on
   Uutiskirjeet, unless an editor chooses another. One is made and named
   after the month the first time it is needed. Luo uutiskirje starts
   another and opens its page, and "Valitse artikkeleita" there sends the
   next picks into it.
2. Open the newsletter. Its checklist shows what is done: the articles, the
   subject line and preview text, the content, and Mailchimp.
3. Open the editor. The first time, it asks for a template, grouped the way
   Mailchimp's gallery is: newsletters, events, announcements and surveys,
   membership, training, greetings, and basic layouts. The first two are the
   association's own: the newsletter as it goes out from its Mailchimp today,
   and the member letter. The others share their look. A template saved
   earlier or an earlier newsletter's look works too. The picked articles go
   into their sections, each with the picture from its own page and a "Kuva:"
   credit under it (see Pictures from the articles' pages), and a section
   with nothing picked is left out. Every
   template is the association's own design: Mailchimp's templates are
   Mailchimp's, and its terms forbid copying them.
4. Edit. Drag a block or a ready-made section in, click any text to write,
   and use the toolbar for headings, bold, links, colours and merge tags such
   as the reader's first name. Pictures come from Kuvapankki, which keeps
   every picture uploaded, and a video link becomes its preview picture with
   a play button. Styles sets the colours and fonts of the whole email. A
   section's settings say how its articles look: plain, with a large title,
   on cards, or with the title in a coloured bar. Osiot → Trendit lists the
   topics of the latest signal detection; one dragged in, or pressed, becomes
   a box after Nostoja kentältä with the topic, how many articles the sources
   ran on it, and three of them. Why it matters is left for the editors to
   write, and Tarkistus counts it until they do: the AI's reason for a signal
   is about one article, not the trend.
5. Check. Each article starts as its Finnish summary, outlined in amber until
   someone ticks it as checked. Tarkistus lists what stops the email (unchecked
   articles and AI drafts, pictures from the sources' pages that wait for
   permission, the template's sample text, no unsubscribe link, no postal
   address, no subject line) and what is worth a look (headlines left
   in English, pictures without a description, empty links, an email big
   enough for Gmail to cut short). Clicking an item shows the block. Every
   preview shows a wireframe, a grey box with a picture icon, where a picture
   has not been added yet; the email that goes out leaves those places out.
   Until Tarkistus lists no error, the email stays in the dashboard: Vie
   Mailchimpiin lists what is left and leads back to the editor instead of
   offering its three ways, Lähetä testi waits as well, and the server
   refuses the draft, the test and the files the same way
   (`issues.check_ready`). That is the promise to the association: nothing
   the AI wrote reaches Mailchimp before a person has read it.
6. The editor saves by itself a moment after each change. If someone else
   saved in between, it asks which version stays. Tallenna ja poistu runs
   the check first and lists what is still open.
7. Vie Mailchimpiin, from the checklist, in one of three ways:
   - a draft straight into Mailchimp, with its pictures, subject line,
     preview text, sender and audience. This needs the Mailchimp connection
     and, to send it, the Standard plan.
   - section by section into the editors' own Mailchimp template, which
     works on every plan, Essentials too.
   - as a file: a ZIP for Mailchimp's Import ZIP, or the HTML.
8. Lähetä testi, in the editor, has Mailchimp send the draft to the
   addresses typed in, after bringing it up to date there. Because it
   updates the draft, it waits for Tarkistus like the export does; the
   preview works any time.
9. The editors look the draft over in Mailchimp, change it there if they
   want, and send or schedule it there. The dashboard never sends.
10. Uutiskirjeet asks Mailchimp what became of each draft, and marks one
    Mailchimp has sent as sent here too. Without the connection, the
    editors mark it sent themselves. Its articles show as sent and stay out
    of the next issue.

A Mailchimp draft is made from the email's HTML, so Mailchimp opens it in its
classic editor rather than the new builder. The texts, pictures and buttons
can still be changed there. On Mailchimp's Essentials plan an email made
outside Mailchimp can be created but not sent, which is why the copy way
exists.

## Mailchimp

n8n holds the Mailchimp key and is the only part that talks to Mailchimp.
The dashboard asks it through `POST /webhook/mailchimp` with the ingest
token. The workflow and the key are described in `n8n/README.md` and
`docs/credentials.md`.

On Asetukset an admin sets:

- the data centre, the part after the dash at the end of the key, like `us4`
- the audience the drafts go to, when the account has more than one
- the plan, which decides the way into Mailchimp the dashboard offers first
- the sender's name, and the reply-to address if it is not the audience's
  own

"Testaa yhteys" there asks Mailchimp again; otherwise the answer is kept for
two minutes.

Mailchimp requires the sender's postal address in every email, and an email
made outside its builder has to carry it itself. The footers carry
`*|LIST:ADDRESSLINE|*`, which Mailchimp fills in from the audience's
settings, and Tarkistus says so if it goes missing.

An email cannot hold a working form: most email programs will not send one,
and Mailchimp's own advice is to link to a form on the web instead. So a
sign-up in an email is a button to a form on the web: the membership page for
joining, an event's own registration form, or Mailchimp's sign-up form
(`*|LIST:SUBSCRIBE|*`), which the footers offer to someone who was forwarded
the email.

Images uploaded in the editor are resized for email and saved again, which
drops the camera's metadata, including where a photo was taken. Each has an
address with a random key under `/media/`, readable without a login so the
readers' email programs can show it. A picture still used in a newsletter or
a template cannot be deleted. Pictures going into Mailchimp are uploaded to
its Content Studio once each, and the email points at Mailchimp's copy.

## Reading by topic

The left column holds the places the list can show:

- **Uudet**: summarised news nobody has decided about, and the theses of the
  followed topics, from the last 30 days (`filter_max_age_days`).
- **Valitut**, **Myöhemmin**, **Ei käytetä**: the editors' decisions.
- **Topics**, with how many new articles each has. A followed topic brings
  its theses into Uudet; news comes there whatever its topic, because the
  news sources are already about education. Following is shared: both
  editors see the same Uudet.
- **Ei aihetta**: news no topic covers, which shows whether one is missing.
- **Lähteet**, and **Muut näkymät**: what the AI step did (waiting, skipped,
  needs attention), the newsletters already sent, and everything.

Every article has subject tags, terms from YSO, the general Finnish ontology
(finto.fi/yso). The tagging workflow in n8n gives them: Finto AI suggests
terms from the Finnish summary, a thesis brings its author's own terms, and
a word from signal detection becomes a tag too. A topic is a list of YSO
terms, and an article is in every topic one of its tags is in; the
`item_topics` view in `db/init/20-topics.sql` is where that rule is written.
Clicking a tag lists everything with it. A wrong tag comes off with its ×
and stays off; "Lisää asiasana" searches YSO for one to add, so jatkuva
oppiminen finds elinikäinen oppiminen.

**Signaalit**, under the topics, lists the weak signals of the latest run:
topics that keep coming up in the news, such as tekoäly, each with how many
articles it came from. Clicking one lists those articles, and an article's
own signal note leads there too. n8n looks every Monday morning over the
last 30 days (`signal_window_days`); "Hae signaalit nyt" asks it to look
straight away, and the column shows the result when it is done, a few
minutes later. `GET /api/signals` gives the signals with their score, time
window and articles. In the newsletter editor, Osiot → Trendit turns one into
a box for Nostoja kentältä. Jira: DM42-40.

Theses come from Theseus. They wait without an AI summary until an editor
picks one, and then the AI writes it within 15 minutes; until then the
article shows the author's abstract and what its licence allows. A thesis
joins a topic only when it also has a learning tag, because most theses are
about other fields.

Keys, whenever no text box has the focus: J and K move down and up the list,
1 to 4 add the article to a section, L keeps it for later, X leaves it out.
After each decision a note offers to take it back.

**Muokkaa aiheita** at the end of the topics opens the topics themselves: the
list shows each topic, and the pane on the right renames it, follows it, adds
YSO terms through the same search as the tags, or deletes it. Under the terms
it says what the topic brings: its news from the last 30 days, and last
week's theses with and without the learning rule, listed with links.

An article in another language shows the Finnish title the AI wrote with the
summary, with the original under it. For an event the AI picks out the
dates, time, place and the last day to sign up, and the article shows the
line the newsletter starts every event with, such as 21.–23.4.2027 |
Tampere. An event goes to Tapahtumat by default, and once its day has passed
it leaves Uudet. An article picked into the newsletter starts with the
Finnish title, keeps the original in its source line, and in Tapahtumat
starts with the event line.

Each editor sees what is new to them: an article not opened yet has a dot,
and Uudet says how many are unread. Opening one for a moment marks it read
for that editor only.

## What the AI costs

Every call to the AI is in `llm_usage` with its tokens and estimated price.
Asetukset shows this month's spending against the budget, each month with
what the pre-filter saved, and each newsletter: the AI work for its
articles, and all the AI work since the newsletter before it, which is what
reading the sources for it took. The model in use is free at our volume, so
the page also says what the same use would cost at that model's paid rate.

An admin sets the monthly budget there (`monthly_budget_eur`, 0 for no cap).
At 80 % the status line warns and the bot tells the team once. When it is
used up, the articles the sources bring in wait in the queue until the next
month, or until the budget is raised; a link sent to the bot and a summary
an editor asks for are still made. The status line says so, with how many
wait, and the bot tells the team when it stops and when it starts again.
`ai_budget` in `db/init/24-ai-budget.sql` is where that state is worked out.

## Writing help from the AI

The AI helps with the newsletter's own text where the editors write it.
Nothing it writes goes out unread:

- Subject line. "Ehdota tekoälyllä", on the newsletter page and in the
  editor's subject dialog, gives three subject lines and two preview texts
  from the picked articles. Pressing one puts it in its field; it is saved
  with the form like anything typed.
- Greeting. Selecting the greeting in the editor shows "Kirjoita luonnos".
  The draft says what this newsletter has in it, after the template's first
  line, "Tervehdys täältä…".
- A trend's box (Osiot → Trendit). The same button writes why the topic
  matters now, from the topic's articles.

A draft goes into the email unchecked, outlined in orange like an article's
AI summary, and Tarkistus counts it until an editor has read it and ticked
"Tarkistettu"; until then the email cannot go to Mailchimp. "Kirjoita uusi luonnos" writes it again in other words, and
asks first if someone has changed the text since. Asking again for the same
thing, on the same articles, comes from the AI's cache at no cost. Each
answer says how many tokens it took and what it cost; it is in `llm_usage`
as `writing-subject`, `writing-greeting` or `writing-trend`, and in the
costs on Asetukset. Like a summary an editor asks for, it is written even
when the month's budget is used up.

The dashboard gathers the material and asks n8n through `POST
/webhook/writing` (`n8n/workflows/writing-help.json`), where the prompts
are: `POST /api/issues/{id}/ai/subject`, `/api/issues/{id}/ai/greeting` and
`/api/signals/{id}/ai/trend`.

### Kysy artikkeleilta

A place on Artikkelit for asking, in Finnish, what the sources have written
about something: "Mitä tekoälystä on kirjoitettu opettajille?" The
dashboard finds the articles that fit best, at most eight, from the time
chosen (30 days to all time), and the AI answers from their summaries only,
citing them as 1, 2, 3. A number opens that article in the reader, and the
articles are listed under the answer like any others, to read and pick for
the newsletter. When no article fits, the dashboard says so and the AI is
not asked. Earlier questions on the page can be opened again without asking
anew.

Finding the articles is `queries/ask.py`: any word of the question, as the
Finnish stemmer leaves it and as the start of a word, in the title, the
summary or the subject tags, with words about the asking itself
("kirjoitettu", "kerro") left out. `POST /api/ask` answers; in
`llm_usage` it is `writing-ask`.

There is no free chat with the model: one would only know what is typed
into it, and the system keeps member data out. An answer is about the
articles here, and says which.

## Pictures from the articles' pages

Each summarised article comes with the picture from its own page: the
page's `og:image`, or the featured image on the association's site. Artikkelit
shows it above the summary, and a picked article starts its newsletter entry
with it, "Kuva: Yle" under it. In a section whose articles are text, an
article with a picture has it at its side. The editor removes it, swaps in
their own from Kuvapankki or an upload, or puts the text-only layout back;
an article without its picture can take it back with "Käytä artikkelin omaa
kuvaa". Jira: DM42-37, DM42-31.

A picture on a publisher's page is the publisher's or its photographer's, and
the newsletters end up in the association's public Mailchimp archive. So each
source says what its pictures are (`sources.picture_rights`):

| Value | Sources | In the newsletter |
|---|---|---|
| `own` | the association's own news, in Finnish and English | used as they are |
| `open` | an open licence such as CC BY | used, credited |
| `check` | everything else, the default | Tarkistus stops the export until an editor ticks "Saa käyttää" (permission asked, or a picture the publisher offers for media use) or removes or replaces it |
| `none` | the journals read only as metadata, and theses | no picture is fetched |

A picture that needs permission is counted on the server too, so it holds
the draft, the test and the files like an unchecked article does.

How it gets here: `n8n/workflows/article-pictures.json` takes ten
summarised articles every 15 minutes, reads each page, downloads the picture
and hands it to `POST /api/items/{id}/picture` with n8n's token. The
dashboard opens it and saves it again like an upload (shrunk to email size,
the camera's metadata gone) and keeps it in `images` with the article's id
and whose it is; `/media/` serves it, and an export carries it into Mailchimp.
Kuvapankki does not list these pictures; they belong to their articles. The
same picture for two articles of a source is its logo or a stock photo, not
the article's own, and is left out, as is anything under 300 by 150 pixels.
A page with no picture, or one that cannot be read, is not tried again
(`items.picture_status`). The pictures go with the articles' text after
`raw_text_retention_days`, unless the article is in a newsletter or kept for
later. `db/init/28-article-pictures.sql`.

## Banners and logo

The newsletter template starts with the association's green Uutiskirje
banner and the member letter with its magenta Jäsenkirje banner; the
templates with a logo start with its logo. They are in
`web/img/brand/`, whose README says where each is from. An admin puts other
pictures in their place on Asetukset (Banneri ja logo), and can go back to
the association's own. A picture chosen there is uploaded to Kuvapankki and
cannot be deleted while it is in use. New emails start with what is chosen;
an email already started keeps its pictures, which the editor changes like
any other. `GET /api/brand`, and `PUT` and `DELETE /api/brand/{which}` for
admins; `db/init/27-brand.sql`.

## Keeping articles

The text of a collected article goes after `raw_text_retention_days`, 90 by
default, which an admin changes on Asetukset (30 to 365 days; agree it with
the client). What goes is the full text, the excerpt from the feed and the
author's name; the link, title, publisher, tags and the AI's summary stay,
and the article says when its text went. The picture from its page goes
too. An article picked into a newsletter, sent or not, or kept for later
stays whole. Two reasons, from
the kickoff: copyright, and the names and opinions of real people that
article text carries. The cleanup runs in n8n every night
(`n8n/workflows/retention.json`) and logs each run in `retention_runs`;
Asetukset shows the last one and what the next night will take. Jira: DM42-45.

## The newsletter archive

The association's past newsletters can be imported from their public archive
in Mailchimp, to check what the system finds against what the editors chose:

```bash
docker compose exec dashboard python -m app.cli.archive import "<archive address>"
docker compose exec dashboard python -m app.cli.archive list
```

`GET /api/archive` and `GET /api/archive/{id}` give the comparison. How it
works and the first results are in `docs/evaluation.md`. Jira: DM42-47.

## How the code is laid out

Each folder holds one kind of work, so a change usually touches one place.

```
app/
  main.py          puts the parts together, and nothing else
  config.py        what the service reads from its environment
  database.py      the connection pool, and the check for a missing migration
  errors.py        the shape of every error: a status, a code, a message
  middleware.py    refuses requests from other websites, adds security headers
  dependencies.py  who is logged in, and the check that only n8n may call
  routes/          the endpoints: read the request, call a service, answer
  services/        the rules, and talking to n8n and the AI server
  queries/         every SQL statement, and nothing else
  schemas/         the shapes the API takes and returns
  cli/users.py     accounts, from the command line
  cli/archive.py   imports the association's past newsletters, for docs/evaluation.md

web/
  index.html       the dashboard's pages
  editor.html      the newsletter editor, full screen
  css/             base.css for every page, ui.css for the shared controls,
                   then one file per page
  img/social/      the social network icons the emails use
  js/app.js        starts the dashboard and picks the page
  js/api.js        every call to the API goes through here
  js/texts.js      every word on the screen, in Finnish and English, with
                   the editor's, the newsletter pages' and the articles
                   page's words in texts/
  js/format.js     escaping, safe links, dates in Finnish time
  js/ui/           building blocks: elements, icons, dialogs, form controls
  js/pages/        one file per page: what it shows and what each click does
  js/components/   how one piece is drawn: an article, the column of topics,
                   the status line
  js/newsletter/   the email itself, used by the editor and the pages alike:
    model.js         what an email is made of: sections, blocks, styles
    render.js        a design written out as email HTML
    templates.js     the templates and the ready-made sections
    richtext.js      the small set of text formatting an email keeps
    checks.js        what Tarkistus lists
    handoff.js       the way into Mailchimp
  js/editor/       the editor:
    main.js          starts it, saves, and wires the parts together
    store.js         the design being edited, with undo
    canvas.js        the email in a frame, with the outlines and toolbars
    dnd.js           dragging blocks and sections
    texttools.js     the text toolbar
    settings.js      the settings of a selected block or section
    panels/          Lohkot, Osiot, Tyylit, Tarkistus
    library.js, preview.js, chooser.js, comments.js
```

A request to `/api/items` goes through `middleware.py`, then
`routes/items.py`, which calls `services/items.py`, which runs the SQL in
`queries/items.py`. The answer leaves in the shape set in `schemas/items.py`.

Every route except logging in sits behind the login, which `main.py` sets up
in one place. A new endpoint added to a router in `routes/` gets it without
asking.

What the newsletter looks like is in `web/js/newsletter/templates.js`, and
how a design becomes email HTML is in `web/js/newsletter/render.js`. The
email is built from tables with the styles written on each element, which is
what email programs, Outlook above all, still need.

## Changing it

- A page: edit the file in `web/` and reload the browser.
- The Python code: `docker compose restart dashboard`.
- `requirements.txt` or the `Dockerfile`: `docker compose up -d --build dashboard`.

Words on the screen go in `web/js/texts.js` or a file in `web/js/texts/`, in
both languages, never into a page directly. API errors carry a code, and the pages show their own words
for it.

## Security

- Editors log in with one-time links from the bot, or with a password they
  chose themselves, stored as Argon2 hashes. Five wrong ones lock an email
  for 15 minutes; the shared demo login takes twenty.
- The login is a cookie the page's scripts cannot read and the browser sends
  only to this site. The database keeps a hash of it, and of every login
  link and link to choose a password. It lasts `session_hours` from
  `app_settings`, 12 by default.
- A login link carries its token after `#`, which never reaches a server,
  and is only used when the person presses the button, so Telegram's link
  preview cannot use it up. A link to choose a password works the same way,
  and is used when the form is sent. The bot sends links only in private chats.
- Everything under `/api` needs a login, except logging in and choosing a
  password with a link. The bot's account endpoint and the one that takes
  the articles' pictures need n8n's token instead.
- The dashboard never fetches a picture from a publisher's site itself: n8n,
  which reads those pages anyway, downloads it and hands it over. The
  dashboard opens it as a picture and saves it again before keeping it, so a
  file that is not a picture never goes further.
- A request that changes something is refused when it comes from another
  website.
- Titles and summaries come from other websites and from a language model.
  Every one is escaped before it goes on the page, only http and https
  addresses become links, and the Content-Security-Policy lets only the
  dashboard's own files run.
- The editor page also allows inline styles, which an email editor needs.
  Its scripts stay limited to the dashboard's own. The preview shows the
  email in a sandboxed frame with a policy that allows its styles and no
  script at all.
- Text pasted into the editor keeps its headings, lists and links and
  nothing else, and only http, https, mailto and tel addresses, anchors and
  Mailchimp merge tags become links.
- The dashboard never holds the Mailchimp key, and nothing in it or in n8n
  can send or schedule a newsletter. See `docs/credentials.md`.
- Adding a tag asks Finto's public API at api.finto.fi, with an address the
  dashboard builds itself, so it cannot be made to fetch anything else. Only
  the words an editor types are sent. The term's Finnish name is read back
  from YSO, so a tag cannot be stored under a wrong name.
- Once it is served over https, set `COOKIE_SECURE=true` in `.env`.
