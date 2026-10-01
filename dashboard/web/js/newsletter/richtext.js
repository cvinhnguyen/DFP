// Rich text in the newsletter: what a text block, an article's summary or the
// footer says, kept as a small, fixed part of HTML.
//
// Whatever the editors type or paste is cut down to this part when it is
// stored (fromDom, in the editor), and whatever is stored is read back through
// parse, which keeps only this part again. So the email can be built from it
// with plain string work on any page, and nothing a summary, a pasted web page
// or an edited database row carries can reach the email as a script.

import { FONTS } from './fonts.js';

const BLOCKS = new Set(['p', 'h1', 'h2', 'h3', 'h4', 'ul', 'ol', 'li']);
const INLINES = new Set(['a', 'strong', 'em', 'u', 's', 'span', 'sup', 'sub']);
const RENAMED = { b: 'strong', i: 'em', strike: 's', del: 's', ins: 'u', div: 'p', blockquote: 'p', h5: 'h4', h6: 'h4', font: 'span', mark: 'span', code: 'span', small: 'span', big: 'span', label: 'span', cite: 'em', address: 'p', pre: 'p', section: 'p', article: 'p', header: 'p', footer: 'p', td: 'p', th: 'p', dt: 'p', dd: 'p', figcaption: 'p' };
// Dropped with everything inside them.
const DROPPED = new Set(['script', 'style', 'noscript', 'template', 'iframe', 'object', 'embed', 'svg', 'math', 'head', 'title', 'meta', 'link', 'button', 'select', 'textarea', 'input', 'video', 'audio', 'canvas', 'img', 'picture', 'map', 'form']);

const HEX = /^#[0-9a-f]{6}$/;
const SIZE = /^(\d{1,2})px$/;

function colour(value) {
  const v = String(value || '').trim().toLowerCase();
  if (HEX.test(v)) return v;
  if (/^#[0-9a-f]{3}$/.test(v)) return `#${v[1]}${v[1]}${v[2]}${v[2]}${v[3]}${v[3]}`;
  const rgb = v.match(/^rgba?\(\s*(\d{1,3})\s*,\s*(\d{1,3})\s*,\s*(\d{1,3})\s*(?:,\s*([\d.]+)\s*)?\)$/);
  if (!rgb) return null;
  if (rgb[4] !== undefined && Number(rgb[4]) === 0) return null;   // transparent
  return `#${[rgb[1], rgb[2], rgb[3]].map((n) => Math.min(255, Number(n)).toString(16).padStart(2, '0')).join('')}`;
}

function fontStack(value) {
  const first = String(value || '').split(',')[0].trim().replace(/^["']|["']$/g, '').toLowerCase();
  const found = FONTS.find((f) => f.label.toLowerCase() === first || f.stack.split(',')[0].replace(/"/g, '').trim().toLowerCase() === first);
  return found ? found.stack : null;
}

// Each style an element may keep, and what turns a value into an allowed one
// (or null, which drops it).
const STYLE = {
  'text-align': (v) => (/^(left|center|right|justify)$/.test(v) ? v : (v === 'start' ? 'left' : v === 'end' ? 'right' : null)),
  'line-height': (v) => {
    const n = Number(v);
    return Number.isFinite(n) && n >= 0.8 && n <= 3 ? String(Math.round(n * 100) / 100) : null;
  },
  'letter-spacing': (v) => {
    if (v === 'normal') return null;
    const m = String(v).match(/^(-?\d{1,2}(?:\.\d+)?)px$/);
    return m && Math.abs(Number(m[1])) <= 20 ? `${Math.round(Number(m[1]) * 10) / 10}px` : null;
  },
  color: colour,
  'background-color': colour,
  'font-size': (v) => {
    const m = String(v).match(SIZE);
    return m && Number(m[1]) >= 8 && Number(m[1]) <= 72 ? `${Number(m[1])}px` : null;
  },
  'font-family': fontStack,
  'font-weight': (v) => (/^(bold|[6-9]00)$/.test(v) ? 'bold' : (/^(normal|[1-4]00)$/.test(v) ? 'normal' : null)),
  'font-style': (v) => (v === 'italic' || v === 'normal' ? v : null),
  'text-decoration': (v) => {
    const words = String(v).split(/\s+/).filter((w) => ['underline', 'line-through', 'none'].includes(w));
    return words.length ? [...new Set(words)].join(' ') : null;
  },
};
const BLOCK_STYLES = ['text-align', 'line-height', 'letter-spacing'];
const STYLES_OF = {
  p: BLOCK_STYLES, h1: BLOCK_STYLES, h2: BLOCK_STYLES, h3: BLOCK_STYLES, h4: BLOCK_STYLES, li: BLOCK_STYLES,
  span: ['color', 'background-color', 'font-size', 'font-family', 'font-weight', 'font-style', 'text-decoration', 'letter-spacing'],
  a: ['color', 'font-weight', 'text-decoration'],
};

// Addresses a link may have: the web, email, phone, a place in the email,
// or one of Mailchimp's merge tags such as *|UNSUB|*.
export function cleanHref(value) {
  const v = String(value || '').trim();
  if (/^\*\|[A-Z0-9_:]+\|\*$/.test(v)) return v;
  if (/^(https?:\/\/|mailto:|tel:)/i.test(v)) return v.replace(/[\s"<>]/g, (c) => encodeURIComponent(c));
  if (/^#[\w-]*$/.test(v)) return v;
  return '';
}

export function parseStyle(text) {
  const out = {};
  for (const part of String(text || '').split(';')) {
    const at = part.indexOf(':');
    if (at < 1) continue;
    const name = part.slice(0, at).trim().toLowerCase();
    const value = part.slice(at + 1).trim().replace(/\s*!important$/i, '');
    if (name && value) out[name] = value;
  }
  return out;
}

function keepStyles(tag, style) {
  const allowed = STYLES_OF[tag] || [];
  const out = {};
  for (const name of allowed) {
    if (style[name] === undefined) continue;
    const value = STYLE[name](String(style[name]).trim().toLowerCase());
    if (value) out[name] = value;
  }
  return out;
}

export function styleText(style) {
  return Object.entries(style).map(([k, v]) => `${k}:${v}`).join(';');
}

// ---------- reading stored text ----------

const ENTITIES = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ', '#39': "'" };

export function decode(text) {
  return String(text).replace(/&(#x[0-9a-f]+|#\d+|[a-z]+\d*);/gi, (whole, name) => {
    if (name[0] === '#') {
      const code = name[1] === 'x' || name[1] === 'X' ? parseInt(name.slice(2), 16) : parseInt(name.slice(1), 10);
      return Number.isFinite(code) && code > 0 && code < 0x110000 ? String.fromCodePoint(code) : '';
    }
    return ENTITIES[name.toLowerCase()] ?? whole;
  });
}

export function escapeText(text) {
  return String(text).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/ /g, '&nbsp;');
}

export function escapeAttr(text) {
  return String(text).replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function readAttrs(text) {
  const attrs = {};
  const re = /([a-zA-Z][\w:-]*)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'>]+)))?/g;
  let m;
  while ((m = re.exec(text))) attrs[m[1].toLowerCase()] = decode(m[2] ?? m[3] ?? m[4] ?? '');
  return attrs;
}

function element(tag, attrs) {
  const node = { tag, children: [] };
  if (tag === 'a') {
    node.href = cleanHref(attrs.href);
    if (attrs.target === '_blank') node.blank = true;
  }
  const style = keepStyles(tag, parseStyle(attrs.style));
  // <font> from older editors carries its look in attributes.
  if (attrs.color) {
    const c = colour(attrs.color);
    if (c && !style.color) style.color = c;
  }
  if (attrs.face && !style['font-family']) {
    const f = fontStack(attrs.face);
    if (f) style['font-family'] = f;
  }
  if (attrs.align && BLOCKS.has(tag) && !style['text-align']) {
    const a = STYLE['text-align'](attrs.align.toLowerCase());
    if (a) style['text-align'] = a;
  }
  if (Object.keys(style).length) node.style = style;
  return node;
}

// Stored text as a tree: { children: [ { tag, children, style?, href?, blank? } | { text } ] }.
// Tags outside the allowed part are renamed or dropped, keeping their text.
export function parse(html) {
  const root = { tag: '#root', children: [] };
  const stack = [root];
  const top = () => stack[stack.length - 1];
  const re = /<!--[\s\S]*?-->|<\/?([a-zA-Z][a-zA-Z0-9]*)((?:\s+[^>]*?)?)\s*\/?>|<|[^<]+/g;
  let skipping = null;
  let m;
  const source = String(html || '');
  while ((m = re.exec(source))) {
    const token = m[0];
    if (token.startsWith('<!--')) continue;
    if (!m[1]) {
      if (skipping) continue;
      const text = token === '<' ? '<' : decode(token);
      if (text) top().children.push({ text });
      continue;
    }
    const closing = token[1] === '/';
    let tag = m[1].toLowerCase();
    if (skipping) {
      if (closing && tag === skipping) skipping = null;
      continue;
    }
    if (DROPPED.has(tag)) {
      if (!closing && !token.endsWith('/>') && tag !== 'img' && tag !== 'input' && tag !== 'meta' && tag !== 'link') skipping = tag;
      continue;
    }
    if (tag === 'br' || tag === 'hr') {
      if (!closing) top().children.push({ tag: 'br' });
      continue;
    }
    tag = RENAMED[tag] || tag;
    if (!BLOCKS.has(tag) && !INLINES.has(tag)) continue;   // unknown: keep what is inside
    if (closing) {
      for (let i = stack.length - 1; i > 0; i -= 1) {
        if (stack[i].tag === tag) {
          stack.length = i;
          break;
        }
      }
      continue;
    }
    const node = element(tag, readAttrs(m[2] || ''));
    top().children.push(node);
    stack.push(node);
  }
  return tidy(normalise(root));
}

// ---------- the shape every stored text has ----------

const isBlock = (n) => n.tag && BLOCKS.has(n.tag);

function inlineOnly(nodes) {
  const out = [];
  for (const n of nodes) {
    if (n.text !== undefined || n.tag === 'br') out.push(n);
    else if (isBlock(n)) {
      if (out.length && out[out.length - 1].tag !== 'br') out.push({ tag: 'br' });
      out.push(...inlineOnly(n.children));
    } else out.push({ ...n, children: inlineOnly(n.children) });
  }
  return out;
}

function listItems(list) {
  const items = [];
  let loose = [];
  const flush = () => {
    if (loose.length) items.push({ tag: 'li', children: inlineOnly(loose) });
    loose = [];
  };
  for (const n of list.children) {
    if (n.tag === 'li') {
      flush();
      items.push({ ...n, children: inlineOnly(n.children) });
    } else if (n.tag === 'ul' || n.tag === 'ol') {
      flush();
      items.push(...listItems(n));
    } else loose.push(n);
  }
  flush();
  return items.filter((li) => hasContent(li.children));
}

function hasContent(nodes) {
  return nodes.some((n) => (n.text !== undefined ? n.text.trim() !== '' : n.tag === 'br' || hasContent(n.children)));
}

// Top level: paragraphs, headings and lists only. Loose text is gathered into
// paragraphs, a heading or paragraph holds no blocks, a list holds items.
function normalise(root) {
  const out = [];
  let loose = [];
  const flush = () => {
    const kept = inlineOnly(loose);
    // Leading and trailing line breaks of loose text are only spacing.
    while (kept.length && kept[0].tag === 'br') kept.shift();
    while (kept.length && kept[kept.length - 1].tag === 'br') kept.pop();
    if (kept.length && hasContent(kept)) out.push({ tag: 'p', children: kept });
    loose = [];
  };
  const visit = (nodes) => {
    for (const n of nodes) {
      if (n.tag === 'ul' || n.tag === 'ol') {
        flush();
        const items = listItems(n);
        if (items.length) out.push({ ...n, children: items });
      } else if (n.tag === 'li') {
        flush();
        out.push({ tag: 'ul', children: [{ ...n, children: inlineOnly(n.children) }] });
      } else if (isBlock(n)) {
        flush();
        // A block holding blocks is unwrapped; one holding text is kept.
        if (n.children.some(isBlock)) visit(n.children);
        else out.push({ ...n, children: inlineOnly(n.children) });
      } else loose.push(n);
    }
  };
  visit(root.children);
  flush();
  // Lists side by side of the same kind become one.
  const merged = [];
  for (const n of out) {
    const last = merged[merged.length - 1];
    if (last && (n.tag === 'ul' || n.tag === 'ol') && last.tag === n.tag && !n.style && !last.style) last.children.push(...n.children);
    else merged.push(n);
  }
  return { tag: '#root', children: merged };
}

// ---------- writing it back ----------

function openTag(n) {
  let attrs = '';
  if (n.tag === 'a') {
    attrs += ` href="${escapeAttr(n.href || '')}"`;
    if (n.blank) attrs += ' target="_blank" rel="noopener noreferrer"';
  }
  if (n.style && Object.keys(n.style).length) attrs += ` style="${escapeAttr(styleText(n.style))}"`;
  return `<${n.tag}${attrs}>`;
}

function serialiseNodes(nodes) {
  return nodes.map((n) => {
    if (n.text !== undefined) return escapeText(n.text);
    if (n.tag === 'br') return '<br>';
    return `${openTag(n)}${serialiseNodes(n.children)}</${n.tag}>`;
  }).join('');
}

// The stored form: always the same for the same text, so two versions can be
// compared as strings.
export function serialise(tree) {
  return serialiseNodes(tree.children);
}

export function clean(html) {
  return serialise(parse(html));
}

// ---------- from the editor's own page ----------

// What the browser holds after typing or pasting, as stored text. Reads the
// browser's own understanding of each element, so styles written by the
// browser while editing (a colour, a size) come along when allowed.
//
// defaults, when given, is what each kind of text looks like anyway
// ({ p: { color: ..., 'font-size': ... }, a: {...} }). The browser sometimes
// writes those onto the text itself, joining two paragraphs for example; a
// style that only repeats them is left out, so it does not stick when the
// email's styles change later.
//
// styles: false keeps the structure only (headings, lists, bold, links),
// for text pasted from a web page or a word processor, whose fonts and
// colours are not the newsletter's.
export function fromDom(container, defaults = null, { styles = true } = {}) {
  const redundant = (tag, block, style) => {
    if (!defaults || !style) return style;
    const base = tag === 'a' ? defaults.a : (defaults[tag] || defaults[block] || defaults.p);
    if (!base) return style;
    for (const [name, value] of Object.entries(style)) {
      if (base[name] !== undefined && base[name] !== null && String(base[name]).toLowerCase() === String(value).toLowerCase()) delete style[name];
    }
    return Object.keys(style).length ? style : undefined;
  };
  const walk = (node, block) => {
    const out = [];
    for (const child of node.childNodes) {
      if (child.nodeType === 3) {
        out.push({ text: child.nodeValue.replace(/[\r\n\t]+/g, ' ') });
        continue;
      }
      if (child.nodeType !== 1) continue;
      let tag = child.tagName.toLowerCase();
      if (DROPPED.has(tag)) continue;
      if (tag === 'br') {
        out.push({ tag: 'br' });
        continue;
      }
      tag = RENAMED[tag] || tag;
      const inBlock = BLOCKS.has(tag) && tag !== 'ul' && tag !== 'ol' ? tag : block;
      const kids = walk(child, inBlock);
      if (!BLOCKS.has(tag) && !INLINES.has(tag)) {
        out.push(...kids);
        continue;
      }
      const attrs = {};
      for (const a of child.attributes) attrs[a.name.toLowerCase()] = a.value;
      const n = element(tag, attrs);
      n.style = styles ? redundant(tag, inBlock, n.style) : undefined;
      if (!n.style) delete n.style;
      n.children = kids;
      // A bold or italic span becomes strong or em.
      if (tag === 'span' && n.style) {
        let wrapped = n;
        if (n.style['font-weight'] === 'bold') {
          delete n.style['font-weight'];
          wrapped = { tag: 'strong', children: [wrapped] };
        }
        if (n.style['font-style'] === 'italic') {
          delete n.style['font-style'];
          wrapped = { tag: 'em', children: [wrapped] };
        }
        if (n.style['text-decoration'] === 'underline') {
          delete n.style['text-decoration'];
          wrapped = { tag: 'u', children: [wrapped] };
        }
        if (!Object.keys(n.style).length) delete n.style;
        out.push(wrapped);
        continue;
      }
      out.push(n);
    }
    return out;
  };
  return serialise(tidy(normalise({ tag: '#root', children: walk(container, 'p') })));
}

// A span with nothing left to say is unwrapped, and empty inline elements go.
function tidy(tree) {
  const fix = (nodes) => {
    const out = [];
    for (const n of nodes) {
      if (n.text !== undefined || n.tag === 'br') {
        out.push(n);
        continue;
      }
      const children = fix(n.children);
      if (INLINES.has(n.tag)) {
        if (!children.length) continue;
        if (n.tag === 'span' && !n.style) {
          out.push(...children);
          continue;
        }
        if (n.tag === 'a' && !n.href) {
          out.push(...children);
          continue;
        }
      }
      out.push({ ...n, children });
    }
    // Neighbouring text is one text.
    const joined = [];
    for (const n of out) {
      const last = joined[joined.length - 1];
      if (last && last.text !== undefined && n.text !== undefined) last.text += n.text;
      else joined.push(n);
    }
    return joined;
  };
  return { tag: '#root', children: fix(tree.children) };
}

// ---------- reading it ----------

// The words, as plain text: for checks, the plain-text email and copying.
export function toText(html) {
  const lines = [];
  const inline = (nodes) => nodes.map((n) => (n.text !== undefined ? n.text : n.tag === 'br' ? '\n' : inline(n.children))).join('');
  for (const n of parse(html).children) {
    if (n.tag === 'ul' || n.tag === 'ol') {
      n.children.forEach((li, i) => lines.push(`${n.tag === 'ol' ? `${i + 1}.` : '•'} ${inline(li.children).trim()}`));
    } else lines.push(inline(n.children).trim());
  }
  return lines.join('\n').replace(/ /g, ' ').replace(/[ \t]+\n/g, '\n').trim();
}

export function isEmpty(html) {
  return toText(html) === '';
}

// Every link in the text: where it goes and what it says.
export function links(html) {
  const found = [];
  const visit = (nodes) => nodes.forEach((n) => {
    if (n.tag === 'a') found.push({ href: n.href || '', text: toText(serialiseNodes(n.children)) });
    if (n.children) visit(n.children);
  });
  visit(parse(html).children);
  return found;
}

// Plain text as stored text: a blank line starts a paragraph, a single line
// break stays a line break.
export function fromText(text) {
  return String(text || '').trim().split(/\n\s*\n/).filter((p) => p.trim())
    .map((p) => `<p>${p.split('\n').map((line) => escapeText(line.trim())).join('<br>')}</p>`).join('');
}
