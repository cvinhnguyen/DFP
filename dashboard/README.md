# The dashboard

The editors' web app, in Finnish with an English switch for the team.

- **Artikkelit**: everything the tool collected, read by topic. A column of
  topics and lists on the left, the list in the middle, the article on the
  right with its Finnish summary, its subject tags and the buttons that
  decide: add it to the newsletter (in a section), keep it for later, or
  leave it out. The next article opens by itself, and keys do the same as
  the buttons. Both editors see who decided what. Skipped and failed
  articles say why, and can be summarised anyway.
- **Uutiskirjeet**: every newsletter, drafts first, like Mailchimp's list of
  campaigns. Each one opens to a checklist: articles, subject line and
  preview text, content, Mailchimp, with a preview beside it.
- **The editor**: an editor for the email itself, laid out like Mailchimp's
  so the editors find their way in both. Blocks, sections, styles, a check
  of everything that needs a look, a phone view, a preview, comments, and
  undo. It starts from a template with the picked articles in place.
- **Asetukset**, for admins: the Mailchimp connection.

Jira: DM42-80, with DM42-31 for the article API, DM42-32 for decisions,
DM42-33 for logging in and DM42-37 for the newsletter.

It is one service: a small Python API (FastAPI) that also serves the pages.
The pages are plain HTML, CSS and JavaScript with no build step.

## Running it

It starts with everything else (`docker compose up -d`) at
http://localhost:8000. Every endpoint is documented at
http://localhost:8000/api/docs.

## Logging in

Editors log in through the Telegram bot, with no password:

| Command | Who | What it does |
|---|---|---|
| `/login` | everyone on the list | a link to the dashboard that works once, for 15 minutes |
| `/invite` | admins | a join link for a new colleague, once, for 24 hours |
| `/invite admin` | admins | the same, for a new admin |
| `/people` | admins | who can use the bot and the dashboard |
| `/remove Name` | admins | ends someone's access; the articles they sent keep their name |

The first admin, and anyone who wants a password, is made from the command
line:

```bash
docker compose exec dashboard python -m app.cli.users add you@example.fi --name You --role admin
docker compose exec dashboard python -m app.cli.users password you@example.fi
docker compose exec dashboard python -m app.cli.users telegram you@example.fi 123456789
docker compose exec dashboard python -m app.cli.users list
docker compose exec dashboard python -m app.cli.users remove someone@example.fi --yes
```

`telegram` puts an account on the bot's list. Message the bot once and it
answers with your Telegram ID. That is how the first admin gets on the list;
after that, admins bring everyone else in with `/invite`.

Someone already on the Telegram list has an account without a password.
Give them one with `password` rather than adding them again.

## From articles to Mailchimp

1. Pick articles on Artikkelit, each into one of the newsletter's four
   sections: Ajankohtaista yhdistykseltä (the association's own news and
   projects), Tapahtumat, Jäsenkuulumisia and Nostoja kentältä. They go into
   the draft chosen under "Valinnat menevät" at the bottom of the left
   column: the newest draft, marked "Uudet valinnat tulevat tähän" on
   Uutiskirjeet, unless an editor chooses another. One is made and named
   after the month the first time it is needed, and an editor can start
   another with Luo uutiskirje.
2. Open the newsletter. Its checklist shows what is done: the articles, the
   subject line and preview text, the content, and Mailchimp.
3. Open the editor. The first time, it asks for a template, grouped the way
   Mailchimp's gallery is: newsletters, events, announcements and surveys,
   membership, training, greetings, and basic layouts. The first two are the
   association's own: the newsletter as it goes out from its Mailchimp today,
   and the member letter. The others share their look. A template saved
   earlier or an earlier newsletter's look works too. The picked articles go
   into their sections, and a section with nothing picked is left out. Every
   template is the association's own design: Mailchimp's templates are
   Mailchimp's, and its terms forbid copying them.
4. Edit. Drag a block or a ready-made section in, click any text to write,
   and use the toolbar for headings, bold, links, colours and merge tags such
   as the reader's first name. Pictures come from Kuvapankki, which keeps
   every picture uploaded, and a video link becomes its preview picture with
   a play button. Styles sets the colours and fonts of the whole email. A
   section's settings say how its articles look: plain, with a large title,
   on cards, or with the title in a coloured bar.
5. Check. Each article starts as its Finnish summary, outlined in amber until
   someone ticks it as checked. Tarkistus lists what stops the email (unchecked
   articles, placeholder text, no unsubscribe link, no postal address, no
   subject line) and what is worth a look (headlines left in English, pictures
   without a description, empty links, an email big enough for Gmail to cut
   short). Clicking an item shows the block. Every preview shows a
   wireframe, a grey box with a picture icon, where a picture has not been
   added yet; the email that goes out leaves those places out.
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
   addresses typed in, after bringing it up to date there.
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

Theses come from Theseus. They wait without an AI summary until an editor
picks one, and then the AI writes it within 15 minutes; until then the
article shows the author's abstract and what its licence allows. A thesis
joins a topic only when it also has a learning tag, because most theses are
about other fields.

Keys, whenever no text box has the focus: J and K move down and up the list,
1 to 4 add the article to a section, L keeps it for later, X leaves it out.
After each decision a note offers to take it back.

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

- Editors log in with one-time links from the bot. Passwords, for those who
  have one, are stored as Argon2 hashes; five wrong ones lock an email for 15
  minutes.
- The login is a cookie the page's scripts cannot read and the browser sends
  only to this site. The database keeps a hash of it, and of every login
  link and invite. It lasts `session_hours` from `app_settings`, 12 by
  default.
- A login link carries its token after `#`, which never reaches a server,
  and is only used when the person presses the button, so Telegram's link
  preview cannot use it up. The bot sends links only in private chats.
- Everything under `/api` needs a login, except logging in. The bot's account
  endpoint needs n8n's token instead.
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
