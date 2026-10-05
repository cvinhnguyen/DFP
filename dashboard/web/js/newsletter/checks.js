// What still needs a look before the newsletter goes to Mailchimp. Worked out
// from the design, so the editor and the newsletter page say the same.
//
// Errors keep the email in the dashboard: no draft in Mailchimp, no test
// email and no file until there are none (newsletter/handoff.js, and
// services/issues.py on the server). They are what every email needs (an
// unsubscribe link, the postal address Mailchimp requires, a subject line),
// the template's sample text, which would otherwise go out as it is, and
// what Kaisa asked for: a person reads every AI-written text before it goes
// out. An article from the association's Drive folder whose document has
// left the folder goes out of the email too, and one whose document changed
// after it went in waits for a person to look (services/drive.py). That reading is the "checked" tick on each article, and on each text
// the AI drafted for the greeting or a trend (newsletter/writing.js); it is
// also what lets AI-written text go out without an AI label under the EU's
// transparency rules, because a person has reviewed it and the association
// takes responsibility for it. A picture from a source's page that needs
// permission waits the same way, for an editor's "Saa käyttää".
//
// Warnings are worth a look but can be right as they are.

import { eachBlock, isSent, showsPicture } from './model.js';
import { toText } from './richtext.js';
import { collectLinks } from './render.js';
import { PLACEHOLDERS } from './templates.js';

// Gmail cuts an email off after 102 kilobytes and hides the rest behind a
// link, unsubscribe link included.
export const GMAIL_CLIP = 102 * 1024;

const MERGE_TAG = /\*\|[A-Z0-9_:]+\|\*/g;
// Mailchimp requires the sender's postal address in every email; an email
// coded outside its builder has to carry one of these, which Mailchimp fills
// in from the audience's settings.
export const ADDRESS_TAGS = ['*|LIST:ADDRESS|*', '*|LIST:ADDRESSLINE|*', '*|HTML:LIST_ADDRESS_HTML|*'];
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
const DRIVE_LINK = /^https?:\/\/(?:drive|docs)\.google\.com\//i;

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
  add(errors, 'uncheckedDraft', sent.filter(({ block }) => block.type === 'text' && block.ai && !block.checked).map(({ block, sec }) => item(block, sec)));
  // A picture from a source's page belongs to its publisher: one from a
  // source whose pictures need permission waits for an editor to say it may
  // be used (28-article-pictures.sql).
  add(errors, 'pictureRights', sent.filter(({ block }) => showsPicture(block) && block.image.rights === 'check' && !block.image.allowed)
    .map(({ block, sec }) => item(block, sec)));
  add(errors, 'placeholders', sent.filter(({ block }) => hasPlaceholder(block)).map(({ block, sec }) => item(block, sec)));

  // The articles the Drive guard says about: gone from the folder, or
  // changed there since they went in. The server holds the email back for
  // the same (services/issues.py).
  const byId = new Map(articles.map((a) => [Number(a.id), a]));
  const flagged = (test) => sent.filter(({ block }) => block.type === 'article' && test(byId.get(Number(block.itemId))))
    .map(({ block, sec }) => ({ ...item(block, sec), itemId: Number(block.itemId) }));
  add(errors, 'driveGone', flagged((a) => a && a.withdrawn));
  add(errors, 'driveChanged', flagged((a) => a && !a.withdrawn && a.drive_changed_at));

  const links = collectLinks(design);
  const mergeTags = new Set();
  for (const { block } of sent) {
    const text = [block.html, block.summary, block.source, block.text, block.title].filter(Boolean).join(' ');
    (text.match(MERGE_TAG) || []).forEach((m) => mergeTags.add(m));
  }
  links.forEach((l) => (l.url.match(MERGE_TAG) || []).forEach((m) => mergeTags.add(m)));

  // A link into the association's Drive: readers cannot open it, and one to
  // a file shared with anyone who has the link would give the file away.
  // The server refuses it too (services/issues.py).
  add(errors, 'driveLink', links.filter((l) => DRIVE_LINK.test(l.url))
    .map((l) => ({ blockId: l.blockId, sectionId: l.sectionId, snippet: l.text || l.url, type: 'link' })));
  if (!links.some((l) => l.url === '*|UNSUB|*')) add(errors, 'unsubscribe', true);
  if (!ADDRESS_TAGS.some((tag) => mergeTags.has(tag))) add(errors, 'address', true);
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
  add(warnings, 'missing', articles.filter((a) => !placed.has(Number(a.id)) && !a.withdrawn)
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
  // Every place a picture was meant to go and none has: the preview shows a
  // wireframe there, and the email that goes out leaves it out.
  add(warnings, 'emptyImages', sent.filter(({ block }) => ((block.type === 'image' || block.type === 'logo') && !block.src)
    || (block.type === 'video' && !(block.thumb && block.thumb.src))
    || (block.type === 'article' && block.layout && block.layout !== 'text' && !(block.image && block.image.src)))
    .map(({ block, sec }) => item(block, sec)));

  const emptyLinks = links.filter((l) => l.kind !== 'social' && (l.url === '' || l.url === '#'));
  const seen = new Set();
  add(warnings, 'emptyLinks', emptyLinks.filter((l) => !seen.has(l.blockId) && seen.add(l.blockId))
    .map((l) => ({ blockId: l.blockId, sectionId: l.sectionId, snippet: l.text, type: 'link' })));

  if (size > GMAIL_CLIP) add(warnings, 'size', true, { kb: Math.round(size / 1024) });

  return {
    errors,
    warnings,
    links,
    mergeTags: [...mergeTags],
    errorCount: errors.reduce((n, e) => n + e.count, 0),
    warningCount: warnings.reduce((n, w) => n + w.count, 0),
  };
}
