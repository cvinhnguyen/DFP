// The newsletter's design: what the editor changes and the email is built
// from. Saved as JSON with the issue.
//
// It is built the way Mailchimp's builder is: an email is a list of sections
// (the header, the greeting, each article section, the footer), a section is
// a list of blocks (text, image, button, divider...), and a columns block
// holds two to four columns, each a list of blocks again. The look of the
// whole email (fonts, colours, buttons) is in styles; a block or section
// keeps only what it changes from that.

import { escapeText, fromText } from './richtext.js';

export const VERSION = 2;
// The association's newsletter is 660 pixels wide.
export const WIDTH = 660;

// The sections the tool fills from picked articles. A section of these with
// no article left in it is not sent: the editors asked for empty sections to
// be dropped rather than shown.
export const ARTICLE_SECTIONS = ['own_news', 'events', 'member_news', 'highlights'];

// The layouts that show an article's picture; in 'text' it stays out.
export const PICTURE_LAYOUTS = ['image-left', 'image-right', 'image-top'];

export function showsPicture(block) {
  return block.type === 'article' && PICTURE_LAYOUTS.includes(block.layout) && !!(block.image && block.image.src);
}

// The picture from the article's own page (28-article-pictures.sql), as an
// article block keeps it: with whose it is, and, for a source whose pictures
// need permission, whether an editor has said it may be used. None, an empty
// picture.
export function articlePicture(article) {
  const p = article && article.picture;
  if (!p || !p.src) return { src: '', alt: '', naturalWidth: 0, naturalHeight: 0 };
  return {
    src: p.src,
    alt: p.alt || article.title_fi || article.title || '',
    naturalWidth: p.width || 0,
    naturalHeight: p.height || 0,
    credit: p.credit || '',
    rights: p.rights || 'check',
    allowed: false,
  };
}

export const BLOCK_TYPES = ['text', 'image', 'button', 'divider', 'spacer', 'social', 'video', 'logo', 'footer', 'columns', 'article'];

export const LAYOUTS = {
  1: [1], '1:1': [1, 1], '1:1:1': [1, 1, 1], '1:1:1:1': [1, 1, 1, 1],
  '1:2': [1, 2], '2:1': [2, 1], '1:3': [1, 3], '3:1': [3, 1],
};

export const NETWORKS = ['facebook', 'instagram', 'linkedin', 'x', 'youtube', 'tiktok', 'bluesky', 'website', 'email'];
export const NETWORK_NAMES = {
  facebook: 'Facebook', instagram: 'Instagram', linkedin: 'LinkedIn', x: 'X', youtube: 'YouTube',
  tiktok: 'TikTok', bluesky: 'Bluesky', website: 'Verkkosivut', email: 'Sähköposti',
};

export function newId(prefix = 'b') {
  return prefix + Math.random().toString(36).slice(2, 10);
}

export function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

// ---------- the look of the whole email ----------

// The association's own look, from the newsletter its members already get:
// near-black text at 17 pixels, teal links and buttons, pink boxes, 660
// pixels wide. Their emails use DM Sans, which is loaded from Google; the
// editor offers only fonts every email program has, and Helvetica is the
// nearest.
export function defaultStyles() {
  const text = (size, mobileSize, lineHeight, color, bold, spacing, extra = {}) => ({
    font: 'helvetica', size, mobileSize, lineHeight, color, letterSpacing: 0, align: 'left',
    bold, italic: false, spacing, ...extra,
  });
  return {
    background: { page: '#f3f4f4', content: '#ffffff', margin: 24, mobilePadding: 16 },
    text: {
      p: text(17, 16, 1.55, '#101010', false, 14),
      h1: text(30, 26, 1.2, '#101010', true, 14),
      h2: text(25, 22, 1.25, '#101010', true, 12),
      h3: text(20, 18, 1.3, '#101010', true, 8),
      h4: text(13, 13, 1.4, '#101010', true, 6, { letterSpacing: 1 }),
    },
    link: { color: '#104f55', underline: true },
    button: {
      shape: 'round', background: '#104f55', color: '#ffffff', borderStyle: 'none', borderColor: '#104f55', borderWidth: 1,
      font: 'helvetica', fontSize: 15, bold: true, italic: false, letterSpacing: 0, size: 'medium', align: 'left', fullWidth: false,
    },
    divider: { line: 'solid', color: '#dde4e4', thickness: 1, paddingTop: 12, paddingBottom: 12 },
    image: { radius: 0, borderStyle: 'none', borderColor: '#dde4e4', borderWidth: 1, align: 'center' },
    logo: { align: 'left' },
  };
}

// Padding each kind of block starts with, top right bottom left, in pixels.
export const BLOCK_PADDING = {
  text: [12, 36, 12, 36],
  image: [12, 36, 12, 36],
  button: [12, 36, 12, 36],
  divider: [0, 36, 0, 36],
  spacer: [0, 0, 0, 0],
  social: [12, 36, 12, 36],
  video: [12, 36, 12, 36],
  logo: [24, 36, 12, 36],
  footer: [24, 36, 24, 36],
  columns: [0, 24, 0, 24],
  article: [0, 36, 24, 36],
};
// Inside a column, blocks sit closer to its edges.
export const COLUMN_SIDE_PADDING = 12;

export const BUTTON_SIZES = { small: [8, 16], medium: [11, 20], large: [15, 30] };

// ---------- blocks ----------

const base = (type, fields = {}) => ({ id: newId(), type, ...fields, style: fields.style || {} });

export function textBlock(html = '<p></p>', extra = {}) {
  return base('text', { html, ...extra });
}

export function headingBlock(text, level = 2, extra = {}) {
  return textBlock(`<h${level}>${escapeText(text)}</h${level}>`, extra);
}

export function imageBlock(fields = {}) {
  return base('image', {
    src: '', alt: '', naturalWidth: 0, naturalHeight: 0, size: 'original', scale: 100,
    link: { url: '', blank: true }, ...fields,
  });
}

// look holds what this button changes from the email's button style (its
// colour, shape, size). style is the block around it, like every block's:
// padding, background, border.
export function buttonBlock(text = 'Painikkeen teksti', url = '', extra = {}) {
  return base('button', { text, link: { url, blank: true }, look: {}, ...extra });
}

export function dividerBlock(extra = {}) {
  return base('divider', extra);
}

export function spacerBlock(height = 24) {
  return base('spacer', { height });
}

export function socialBlock(items) {
  return base('social', {
    items: items || [
      { network: 'facebook', url: '', label: 'Facebook' },
      { network: 'linkedin', url: '', label: 'LinkedIn' },
      { network: 'instagram', url: '', label: 'Instagram' },
    ],
    display: 'icon', iconStyle: 'color', layout: 'horizontal', iconSize: 'medium', spacing: 12,
  });
}

export function videoBlock() {
  return base('video', { url: '', thumb: { src: '', width: 0, height: 0 }, alt: '' });
}

export function logoBlock(fields = {}) {
  return base('logo', { src: '', alt: '', width: 160, link: { url: '', blank: true }, ...fields });
}

// The association's name and postal address, which Mailchimp requires and
// fills in from the audience's settings, the links every email needs, and a
// way to subscribe for someone who was forwarded the email.
export const FOOTER_HTML = '<p><strong>Suomen eOppimiskeskus ry</strong><br>*|LIST:ADDRESSLINE|*<br><a href="https://eoppimiskeskus.fi/">eoppimiskeskus.fi</a></p>'
  + '<p><a href="*|UPDATE_PROFILE|*">Päivitä tietosi</a> · <a href="*|UNSUB|*">Peru tilaus</a> · <a href="*|ARCHIVE|*">Näytä selaimessa</a></p>'
  + '<p>Saitko tämän edelleenlähetettynä? <a href="*|LIST:SUBSCRIBE|*">Tilaa uutiskirje</a>.</p>';

export function footerBlock(html = FOOTER_HTML, extra = {}) {
  return base('footer', { html, ...extra });
}

export function columnsBlock(layout = '1:1') {
  const shares = LAYOUTS[layout] || LAYOUTS['1:1'];
  return base('columns', {
    layout, mobile: 'stack', valign: 'top',
    columns: shares.map(() => ({ id: newId('c'), blocks: [] })),
  });
}

// The share of the width each column gets, as fractions that add up to 1.
export function columnShares(block) {
  const shares = LAYOUTS[block.layout] && LAYOUTS[block.layout].length === block.columns.length
    ? LAYOUTS[block.layout] : block.columns.map(() => 1);
  const total = shares.reduce((a, b) => a + b, 0);
  return shares.map((s) => s / total);
}

// Changes a columns block to another layout. Blocks of columns that go away
// move to the last column that stays.
export function setLayout(block, layout) {
  const want = (LAYOUTS[layout] || LAYOUTS['1:1']).length;
  while (block.columns.length < want) block.columns.push({ id: newId('c'), blocks: [] });
  while (block.columns.length > want) {
    const gone = block.columns.pop();
    block.columns[block.columns.length - 1].blocks.push(...gone.blocks);
  }
  block.layout = layout;
}

// ---------- articles ----------

// How a picked article is written depends on its section, the way the
// editors already do it: news from the field and from members ends with
// "Publisher: original title", an event gets a sign-up button, the
// association's own news a link to read on.
export const VARIANT_OF = { highlights: 'highlight', events: 'event', own_news: 'own', member_news: 'highlight' };

function sourceLine(article, variant) {
  const url = escapeAttrSafe(article.url);
  if (!url) return '';
  if (variant === 'own') return `<p><a href="${url}">Lue koko juttu</a></p>`;
  if (variant === 'event') return '';
  const who = article.publisher ? `${escapeText(article.publisher)}: ` : '';
  return `<p>${who}<a href="${url}">${escapeText(article.title || '')}</a></p>`;
}

function escapeAttrSafe(url) {
  const v = String(url || '').trim();
  return /^https?:\/\//i.test(v) ? v.replace(/&/g, '&amp;').replace(/"/g, '%22').replace(/</g, '%3C').replace(/>/g, '%3E') : '';
}

// The text an article starts from: its Finnish summary, or the publisher's
// own description. An event picked for Tapahtumat starts with the line the
// association's newsletter starts every event with, 17.9.2026 | Tampere.
function startingText(article, variant) {
  const text = article.summary || article.excerpt || '';
  return variant === 'event' && article.event_line ? `${article.event_line}\n\n${text}` : text;
}

export function articleBlock(article, section = article.section) {
  const variant = VARIANT_OF[section] || 'highlight';
  return base('article', {
    itemId: Number(article.id),
    section,
    variant,
    // An editor ticks this after reading what the AI wrote. Kaisa asked for
    // it, and it is what lets AI-written text go out without an AI label.
    checked: false,
    lang: article.language || '',
    // A title in another language starts in Finnish, as the AI wrote it. The
    // source line keeps the original, which is what the publisher used.
    originalTitle: article.title || '',
    title: article.title_fi || article.title || '',
    url: article.url || '',
    linkTitle: false,
    summary: fromText(startingText(article, variant)),
    source: sourceLine(article, variant),
    button: { show: variant === 'event', text: 'Tutustu ja ilmoittaudu' },
    // The article's own picture, at its side, unless the section gives its
    // articles another layout (templates.js, placeArticles).
    image: articlePicture(article),
    layout: article.picture && article.picture.src ? 'image-right' : 'text',
  });
}

// ---------- sections ----------

export function section(name, role = null, blocks = [], style = {}) {
  return { id: newId('s'), name, role, blocks, style };
}

export function emptyDesign() {
  return { version: VERSION, styles: defaultStyles(), sections: [] };
}

// A stored design in this format, filled in where an older save lacks
// something. Anything else (the old editor's format, nothing) is null, and
// the editor starts the issue again from a template.
export function readDesign(stored) {
  if (!stored || stored.version !== VERSION || !Array.isArray(stored.sections)) return null;
  const design = clone(stored);
  const defaults = defaultStyles();
  design.styles = design.styles || {};
  for (const key of Object.keys(defaults)) {
    if (key === 'text') {
      design.styles.text = design.styles.text || {};
      for (const tag of Object.keys(defaults.text)) design.styles.text[tag] = { ...defaults.text[tag], ...(design.styles.text[tag] || {}) };
    } else design.styles[key] = { ...defaults[key], ...(design.styles[key] || {}) };
  }
  for (const s of design.sections) {
    s.id = s.id || newId('s');
    s.style = s.style || {};
    s.blocks = Array.isArray(s.blocks) ? s.blocks : [];
  }
  eachBlock(design, (b) => {
    b.id = b.id || newId();
    b.style = b.style || {};
    if (b.type === 'columns') b.columns.forEach((c) => { c.id = c.id || newId('c'); c.blocks = c.blocks || []; });
    if (b.type === 'button') b.look = b.look || {};
  });
  return design;
}

// ---------- finding things ----------

// Calls fn(block, list, index, section, parent) for every block, columns
// first and then the blocks inside them. parent is the columns block a block
// sits in, if any.
export function eachBlock(design, fn) {
  for (const s of design.sections) {
    const visit = (list, parent) => {
      list.forEach((b, i) => {
        fn(b, list, i, s, parent);
        if (b.type === 'columns') b.columns.forEach((c) => visit(c.blocks, b));
      });
    };
    visit(s.blocks, null);
  }
}

export function allBlocks(design) {
  const out = [];
  eachBlock(design, (b) => out.push(b));
  return out;
}

export function findBlock(design, id) {
  let found = null;
  eachBlock(design, (block, list, index, sec, parent) => {
    if (!found && block.id === id) found = { block, list, index, section: sec, parent };
  });
  return found;
}

export function findSection(design, id) {
  const index = design.sections.findIndex((s) => s.id === id);
  return index < 0 ? null : { section: design.sections[index], index };
}

// A list blocks can go in: a section's (by its id) or a column's (by its id).
export function findList(design, id) {
  const sec = design.sections.find((s) => s.id === id);
  if (sec) return { list: sec.blocks, section: sec, column: null, parent: null };
  let found = null;
  eachBlock(design, (b, list, index, s) => {
    if (found || b.type !== 'columns') return;
    const column = b.columns.find((c) => c.id === id);
    if (column) found = { list: column.blocks, section: s, column, parent: b };
  });
  return found;
}

// The section or column a block is in, by id, as findList takes it.
export function listIdOf(design, blockId) {
  const found = findBlock(design, blockId);
  if (!found) return null;
  if (!found.parent) return found.section.id;
  return found.parent.columns.find((c) => c.blocks === found.list).id;
}

// ---------- changing things ----------

// A copy with new ids throughout, for duplicating and for inserting a saved
// section or template more than once.
export function withNewIds(thing) {
  const copy = clone(thing);
  const renew = (b) => {
    b.id = newId(b.type ? 'b' : 's');
    if (b.type === 'columns') b.columns.forEach((c) => { c.id = newId('c'); c.blocks.forEach(renew); });
  };
  if (Array.isArray(copy.blocks)) {
    copy.id = newId('s');
    copy.blocks.forEach(renew);
  } else renew(copy);
  return copy;
}

export function insertBlock(design, listId, index, block) {
  const target = findList(design, listId);
  if (!target) return false;
  // Columns do not go inside columns.
  if (block.type === 'columns' && target.parent) return false;
  if (target.parent) {
    // A block moved into a column takes the column's narrower edges.
    const [, right, , left] = BLOCK_PADDING[block.type] || [0, 0, 0, 0];
    if (block.style.paddingLeft === undefined && left > COLUMN_SIDE_PADDING) block.style.paddingLeft = COLUMN_SIDE_PADDING;
    if (block.style.paddingRight === undefined && right > COLUMN_SIDE_PADDING) block.style.paddingRight = COLUMN_SIDE_PADDING;
  }
  const at = Math.max(0, Math.min(index ?? target.list.length, target.list.length));
  target.list.splice(at, 0, block);
  return true;
}

export function removeBlock(design, id) {
  const found = findBlock(design, id);
  if (!found) return null;
  found.list.splice(found.index, 1);
  return found.block;
}

export function moveBlock(design, id, listId, index) {
  const found = findBlock(design, id);
  const target = findList(design, listId);
  if (!found || !target) return false;
  if (found.block.type === 'columns' && target.parent) return false;
  let at = index;
  if (found.list === target.list && found.index < index) at -= 1;
  found.list.splice(found.index, 1);
  if (target.parent && !found.parent) {
    const [, right, , left] = BLOCK_PADDING[found.block.type] || [0, 0, 0, 0];
    if (found.block.style.paddingLeft === undefined && left > COLUMN_SIDE_PADDING) found.block.style.paddingLeft = COLUMN_SIDE_PADDING;
    if (found.block.style.paddingRight === undefined && right > COLUMN_SIDE_PADDING) found.block.style.paddingRight = COLUMN_SIDE_PADDING;
  }
  target.list.splice(Math.max(0, Math.min(at, target.list.length)), 0, found.block);
  return true;
}

export function duplicateBlock(design, id) {
  const found = findBlock(design, id);
  if (!found) return null;
  const copy = withNewIds(found.block);
  // A duplicated article is the same article twice, and a copy of an AI
  // draft is read again too: both start unchecked.
  if (copy.type === 'article' || copy.ai) copy.checked = false;
  found.list.splice(found.index + 1, 0, copy);
  return copy;
}

export function insertSection(design, index, sec) {
  const at = Math.max(0, Math.min(index ?? design.sections.length, design.sections.length));
  design.sections.splice(at, 0, sec);
}

export function moveSection(design, id, toIndex) {
  const found = findSection(design, id);
  if (!found) return;
  design.sections.splice(found.index, 1);
  design.sections.splice(Math.max(0, Math.min(toIndex, design.sections.length)), 0, found.section);
}

export function removeSection(design, id) {
  const found = findSection(design, id);
  if (found) design.sections.splice(found.index, 1);
}

export function duplicateSection(design, id) {
  const found = findSection(design, id);
  if (!found) return null;
  const copy = withNewIds(found.section);
  copy.name = `${found.section.name} (2)`;
  eachBlock({ sections: [copy] }, (b) => { if (b.type === 'article' || b.ai) b.checked = false; });
  design.sections.splice(found.index + 1, 0, copy);
  return copy;
}

// ---------- articles in the design ----------

export function articleIds(design) {
  const ids = new Set();
  eachBlock(design, (b) => { if (b.type === 'article') ids.add(Number(b.itemId)); });
  return ids;
}

// The design without its articles: what a template keeps. The articles of the
// next issue are put in when the template is used.
export function withoutArticles(thing) {
  const copy = clone(thing);
  const strip = (list) => {
    for (let i = list.length - 1; i >= 0; i -= 1) {
      if (list[i].type === 'article') list.splice(i, 1);
      else if (list[i].type === 'columns') list[i].columns.forEach((c) => strip(c.blocks));
    }
  };
  if (Array.isArray(copy.sections)) copy.sections.forEach((s) => strip(s.blocks));
  else if (Array.isArray(copy.blocks)) strip(copy.blocks);
  return copy;
}

export function isArticleSection(sec) {
  return ARTICLE_SECTIONS.includes(sec.role);
}

export function hasArticles(sec) {
  let found = false;
  eachBlock({ sections: [sec] }, (b) => { if (b.type === 'article') found = true; });
  return found;
}

// Whether a section goes into the email: an article section only with an
// article in it, any other section only with something in it.
export function isSent(sec) {
  return isArticleSection(sec) ? hasArticles(sec) : sec.blocks.length > 0;
}

export function placeholderText(text) {
  return fromText(text);
}
