// Every word the dashboard shows, in Finnish and in English. Finnish is the
// default, because the editors work in Finnish and so does their newsletter.
// The team can switch to English from the top bar; the choice is kept in this
// browser only.
//
// Values are plain text. They are escaped when they go on the page, so a
// translation cannot break the HTML. {name} is filled in when the text is
// used. Keys ending in .one and .other are picked by a count. A key missing
// from Finnish falls back to English rather than showing the key.

import { fi as editorFi, en as editorEn } from './texts/editor.js';
import { fi as newsletterFi, en as newsletterEn } from './texts/newsletter.js';

const fi = {
  'app.title': 'Uutiskirje · Suomen eOppimiskeskus',
  'app.name': 'Uutiskirje',
  'app.org': 'Suomen eOppimiskeskus ry',
  'nav.label': 'Sivut',
  'nav.articles': 'Artikkelit',

  'block.category': 'Lohkot',
  'block.picked': 'Valitut artikkelit',
  'block.heading': 'Väliotsikko',
  'block.text': 'Teksti',
  'block.news': 'Uutinen',
  'block.event': 'Tapahtuma',
  'block.image': 'Kuva',
  'block.imageText': 'Kuva ja teksti',
  'block.button': 'Painike',
  'block.divider': 'Erotin',
  'block.tips': 'Vinkkilaatikko',
  'block.quote': 'Lainaus',
  'block.calendar': 'Päivämäärälista',
  'lang.switch': 'In English',
  'header.logout': 'Kirjaudu ulos',

  'login.title': 'Kirjaudu sisään',
  'login.email': 'Sähköposti',
  'login.password': 'Salasana',
  'login.submit': 'Kirjaudu',
  'login.busy': 'Kirjaudutaan…',
  'login.hint': 'Toimittajat kirjautuvat kertakäyttöisellä linkillä: lähetä Telegram-botille /login. Salasanalla voi kirjautua vain, jos ylläpitäjä on antanut sellaisen.',

  'link.title': 'Kirjaudu Telegramista saamallasi linkillä',
  'link.intro': 'Linkki toimii kerran. Kirjaudu painamalla painiketta.',
  'link.submit': 'Kirjaudu',
  'link.busy': 'Kirjaudutaan…',
  'link.password': 'Kirjaudu mieluummin salasanalla',

  'error.network': 'Palveluun ei saada yhteyttä. Tarkista, että se on käynnissä.',
  'error.server': 'Jokin meni vikaan (virhe {status}).',
  'error.load': 'Artikkeleita ei voitu ladata.',
  'error.retry': 'Yritä uudelleen',
  'error.not_logged_in': 'Kirjaudu ensin sisään.',
  'error.login_ended': 'Kirjautumisesi on päättynyt. Kirjaudu uudelleen.',
  'error.admin_only': 'Vain ylläpitäjä voi tehdä tämän.',
  'error.locked_out': 'Liian monta väärää salasanaa. Odota 15 minuuttia ja yritä uudelleen.',
  'error.wrong_password': 'Väärä sähköposti tai salasana.',
  'error.bad_link': 'Linkki on vanhentunut tai jo käytetty. Lähetä botille /login, niin saat uuden.',
  'error.no_such_article': 'Tällä numerolla ei ole artikkelia.',
  'error.duplicate': 'Tämä on sama juttu kuin artikkeli {id}. Käytä sitä.',
  'error.too_little_text': 'Tässä on vain otsikko tai muutama rivi, joten tiivistettävää ei ole.',
  'error.cannot_summarise': 'Tekoälylle voi lähettää uudelleen vain ohitettuja tai epäonnistuneita artikkeleita.',
  'error.check_running': 'Tarkistus on jo käynnissä.',
  'error.check_not_set_up': 'Tarkista nyt ei ole käytössä: INGEST_TOKEN puuttuu .env-tiedostosta.',
  'error.n8n_refused': 'n8n ei aloittanut tarkistusta (vastaus {status}). Onko keräysaikataulun työnkulku päällä?',
  'error.n8n_unreachable': 'n8n:ään ei saada yhteyttä. Onko se käynnissä?',
  'error.other_site': 'Muilta sivustoilta tulevat pyynnöt torjutaan.',
  'error.send_json': 'Lähetä pyyntö JSON-muodossa.',
  'error.section_needed': 'Valitse, mihin uutiskirjeen osioon artikkeli tulee.',
  'error.already_used': 'Tämä artikkeli oli uutiskirjeessä {issue}, joten päätös pysyy.',
  'error.issue_sent': 'Tämä uutiskirje on lähetetty, joten sitä ei voi enää muuttaa.',
  'error.no_such_issue': 'Tällä numerolla ei ole uutiskirjettä.',
  'error.edited_elsewhere': '{name} tallensi uutiskirjeen sen jälkeen, kun avasit sen.',
  'error.not_designed_yet': 'Avaa uutiskirje editorissa ja tallenna se ensin.',
  'error.image_too_big': 'Kuva on yli 10 Mt. Tallenna se pienempänä ja yritä uudelleen.',
  'error.not_an_image': 'Tiedosto ei ole uutiskirjeeseen sopiva kuva (JPEG, PNG, GIF tai WebP).',

  'when.today': 'tänään',
  'when.yesterday': 'eilen',
  'when.tomorrow': 'huomenna',
  'when.at': '{day} klo {time}',

  'page.articles': 'Artikkelit',
  'page.articlesLead': 'Kaikki kerätty, suomeksi tiivistettynä. Valitse uutiskirjeeseen sopivat.',
  'issue.subject': 'Aiherivi',
  'issue.subjectHint': 'Näkyy lukijan postilaatikossa viestin otsikkona.',
  'issue.preheader': 'Esikatseluteksti',
  'issue.preheaderHint': 'Näkyy postilaatikossa aiherivin perässä.',
  'issue.fieldSaved': 'Tallennettu',
  'issue.savedBy': 'Tallennettu editorissa {when} ({name})',
  'issue.markSent': 'Merkitse lähetetyksi',
  'issue.markSentConfirm': 'Onko uutiskirje lähetetty Mailchimpista? Tämän jälkeen kirjettä ei voi enää muuttaa, ja seuraavat valinnat menevät uuteen kirjeeseen.',
  'issue.remove': 'Poista kirjeestä',
  'issue.pickedBy': 'valitsi {name} {when}',
  'issue.preview': 'Esikatselu',
  'issue.noPreview': 'Esikatselu näkyy, kun kirje on avattu editorissa.',

  'status.lastCheck': 'Lähteet tarkistettu {when}.',
  'status.neverChecked': 'Lähteitä ei ole vielä tarkistettu.',
  'status.newToday.one': 'Tänään 1 uusi artikkeli.',
  'status.newToday.other': 'Tänään {n} uutta artikkelia.',
  'status.nothingToday': 'Tänään ei uusia artikkeleita.',
  'status.next': 'Seuraava tarkistus {when}.',
  'status.off': 'Automaattiset tarkistukset ovat pois päältä.',
  'status.checkNow': 'Tarkista nyt',
  'status.checking': 'Tarkistetaan kaikkia lähteitä. Tähän menee noin minuutti.',
  'status.checkDone.one': 'Tarkistus valmis: 1 uusi artikkeli. Tiivistelmä valmistuu 15 minuutin kuluessa.',
  'status.checkDone.other': 'Tarkistus valmis: {n} uutta artikkelia. Tiivistelmät valmistuvat 15 minuutin kuluessa.',
  'status.checkDoneNothing': 'Tarkistus valmis. Ei mitään uutta.',
  'status.failed.one': 'Yhden lähteen viimeisin tarkistus epäonnistui: {names}.',
  'status.failed.other': '{n} lähteen viimeisin tarkistus epäonnistui: {names}.',
  'status.failedDetails': 'Mikä meni vikaan',
  'status.aiDown': 'Tekoäly ei vastaa. Uudet artikkelit odottavat ja tiivistetään, kun se palaa.',
  'status.aiRetry.one': '1 artikkeli odottaa, koska tekoäly ei vastannut viime kerralla. Se yrittää uudelleen 15 minuutin välein.',
  'status.aiRetry.other': '{n} artikkelia odottaa, koska tekoäly ei vastannut viime kerralla. Se yrittää uudelleen 15 minuutin välein.',
  'status.waiting.one': '1 artikkeli odottaa tiivistelmää. Tiivistelmät tehdään 15 minuutin välein.',
  'status.waiting.other': '{n} artikkelia odottaa tiivistelmää. Tiivistelmät tehdään 15 minuutin välein.',
  'status.attention.one': '1 artikkeli vaatii huomiota.',
  'status.attention.other': '{n} artikkelia vaatii huomiota.',
  'status.show': 'Näytä',

  'view.label': 'Näytä',
  'view.review': 'Arvioitavat',
  'view.picked': 'Valitut',
  'view.later': 'Myöhemmin',
  'view.dismissed': 'Ei käytetä',
  'view.used': 'Lähetetyt',
  'view.waiting': 'Odottaa',
  'view.skipped': 'Ohitetut',
  'view.attention': 'Vaatii huomiota',
  'view.all': 'Kaikki',
  'note.review': 'Uudet tiivistelmät, joista kukaan ei ole vielä päättänyt. Lisää uutiskirjeeseen, säästä myöhemmäksi tai jätä pois.',
  'note.picked': 'Nämä ovat valmisteilla olevassa uutiskirjeessä. Uutiskirje-sivulla niistä tehdään lähetettävä kirje.',
  'note.later': 'Myöhemmäksi säästetyt. Ne odottavat tässä, kunnes lisäät ne uutiskirjeeseen tai jätät pois.',
  'note.dismissed': 'Näitä ei käytetä. Päätöksen voi perua.',
  'note.used': 'Nämä ovat olleet lähetetyssä uutiskirjeessä.',
  'note.waiting': 'Nämä odottavat tekoälyä. Tiivistelmät tehdään 15 minuutin välein.',
  'note.skipped': 'Suodatin jätti nämä tekoälyltä pois, joten ne eivät maksaneet mitään. Jokaisessa kerrotaan syy, ja tiivistelmän voi silti pyytää.',
  'note.attention': 'Näiden tiivistys epäonnistui, tai lähde ei salli tekoälytiivistelmiä. Lue alkuperäinen ennen käyttöä.',

  'filter.search': 'Haku',
  'filter.searchHint': 'Otsikot ja tiivistelmät',
  'filter.source': 'Lähde',
  'filter.allSources': 'Kaikki lähteet',
  'filter.language': 'Kieli',
  'filter.allLanguages': 'Kaikki kielet',
  'filter.period': 'Aika',
  'filter.sort': 'Järjestys',
  'filter.topic': 'Aihe: {topic}',
  'filter.removeTopic': 'Poista aiherajaus',
  'filter.clear': 'Tyhjennä rajaukset',

  'period.any': 'Milloin tahansa',
  'period.today': 'Tänään',
  'period.week': 'Viimeiset 7 päivää',
  'period.month': 'Viimeiset 30 päivää',

  'sort.collected': 'Uusimmat ensin',
  'sort.published': 'Julkaisupäivä',
  'sort.relevance': 'Osuvimmat',

  'lang.fi': 'Suomi',
  'lang.en': 'Englanti',
  'lang.no': 'Norja',
  'lang.sv': 'Ruotsi',
  'lang.da': 'Tanska',
  'lang.de': 'Saksa',
  'lang.unknown': 'Ei tiedossa',

  'results.count': 'Näytetään {shown} / {total}.',
  'results.none': 'Rajauksia vastaavia artikkeleita ei löytynyt.',
  'results.empty.review': 'Kaikki tiivistelmät on käyty läpi. Uudet tulevat tänne seuraavan tarkistuksen jälkeen.',
  'results.empty.picked': 'Uutiskirjeeseen ei ole vielä valittu artikkeleita.',
  'results.empty.later': 'Myöhemmäksi ei ole säästetty mitään.',
  'results.empty.dismissed': 'Mitään ei ole jätetty pois.',
  'results.empty.used': 'Mitään ei ole vielä lähetetty.',
  'results.empty.waiting': 'Mikään ei odota tekoälyä.',
  'results.empty.skipped': 'Suodatin ei ole ohittanut mitään.',
  'results.empty.attention': 'Mikään ei vaadi huomiota.',
  'results.empty.all': 'Mitään ei ole vielä kerätty. Tarkista lähteet heti painamalla Tarkista nyt.',
  'results.more': 'Näytä lisää',

  'item.collectedOn': 'kerätty {date}',
  'item.from': 'lähde: {source}',
  'item.sentBy': 'lähetti Telegramissa: {name}',
  'item.sentOnTelegram': 'lähetetty Telegramissa',
  'item.anEditor': 'toimittaja',
  'item.excerpt': 'Julkaisijan kuvaus:',
  'item.waiting': 'Odottaa tekoälyä. Tiivistelmät tehdään 15 minuutin välein.',
  'item.waitingForAi': 'Tekoäly ei vastannut. Se yrittää uudelleen seuraavalla kierroksella, 15 minuutin kuluessa.',
  'item.requested': 'Jonossa pyynnöstä ({name}). Tiivistelmä valmistuu 15 minuutin kuluessa.',
  'item.requestedDone': 'Tiivistetty pyynnöstä ({name}).',
  'item.skipped': 'Ohitettu ennen tekoälyä: {reason}',
  'item.failed': 'Tiivistys epäonnistui: {reason}',
  'item.manual': 'Tämä lähde ei salli tekoälytiivistelmiä. Lue alkuperäinen.',
  'item.noReason': 'syytä ei kirjattu.',
  'item.summariseAnyway': 'Tiivistä silti',
  'item.tryAgain': 'Yritä uudelleen',
  'item.topicHint': 'Näytä vain tämän aiheen artikkelit',
  'item.alsoIn.one': 'Myös 1 muussa lähteessä',
  'item.alsoIn.other': 'Myös {n} muussa lähteessä',
  'item.details': 'Tiedot',

  'section.highlights': 'Nostoja kentältä',
  'section.events': 'Tapahtumat',
  'section.own_news': 'Ajankohtaista yhdistykseltä',
  'section.member_news': 'Jäsenkuulumisia',
  'pick.add': 'Lisää uutiskirjeeseen',
  'pick.suggested': '{section} (ehdotus)',
  'pick.later': 'Myöhemmin',
  'pick.dismiss': 'Ei käytetä',
  'pick.undo': 'Peru',
  'pick.move': 'Siirrä osioon',
  'pick.inIssue': 'Uutiskirjeessä {issue}: {section}',
  'pick.keptLater': 'Säästetty myöhemmäksi',
  'pick.notUsed': 'Ei käytetä',
  'pick.sentIn': 'Lähetetty uutiskirjeessä {issue}',
  'pick.by': '{name}, {when}',

  'reason.duplicate': 'sama juttu on jo täällä: "{title}".',
  'reason.tooLittle': 'mukana oli vain otsikko tai muutama rivi, joten tiivistettävää ei ollut.',
  'reason.noKeyword': 'yksikään suodattimen avainsana ei esiinny siinä.',
  'reason.tooOld': 'se oli kerättäessä yli {days} päivää vanha.',

  'details.collected': 'Kerätty',
  'details.published': 'Julkaistu',
  'details.summarised': 'Tiivistetty',
  'details.text': 'Artikkelin teksti',
  'details.chars': '{count} merkkiä',
  'details.noText': 'vain otsikko',
  'details.language': 'Kieli',
  'details.number': 'Artikkelin numero',
  'details.copies': 'Sama juttu muualla',
};

const en = {
  'app.title': 'Newsletter desk · Suomen eOppimiskeskus',
  'app.name': 'Newsletter desk',
  'app.org': 'Suomen eOppimiskeskus ry',
  'nav.label': 'Pages',
  'nav.articles': 'Articles',

  'block.category': 'Blocks',
  'block.picked': 'Picked articles',
  'block.heading': 'Heading',
  'block.text': 'Text',
  'block.news': 'News item',
  'block.event': 'Event',
  'block.image': 'Image',
  'block.imageText': 'Image and text',
  'block.button': 'Button',
  'block.divider': 'Divider',
  'block.tips': 'Tip box',
  'block.quote': 'Quote',
  'block.calendar': 'Date list',
  'lang.switch': 'Suomeksi',
  'header.logout': 'Log out',

  'login.title': 'Log in',
  'login.email': 'Email',
  'login.password': 'Password',
  'login.submit': 'Log in',
  'login.busy': 'Logging in…',
  'login.hint': 'Editors log in with a one-time link: send /login to the Telegram bot. A password works only if an admin gave you one.',

  'link.title': 'Log in with your link from Telegram',
  'link.intro': 'The link works once. Press the button to log in.',
  'link.submit': 'Log in',
  'link.busy': 'Logging in…',
  'link.password': 'Log in with a password instead',

  'error.network': "Couldn't reach the dashboard. Check that it is running.",
  'error.server': 'Something went wrong (error {status}).',
  'error.load': "Couldn't load the articles.",
  'error.retry': 'Try again',
  'error.not_logged_in': 'Log in first.',
  'error.login_ended': 'Your login has ended. Log in again.',
  'error.admin_only': 'Only an admin can do this.',
  'error.locked_out': 'Too many wrong passwords. Wait 15 minutes and try again.',
  'error.wrong_password': 'Wrong email or password.',
  'error.bad_link': 'This link has expired or was already used. Send /login to the bot for a new one.',
  'error.no_such_article': 'There is no article with that number.',
  'error.duplicate': 'This is the same story as article {id}. Use that one.',
  'error.too_little_text': "There's only a title or a few lines here, so nothing to summarise.",
  'error.cannot_summarise': 'Only skipped or failed articles can be sent to the AI again.',
  'error.check_running': 'A check is already running.',
  'error.check_not_set_up': 'Check now is not set up: INGEST_TOKEN is missing from .env.',
  'error.n8n_refused': 'n8n did not start the check (it answered {status}). Is the collection schedule workflow switched on?',
  'error.n8n_unreachable': 'Could not reach n8n. Is it running?',
  'error.other_site': 'Requests from other websites are refused.',
  'error.send_json': 'Send the request as JSON.',
  'error.section_needed': 'Choose which section of the newsletter the article goes in.',
  'error.already_used': 'This article went out in {issue}, so the decision stays.',
  'error.issue_sent': 'This newsletter has been sent, so it can no longer be changed.',
  'error.no_such_issue': 'There is no newsletter with that number.',
  'error.edited_elsewhere': '{name} saved the newsletter after you opened it.',
  'error.not_designed_yet': 'Open the newsletter in the editor and save it first.',
  'error.image_too_big': 'The image is over 10 MB. Save it smaller and try again.',
  'error.not_an_image': 'That file is not a picture the newsletter can use (JPEG, PNG, GIF or WebP).',

  'when.today': 'today',
  'when.yesterday': 'yesterday',
  'when.tomorrow': 'tomorrow',
  'when.at': '{day} at {time}',

  'page.articles': 'Articles',
  'page.articlesLead': 'Everything collected, summarised in Finnish. Pick what belongs in the newsletter.',
  'issue.subject': 'Subject line',
  'issue.subjectHint': "What readers see as the email's subject in their inbox.",
  'issue.preheader': 'Preview text',
  'issue.preheaderHint': 'Shown after the subject line in the inbox.',
  'issue.fieldSaved': 'Saved',
  'issue.savedBy': 'Saved in the editor {when} by {name}',
  'issue.markSent': 'Mark as sent',
  'issue.markSentConfirm': 'Has the newsletter been sent from Mailchimp? After this it can no longer be changed, and new picks go into a new newsletter.',
  'issue.remove': 'Remove',
  'issue.pickedBy': 'picked by {name} {when}',
  'issue.preview': 'Preview',
  'issue.noPreview': 'The preview appears once the email has been opened in the editor.',

  'status.lastCheck': 'Sources last checked {when}.',
  'status.neverChecked': "Sources haven't been checked yet.",
  'status.newToday.one': '1 new article today.',
  'status.newToday.other': '{n} new articles today.',
  'status.nothingToday': 'Nothing new today.',
  'status.next': 'Next check {when}.',
  'status.off': 'Automatic checks are off.',
  'status.checkNow': 'Check now',
  'status.checking': 'Checking every source now. This takes about a minute.',
  'status.checkDone.one': 'Check finished: 1 new article. Its summary will be ready within 15 minutes.',
  'status.checkDone.other': 'Check finished: {n} new articles. Their summaries will be ready within 15 minutes.',
  'status.checkDoneNothing': 'Check finished. Nothing new.',
  'status.failed.one': '1 source failed on its last check: {names}.',
  'status.failed.other': '{n} sources failed on their last check: {names}.',
  'status.failedDetails': 'What went wrong',
  'status.aiDown': "The AI isn't answering. New articles wait and are summarised when it's back.",
  'status.aiRetry.one': "1 article is waiting because the AI didn't answer last time. It tries again every 15 minutes.",
  'status.aiRetry.other': "{n} articles are waiting because the AI didn't answer last time. It tries again every 15 minutes.",
  'status.waiting.one': '1 article is waiting for its summary. Summaries are made every 15 minutes.',
  'status.waiting.other': '{n} articles are waiting for their summaries. Summaries are made every 15 minutes.',
  'status.attention.one': '1 article needs attention.',
  'status.attention.other': '{n} articles need attention.',
  'status.show': 'Show',

  'view.label': 'Show',
  'view.review': 'To review',
  'view.picked': 'Picked',
  'view.later': 'Later',
  'view.dismissed': 'Not used',
  'view.used': 'Sent',
  'view.waiting': 'Waiting',
  'view.skipped': 'Skipped',
  'view.attention': 'Needs attention',
  'view.all': 'All',
  'note.review': "New summaries nobody has decided on yet. Add them to the newsletter, keep them for later, or leave them out.",
  'note.picked': 'These are in the newsletter being prepared. The Newsletter page turns them into the email.',
  'note.later': 'Kept for later. They wait here until you add them to the newsletter or leave them out.',
  'note.dismissed': 'These are not used. The decision can be taken back.',
  'note.used': 'These were in a newsletter that has been sent.',
  'note.waiting': 'These are waiting for the AI. Summaries are made every 15 minutes.',
  'note.skipped': 'The filter kept these from the AI, so they cost nothing. Each one says why, and you can still ask for a summary.',
  'note.attention': "The AI step failed for these, or their source doesn't allow AI summaries. Read the original before using one.",

  'filter.search': 'Search',
  'filter.searchHint': 'Titles and summaries',
  'filter.source': 'Source',
  'filter.allSources': 'All sources',
  'filter.language': 'Language',
  'filter.allLanguages': 'All languages',
  'filter.period': 'Date',
  'filter.sort': 'Order',
  'filter.topic': 'Topic: {topic}',
  'filter.removeTopic': 'Stop filtering by this topic',
  'filter.clear': 'Clear filters',

  'period.any': 'Any time',
  'period.today': 'Today',
  'period.week': 'Last 7 days',
  'period.month': 'Last 30 days',

  'sort.collected': 'Newest arrivals',
  'sort.published': 'Publication date',
  'sort.relevance': 'Best match',

  'lang.fi': 'Finnish',
  'lang.en': 'English',
  'lang.no': 'Norwegian',
  'lang.sv': 'Swedish',
  'lang.da': 'Danish',
  'lang.de': 'German',
  'lang.unknown': 'Not known',

  'results.count': 'Showing {shown} of {total}.',
  'results.none': 'No articles match these filters.',
  'results.empty.review': 'Every summary has been looked at. New ones arrive here after the next check.',
  'results.empty.picked': 'Nothing has been picked for the newsletter yet.',
  'results.empty.later': 'Nothing is kept for later.',
  'results.empty.dismissed': 'Nothing has been left out.',
  'results.empty.used': 'Nothing has been sent yet.',
  'results.empty.waiting': 'Nothing is waiting for the AI.',
  'results.empty.skipped': "The filter hasn't skipped anything.",
  'results.empty.attention': 'Nothing needs attention.',
  'results.empty.all': 'Nothing has been collected yet. Press Check now to check the sources straight away.',
  'results.more': 'Show more',

  'item.collectedOn': 'collected {date}',
  'item.from': 'from {source}',
  'item.sentBy': 'sent by {name} on Telegram',
  'item.sentOnTelegram': 'sent on Telegram',
  'item.anEditor': 'an editor',
  'item.excerpt': "Publisher's description:",
  'item.waiting': 'Waiting for the AI. Summaries are made every 15 minutes.',
  'item.waitingForAi': "The AI didn't answer. It tries again on the next run, within 15 minutes.",
  'item.requested': 'Queued because {name} asked. The summary will be ready within 15 minutes.',
  'item.requestedDone': 'Summarised because {name} asked for it.',
  'item.skipped': 'Skipped before the AI: {reason}',
  'item.failed': 'The summary failed: {reason}',
  'item.manual': "This source doesn't allow AI summaries. Read the original.",
  'item.noReason': 'no reason was recorded.',
  'item.summariseAnyway': 'Summarise anyway',
  'item.tryAgain': 'Try again',
  'item.topicHint': 'Show only articles on this topic',
  'item.alsoIn.one': 'Also in 1 other source',
  'item.alsoIn.other': 'Also in {n} other sources',
  'item.details': 'Details',

  'section.highlights': 'Highlights from the field',
  'section.events': 'Events',
  'section.own_news': 'News from the association',
  'section.member_news': 'Member news',
  'pick.add': 'Add to the newsletter',
  'pick.suggested': '{section} (suggested)',
  'pick.later': 'Later',
  'pick.dismiss': 'Not used',
  'pick.undo': 'Undo',
  'pick.move': 'Move to',
  'pick.inIssue': 'In {issue}: {section}',
  'pick.keptLater': 'Kept for later',
  'pick.notUsed': 'Not used',
  'pick.sentIn': 'Sent in {issue}',
  'pick.by': '{name}, {when}',

  'reason.duplicate': 'the same story is already here as "{title}".',
  'reason.tooLittle': 'there was only a title or a few lines, so nothing to summarise.',
  'reason.noKeyword': "none of the filter's keywords appear in it.",
  'reason.tooOld': 'it was more than {days} days old when it was collected.',

  'details.collected': 'Collected',
  'details.published': 'Published',
  'details.summarised': 'Summary made',
  'details.text': 'Article text',
  'details.chars': '{count} characters',
  'details.noText': 'only the title',
  'details.language': 'Language',
  'details.number': 'Article number',
  'details.copies': 'The same story elsewhere',
};

// The editor's and the newsletter pages' words live in files of their own,
// added here.
Object.assign(fi, editorFi, newsletterFi);
Object.assign(en, editorEn, newsletterEn);

const DICTIONARIES = { fi, en };
const STORE = 'dfp.lang';

function chosenLanguage() {
  try {
    const saved = localStorage.getItem(STORE);
    if (saved in DICTIONARIES) return saved;
  } catch {
    // Storage can be blocked; Finnish then, every time.
  }
  return 'fi';
}

let language = chosenLanguage();
let texts = DICTIONARIES[language];

export function currentLanguage() {
  return language;
}

// The other language, which the switch in the top bar offers.
export function otherLanguage() {
  return language === 'fi' ? 'en' : 'fi';
}

// Switches at once; the page then draws itself again. Remembered for next
// time where the browser allows it.
export function setLanguage(next) {
  if (!(next in DICTIONARIES)) return;
  language = next;
  texts = DICTIONARIES[next];
  try {
    localStorage.setItem(STORE, next);
  } catch {
    // Without storage the choice lasts until the page is closed.
  }
}

export function t(key, vars = {}) {
  const text = texts[key] ?? en[key] ?? key;
  return text.replace(/\{(\w+)\}/g, (whole, name) => (name in vars ? String(vars[name]) : whole));
}

// The .one or .other form of a text, by the count n.
export function tn(key, n, vars = {}) {
  return t(`${key}.${n === 1 ? 'one' : 'other'}`, { n, ...vars });
}

export function has(key) {
  return key in texts || key in en;
}

// Fills every element marked data-t="key" in the static HTML, and
// data-t-label="key" into aria-label.
export function applyTexts(root) {
  root.querySelectorAll('[data-t]').forEach((el) => {
    el.textContent = t(el.dataset.t);
  });
  root.querySelectorAll('[data-t-label]').forEach((el) => {
    el.setAttribute('aria-label', t(el.dataset.tLabel));
  });
  document.documentElement.lang = language;
  document.title = t('app.title');
}
