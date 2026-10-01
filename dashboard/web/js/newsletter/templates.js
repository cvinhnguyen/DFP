// The templates an issue can start from, and how picked articles find their
// place in a design.
//
// The first template is the association's own newsletter as its members
// already know it. The others are plainer starting points. Mailchimp's own
// templates are not copied: they are Mailchimp's designs, and the
// association cares about copyright. An issue can also start from a design
// an editor saved, or from an earlier issue.

import {
  emptyDesign, section, textBlock, headingBlock, dividerBlock, imageBlock, footerBlock, buttonBlock,
  columnsBlock, articleBlock, socialBlock, logoBlock, articleIds, withoutArticles, withNewIds,
  ARTICLE_SECTIONS, FOOTER_HTML, readDesign,
} from './model.js';
import { escapeText, fromText } from './richtext.js';

export const SECTION_NAMES = {
  own_news: 'Kuulumisia toimistolta',
  events: 'Tapahtumat',
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
};

const TEAL = '#104f55';
const PINK = '#fcc0c5';
const PINK_WASH = '#fde9eb';

const placeholder = (text, extra = {}) => textBlock(fromText(text), { placeholder: true, ...extra });

// How each template heads a section, so an article section added later
// looks like the ones already there.
const HEADINGS = {
  eok: (name) => [
    headingBlock(name, 2, { style: { paddingTop: 16, paddingBottom: 8 } }),
    dividerBlock({ style: { color: PINK, thickness: 3, paddingTop: 0, paddingBottom: 16 } }),
  ],
  simple: (name) => [
    headingBlock(name, 2, { style: { paddingTop: 20, paddingBottom: 4 } }),
    dividerBlock({ style: { paddingTop: 4, paddingBottom: 12 } }),
  ],
  visual: (name) => [
    headingBlock(name.toUpperCase(), 4, { style: { paddingTop: 24, paddingBottom: 12 } }),
  ],
  blank: (name) => [headingBlock(name, 2)],
};

function headingFor(design, name) {
  const make = HEADINGS[(design.meta && design.meta.template) || 'eok'] || HEADINGS.eok;
  return make(name);
}

function articleSection(design, key) {
  return section(SECTION_NAMES[key], key, headingFor(design, SECTION_NAMES[key]));
}

// ---------- the templates ----------

function title(issue) {
  return (issue && (issue.subject || issue.name)) || 'Uutiskirje';
}

const BUILT_IN = [
  {
    key: 'eok',
    build(issue) {
      const d = emptyDesign();
      d.meta = { template: 'eok' };
      d.sections.push(
        section('Ylätunniste', 'header', [
          textBlock(`<p><span style="color:${PINK};font-size:12px;letter-spacing:2px">SUOMEN EOPPIMISKESKUS RY · UUTISKIRJE</span></p>`
            + `<h1>${escapeText(title(issue))}</h1>`, { style: { paddingTop: 30, paddingBottom: 26 } }),
        ], { contentBackground: TEAL, textColor: '#ffffff', linkColor: PINK }),
        section('Tervehdys', 'greeting', [
          textBlock(`<p><strong>Hei!</strong></p>${fromText(PLACEHOLDERS.greeting)}`, { placeholder: true, style: { paddingTop: 28 } }),
        ]),
        ...ARTICLE_SECTIONS.map((key) => articleSection(d, key)),
        section('Vinkkinurkka', 'tips', [
          ...HEADINGS.eok('Vinkkinurkka'),
          placeholder(PLACEHOLDERS.tips, {
            style: { background: PINK_WASH, radius: 6, paddingTop: 18, paddingRight: 20, paddingBottom: 18, paddingLeft: 20, marginLeft: 36, marginRight: 36, marginBottom: 12 },
          }),
        ]),
        section('Kalenteriin poimittavia', 'calendar', [
          ...HEADINGS.eok('Kalenteriin poimittavia'),
          placeholder(PLACEHOLDERS.calendar),
        ]),
        section('Alatunniste', 'footer', [footerBlock(FOOTER_HTML)],
          { contentBackground: TEAL, textColor: '#ffffff', linkColor: PINK, paddingTop: 4, paddingBottom: 4 }),
      );
      return d;
    },
  },
  {
    key: 'simple',
    build(issue) {
      const d = emptyDesign();
      d.meta = { template: 'simple' };
      d.styles.background.page = '#ffffff';
      d.styles.button.shape = 'square';
      d.sections.push(
        section('Ylätunniste', 'header', [
          textBlock(`<p><span style="color:#6a7677;font-size:13px">Suomen eOppimiskeskus ry</span></p><h1>${escapeText(title(issue))}</h1>`,
            { style: { paddingTop: 32, paddingBottom: 8 } }),
          dividerBlock({ style: { color: TEAL, thickness: 2, paddingTop: 8, paddingBottom: 8 } }),
        ]),
        section('Tervehdys', 'greeting', [placeholder(PLACEHOLDERS.greeting, { style: { paddingTop: 16 } })]),
        ...ARTICLE_SECTIONS.map((key) => articleSection(d, key)),
        section('Alatunniste', 'footer', [
          dividerBlock({ style: { paddingTop: 16, paddingBottom: 0 } }),
          footerBlock(FOOTER_HTML, { style: { paddingTop: 16 } }),
        ], { textColor: '#6a7677' }),
      );
      d.styles.text.p.size = 16;
      return d;
    },
  },
  {
    key: 'visual',
    build(issue) {
      const d = emptyDesign();
      d.meta = { template: 'visual' };
      d.styles.background.page = '#eef2f2';
      d.styles.button.shape = 'pill';
      const intro = columnsBlock('1:2');
      intro.columns[0].blocks.push(imageBlock({ size: 'fill', style: { paddingLeft: 12, paddingRight: 12 } }));
      intro.columns[1].blocks.push(placeholder(PLACEHOLDERS.intro, { style: { paddingLeft: 12, paddingRight: 12 } }));
      d.sections.push(
        section('Ylätunniste', 'header', [
          logoBlock({ style: { paddingTop: 20, paddingBottom: 20 } }),
        ], { contentBackground: '#ffffff' }),
        section('Pääkuva', 'hero', [
          imageBlock({ size: 'fill', style: { paddingTop: 0, paddingRight: 0, paddingBottom: 0, paddingLeft: 0 } }),
          textBlock(`<h1>${escapeText(title(issue))}</h1>`, { style: { paddingTop: 24 } }),
          placeholder(PLACEHOLDERS.greeting),
        ]),
        section('Esittely', 'intro', [intro], { paddingTop: 12, paddingBottom: 12 }),
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
    key: 'blank',
    build(issue) {
      const d = emptyDesign();
      d.meta = { template: 'blank' };
      d.sections.push(
        section('Ylätunniste', 'header', [textBlock(`<h1>${escapeText(title(issue))}</h1>`, { style: { paddingTop: 28 } })]),
        section('Sisältö', 'body', []),
        section('Alatunniste', 'footer', [footerBlock(FOOTER_HTML)], { textColor: '#6a7677' }),
      );
      return d;
    },
  },
];

export function builtInTemplates() {
  return BUILT_IN.map((t) => t.key);
}

export function buildTemplate(key, issue) {
  const found = BUILT_IN.find((t) => t.key === key) || BUILT_IN[0];
  return found.build(issue);
}

// ---------- articles ----------

// The article sections in their usual order, so a section added for a new
// pick goes before the sections that come after it, or before the tips, the
// calendar and the footer.
const AFTER_ARTICLES = ['tips', 'calendar', 'footer'];

function insertAt(design, key) {
  const later = ARTICLE_SECTIONS.slice(ARTICLE_SECTIONS.indexOf(key) + 1);
  const anchor = design.sections.findIndex((s) => later.includes(s.role) || AFTER_ARTICLES.includes(s.role));
  return anchor < 0 ? design.sections.length : anchor;
}

// Puts each picked article not yet in the design at the end of its section,
// making the section if the design has none. Returns the blocks added.
export function placeArticles(design, articles) {
  const present = articleIds(design);
  const added = [];
  for (const article of articles) {
    if (present.has(Number(article.id))) continue;
    const key = ARTICLE_SECTIONS.includes(article.section) ? article.section : 'highlights';
    let target = design.sections.find((s) => s.role === key);
    if (!target) target = design.sections.find((s) => s.role === 'body');
    if (!target) {
      target = articleSection(design, key);
      design.sections.splice(insertAt(design, key), 0, target);
    }
    const block = articleBlock(article, key);
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

// ---------- ready-made sections ----------

// Sections to drop into any email from the Sections panel, grouped the way
// Mailchimp groups its own: headers, introductions, articles, text,
// galleries and footers.
export const PREBUILT_GROUPS = ['header', 'hero', 'articles', 'text', 'gallery', 'footer'];

export const PREBUILT = [
  {
    group: 'header',
    key: 'header-eok',
    name: 'Yhdistyksen ylätunniste',
    create: (issue) => section('Ylätunniste', 'header', [
      textBlock(`<p><span style="color:${PINK};font-size:12px;letter-spacing:2px">SUOMEN EOPPIMISKESKUS RY · UUTISKIRJE</span></p>`
        + `<h1>${escapeText(title(issue))}</h1>`, { style: { paddingTop: 30, paddingBottom: 26 } }),
    ], { contentBackground: TEAL, textColor: '#ffffff', linkColor: PINK }),
  },
  {
    group: 'header',
    key: 'header-logo',
    name: 'Logo ja otsikko',
    create: (issue) => section('Ylätunniste', 'header', [
      logoBlock({ style: { paddingTop: 24, paddingBottom: 8 } }),
      textBlock(`<h1>${escapeText(title(issue))}</h1>`, { style: { paddingTop: 8 } }),
    ]),
  },
  {
    group: 'hero',
    key: 'hero-image',
    name: 'Pääkuva, teksti ja painike',
    create: () => section('Pääkuva', 'hero', [
      imageBlock({ size: 'fill', style: { paddingTop: 0, paddingRight: 0, paddingBottom: 0, paddingLeft: 0 } }),
      textBlock(`<h2>Otsikko</h2>${fromText(PLACEHOLDERS.body)}`, { placeholder: true, style: { paddingTop: 24 } }),
      buttonBlock('Lue lisää', '', { style: { paddingBottom: 24 } }),
    ]),
  },
  {
    group: 'hero',
    key: 'image-text',
    name: 'Kuva ja teksti vierekkäin',
    create: () => {
      const cols = columnsBlock('1:2');
      cols.columns[0].blocks.push(imageBlock({ size: 'fill', style: { paddingLeft: 12, paddingRight: 12 } }));
      cols.columns[1].blocks.push(textBlock(`<h3>Otsikko</h3>${fromText(PLACEHOLDERS.body)}`, { placeholder: true, style: { paddingLeft: 12, paddingRight: 12 } }));
      return section('Kuva ja teksti', null, [cols], { paddingTop: 12, paddingBottom: 12 });
    },
  },
  ...ARTICLE_SECTIONS.map((key) => ({
    group: 'articles',
    key,
    name: SECTION_NAMES[key],
    create: () => section(SECTION_NAMES[key], key, HEADINGS.eok(SECTION_NAMES[key])),
  })),
  {
    group: 'text',
    key: 'tips',
    name: 'Vinkkinurkka',
    create: () => section('Vinkkinurkka', 'tips', [
      ...HEADINGS.eok('Vinkkinurkka'),
      placeholder(PLACEHOLDERS.tips, {
        style: { background: PINK_WASH, radius: 6, paddingTop: 18, paddingRight: 20, paddingBottom: 18, paddingLeft: 20, marginLeft: 36, marginRight: 36, marginBottom: 12 },
      }),
    ]),
  },
  {
    group: 'text',
    key: 'calendar',
    name: 'Kalenteriin poimittavia',
    create: () => section('Kalenteriin poimittavia', 'calendar', [...HEADINGS.eok('Kalenteriin poimittavia'), placeholder(PLACEHOLDERS.calendar)]),
  },
  {
    group: 'text',
    key: 'cta',
    name: 'Kehotus ja painike',
    create: () => section('Kehotus', null, [
      textBlock(`<h2>Otsikko</h2>${fromText(PLACEHOLDERS.body)}`, { placeholder: true, style: { paddingTop: 24 } }),
      buttonBlock('Ilmoittaudu', '', { style: { paddingBottom: 24 } }),
    ], { contentBackground: PINK_WASH }),
  },
  {
    group: 'gallery',
    key: 'gallery-3',
    name: 'Kolme kuvaa',
    create: () => {
      const cols = columnsBlock('1:1:1');
      cols.columns.forEach((c) => c.blocks.push(imageBlock({ size: 'fill', style: { paddingLeft: 6, paddingRight: 6 } })));
      return section('Kuvagalleria', null, [cols], { paddingTop: 12, paddingBottom: 12 });
    },
  },
  {
    group: 'gallery',
    key: 'gallery-2',
    name: 'Kaksi kuvaa tekstein',
    create: () => {
      const cols = columnsBlock('1:1');
      cols.columns.forEach((c) => c.blocks.push(
        imageBlock({ size: 'fill', style: { paddingLeft: 12, paddingRight: 12 } }),
        textBlock(fromText(PLACEHOLDERS.body), { placeholder: true, style: { paddingLeft: 12, paddingRight: 12 } }),
      ));
      return section('Kuvat', null, [cols], { paddingTop: 12, paddingBottom: 12 });
    },
  },
  {
    group: 'footer',
    key: 'footer-eok',
    name: 'Yhdistyksen alatunniste',
    create: () => section('Alatunniste', 'footer', [footerBlock(FOOTER_HTML)],
      { contentBackground: TEAL, textColor: '#ffffff', linkColor: PINK, paddingTop: 4, paddingBottom: 4 }),
  },
  {
    group: 'footer',
    key: 'footer-social',
    name: 'Some ja alatunniste',
    create: () => section('Alatunniste', 'footer', [socialBlock(), footerBlock(FOOTER_HTML, { style: { paddingTop: 8 } })],
      { textColor: '#6a7677' }),
  },
];
