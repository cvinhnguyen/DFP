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
import { fi as articlesFi, en as articlesEn } from './texts/articles.js';
import { fi as sourcesFi, en as sourcesEn } from './texts/sources.js';

const fi = {
  'app.title': 'Uutiskirje · Suomen eOppimiskeskus',
  'app.name': 'Uutiskirje',
  'app.org': 'Suomen eOppimiskeskus ry',
  'app.loading': 'Ladataan…',
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
  'menu.user': '{name}, valikko',
  'menu.appearance': 'Ulkoasu',
  'menu.language': 'Kieli',
  'theme.system': 'Tietokoneen mukaan',
  'theme.light': 'Vaalea',
  'theme.dark': 'Tumma',

  'login.title': 'Kirjaudu sisään',
  'login.email': 'Sähköposti',
  'login.password': 'Salasana',
  'login.submit': 'Kirjaudu',
  'login.busy': 'Kirjaudutaan…',
  'login.hint': 'Telegramissa? Lähetä botille /login, niin saat kertakäyttöisen kirjautumislinkin. Unohtuiko salasana? Lähetä botille /password tai pyydä ylläpitäjältä linkki, jolla valitset uuden.',

  'linkLogin.title': 'Kirjaudu Telegramista saamallasi linkillä',
  'linkLogin.intro': 'Linkki toimii kerran. Kirjaudu painamalla painiketta.',
  'linkLogin.submit': 'Kirjaudu',
  'linkLogin.busy': 'Kirjaudutaan…',
  'linkLogin.password': 'Kirjaudu mieluummin salasanalla',

  'password.title': 'Valitse salasana',
  'password.checking': 'Tarkistetaan linkkiä…',
  'password.intro': 'Hei {name}! Jatkossa kirjaudut sähköpostiosoitteellasi ja salasanalla, jonka valitset tässä.',
  'password.introEmail': 'Hei {name}! Valitse sähköpostiosoite ja salasana. Niillä kirjaudut millä tahansa koneella, myös ilman Telegramia. Telegramin /login toimii edelleen.',
  'password.introNew': 'Hei {name}! Valitse uusi salasana. Kun tallennat sen, muut kirjautumisesi päättyvät.',
  'password.new': 'Salasana',
  'password.rule': 'Vähintään {n} merkkiä. Lyhyt lause, jonka muistat, käy hyvin.',
  'password.again': 'Salasana uudelleen',
  'password.submit': 'Tallenna ja kirjaudu',
  'password.busy': 'Tallennetaan…',
  'password.mismatch': 'Salasanat eivät ole samat.',
  'password.notYours': 'Tämä linkki on henkilölle {who}. Olet kirjautunut nimellä {you}, joten lähetä linkki hänelle äläkä käytä sitä itse.',
  'password.toLogin': 'Siirry kirjautumaan',
  'password.back': 'Takaisin artikkeleihin',

  'error.network': 'Palveluun ei saada yhteyttä. Tarkista, että se on käynnissä.',
  'error.server': 'Jokin meni vikaan (virhe {status}).',
  'error.load': 'Artikkeleita ei voitu ladata.',
  'error.retry': 'Yritä uudelleen',
  'error.not_logged_in': 'Kirjaudu ensin sisään.',
  'error.login_ended': 'Kirjautumisesi on päättynyt. Kirjaudu uudelleen.',
  'error.admin_only': 'Vain ylläpitäjä voi tehdä tämän.',
  'error.demo_login': 'Jaettu demotunnus ei voi tehdä tätä. Kaikki muu toimii tavalliseen tapaan.',
  'error.invalid_request': 'Pyynnössä oli jotain, mitä ei voitu käyttää. Tarkista kentät ja yritä uudelleen.',
  'error.bad_request': 'Pyyntöä ei voitu käsitellä. Lataa sivu uudelleen ja yritä uudestaan.',
  'error.not_ready': 'Kirje viedään Mailchimpiin vasta, kun Tarkistuksessa ei ole virheitä. Korjattavaa: {count}.',
  'error.locked_out': 'Liian monta väärää salasanaa. Odota 15 minuuttia ja yritä uudelleen.',
  'error.wrong_password': 'Väärä sähköposti tai salasana.',
  'error.bad_link': 'Linkki on vanhentunut tai jo käytetty. Lähetä botille /login, niin saat uuden.',
  'error.bad_password_link': 'Linkki on vanhentunut tai jo käytetty. Lähetä botille /password, niin saat uuden, tai pyydä sitä ylläpitäjältä.',
  'error.bad_login_email': 'Kirjoita sähköpostiosoite, jolla kirjaudut.',
  'error.email_taken': 'Tällä sähköpostiosoitteella on jo toinen tili. Kirjoita toinen osoite tai kysy ylläpitäjältä.',
  'error.signals_not_set_up': 'Signaalien haku ei ole käytössä: INGEST_TOKEN puuttuu .env-tiedostosta.',
  'error.signals_refused': 'n8n ei aloittanut signaalien hakua (vastaus {status}). Onko Signal detection -työnkulku päällä?',
  'error.weak_password': 'Salasanassa pitää olla vähintään {n} merkkiä.',
  'error.no_such_article': 'Tällä numerolla ei ole artikkelia.',
  'error.duplicate': 'Tämä on sama juttu kuin artikkeli {id}. Käytä sitä.',
  'error.too_little_text': 'Tässä on vain otsikko tai muutama rivi, joten tiivistettävää ei ole.',
  'error.cannot_summarise': 'Tekoälylle voi lähettää uudelleen vain ohitettuja tai epäonnistuneita artikkeleita.',
  'error.check_running': 'Tarkistus on jo käynnissä.',
  'error.check_not_set_up': 'Tarkista nyt ei ole käytössä: INGEST_TOKEN puuttuu .env-tiedostosta.',
  'error.n8n_refused': 'n8n ei aloittanut tarkistusta (vastaus {status}). Onko keräysaikataulun työnkulku päällä?',
  'error.n8n_unreachable': 'n8n:ään ei saada yhteyttä. Onko se käynnissä?',
  'error.ai_failed': 'Tekoäly ei vastannut. Yritä hetken päästä uudelleen.',
  'error.ai_slow': 'Tekoäly vastasi liian hitaasti. Yritä uudelleen.',
  'error.ai_busy': 'Tekoälyllä on nyt liikaa kysymyksiä yhtä aikaa. Yritä hetken päästä uudelleen.',
  'error.ai_not_set_up': 'Kirjoitusapu ei ole käytössä: n8n:stä puuttuu Writing help -työnkulku.',
  'error.ai_no_articles': 'Valitse ensin artikkeleita tähän uutiskirjeeseen.',
  'error.ai_bad_request': 'Tekoälylle lähti pyyntö, jota se ei tunne.',
  'error.no_such_signal': 'Tällä numerolla ei ole signaalia.',
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
  'ago.now': 'juuri nyt',
  'ago.minutes': '{n} min sitten',
  'ago.hours': '{n} t sitten',
  'days.today': 'tänään',
  'days.tomorrow': 'huomenna',
  'days.yesterday': 'eilen',
  'days.in': '{n} pv päästä',
  'days.ago': '{n} pv sitten',

  'page.articles': 'Artikkelit',
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

  'status.checked': 'Lähteet tarkistettu {when}',
  'status.neverChecked': 'Lähteitä ei ole vielä tarkistettu',
  'status.articles.one': '1 uusi artikkeli',
  'status.articles.other': '{n} uutta artikkelia',
  'status.theses.one': '1 opinnäytetyö',
  'status.theses.other': '{n} opinnäytetyötä',
  'status.both': '{a} ja {b}',
  'status.today': '{what} tänään',
  'status.nothingNew': 'Tänään ei uutta',
  'status.waitingShort.one': '1 odottaa tiivistelmää',
  'status.waitingShort.other': '{n} odottaa tiivistelmää',
  'status.nextShort': 'Seuraava tarkistus {when}',
  'status.offShort': 'Automaattiset tarkistukset pois päältä',
  'status.checkNow': 'Tarkista nyt',
  'status.checkingShort': 'Tarkistetaan…',
  'status.checking': 'Tarkistetaan kaikkia lähteitä. Tähän menee noin minuutti.',
  'status.checkDone.one': 'Tarkistus valmis: 1 uusi artikkeli. Tiivistelmä valmistuu 15 minuutin kuluessa.',
  'status.checkDone.other': 'Tarkistus valmis: {n} uutta artikkelia. Tiivistelmät valmistuvat 15 minuutin kuluessa.',
  'status.checkDoneNothing': 'Tarkistus valmis. Ei mitään uutta.',
  'status.failedChip.one': '1 lähteen haku epäonnistui',
  'status.failedChip.other': '{n} lähteen haku epäonnistui',
  'status.failedAgain.one': 'Lähteen hakua yritetään uudelleen seuraavassa tarkistuksessa.',
  'status.failedAgain.other': 'Lähteiden hakua yritetään uudelleen seuraavassa tarkistuksessa.',
  'status.attentionChip.one': '1 artikkeli vaatii huomiota',
  'status.attentionChip.other': '{n} artikkelia vaatii huomiota',
  'status.aiDown': 'Tekoäly ei vastaa. Uudet artikkelit odottavat ja tiivistetään, kun se palaa.',
  'status.budgetWarn': 'Tekoälyn kuukausibudjetista on käytetty {pct} % ({spent} / {budget}).',
  'status.budgetOver': 'Tekoälyn tämän kuun budjetti ({budget}) on käytetty. Lähteiden uusia artikkeleita tiivistetään taas {date} tai kun ylläpitäjä nostaa budjettia Asetuksissa. Telegram-botille lähetetyt linkit ja pyydetyt tiivistelmät tehdään silti.',
  'status.budgetWaiting.one': '1 artikkeli odottaa.',
  'status.budgetWaiting.other': '{n} artikkelia odottaa.',
  'status.aiRetry.one': '1 artikkeli odottaa, koska tekoäly ei vastannut viime kerralla. Se yrittää uudelleen 15 minuutin välein.',
  'status.aiRetry.other': '{n} artikkelia odottaa, koska tekoäly ei vastannut viime kerralla. Se yrittää uudelleen 15 minuutin välein.',

  'view.picked': 'Valitut',
  'view.later': 'Myöhemmin',
  'view.dismissed': 'Ei käytetä',
  'view.used': 'Lähetetyt',
  'view.waiting': 'Odottaa',
  'view.skipped': 'Ohitetut',
  'view.attention': 'Vaatii huomiota',
  'view.all': 'Kaikki',
  'note.picked': 'Nämä ovat valmisteilla olevassa uutiskirjeessä. Uutiskirje-sivulla niistä tehdään lähetettävä kirje.',
  'note.later': 'Myöhemmäksi säästetyt. Ne odottavat tässä, kunnes lisäät ne uutiskirjeeseen tai jätät pois.',
  'note.dismissed': 'Näitä ei käytetä. Päätöksen voi perua.',
  'note.used': 'Nämä ovat olleet lähetetyssä uutiskirjeessä.',
  'note.waiting': 'Nämä odottavat tekoälyä. Tiivistelmät tehdään 15 minuutin välein.',
  'note.skipped': 'Suodatin jätti nämä tekoälyltä pois, joten ne eivät maksaneet mitään. Jokaisessa kerrotaan syy, ja tiivistelmän voi silti pyytää.',
  'note.attention': 'Näiden tiivistys epäonnistui, tai lähde ei salli tekoälytiivistelmiä. Lue alkuperäinen ennen käyttöä.',

  'filter.sort': 'Järjestys',
  'filter.clear': 'Tyhjennä rajaukset',

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

  'results.none': 'Rajauksia vastaavia artikkeleita ei löytynyt.',
  'results.empty.picked': 'Uutiskirjeeseen ei ole vielä valittu artikkeleita.',
  'results.empty.later': 'Myöhemmäksi ei ole säästetty mitään.',
  'results.empty.dismissed': 'Mitään ei ole jätetty pois.',
  'results.empty.used': 'Mitään ei ole vielä lähetetty.',
  'results.empty.waiting': 'Mikään ei odota tekoälyä.',
  'results.empty.skipped': 'Suodatin ei ole ohittanut mitään.',
  'results.empty.attention': 'Mikään ei vaadi huomiota.',
  'results.empty.all': 'Mitään ei ole vielä kerätty. Tarkista lähteet heti painamalla Tarkista nyt.',
  'results.more': 'Näytä lisää',

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
  'item.alsoIn.one': 'Myös 1 muussa lähteessä',
  'item.alsoIn.other': 'Myös {n} muussa lähteessä',
  'item.details': 'Tiedot',

  'section.highlights': 'Nostoja kentältä',
  'section.events': 'Tapahtumat',
  'section.own_news': 'Ajankohtaista yhdistykseltä',
  'section.member_news': 'Jäsenkuulumisia',
  'section.training': 'Learning Factory',
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
  'details.textRemoved': 'poistettu {date} säilytysajan päätyttyä',
  'details.language': 'Kieli',
  'details.number': 'Artikkelin numero',
  'details.copies': 'Sama juttu muualla',
};

const en = {
  'app.title': 'Newsletter desk · Suomen eOppimiskeskus',
  'app.name': 'Newsletter desk',
  'app.org': 'Suomen eOppimiskeskus ry',
  'app.loading': 'Loading…',
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
  'menu.user': '{name}, menu',
  'menu.appearance': 'Appearance',
  'menu.language': 'Language',
  'theme.system': 'Same as the computer',
  'theme.light': 'Light',
  'theme.dark': 'Dark',

  'login.title': 'Log in',
  'login.email': 'Email',
  'login.password': 'Password',
  'login.submit': 'Log in',
  'login.busy': 'Logging in…',
  'login.hint': 'On Telegram? Send /login to the bot for a one-time login link. Forgot your password? Send /password to the bot, or ask an admin for a link to choose a new one.',

  'linkLogin.title': 'Log in with your link from Telegram',
  'linkLogin.intro': 'The link works once. Press the button to log in.',
  'linkLogin.submit': 'Log in',
  'linkLogin.busy': 'Logging in…',
  'linkLogin.password': 'Log in with a password instead',

  'password.title': 'Choose your password',
  'password.checking': 'Checking the link…',
  'password.intro': 'Hi {name}! From now on you log in with your email address and the password you choose here.',
  'password.introEmail': 'Hi {name}! Choose an email address and a password. With them you log in on any computer, also without Telegram. /login in Telegram keeps working.',
  'password.introNew': 'Hi {name}! Choose a new password. When you save it, your other logins end.',
  'password.new': 'Password',
  'password.rule': 'At least {n} characters. A short sentence you will remember works well.',
  'password.again': 'Password again',
  'password.submit': 'Save and log in',
  'password.busy': 'Saving…',
  'password.mismatch': 'The two passwords are different.',
  'password.notYours': 'This link is for {who}. You are logged in as {you}, so send the link to them rather than using it yourself.',
  'password.toLogin': 'Go to the login',
  'password.back': 'Back to the articles',

  'error.network': "Couldn't reach the dashboard. Check that it is running.",
  'error.server': 'Something went wrong (error {status}).',
  'error.load': "Couldn't load the articles.",
  'error.retry': 'Try again',
  'error.not_logged_in': 'Log in first.',
  'error.login_ended': 'Your login has ended. Log in again.',
  'error.admin_only': 'Only an admin can do this.',
  'error.demo_login': 'The shared demo login cannot do this. Everything else works as usual.',
  'error.invalid_request': 'Something in the request could not be used. Check the fields and try again.',
  'error.bad_request': 'The request could not be handled. Reload the page and try again.',
  'error.not_ready': 'The email goes to Mailchimp only once Check lists no errors. Left to fix: {count}.',
  'error.locked_out': 'Too many wrong passwords. Wait 15 minutes and try again.',
  'error.wrong_password': 'Wrong email or password.',
  'error.bad_link': 'This link has expired or was already used. Send /login to the bot for a new one.',
  'error.bad_password_link': 'This link has expired or was already used. Send /password to the bot for a new one, or ask an admin.',
  'error.bad_login_email': 'Type the email address you will log in with.',
  'error.email_taken': 'Another account has that email already. Type another one, or ask an admin.',
  'error.signals_not_set_up': 'Looking for signals is not set up: INGEST_TOKEN is missing from .env.',
  'error.signals_refused': "n8n didn't start looking for signals (answer {status}). Is the signal detection workflow on?",
  'error.weak_password': 'Use at least {n} characters.',
  'error.no_such_article': 'There is no article with that number.',
  'error.duplicate': 'This is the same story as article {id}. Use that one.',
  'error.too_little_text': "There's only a title or a few lines here, so nothing to summarise.",
  'error.cannot_summarise': 'Only skipped or failed articles can be sent to the AI again.',
  'error.check_running': 'A check is already running.',
  'error.check_not_set_up': 'Check now is not set up: INGEST_TOKEN is missing from .env.',
  'error.n8n_refused': 'n8n did not start the check (it answered {status}). Is the collection schedule workflow switched on?',
  'error.n8n_unreachable': 'Could not reach n8n. Is it running?',
  'error.ai_failed': 'The AI did not answer. Try again in a moment.',
  'error.ai_slow': 'The AI took too long to answer. Try again.',
  'error.ai_busy': 'Too many questions for the AI at once. Try again in a moment.',
  'error.ai_not_set_up': 'Writing help is not set up: n8n has no Writing help workflow switched on.',
  'error.ai_no_articles': 'Pick articles for this newsletter first.',
  'error.ai_bad_request': 'The AI was sent a request it does not know.',
  'error.no_such_signal': 'There is no signal with that number.',
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
  'ago.now': 'just now',
  'ago.minutes': '{n} min ago',
  'ago.hours': '{n} h ago',
  'days.today': 'today',
  'days.tomorrow': 'tomorrow',
  'days.yesterday': 'yesterday',
  'days.in': 'in {n} days',
  'days.ago': '{n} days ago',

  'page.articles': 'Articles',
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

  'status.checked': 'Sources checked {when}',
  'status.neverChecked': "Sources haven't been checked yet",
  'status.articles.one': '1 new article',
  'status.articles.other': '{n} new articles',
  'status.theses.one': '1 thesis',
  'status.theses.other': '{n} theses',
  'status.both': '{a} and {b}',
  'status.today': '{what} today',
  'status.nothingNew': 'Nothing new today',
  'status.waitingShort.one': '1 waiting for its summary',
  'status.waitingShort.other': '{n} waiting for summaries',
  'status.nextShort': 'Next check {when}',
  'status.offShort': 'Automatic checks are off',
  'status.checkNow': 'Check now',
  'status.checkingShort': 'Checking…',
  'status.checking': 'Checking every source now. This takes about a minute.',
  'status.checkDone.one': 'Check finished: 1 new article. Its summary will be ready within 15 minutes.',
  'status.checkDone.other': 'Check finished: {n} new articles. Their summaries will be ready within 15 minutes.',
  'status.checkDoneNothing': 'Check finished. Nothing new.',
  'status.failedChip.one': '1 source failed',
  'status.failedChip.other': '{n} sources failed',
  'status.failedAgain.one': "It's tried again on the next check.",
  'status.failedAgain.other': "They're tried again on the next check.",
  'status.attentionChip.one': '1 article needs attention',
  'status.attentionChip.other': '{n} articles need attention',
  'status.aiDown': "The AI isn't answering. New articles wait and are summarised when it's back.",
  'status.budgetWarn': "{pct} % of this month's AI budget is used ({spent} of {budget}).",
  'status.budgetOver': "This month's AI budget ({budget}) is used up. New articles from the sources are summarised again on {date}, or when an admin raises the budget in Settings. Links sent to the bot and summaries editors ask for are still made.",
  'status.budgetWaiting.one': '1 article is waiting.',
  'status.budgetWaiting.other': '{n} articles are waiting.',
  'status.aiRetry.one': "1 article is waiting because the AI didn't answer last time. It tries again every 15 minutes.",
  'status.aiRetry.other': "{n} articles are waiting because the AI didn't answer last time. It tries again every 15 minutes.",

  'view.picked': 'Picked',
  'view.later': 'Later',
  'view.dismissed': 'Not used',
  'view.used': 'Sent',
  'view.waiting': 'Waiting',
  'view.skipped': 'Skipped',
  'view.attention': 'Needs attention',
  'view.all': 'All',
  'note.picked': 'These are in the newsletter being prepared. The Newsletter page turns them into the email.',
  'note.later': 'Kept for later. They wait here until you add them to the newsletter or leave them out.',
  'note.dismissed': 'These are not used. The decision can be taken back.',
  'note.used': 'These were in a newsletter that has been sent.',
  'note.waiting': 'These are waiting for the AI. Summaries are made every 15 minutes.',
  'note.skipped': 'The filter kept these from the AI, so they cost nothing. Each one says why, and you can still ask for a summary.',
  'note.attention': "The AI step failed for these, or their source doesn't allow AI summaries. Read the original before using one.",

  'filter.sort': 'Order',
  'filter.clear': 'Clear filters',

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

  'results.none': 'No articles match these filters.',
  'results.empty.picked': 'Nothing has been picked for the newsletter yet.',
  'results.empty.later': 'Nothing is kept for later.',
  'results.empty.dismissed': 'Nothing has been left out.',
  'results.empty.used': 'Nothing has been sent yet.',
  'results.empty.waiting': 'Nothing is waiting for the AI.',
  'results.empty.skipped': "The filter hasn't skipped anything.",
  'results.empty.attention': 'Nothing needs attention.',
  'results.empty.all': 'Nothing has been collected yet. Press Check now to check the sources straight away.',
  'results.more': 'Show more',

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
  'item.alsoIn.one': 'Also in 1 other source',
  'item.alsoIn.other': 'Also in {n} other sources',
  'item.details': 'Details',

  'section.highlights': 'Highlights from the field',
  'section.events': 'Events',
  'section.own_news': 'News from the association',
  'section.member_news': 'Member news',
  'section.training': 'Learning Factory',
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
  'details.textRemoved': 'removed on {date}, when the retention period ended',
  'details.language': 'Language',
  'details.number': 'Article number',
  'details.copies': 'The same story elsewhere',
};

// The editor's, the newsletter pages', the articles page's and the sources'
// words live in files of their own, added here.
Object.assign(fi, editorFi, newsletterFi, articlesFi, sourcesFi);
Object.assign(en, editorEn, newsletterEn, articlesEn, sourcesEn);

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

// The browser tab's title: what is on screen first, then the app's name, so
// tabs, history and screen readers tell the pages apart.
export function pageTitle(...parts) {
  document.title = [...parts.filter(Boolean), t('app.title')].join(' · ');
}
