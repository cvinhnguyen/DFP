// What still needs a look before the newsletter goes to Mailchimp. Worked out
// from the design, so the editor and the newsletter page say the same.
//
// Errors are what Mailchimp itself would refuse (no unsubscribe link,
// placeholder text, no subject line) and what Kaisa asked for: a person reads
// every AI-written text before it goes out. That reading is the "checked"
// tick on each article; it is also what lets AI-written text go out without
// an AI label under the EU's transparency rules, because a person has
// reviewed it and the association takes responsibility for it.
//
// Warnings are worth a look but can be right as they are.

import { eachBlock, isSent } from './model.js';
import { toText } from './richtext.js';
import { collectLinks } from './render.js';
import { PLACEHOLDERS } from './templates.js';

// Gmail cuts an email off after 102 kilobytes and hides the rest behind a
// link, unsubscribe link included.
export const GMAIL_CLIP = 102 * 1024;

const MERGE_TAG = /\*\|[A-Z0-9_:]+\|\*/g;
const DEFAULT_BUTTON = 'Painikkeen teksti';

// A few words that say which block is meant: the text it starts with, an
// image's description, a button's label.
export function snippet(block) {
  const cut = (text) => {
    const clean = String(text || '').replace(/\s+/g, ' ').trim();
    return clean.length > 70 ? `${clean.slice(0, 68)}…` : clean;
  };
  switch (block.type) {
    case 'text':
    case 'footer':
      return cut(toText(block.html));
    case 'article':
      return cut(block.title);
    case 'button':
      return cut(block.text);
    case 'image':
    case 'logo':
      return cut(block.alt);
    case 'video':
      return cut(block.alt || block.url);
    default:
      return '';
  }
}

function item(block, sec) {
  return { blockId: block.id, sectionId: sec.id, type: block.type, snippet: snippet(block) };
}

function hasPlaceholder(block) {
  if (block.placeholder) return true;
  const texts = [];
  if (block.type === 'text' || block.type === 'footer') texts.push(toText(block.html));
  if (block.type === 'article') texts.push(block.title, toText(block.summary));
  if (block.type === 'button') return (block.text || '').trim() === DEFAULT_BUTTON || !(block.text || '').trim();
  return texts.some((t) => Object.values(PLACEHOLDERS).some((p) => t.includes(p)));
}

// issue: { subject }, articles: the articles picked for the issue, size: the
// finished email's size in bytes, if known.
export function checkDesign(design, { issue = {}, articles = [], size = 0 } = {}) {
  const sent = [];
  for (const sec of design.sections.filter(isSent)) {
    eachBlock({ sections: [sec] }, (block) => sent.push({ block, sec }));
  }
  const errors = [];
  const warnings = [];
  const add = (list, code, items, params = {}) => {
    if (items === true) list.push({ code, items: [], count: 1, params });
    else if (items.length) list.push({ code, items, count: items.length, params });
  };

  add(errors, 'unchecked', sent.filter(({ block }) => block.type === 'article' && !block.checked).map(({ block, sec }) => item(block, sec)));
  add(errors, 'placeholders', sent.filter(({ block }) => hasPlaceholder(block)).map(({ block, sec }) => item(block, sec)));

  const links = collectLinks(design);
  if (!links.some((l) => l.url === '*|UNSUB|*')) add(errors, 'unsubscribe', true);
  if (!String(issue.subject || '').trim()) add(errors, 'subject', true);

  // A headline left in the original language, in a Finnish email.
  add(warnings, 'foreign', sent.filter(({ block }) => block.type === 'article' && block.lang && block.lang !== 'fi'
    && (block.title || '').trim() === (block.originalTitle || '').trim()).map(({ block, sec }) => item(block, sec)));

  const picked = new Set(articles.map((a) => Number(a.id)));
  const placed = new Set();
  const orphans = [];
  eachBlock(design, (block, list, index, sec) => {
    if (block.type !== 'article') return;
    placed.add(Number(block.itemId));
    if (!picked.has(Number(block.itemId))) orphans.push(item(block, sec));
  });
  add(warnings, 'missing', articles.filter((a) => !placed.has(Number(a.id)))
    .map((a) => ({ itemId: Number(a.id), snippet: a.title, type: 'article' })));
  add(warnings, 'orphans', orphans);

  const images = [];
  for (const { block, sec } of sent) {
    const missingAlt = ((block.type === 'image' || block.type === 'logo') && block.src && !(block.alt || '').trim())
      || (block.type === 'video' && block.thumb && block.thumb.src && !(block.alt || '').trim())
      || (block.type === 'article' && block.image && block.image.src && !(block.image.alt || '').trim());
    if (missingAlt) images.push(item(block, sec));
  }
  add(warnings, 'alt', images);
  add(warnings, 'emptyImages', sent.filter(({ block }) => (block.type === 'image' && !block.src) || (block.type === 'video' && !(block.thumb && block.thumb.src)))
    .map(({ block, sec }) => item(block, sec)));

  const emptyLinks = links.filter((l) => l.kind !== 'social' && (l.url === '' || l.url === '#'));
  const seen = new Set();
  add(warnings, 'emptyLinks', emptyLinks.filter((l) => !seen.has(l.blockId) && seen.add(l.blockId))
    .map((l) => ({ blockId: l.blockId, sectionId: l.sectionId, snippet: l.text, type: 'link' })));

  if (size > GMAIL_CLIP) add(warnings, 'size', true, { kb: Math.round(size / 1024) });

  const mergeTags = new Set();
  for (const { block } of sent) {
    const text = [block.html, block.summary, block.source, block.text, block.title].filter(Boolean).join(' ');
    (text.match(MERGE_TAG) || []).forEach((m) => mergeTags.add(m));
  }
  links.forEach((l) => (l.url.match(MERGE_TAG) || []).forEach((m) => mergeTags.add(m)));

  return {
    errors,
    warnings,
    links,
    mergeTags: [...mergeTags],
    errorCount: errors.reduce((n, e) => n + e.count, 0),
    warningCount: warnings.reduce((n, w) => n + w.count, 0),
  };
}
