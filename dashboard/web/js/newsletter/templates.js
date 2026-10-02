// The templates an issue can start from, and how picked articles find their
// place in a design.
//
// They are grouped the way Mailchimp groups its template gallery. The first
// two are the association's own emails as it sends them today: the
// newsletter (Uutiskirje) from its Mailchimp, and the member letter
// (Jäsenkirje). The rest share their look: the banner on top, near-black text,
// teal links and buttons, pink boxes, the teal band of social links and the
// grey footer. Mailchimp's own templates are not copied: they are Mailchimp's
// designs, its terms forbid copying them, and the association cares about
// copyright. An issue can also start from a design an editor saved, or from
// an earlier issue.

import {
  emptyDesign, section, textBlock, headingBlock, dividerBlock, imageBlock, footerBlock, buttonBlock,
  columnsBlock, articleBlock, socialBlock, logoBlock, articleIds, withoutArticles, withNewIds,
  ARTICLE_SECTIONS, FOOTER_HTML, BLOCK_PADDING, COLUMN_SIDE_PADDING, readDesign,
} from './model.js';
import { escapeAttr, escapeText, fromText } from './richtext.js';
import { brand } from './brand.js';

export const SECTION_NAMES = {
  own_news: 'Ajankohtaista yhdistykseltä ja hankkeista',
  events: 'Tapahtumat',
  member_news: 'Jäsenkuulumisia',
  highlights: 'Nostoja kentältä',
};

// Text meant to be replaced. A block holding it is marked placeholder, which
// the checks count and the canvas tints, until someone edits it.
export const PLACEHOLDERS = {
  greeting: 'Kirjoita tähän muutama rivi lukijoille: mitä tässä kirjeessä on ja mitä toimistolla on meneillään.',
  tips: 'Kirjoita tähän vinkki: kirja, podcast, työkalu tai tapahtuma, jota suosittelette.',
  calendar: 'Lisää tähän tulevat päivämäärät ja tapahtumat, yksi riviä kohden.',
  intro: 'Kirjoita tähän johdanto.',
  body: 'Kirjoita tähän tekstiä.',
  letter: 'Kirjoita tähän kirjeen teksti: mitä yhdistyksessä on meneillään ja mitä se tarkoittaa jäsenille.',
  event: 'Kerro tähän lyhyesti, mistä tapahtumassa on kyse ja kenelle se sopii.',
  webinar: 'Kerro tähän, mitä webinaarissa käsitellään ja kenelle se on tarkoitettu.',
  training: 'Kerro tähän, mitä koulutuksessa opitaan ja kenelle se sopii.',
  courses: 'Kirjoita tähän johdanto: mitä koulutuksia on tarjolla ja kenelle ne sopivat.',
  survey: 'Kerro tähän, mistä kysely kertoo ja mihin vastauksia käytetään.',
  card: 'Kirjoita tähän tervehdys jäsenille.',
  join: 'Kerro tähän, miksi yhdistykseen kannattaa liittyä ja keitä jäseniksi toivotaan.',
  learningFactory: 'Kerro tähän ajankohtaisesta koulutuksesta: mitä siinä opitaan, kenelle se sopii ja milloin se alkaa.',
  trend: 'Kirjoita tähän, miksi aihe on nyt pinnalla ja mitä se tarkoittaa jäsenille.',
};

// Sample content in more than one paragraph, also replaced by the editors.
const SAMPLES = {
  eventInfo: '<p><strong>Aika:</strong> tiistai 12.11.2026 klo 13–16</p>'
    + '<p><strong>Paikka:</strong> kirjoita tähän osoite tai verkkotapahtuman nimi</p>'
    + '<p><strong>Hinta:</strong> maksuton jäsenille</p>',
  webinarInfo: '<p><strong>Aika:</strong> torstai 14.11.2026 klo 14–15</p>'
    + '<p><strong>Missä:</strong> verkossa, osallistumislinkki lähetetään ilmoittautuneille</p>',
  reminderInfo: '<p><strong>Alkaa:</strong> huomenna klo 14</p>'
    + '<p><strong>Missä:</strong> kirjoita tähän paikka tai osallistumislinkki</p>',
  trainingInfo: '<p><strong>Kesto:</strong> 3 × 2 tuntia</p>'
    + '<p><strong>Muoto:</strong> verkossa</p>'
    + '<p><strong>Alkaa:</strong> 20.1.2027</p>'
    + '<p><strong>Hinta:</strong> kirjoita tähän hinta jäsenille ja muille</p>',
  meetingInfo: '<p><strong>Aika:</strong> torstai 21.11.2026 klo 15</p>'
    + '<p><strong>Paikka:</strong> kirjoita tähän paikka</p>'
    + '<p><strong>Etäosallistuminen:</strong> linkki lähetetään ilmoittautuneille</p>',
  agenda: '<ul><li>13.00 Avaus</li><li>13.15 Ensimmäinen puheenvuoro</li><li>14.15 Tauko</li>'
    + '<li>14.30 Paneelikeskustelu</li><li>15.45 Yhteenveto ja lopetus</li></ul>',
  learn: '<ul><li>Ensimmäinen asia, jonka osallistuja oppii</li><li>Toinen asia</li><li>Kolmas asia</li></ul>',
  trainingContents: '<ul><li>Ensimmäinen kerta: aihe</li><li>Toinen kerta: aihe</li><li>Kolmas kerta: aihe</li></ul>',
  meetingAgenda: '<ol><li>Kokouksen avaus</li><li>Kokouksen järjestäytyminen</li>'
    + '<li>Kokouksen laillisuus ja päätösvaltaisuus</li><li>Esityslistan hyväksyminen</li>'
    + '<li>Sääntöjen määräämät asiat</li><li>Muut asiat</li><li>Kokouksen päättäminen</li></ol>',
  speaker: '<h3>Puhujan nimi</h3><p>Tehtävä ja organisaatio. Kirjoita tähän pari lausetta puhujasta.</p>',
  signature: '<p>Ystävällisin terveisin,</p><p><strong>Etunimi Sukunimi</strong><br>tehtävänimike, Suomen eOppimiskeskus ry</p>',
  course: '<h3>Koulutuksen nimi</h3><p>Lyhyt kuvaus: mitä opitaan, kesto ja muoto.</p>',
  card: '<h3>Otsikko</h3><p>Kirjoita tähän lyhyt kuvaus.</p>',
  quote: '<p><em>”Kirjoita tähän osallistujan palaute.”</em></p><p>Nimi, organisaatio</p>',
  mustRead: '<ul><li>Ensimmäinen nosto ja sen linkki</li><li>Toinen nosto</li><li>Kolmas nosto</li></ul>',
  archive: '<ul><li>Kokoa tähän aiempien jäsenkirjeiden tärkeimmät linkit.</li></ul>',
  benefits: [
    '<h3>Tapahtumat</h3><p>Seminaarit, webinaarit ja verkostotapaamiset.</p>',
    '<h3>Uutiskirje</h3><p>Alan uutiset, tapahtumat ja nostot sähköpostiisi.</p>',
    '<h3>Verkosto</h3><p>Muut digitaalisen oppimisen kehittäjät ja asiantuntijat.</p>',
  ],
  why: [
    '<h3>Vaikutat</h3><p>Tuot asiantuntemuksesi yhdistyksen yhteisiin lausuntoihin.</p>',
    '<h3>Verkostoidut</h3><p>Tapaat muita oppimisen kehittäjiä jäsenkahveilla ja tapahtumissa.</p>',
    '<h3>Saat etuja</h3><p>Pääset yhdistyksen tapahtumiin jäsenhinnalla.</p>',
  ],
};

// The association's colours, from the emails it sends.
const TEAL = '#104f55';        // links, buttons, the band of social links
const PINK = '#fcc0c5';        // the newsletter's boxes
const PINK_WASH = '#fde9eb';   // a lighter pink for boxes of facts
const GREEN = '#4e8f27';       // the "Liity jäseneksi" box
const BLUE = '#8bcbde';        // Learning Factory
const MAGENTA = '#e60a7f';     // the member letter's section bars
const BAR_GREEN = '#509726';   // the member letter's headlines
const BLACK = '#111111';       // the member letter's highlights and archive
const PAGE = '#f3f4f4';
const SOFT = '#6a7677';

// The association's own pages, as its newsletter links to them.
const LINKS = {
  membership: 'https://eoppimiskeskus.fi/jasenyys/',
  shop: 'https://www.learningfactory.fi/verkkokauppa/',
};
const SOCIAL = [
  { network: 'facebook', url: 'https://www.facebook.com/seoppi', label: 'Facebook' },
  { network: 'instagram', url: 'https://www.instagram.com/eoppimiskeskus/', label: 'Instagram' },
  { network: 'website', url: 'https://www.eoppimiskeskus.fi/', label: 'Verkkosivut' },
  { network: 'email', url: 'mailto:info@eoppimiskeskus.fi', label: 'Sähköposti' },
  { network: 'youtube', url: 'https://www.youtube.com/channel/UCGm2mwkq_Ca_yXHq6L3aAbg', label: 'YouTube' },
  { network: 'linkedin', url: 'https://www.linkedin.com/company/565075/', label: 'LinkedIn' },
];

const NAME = 'Suomen eOppimiskeskus ry';
// The same in the genitive: Suomen eOppimiskeskus ry:n hallitus.
const NAME_OF = 'Suomen eOppimiskeskus ry:n';

// The pink box the facts sit in, inset from the email's edges.
const BOX = { background: PINK_WASH, radius: 6, paddingTop: 18, paddingRight: 20, paddingBottom: 18, paddingLeft: 20, marginLeft: 36, marginRight: 36, marginBottom: 12 };
// A white card on a coloured section, as the newsletter's tips are.
const WHITE_CARD = { background: '#ffffff', radius: 10, paddingTop: 20, paddingRight: 22, paddingBottom: 20, paddingLeft: 22, marginLeft: 6, marginRight: 6, marginBottom: 12 };
// A light card for benefits on a white section.
const LIGHT_CARD = { background: PINK_WASH, radius: 8, paddingTop: 18, paddingRight: 18, paddingBottom: 18, paddingLeft: 18, marginLeft: 6, marginRight: 6, marginBottom: 12 };
// A picture across the whole width of the email.
const BLEED = { paddingTop: 0, paddingRight: 0, paddingBottom: 0, paddingLeft: 0 };
// The newsletter's coloured boxes: round corners and white space between.
const BOXED = { radius: 10, spaceAbove: 14 };

const placeholder = (text, extra = {}) => textBlock(fromText(text), { placeholder: true, ...extra });
const sample = (html, extra = {}) => textBlock(html, { placeholder: true, ...extra });

// ---------- pieces the templates share ----------

function title(issue) {
  return (issue && (issue.subject || issue.name)) || 'Uutiskirje';
}

// A block inside a column sits closer to the column's edges, as it does when
// an editor drops it there.
function inColumn(block) {
  const [, right, , left] = BLOCK_PADDING[block.type] || [0, 0, 0, 0];
  if (block.style.paddingLeft === undefined && left > COLUMN_SIDE_PADDING) block.style.paddingLeft = COLUMN_SIDE_PADDING;
  if (block.style.paddingRight === undefined && right > COLUMN_SIDE_PADDING) block.style.paddingRight = COLUMN_SIDE_PADDING;
  return block;
}

// A columns block filled with the given blocks, one list per column.
function columns(layout, ...lists) {
  const block = columnsBlock(layout);
  lists.forEach((blocks, i) => block.columns[i].blocks.push(...blocks.map(inColumn)));
  return block;
}

// Blocks on one white card inside a coloured section: a single column with
// a white background.
function whiteBox(blocks, inset = 12) {
  const block = columns('1', blocks);
  block.style = { columnBackground: '#ffffff', paddingTop: inset, paddingRight: inset, paddingBottom: inset, paddingLeft: inset };
  return block;
}

const picture = (extra = {}) => imageBlock({ size: 'fill', ...extra });
const sides = (n) => ({ paddingLeft: n, paddingRight: n });
const h2 = (text, extra = {}) => headingBlock(text, 2, { style: { paddingTop: 20, paddingBottom: 4 }, ...extra });

// The banner the association's emails start with: its logo and the name of
// the email, as one picture the editors upload once.
// The banner across the top. which, newsletter or members, starts it with
// that banner (newsletter/brand.js: the association's own, or the one an
// admin chose); without, it is a place for the editor to put a picture, the
// size the association's banners are.
function bannerSection(alt, which = null) {
  const banner = which ? brand(which) : null;
  return section('Banneri', 'header', [picture(banner
    ? { src: banner.src, alt, naturalWidth: banner.width, naturalHeight: banner.height, style: { ...BLEED } }
    : { alt, naturalWidth: 1128, naturalHeight: 222, style: { ...BLEED } })]);
}

// The association's logo, linked to its website.
function brandLogo(style) {
  const logo = brand('logo');
  return logoBlock({ src: logo.src, alt: NAME, link: { url: 'https://www.eoppimiskeskus.fi/', blank: true }, style });
}

// "Lue viesti selaimessasi", over the banner, as in the newsletter.
function browserLinkSection() {
  return section('Selainlinkki', 'browser', [
    textBlock('<p style="text-align:center"><span style="font-size:14px"><a href="*|ARCHIVE|*">Lue viesti selaimessasi</a></span></p>',
      { style: { paddingTop: 10, paddingBottom: 4 } }),
  ]);
}

// A small teal label and the title, under the banner.
function titleSection(label, heading) {
  return section('Otsikko', 'title', [
    textBlock(`<p><span style="color:${TEAL};font-size:13px;letter-spacing:2px"><strong>${escapeText(label)}</strong></span></p>`
      + `<h1>${escapeText(heading)}</h1>`, { style: { paddingTop: 26, paddingBottom: 4 } }),
  ]);
}

function brandTop(alt, label, heading) {
  return [bannerSection(alt), titleSection(label, heading)];
}

// A teal band with the title, kept as a ready-made section.
function bandHeader(label, heading) {
  return section('Ylätunniste', 'header', [
    textBlock(`<p><span style="color:${PINK};font-size:12px;letter-spacing:2px">${escapeText(label)}</span></p>`
      + `<h1>${escapeText(heading)}</h1>`, { style: { paddingTop: 30, paddingBottom: 26 } }),
  ], { contentBackground: TEAL, textColor: '#ffffff', linkColor: PINK });
}

// White, with the association's name over the title and a teal line under it.
function plainHeader(label, heading) {
  return section('Ylätunniste', 'header', [
    textBlock(`<p><span style="color:${SOFT};font-size:13px">${escapeText(label)}</span></p><h1>${escapeText(heading)}</h1>`,
      { style: { paddingTop: 32, paddingBottom: 8 } }),
    dividerBlock({ style: { color: TEAL, thickness: 2, paddingTop: 8, paddingBottom: 8 } }),
  ]);
}

// The association's logo over the title.
function logoHeader(heading) {
  return section('Ylätunniste', 'header', [
    brandLogo({ paddingTop: 24, paddingBottom: 8 }),
    textBlock(`<h1>${escapeText(heading)}</h1>`, { style: { paddingTop: 8 } }),
  ]);
}

function heroSection() {
  return section('Pääkuva', 'hero', [picture({ style: { ...BLEED } })]);
}

function factsSection(name, html) {
  return section(name, 'facts', [sample(html, { style: { ...BOX, marginTop: 4 } })]);
}

function headedSection(name, role, blocks, style = {}) {
  return section(name, role, [h2(name), ...blocks], style);
}

function speakersSection(name, count) {
  const one = () => [picture({ style: { radius: 6 } }), sample(SAMPLES.speaker)];
  const people = count === 1
    ? columns('1:2', [picture({ style: { radius: 6 } })], [sample(SAMPLES.speaker)])
    : columns('1:1', one(), one());
  return headedSection(name, 'speakers', [people]);
}

// A big button in the middle, and a line of small print under it.
function actionSection(name, label, url, note, style = {}) {
  return section(name, 'cta', [
    buttonBlock(label, url, { look: { align: 'center', size: 'large' }, style: { paddingTop: 24, paddingBottom: note ? 8 : 24 } }),
    note ? textBlock(`<p style="text-align:center"><span style="font-size:15px">${escapeText(note)}</span></p>`, { style: { paddingTop: 4, paddingBottom: 22 } }) : null,
  ].filter(Boolean), style);
}

function signatureSection() {
  return section('Allekirjoitus', 'signature', [
    columns('1:3', [picture({ style: { radius: 6 } })], [sample(SAMPLES.signature)]),
  ], { paddingTop: 8, paddingBottom: 16 });
}

function quoteSection() {
  return section('Palaute', 'quote', [sample(SAMPLES.quote, { style: { ...BOX, marginTop: 12, marginBottom: 12 } })]);
}

function gallerySection(name, count = 3) {
  const layout = count === 2 ? '1:1' : '1:1:1';
  return headedSection(name, 'gallery', [
    columns(layout, ...Array.from({ length: count }, () => [picture()])),
  ]);
}

// The newsletter's tips: two white cards in a pink box.
function tipsSection() {
  const tip = (label) => sample(`<h4>${label}</h4><h3>Otsikko</h3><p><em>${escapeText(PLACEHOLDERS.tips)}</em></p>`, { style: { ...WHITE_CARD } });
  const cards = columns('1:1', [tip('KIRJAVINKKI')], [tip('PEDAGOGIIKKAVINKKI')]);
  cards.style = { ...sides(12) };
  return section('Vinkkinurkka', 'tips', [h2('Vinkkinurkka', { style: { paddingTop: 20, paddingBottom: 6 } }), cards],
    { contentBackground: PINK, ...BOXED, paddingBottom: 8 });
}

// Learning Factory, the association's training: a white card in a blue box.
function learningFactorySection() {
  return section('Learning Factory', 'training', [whiteBox([
    h2('Learning Factory – Kehitä osaamistasi', { style: { paddingTop: 20, paddingBottom: 4, ...sides(22) } }),
    picture({ naturalWidth: 1136, naturalHeight: 568, style: { radius: 4, ...sides(22) } }),
    sample(`<p><em>${escapeText(PLACEHOLDERS.learningFactory)}</em></p>`, { style: { ...sides(22) } }),
    textBlock(`<p><a href="${LINKS.shop}">Tutustu Learning Factoryn koko koulutustarjontaan</a></p>`, { style: { paddingBottom: 20, ...sides(22) } }),
  ])], { contentBackground: BLUE, ...BOXED });
}

// The way to join the association, at the end of every newsletter: a white
// card in a green box, linking to the membership page on its website.
function joinSection() {
  const card = columns('1:2',
    [picture({ alt: 'Liity nyt jäseneksi!', naturalWidth: 400, naturalHeight: 400, link: { url: LINKS.membership, blank: true }, style: { paddingTop: 18, paddingBottom: 18, ...sides(18) } })],
    [textBlock(`<p><a href="${LINKS.membership}"><strong>Liity jäseneksi</strong></a> ja tule mukaan rakentamaan rohkeampaa oppimisen tulevaisuutta.</p>`, { style: { paddingTop: 22, ...sides(18) } }),
      buttonBlock('Liity jäseneksi', LINKS.membership, { look: { size: 'small' }, style: { paddingBottom: 22, ...sides(18) } })]);
  card.valign = 'middle';
  card.style = { columnBackground: '#ffffff', paddingTop: 12, paddingRight: 12, paddingBottom: 12, paddingLeft: 12 };
  return section('Liity jäseneksi', 'join', [card], { contentBackground: GREEN, ...BOXED });
}

// For someone who was forwarded the email: Mailchimp's own sign-up form.
function subscribeSection() {
  return section('Tilaa uutiskirje', 'subscribe', [
    textBlock('<h3 style="text-align:center">Saitko tämän kirjeen edelleenlähetettynä?</h3>'
      + '<p style="text-align:center">Tilaa oma uutiskirjeesi, niin saat seuraavan suoraan sähköpostiisi.</p>', { style: { paddingTop: 22 } }),
    buttonBlock('Tilaa uutiskirje', '*|LIST:SUBSCRIBE|*', { look: { align: 'center' }, style: { paddingBottom: 22 } }),
  ], { contentBackground: PINK_WASH, ...BOXED });
}

function aboutSection() {
  return section('Tietoa yhdistyksestä', 'about', [
    textBlock(`<p><span style="font-size:15px"><em><strong>${NAME}</strong> kokoaa yhteen ihmiset ja organisaatiot, jotka haluavat ymmärtää, `
      + 'ennakoida ja rakentaa oppimisen tulevaisuutta muuttuvassa maailmassa.</em></span></p>', { style: { paddingTop: 22, paddingBottom: 18 } }),
  ], { spaceAbove: 14 });
}

// The association's channels as white icons on teal.
function socialBand() {
  const links = socialBlock(SOCIAL.map((s) => ({ ...s })));
  links.iconStyle = 'light';
  links.style = { align: 'center', paddingTop: 14, paddingBottom: 14 };
  return section('Somekanavat', 'social', [links], { contentBackground: TEAL });
}

const FOOTER_BRAND = `<p style="text-align:center"><span style="font-size:14px"><em>${NAME}</em><br>*|LIST:ADDRESSLINE|*</span></p>`
  + '<p style="text-align:center"><span style="font-size:14px">Voit <a href="*|UPDATE_PROFILE|*">muokata uutiskirjetilauksen asetuksia</a> '
  + 'tai <a href="*|UNSUB|*">peruuttaa tilauksen</a>.</span></p>'
  + '<p style="text-align:center"><span style="font-size:14px">Saitko tämän edelleenlähetettynä? <a href="*|LIST:SUBSCRIBE|*">Tilaa uutiskirje</a>.</span></p>';

// The newsletter's footer, on grey.
function greyFooter() {
  return section('Alatunniste', 'footer', [footerBlock(FOOTER_BRAND, { style: { paddingTop: 22, paddingBottom: 24 } })],
    { contentBackground: PAGE });
}

function tealFooter() {
  return section('Alatunniste', 'footer', [footerBlock(FOOTER_HTML)],
    { contentBackground: TEAL, textColor: '#ffffff', linkColor: PINK, paddingTop: 4, paddingBottom: 4 });
}

function socialFooter() {
  return section('Alatunniste', 'footer', [socialBlock(), footerBlock(FOOTER_HTML, { style: { paddingTop: 8 } })],
    { textColor: SOFT });
}

function plainFooter(html = FOOTER_HTML) {
  return section('Alatunniste', 'footer', [
    dividerBlock({ style: { paddingTop: 16, paddingBottom: 0 } }),
    footerBlock(html, { style: { paddingTop: 16 } }),
  ], { textColor: SOFT });
}

// The member letter goes to members, so its footer does not offer the
// public newsletter's sign-up.
const MEMBERS_FOOTER = FOOTER_HTML.split('<p>Saitko')[0];

// A bar across the email with a section's name, as the member letter has.
function sectionBar(text, colour, ink = '#ffffff', align = 'center') {
  return textBlock(`<h2${align === 'center' ? ' style="text-align:center"' : ''}><span style="color:${ink}">${escapeText(text)}</span></h2>`,
    { style: { background: colour, paddingTop: 16, paddingBottom: 6 } });
}

// ---------- article sections, as each family of templates shows them ----------

// Where the member letter's list of contents jumps to.
const ANCHORS = { own_news: 'ajankohtaista', events: 'tapahtumat', member_news: 'jasenkuulumisia', highlights: 'nostoja' };

const FAMILIES = {
  // The newsletter: its own news with large titles and a picture on the
  // right, everything else as white cards in pink boxes.
  eok: (key, name) => (key === 'own_news'
    ? section(name, key, [], { articleLook: 'large', articleLayout: 'image-right', paddingTop: 8, paddingBottom: 8 })
    : section(name, key, [h2(name, { style: { paddingTop: 20, paddingBottom: 6 } })], {
      contentBackground: PINK, ...BOXED, paddingBottom: 8, articleLook: 'card', ...(key === 'events' ? { articleLayout: 'image-top' } : {}),
    })),
  // The member letter: a magenta bar for each section, each headline in a
  // green bar, black for the highlights from the field.
  jasenkirje: (key, name) => section(name, key, [sectionBar(name, MAGENTA)], {
    anchor: ANCHORS[key], spaceAbove: 12, paddingBottom: 8, articleLook: 'bar', articleColour: key === 'highlights' ? BLACK : BAR_GREEN,
  }),
  simple: (key, name) => section(name, key, [
    headingBlock(name, 2, { style: { paddingTop: 20, paddingBottom: 4 } }),
    dividerBlock({ style: { paddingTop: 4, paddingBottom: 12 } }),
  ]),
  visual: (key, name) => section(name, key, [headingBlock(name.toUpperCase(), 4, { style: { paddingTop: 24, paddingBottom: 12 } })]),
  blank: (key, name) => section(name, key, [headingBlock(name, 2)]),
};

function articleSection(design, key) {
  const meta = design.meta || {};
  const make = FAMILIES[meta.headings || meta.template] || FAMILIES.eok;
  return make(key, SECTION_NAMES[key]);
}

function start(key, family, change) {
  const d = emptyDesign();
  d.meta = { template: key, headings: family };
  if (change) change(d.styles);
  return d;
}

// ---------- the templates ----------

export const TEMPLATE_GROUPS = ['newsletters', 'events', 'announcements', 'membership', 'training', 'greetings', 'layouts'];

const BUILT_IN = [
  // ----- newsletters -----
  {
    // The newsletter the association sends from Mailchimp today.
    key: 'eok',
    group: 'newsletters',
    build() {
      const d = start('eok', 'eok');
      d.sections.push(
        browserLinkSection(),
        bannerSection(`${NAME} – Uutiskirje`, 'newsletter'),
        section('Tervehdys', 'greeting', [
          textBlock(`<p>Tervehdys täältä ${NAME_OF} toimistolta!</p>${fromText(PLACEHOLDERS.greeting)}`, { placeholder: true, style: { paddingTop: 26 } }),
        ]),
        ...ARTICLE_SECTIONS.map((key) => articleSection(d, key)),
        tipsSection(),
        learningFactorySection(),
        joinSection(),
        aboutSection(),
        socialBand(),
        greyFooter(),
      );
      return d;
    },
  },
  {
    // The member letter: a list of contents, a big picture, the picks to
    // read first, and each section under a magenta bar.
    key: 'jasenkirje',
    group: 'newsletters',
    build() {
      const d = start('jasenkirje', 'jasenkirje');
      const contents = ARTICLE_SECTIONS.map((k) => `<a href="#${ANCHORS[k]}">${escapeText(SECTION_NAMES[k])}</a>`)
        .concat('<a href="#learning-factory">Learning Factory</a>', '<a href="#arkisto">Arkisto</a>').join(' | ');
      d.sections.push(
        bannerSection(`${NAME} – Jäsenkirje`, 'members'),
        section('Sisällys', 'contents', [textBlock(`<p><strong>${contents}</strong></p>`, { style: { paddingTop: 18, paddingBottom: 10 } })],
          { linkColor: MAGENTA }),
        section('Tervehdys', 'greeting', [
          textBlock(`<p>Mukavaa viikon alkua!</p>${fromText(PLACEHOLDERS.greeting)}`, { placeholder: true, style: { paddingTop: 20 } }),
        ], { spaceAbove: 12 }),
        section('Pääkuva', 'hero', [picture({ style: { ...BLEED } })], { spaceAbove: 12 }),
        section('Tutustu ainakin näihin', 'picks', [
          sectionBar('Tutustu ainakin näihin', PINK, BLACK, 'left'),
          sample(SAMPLES.mustRead, { style: { paddingTop: 16, paddingBottom: 16 } }),
        ], { spaceAbove: 12 }),
        ...ARTICLE_SECTIONS.map((key) => articleSection(d, key)),
        section('Learning Factory', 'training', [
          sectionBar('Poimintoja Learning Factorysta', BLUE, BLACK),
          placeholder(PLACEHOLDERS.learningFactory, { style: { paddingTop: 18 } }),
          buttonBlock('Tutustu koulutustarjontaan', LINKS.shop, { style: { paddingBottom: 20 } }),
        ], { anchor: 'learning-factory', spaceAbove: 12 }),
        section('Arkisto', 'archive', [
          sectionBar('Arkisto', BLACK, '#ffffff', 'left'),
          sample(SAMPLES.archive, { style: { paddingTop: 16, paddingBottom: 16 } }),
        ], { anchor: 'arkisto', spaceAbove: 12 }),
        plainFooter(MEMBERS_FOOTER),
      );
      return d;
    },
  },
  {
    key: 'simple',
    group: 'newsletters',
    build(issue) {
      const d = start('simple', 'simple', (s) => {
        s.background.page = '#ffffff';
        s.button.shape = 'square';
      });
      d.sections.push(
        plainHeader(NAME, title(issue)),
        section('Tervehdys', 'greeting', [placeholder(PLACEHOLDERS.greeting, { style: { paddingTop: 16 } })]),
        ...ARTICLE_SECTIONS.map((key) => articleSection(d, key)),
        plainFooter(),
      );
      return d;
    },
  },
  {
    key: 'visual',
    group: 'newsletters',
    build(issue) {
      const d = start('visual', 'visual', (s) => {
        s.background.page = '#eef2f2';
        s.button.shape = 'pill';
      });
      d.sections.push(
        section('Ylätunniste', 'header', [brandLogo({ paddingTop: 20, paddingBottom: 20 })], { contentBackground: '#ffffff' }),
        section('Pääkuva', 'hero', [
          picture({ style: { ...BLEED } }),
          textBlock(`<h1>${escapeText(title(issue))}</h1>`, { style: { paddingTop: 24 } }),
          placeholder(PLACEHOLDERS.greeting),
        ]),
        section('Esittely', 'intro', [columns('1:2', [picture()], [placeholder(PLACEHOLDERS.intro)])], { paddingTop: 12, paddingBottom: 12 }),
        ...ARTICLE_SECTIONS.map((key) => articleSection(d, key)),
        section('Alatunniste', 'footer', [
          socialBlock(),
          footerBlock(FOOTER_HTML, { style: { paddingTop: 8 } }),
        ], { contentBackground: TEAL, textColor: '#ffffff', linkColor: PINK, paddingTop: 12, paddingBottom: 12 }),
      );
      return d;
    },
  },
  {
    // A letter from the chair or the office, signed.
    key: 'letter',
    group: 'newsletters',
    build(issue) {
      const d = start('letter', 'simple', (s) => {
        s.text.h1.font = 'georgia';
        s.text.h2.font = 'georgia';
      });
      d.sections.push(
        ...brandTop(NAME, 'KIRJE JÄSENILLE', title(issue)),
        section('Kirje', 'letter', [
          textBlock('<p>Hyvä jäsen,</p>', { style: { paddingTop: 16, paddingBottom: 4 } }),
          placeholder(PLACEHOLDERS.letter),
        ]),
        signatureSection(),
        socialBand(),
        greyFooter(),
      );
      return d;
    },
  },

  // ----- events -----
  {
    key: 'event',
    group: 'events',
    build(issue) {
      const d = start('event', 'simple');
      d.sections.push(
        ...brandTop(NAME, 'TAPAHTUMAKUTSU', title(issue)),
        heroSection(),
        section('Esittely', 'intro', [placeholder(PLACEHOLDERS.event, { style: { paddingTop: 22 } })]),
        factsSection('Tapahtuman tiedot', SAMPLES.eventInfo),
        headedSection('Ohjelma', 'agenda', [sample(SAMPLES.agenda)]),
        speakersSection('Puhujat', 2),
        actionSection('Ilmoittautuminen', 'Ilmoittaudu mukaan', '', 'Ilmoittautuminen päättyy viikkoa ennen tapahtumaa.', { contentBackground: PINK, ...BOXED }),
        socialBand(),
        greyFooter(),
      );
      return d;
    },
  },
  {
    key: 'webinar',
    group: 'events',
    build(issue) {
      const d = start('webinar', 'simple');
      d.sections.push(
        ...brandTop(NAME, 'WEBINAARI', title(issue)),
        factsSection('Ajankohta', SAMPLES.webinarInfo),
        section('Esittely', 'intro', [placeholder(PLACEHOLDERS.webinar)]),
        headedSection('Mitä opit', 'learn', [sample(SAMPLES.learn)]),
        speakersSection('Puhuja', 1),
        actionSection('Ilmoittautuminen', 'Ilmoittaudu webinaariin', '', 'Tallenne lähetetään kaikille ilmoittautuneille.', { contentBackground: PINK, ...BOXED }),
        socialBand(),
        greyFooter(),
      );
      return d;
    },
  },
  {
    key: 'reminder',
    group: 'events',
    build(issue) {
      const d = start('reminder', 'simple');
      d.sections.push(
        ...brandTop(NAME, 'MUISTUTUS', title(issue)),
        section('Muistutus', 'intro', [
          textBlock('<h2>Tapahtuma alkaa pian</h2><p>Liity mukaan alla olevasta painikkeesta muutama minuutti ennen alkua.</p>', { style: { paddingTop: 16 } }),
          sample(SAMPLES.reminderInfo, { style: { ...BOX } }),
          buttonBlock('Liity mukaan', '', { look: { size: 'large' }, style: { paddingBottom: 20 } }),
          textBlock('<p>Jos et pääse mukaan, kerro siitä vastaamalla tähän viestiin.</p>', { style: { paddingBottom: 20 } }),
        ]),
        greyFooter(),
      );
      return d;
    },
  },
  {
    key: 'thanks',
    group: 'events',
    build() {
      const d = start('thanks', 'simple');
      d.sections.push(
        ...brandTop(NAME, 'KIITOS', 'Kiitos, että olit mukana!'),
        section('Kiitos', 'intro', [
          textBlock('<p>Toivottavasti sait tapahtumasta uusia ajatuksia ja ideoita omaan työhösi.</p>', { style: { paddingTop: 16 } }),
        ]),
        headedSection('Tallenne ja materiaalit', 'materials', [
          textBlock('<p>Tallenne ja esitysmateriaalit ovat nyt saatavilla.</p>'),
          columns('1:1',
            [buttonBlock('Katso tallenne', '', { look: { fullWidth: true } })],
            [buttonBlock('Lataa materiaalit', '', { look: { fullWidth: true } })]),
        ]),
        gallerySection('Tunnelmia tapahtumasta'),
        section('Palaute', 'feedback', [
          textBlock('<h3>Kerro mielipiteesi</h3><p>Vastaa lyhyeen palautekyselyyn. Palautteesi auttaa meitä kehittämään tapahtumia.</p>', { style: { paddingTop: 22 } }),
          buttonBlock('Anna palautetta', '', { style: { paddingBottom: 24 } }),
        ], { contentBackground: PINK, ...BOXED }),
        socialBand(),
        greyFooter(),
      );
      return d;
    },
  },

  // ----- announcements and surveys -----
  {
    key: 'announce',
    group: 'announcements',
    build(issue) {
      const d = start('announce', 'simple', (s) => { s.button.shape = 'square'; });
      d.sections.push(
        ...brandTop(NAME, 'TIEDOTE', title(issue)),
        heroSection(),
        section('Tiedote', 'intro', [
          placeholder(PLACEHOLDERS.body, { style: { paddingTop: 22 } }),
          buttonBlock('Lue lisää', '', { style: { paddingBottom: 24 } }),
        ]),
        socialBand(),
        greyFooter(),
      );
      return d;
    },
  },
  {
    key: 'meeting',
    group: 'announcements',
    build(issue) {
      const d = start('meeting', 'simple', (s) => { s.button.shape = 'square'; });
      d.sections.push(
        ...brandTop(NAME, 'KOKOUSKUTSU', title(issue)),
        section('Kutsu', 'intro', [
          sample('<p>Yhdistyksen jäsenet kutsutaan sääntömääräiseen kokoukseen.</p>', { style: { paddingTop: 16 } }),
        ]),
        factsSection('Kokouksen tiedot', SAMPLES.meetingInfo),
        headedSection('Esityslista', 'agenda', [sample(SAMPLES.meetingAgenda)]),
        section('Ilmoittautuminen', 'cta', [
          sample('<p>Ilmoittaudu viimeistään viikkoa ennen kokousta. Kokousasiakirjat lähetetään ilmoittautuneille.</p>'),
          buttonBlock('Ilmoittaudu kokoukseen', '', { style: { paddingBottom: 16 } }),
        ]),
        section('Allekirjoitus', 'signature', [
          textBlock(`<p>Tervetuloa!</p><p><strong>${NAME_OF} hallitus</strong></p>`, { style: { paddingBottom: 20 } }),
        ]),
        greyFooter(),
      );
      return d;
    },
  },
  {
    key: 'survey',
    group: 'announcements',
    build(issue) {
      const d = start('survey', 'simple');
      d.sections.push(
        ...brandTop(NAME, 'KYSELY', title(issue)),
        section('Kysely', 'intro', [
          textBlock('<h2>Mitä mieltä olet?</h2>', { style: { paddingTop: 16 } }),
          placeholder(PLACEHOLDERS.survey),
          sample('<p><strong>Vastaaminen vie noin 5 minuuttia.</strong></p>'),
        ]),
        actionSection('Vastaa', 'Vastaa kyselyyn', '', 'Kiitos jo etukäteen!', { contentBackground: PINK, ...BOXED }),
        greyFooter(),
      );
      return d;
    },
  },

  // ----- membership -----
  {
    // Asking people to join. The association's own sign-up is the
    // membership page on its website, so the email links there.
    key: 'join',
    group: 'membership',
    build() {
      const d = start('join', 'simple');
      d.sections.push(
        bannerSection(NAME),
        section('Kutsu', 'intro', [
          textBlock('<h1>Liity jäseneksi!</h1><p>Tule mukaan rakentamaan rohkeampaa oppimisen tulevaisuutta.</p>', { style: { paddingTop: 28 } }),
          placeholder(PLACEHOLDERS.join),
        ]),
        headedSection('Jäsenenä', 'features', [
          columns('1:1:1', ...SAMPLES.why.map((html) => [sample(html, { style: { ...LIGHT_CARD } })])),
        ]),
        actionSection('Liity', 'Liity jäseneksi', LINKS.membership, 'Jäsenyydestä ja jäsenmaksuista kerrotaan yhdistyksen verkkosivuilla.', { contentBackground: PINK, ...BOXED }),
        aboutSection(),
        socialBand(),
        greyFooter(),
      );
      return d;
    },
  },
  {
    key: 'welcome',
    group: 'membership',
    build() {
      const d = start('welcome', 'simple');
      d.sections.push(
        ...brandTop(NAME, 'TERVETULOA', 'Tervetuloa jäseneksi!'),
        section('Tervehdys', 'intro', [
          textBlock(`<p>Kiitos, että liityit ${NAME_OF} jäseneksi. Olemme iloisia, että olet mukana!</p>`, { style: { paddingTop: 16 } }),
        ]),
        headedSection('Jäsenenä saat', 'features', [
          columns('1:1:1', ...SAMPLES.benefits.map((html) => [sample(html, { style: { ...LIGHT_CARD } })])),
        ]),
        headedSection('Näin pääset alkuun', 'start', [
          textBlock('<ul><li>Tutustu tuleviin tapahtumiin verkkosivuillamme</li><li>Seuraa meitä somessa</li>'
            + '<li>Vastaa tähän viestiin, jos sinulla on kysyttävää</li></ul>'),
        ]),
        signatureSection(),
        socialBand(),
        greyFooter(),
      );
      return d;
    },
  },

  // ----- training -----
  {
    // The training on offer: three courses side by side.
    key: 'course',
    group: 'training',
    build(issue) {
      const d = start('course', 'simple', (s) => { s.button.shape = 'pill'; });
      const offer = () => [picture({ style: { radius: 6 } }), sample(SAMPLES.course),
        buttonBlock('Lue lisää', '', { look: { size: 'small' }, style: { paddingBottom: 16 } })];
      d.sections.push(
        ...brandTop(`${NAME} – Learning Factory`, 'KOULUTUKSET', title(issue)),
        section('Esittely', 'intro', [placeholder(PLACEHOLDERS.courses, { style: { paddingTop: 16 } })]),
        section('Koulutukset', 'features', [columns('1:1:1', offer(), offer(), offer())], { paddingTop: 4, paddingBottom: 8 }),
        quoteSection(),
        actionSection('Kaikki koulutukset', 'Katso kaikki koulutukset', LINKS.shop, '', { contentBackground: BLUE, ...BOXED }),
        socialBand(),
        greyFooter(),
      );
      return d;
    },
  },
  {
    // One course in detail.
    key: 'training',
    group: 'training',
    build(issue) {
      const d = start('training', 'simple', (s) => { s.button.shape = 'pill'; });
      d.sections.push(
        ...brandTop(`${NAME} – Learning Factory`, 'KOULUTUS', title(issue)),
        heroSection(),
        section('Esittely', 'intro', [placeholder(PLACEHOLDERS.training, { style: { paddingTop: 22 } })]),
        factsSection('Koulutuksen tiedot', SAMPLES.trainingInfo),
        headedSection('Sisältö', 'agenda', [sample(SAMPLES.trainingContents)]),
        speakersSection('Kouluttaja', 1),
        actionSection('Ilmoittautuminen', 'Ilmoittaudu koulutukseen', '', '', { contentBackground: BLUE, ...BOXED }),
        socialBand(),
        greyFooter(),
      );
      return d;
    },
  },

  // ----- greetings -----
  {
    // A holiday card: one picture and a few warm words, centred.
    key: 'greeting',
    group: 'greetings',
    build() {
      const d = start('greeting', 'simple', (s) => {
        s.background.page = PINK_WASH;
        s.text.h1.font = 'georgia';
        for (const tag of ['p', 'h1', 'h2', 'h3']) s.text[tag].align = 'center';
      });
      d.sections.push(
        heroSection(),
        section('Tervehdys', 'intro', [
          textBlock('<h1>Hyvää joulua ja onnellista uutta vuotta!</h1>', { style: { paddingTop: 32 } }),
          placeholder(PLACEHOLDERS.card),
          textBlock(`<p><strong>${NAME}</strong></p>`, { style: { paddingBottom: 28 } }),
        ]),
        section('Alatunniste', 'footer', [footerBlock(FOOTER_HTML)], { textColor: SOFT, contentBackground: PINK_WASH }),
      );
      return d;
    },
  },

  // ----- basic layouts -----
  {
    key: 'onecol',
    group: 'layouts',
    build(issue) {
      const d = start('onecol', 'simple');
      d.sections.push(
        logoHeader(title(issue)),
        section('Sisältö', 'content', [
          picture(),
          sample(`<h2>Otsikko</h2>${fromText(PLACEHOLDERS.body)}`),
          buttonBlock('Lue lisää'),
          dividerBlock(),
          sample(`<h2>Otsikko</h2>${fromText(PLACEHOLDERS.body)}`),
        ], { paddingBottom: 16 }),
        socialFooter(),
      );
      return d;
    },
  },
  {
    key: 'twocol',
    group: 'layouts',
    build(issue) {
      const d = start('twocol', 'simple');
      const card = () => [picture({ style: { radius: 4 } }), sample(SAMPLES.card),
        buttonBlock('Lue lisää', '', { look: { size: 'small' }, style: { paddingBottom: 16 } })];
      d.sections.push(
        logoHeader(title(issue)),
        section('Johdanto', 'intro', [placeholder(PLACEHOLDERS.intro)]),
        section('Kaksi saraketta', 'features', [columns('1:1', card(), card()), columns('1:1', card(), card())], { paddingBottom: 12 }),
        socialFooter(),
      );
      return d;
    },
  },
  {
    key: 'threecol',
    group: 'layouts',
    build(issue) {
      const d = start('threecol', 'simple');
      const card = () => [picture({ style: { radius: 4 } }), sample(SAMPLES.card)];
      d.sections.push(
        logoHeader(title(issue)),
        section('Johdanto', 'intro', [placeholder(PLACEHOLDERS.intro)]),
        section('Kolme saraketta', 'features', [columns('1:1:1', card(), card(), card())], { paddingBottom: 12 }),
        socialFooter(),
      );
      return d;
    },
  },
  {
    key: 'zigzag',
    group: 'layouts',
    build(issue) {
      const d = start('zigzag', 'simple');
      const text = () => [sample(SAMPLES.card), buttonBlock('Lue lisää', '', { look: { size: 'small' } })];
      const row = (imageLeft) => {
        const image = [picture({ style: { radius: 4 } })];
        const block = imageLeft ? columns('1:1', image, text()) : columns('1:1', text(), image);
        block.valign = 'middle';
        // A picture on the right still goes above its text on a phone.
        if (!imageLeft) block.mobile = 'reverse';
        return block;
      };
      d.sections.push(
        logoHeader(title(issue)),
        section('Johdanto', 'intro', [placeholder(PLACEHOLDERS.intro)]),
        section('Kuvat ja tekstit', 'features', [row(true), row(false), row(true)], { paddingBottom: 12 }),
        socialFooter(),
      );
      return d;
    },
  },
  {
    // Like an ordinary email: no colours, no pictures.
    key: 'plain',
    group: 'layouts',
    build() {
      const d = start('plain', 'simple', (s) => {
        s.background.page = '#ffffff';
        s.background.margin = 8;
      });
      d.sections.push(
        section('Teksti', 'letter', [
          textBlock('<p>Hei,</p>', { style: { paddingTop: 24, paddingBottom: 4 } }),
          placeholder(PLACEHOLDERS.body),
          sample(SAMPLES.signature, { style: { paddingBottom: 20 } }),
        ]),
        plainFooter(),
      );
      return d;
    },
  },
  {
    key: 'blank',
    group: 'layouts',
    build(issue) {
      const d = start('blank', 'blank');
      d.sections.push(
        section('Ylätunniste', 'header', [textBlock(`<h1>${escapeText(title(issue))}</h1>`, { style: { paddingTop: 28 } })]),
        section('Sisältö', 'body', []),
        section('Alatunniste', 'footer', [footerBlock(FOOTER_HTML)], { textColor: SOFT }),
      );
      return d;
    },
  },
];

export function builtInTemplates() {
  return BUILT_IN.map((t) => t.key);
}

// The templates by group, in the order the chooser shows them.
export function builtInGroups() {
  return TEMPLATE_GROUPS.map((group) => ({ group, keys: BUILT_IN.filter((t) => t.group === group).map((t) => t.key) }));
}

export function buildTemplate(key, issue) {
  const found = BUILT_IN.find((t) => t.key === key) || BUILT_IN[0];
  return found.build(issue);
}

// ---------- articles ----------

// The sections that come after the article sections, so a section added for
// a new pick goes before them.
const AFTER_ARTICLES = ['tips', 'calendar', 'training', 'join', 'subscribe', 'about', 'signature', 'archive', 'social', 'footer'];

function insertAt(design, key) {
  const later = ARTICLE_SECTIONS.slice(ARTICLE_SECTIONS.indexOf(key) + 1);
  const anchor = design.sections.findIndex((s) => later.includes(s.role) || AFTER_ARTICLES.includes(s.role));
  return anchor < 0 ? design.sections.length : anchor;
}

// The design's section for one kind of article, made in the design's own
// style and put in its place if the design has none yet.
export function ensureArticleSection(design, key) {
  let target = design.sections.find((s) => s.role === key);
  if (!target) {
    target = articleSection(design, key);
    design.sections.splice(insertAt(design, key), 0, target);
  }
  return target;
}

// Puts each picked article not yet in the design at the end of its section,
// making the section if the design has none, in the layout the section gives
// new articles. Returns the blocks added.
export function placeArticles(design, articles) {
  const present = articleIds(design);
  const added = [];
  for (const article of articles) {
    if (present.has(Number(article.id))) continue;
    const key = ARTICLE_SECTIONS.includes(article.section) ? article.section : 'highlights';
    const target = design.sections.find((s) => s.role === key)
      || design.sections.find((s) => s.role === 'body')
      || ensureArticleSection(design, key);
    const block = articleBlock(article, key);
    if (target.style && target.style.articleLayout) block.layout = target.style.articleLayout;
    let last = -1;
    target.blocks.forEach((b, i) => { if (b.type === 'article') last = i; });
    target.blocks.splice(last >= 0 ? last + 1 : target.blocks.length, 0, block);
    present.add(Number(article.id));
    added.push(block);
  }
  return added;
}

// A design to start an issue from: a template's, a saved one, or an earlier
// issue's, always without the articles it had, then with this issue's.
export function startDesign(source, issue, articles) {
  let design = null;
  if (source && source.kind === 'design') {
    const stored = readDesign(source.design);
    if (stored) {
      design = withoutArticles(stored);
      design.sections = design.sections.map((s) => withNewIds(s));
    }
  }
  if (!design) design = buildTemplate(source && source.key, issue);
  placeArticles(design, articles || []);
  return design;
}

// ---------- trends ----------

// A topic the signal detection found coming up again and again
// (n8n/workflows/signal-detection.json), as a box for Nostoja kentältä: the
// topic, how often the sources wrote about it, and a few of those articles.
// Why it matters is for the editors to write, so the box starts as sample
// text the checks count until someone does: the AI's reason for a signal
// describes one article, not the trend.
// Jira: DM42-40
const TREND_ARTICLES = 3;
const TREND_CARD = { background: '#ffffff', radius: 10, paddingTop: 22, paddingRight: 24, paddingBottom: 22, paddingLeft: 24, marginRight: 24, marginBottom: 14, marginLeft: 24 };

export function trendTopic(signal) {
  const topic = String(signal.topic || '').trim();
  return topic.charAt(0).toUpperCase() + topic.slice(1);
}

function trendHref(url) {
  const v = String(url || '').trim();
  return /^https?:\/\//i.test(v) ? escapeAttr(v) : '';
}

// The text of a trend's box: the topic, why it matters (the sample text, or
// an AI draft once an editor asks for one), how often the sources wrote
// about it, and a few of those articles. label puts NOUSEVA AIHE over the
// topic, as the newsletter's card has it.
export function trendCardHtml(signal, whyHtml, label = false) {
  const topic = trendTopic(signal);
  const n = Number(signal.articles) || 0;
  const days = Math.round((Date.parse(signal.period_end) - Date.parse(signal.period_start)) / 86400000);
  const items = (signal.items || []).filter((a) => trendHref(a.url)).slice(0, TREND_ARTICLES)
    .map((a) => `<li>${a.publisher ? `${escapeText(a.publisher)}: ` : ''}<a href="${trendHref(a.url)}">${escapeText(a.title || a.url)}</a></li>`)
    .join('');
  const count = `Seuraamissamme lähteissä aiheesta on ilmestynyt ${n} ${n === 1 ? 'juttu' : 'juttua'}`
    + (days > 0 ? ` viimeisen ${days} päivän aikana` : '') + (items ? '. Muutama niistä:' : '.');
  return `${label ? '<h4>NOUSEVA AIHE</h4>' : ''}<h3>${escapeText(topic)}</h3>${whyHtml}<p>${count}</p>${items ? `<ul>${items}</ul>` : ''}`;
}

// The box as a section of its own. It keeps the signal's id, so the editor
// can ask the AI to write why the topic matters (newsletter/writing.js).
export function trendSection(signal, design) {
  const sampleWhy = `<p><em>${escapeText(PLACEHOLDERS.trend)}</em></p>`;
  const name = `Nouseva aihe: ${trendTopic(signal)}`;
  const meta = (design && design.meta) || {};
  const family = meta.headings || meta.template;
  let sec;
  if (family === 'jasenkirje') {
    // The member letter: a black bar, as its highlights from the field have.
    sec = section(name, 'trend', [
      sectionBar('Nouseva aihe', BLACK),
      sample(trendCardHtml(signal, sampleWhy), { style: { paddingTop: 16, paddingBottom: 16 } }),
    ], { spaceAbove: 12, paddingBottom: 8 });
  } else if (['simple', 'visual', 'blank'].includes(family)) {
    sec = section(name, 'trend', [h2('Nouseva aihe'), sample(trendCardHtml(signal, sampleWhy))]);
  } else {
    // The newsletter: a white card in a pink box, like the articles in
    // Nostoja kentältä, with a small label over the topic as the tips have.
    // No heading of its own, so two trends in a row do not repeat one.
    sec = section(name, 'trend', [
      sample(trendCardHtml(signal, sampleWhy, true), { style: { ...TREND_CARD, marginTop: 24 } }),
    ], { contentBackground: PINK, ...BOXED, paddingBottom: 10 });
  }
  sec.signal = Number(signal.id) || null;
  return sec;
}

// Where a trend goes when it is clicked rather than dragged: after
// Nostoja kentältä and any trends already there. -1 when the design has no
// such section, and then it goes where any section would.
export function trendPlace(design) {
  let i = design.sections.findIndex((s) => s.role === 'highlights');
  if (i < 0) return -1;
  i += 1;
  while (design.sections[i] && design.sections[i].role === 'trend') i += 1;
  return i;
}

// ---------- ready-made sections ----------

// Sections to drop into any email from the Sections panel, grouped the way
// Mailchimp groups its own. create(issue, design) makes a new one; an
// article section takes the open email's style.
export const PREBUILT_GROUPS = ['header', 'hero', 'articles', 'text', 'signup', 'event', 'columns', 'gallery', 'footer'];

export const PREBUILT = [
  { group: 'header', key: 'banner-newsletter', name: 'Banneri: Uutiskirje', create: () => bannerSection(`${NAME} – Uutiskirje`, 'newsletter') },
  { group: 'header', key: 'banner-members', name: 'Banneri: Jäsenkirje', create: () => bannerSection(`${NAME} – Jäsenkirje`, 'members') },
  { group: 'header', key: 'banner', name: 'Banneri, oma kuva', create: () => bannerSection(NAME) },
  { group: 'header', key: 'browser-link', name: 'Lue viesti selaimessasi', create: () => browserLinkSection() },
  { group: 'header', key: 'title', name: 'Pieni otsake ja otsikko', create: (issue) => titleSection(NAME.toUpperCase(), title(issue)) },
  { group: 'header', key: 'header-band', name: 'Värillinen otsikkokaista', create: (issue) => bandHeader(`${NAME.toUpperCase()} · UUTISKIRJE`, title(issue)) },
  { group: 'header', key: 'header-plain', name: 'Nimi ja otsikko', create: (issue) => plainHeader(NAME, title(issue)) },
  { group: 'header', key: 'header-logo', name: 'Logo ja otsikko', create: (issue) => logoHeader(title(issue)) },
  {
    group: 'hero',
    key: 'hero-image',
    name: 'Pääkuva, teksti ja painike',
    create: () => section('Pääkuva', 'hero', [
      picture({ style: { ...BLEED } }),
      textBlock(`<h2>Otsikko</h2>${fromText(PLACEHOLDERS.body)}`, { placeholder: true, style: { paddingTop: 24 } }),
      buttonBlock('Lue lisää', '', { style: { paddingBottom: 24 } }),
    ]),
  },
  {
    group: 'hero',
    key: 'image-text',
    name: 'Kuva ja teksti vierekkäin',
    create: () => section('Kuva ja teksti', null, [
      columns('1:2', [picture()], [sample(`<h3>Otsikko</h3>${fromText(PLACEHOLDERS.body)}`)]),
    ], { paddingTop: 12, paddingBottom: 12 }),
  },
  ...ARTICLE_SECTIONS.map((key) => ({
    group: 'articles',
    key,
    name: SECTION_NAMES[key],
    create: (issue, design) => articleSection(design || { meta: { template: 'eok' } }, key),
  })),
  { group: 'text', key: 'tips', name: 'Vinkkinurkka', create: () => tipsSection() },
  {
    group: 'text',
    key: 'must-read',
    name: 'Tutustu ainakin näihin',
    create: () => section('Tutustu ainakin näihin', 'picks', [
      sectionBar('Tutustu ainakin näihin', PINK, BLACK, 'left'),
      sample(SAMPLES.mustRead, { style: { paddingTop: 16, paddingBottom: 16 } }),
    ]),
  },
  {
    group: 'text',
    key: 'calendar',
    name: 'Kalenteriin poimittavia',
    create: () => headedSection('Kalenteriin poimittavia', 'calendar', [placeholder(PLACEHOLDERS.calendar)]),
  },
  { group: 'text', key: 'learning-factory', name: 'Learning Factory', create: () => learningFactorySection() },
  {
    group: 'text',
    key: 'cta',
    name: 'Kehotus ja painike',
    create: () => section('Kehotus', null, [
      textBlock(`<h2>Otsikko</h2>${fromText(PLACEHOLDERS.body)}`, { placeholder: true, style: { paddingTop: 24 } }),
      buttonBlock('Ilmoittaudu', '', { style: { paddingBottom: 24 } }),
    ], { contentBackground: PINK, ...BOXED }),
  },
  { group: 'text', key: 'quote', name: 'Lainaus tai palaute', create: () => quoteSection() },
  { group: 'text', key: 'signature', name: 'Allekirjoitus kuvan kanssa', create: () => signatureSection() },
  { group: 'text', key: 'about', name: 'Tietoa yhdistyksestä', create: () => aboutSection() },
  { group: 'text', key: 'section-bar', name: 'Osion palkki', create: () => section('Osio', null, [sectionBar('Osion nimi', MAGENTA)]) },
  { group: 'signup', key: 'join', name: 'Liity jäseneksi', create: () => joinSection() },
  { group: 'signup', key: 'subscribe', name: 'Tilaa uutiskirje', create: () => subscribeSection() },
  {
    group: 'signup',
    key: 'register',
    name: 'Ilmoittautumispainike',
    create: () => actionSection('Ilmoittautuminen', 'Ilmoittaudu mukaan', '', 'Ilmoittautuminen päättyy viikkoa ennen tapahtumaa.', { contentBackground: PINK, ...BOXED }),
  },
  { group: 'event', key: 'event-facts', name: 'Tapahtuman tiedot', create: () => factsSection('Tapahtuman tiedot', SAMPLES.eventInfo) },
  { group: 'event', key: 'agenda', name: 'Ohjelma', create: () => headedSection('Ohjelma', 'agenda', [sample(SAMPLES.agenda)]) },
  { group: 'event', key: 'speakers', name: 'Kaksi puhujaa', create: () => speakersSection('Puhujat', 2) },
  { group: 'event', key: 'speaker', name: 'Yksi puhuja', create: () => speakersSection('Puhuja', 1) },
  {
    group: 'columns',
    key: 'features-3',
    name: 'Kolme nostoa kuvin',
    create: () => section('Nostot', 'features', [
      columns('1:1:1', ...[0, 1, 2].map(() => [picture({ style: { radius: 4 } }), sample(SAMPLES.card)])),
    ], { paddingTop: 8, paddingBottom: 8 }),
  },
  {
    group: 'columns',
    key: 'features-2',
    name: 'Kaksi nostoa ja painikkeet',
    create: () => section('Nostot', 'features', [
      columns('1:1', ...[0, 1].map(() => [picture({ style: { radius: 4 } }), sample(SAMPLES.card),
        buttonBlock('Lue lisää', '', { look: { size: 'small' }, style: { paddingBottom: 16 } })])),
    ], { paddingTop: 8, paddingBottom: 8 }),
  },
  {
    group: 'gallery',
    key: 'gallery-3',
    name: 'Kolme kuvaa',
    create: () => section('Kuvagalleria', null, [
      columns('1:1:1', ...[0, 1, 2].map(() => [picture({ style: { paddingLeft: 6, paddingRight: 6 } })])),
    ], { paddingTop: 12, paddingBottom: 12 }),
  },
  {
    group: 'gallery',
    key: 'gallery-2',
    name: 'Kaksi kuvaa tekstein',
    create: () => section('Kuvat', null, [
      columns('1:1', ...[0, 1].map(() => [picture(), sample(fromText(PLACEHOLDERS.body))])),
    ], { paddingTop: 12, paddingBottom: 12 }),
  },
  { group: 'footer', key: 'social-band', name: 'Somekanavat', create: () => socialBand() },
  { group: 'footer', key: 'footer-grey', name: 'Yhdistyksen alatunniste', create: () => greyFooter() },
  { group: 'footer', key: 'footer-teal', name: 'Teal-alatunniste', create: () => tealFooter() },
  { group: 'footer', key: 'footer-social', name: 'Some ja alatunniste', create: () => socialFooter() },
  { group: 'footer', key: 'footer-plain', name: 'Pelkistetty alatunniste', create: () => plainFooter() },
];
