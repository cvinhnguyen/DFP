// The email itself, built from the design: tables and inline styles, which is
// what email programs, Outlook above all, still need, and a little CSS for
// phones. The same code draws the editor's canvas, the finished email for
// Mailchimp, and the pieces the editors can paste into Mailchimp themselves.
//
//   canvas    the editor's view: every section, block and editable text
//             carries an id the editor finds it by, and empty places show
//             what can go in them
//   export    the whole email for Mailchimp. Text and images are marked
//             mc:edit, so they can still be changed in Mailchimp's editor.
//   fragment  the same email without <html>, <head> and the hidden preview
//             text, for pasting into a Code block in Mailchimp's own builder
//
// sectionsForPaste gives each section as plain formatted text for pasting
// into a text block of the association's own Mailchimp template.

import {
  WIDTH, BLOCK_PADDING, BUTTON_SIZES, NETWORK_NAMES, columnShares, isArticleSection, isSent,
} from './model.js';
import { parse, escapeText, escapeAttr, styleText, cleanHref, toText, links as textLinks } from './richtext.js';
import { fontStack } from './fonts.js';

const HEADINGS = ['h1', 'h2', 'h3', 'h4'];
const TABLE = 'role="presentation" cellpadding="0" cellspacing="0" border="0"';

function css(style) {
  return escapeAttr(styleText(Object.fromEntries(Object.entries(style).filter(([, v]) => v !== undefined && v !== null && v !== ''))));
}

function px(n) {
  return `${Math.round(Number(n) || 0)}px`;
}

export function blockPadding(block, styles) {
  const [t, r, b, l] = BLOCK_PADDING[block.type] || [0, 0, 0, 0];
  const s = block.style || {};
  const top = block.type === 'divider' ? styles.divider.paddingTop : t;
  const bottom = block.type === 'divider' ? styles.divider.paddingBottom : b;
  return { top: s.paddingTop ?? top, right: s.paddingRight ?? r, bottom: s.paddingBottom ?? bottom, left: s.paddingLeft ?? l };
}

export function buttonLook(styles, overrides = {}) {
  return { ...styles.button, ...Object.fromEntries(Object.entries(overrides).filter(([k]) => k in styles.button)) };
}

// ---------- text ----------

function textCss(tag, ctx) {
  const t = ctx.styles.text[tag] || ctx.styles.text.p;
  return {
    margin: `0 0 ${px(t.spacing)} 0`,
    padding: '0',
    'font-family': fontStack(t.font),
    'font-size': px(t.size),
    'line-height': String(t.lineHeight),
    color: ctx.sectionStyle.textColor || t.color,
    'font-weight': t.bold ? 'bold' : 'normal',
    'font-style': t.italic ? 'italic' : 'normal',
    'letter-spacing': t.letterSpacing ? px(t.letterSpacing) : undefined,
    'text-align': t.align && t.align !== 'left' ? t.align : undefined,
  };
}

function linkCss(ctx) {
  return {
    color: ctx.sectionStyle.linkColor || ctx.styles.link.color,
    'text-decoration': ctx.styles.link.underline ? 'underline' : 'none',
  };
}

function href(value) {
  return escapeAttr(cleanHref(value) || '#');
}

function renderInline(nodes, ctx) {
  return nodes.map((n) => {
    if (n.text !== undefined) return escapeText(n.text);
    if (n.tag === 'br') return '<br>';
    const inner = renderInline(n.children, ctx);
    if (n.tag === 'a') {
      const target = n.blank ? ' target="_blank"' : '';
      return `<a href="${href(n.href)}"${target} style="${css({ ...linkCss(ctx), ...(n.style || {}) })}">${inner}</a>`;
    }
    if (n.tag === 'span') return n.style ? `<span style="${css(n.style)}">${inner}</span>` : inner;
    return `<${n.tag}>${inner}</${n.tag}>`;
  }).join('');
}

// Stored text with the email's own look written into every paragraph,
// heading and link. The editors' own changes (a centred line, a colour)
// stay on top of it.
//
// On the editor's canvas the email's look comes from CSS instead (see
// canvasTextCss), and only the editors' own changes are written on the
// elements. What the canvas holds after typing is read back as the stored
// text, so it must not carry the email's look as if an editor had chosen it.
export function renderRich(html, ctx) {
  const blocks = parse(html).children;
  if (ctx.mode === 'canvas') return blocks.map((n) => canvasNode(n)).join('');
  return blocks.map((n, i) => {
    const last = i === blocks.length - 1;
    if (n.tag === 'ul' || n.tag === 'ol') {
      const p = ctx.styles.text.p;
      const items = n.children.map((li, j) => {
        const style = { ...textCss('p', ctx), margin: j === n.children.length - 1 ? '0' : '0 0 4px 0', ...(li.style || {}) };
        return `<li class="nl-p" style="${css(style)}">${renderInline(li.children, ctx) || '&nbsp;'}</li>`;
      }).join('');
      return `<${n.tag} style="${css({ margin: last ? '0' : `0 0 ${px(p.spacing)} 0`, padding: '0 0 0 24px' })}">${items}</${n.tag}>`;
    }
    const tag = HEADINGS.includes(n.tag) ? n.tag : 'p';
    const style = { ...textCss(tag, ctx), ...(last ? { margin: '0' } : {}), ...(n.style || {}) };
    if (style['letter-spacing'] === '0px') delete style['letter-spacing'];
    return `<${tag} class="nl-${tag}" style="${css(style)}">${renderInline(n.children, ctx) || '<br>'}</${tag}>`;
  }).join('');
}

function own(n) {
  return n.style && Object.keys(n.style).length ? ` style="${css(n.style)}"` : '';
}

function canvasNode(n) {
  if (n.text !== undefined) return escapeText(n.text);
  if (n.tag === 'br') return '<br>';
  const inner = n.children.map(canvasNode).join('');
  if (n.tag === 'a') return `<a href="${href(n.href)}"${n.blank ? ' target="_blank"' : ''}${own(n)}>${inner}</a>`;
  if (n.tag === 'span') return n.style ? `<span${own(n)}>${inner}</span>` : inner;
  const empty = ['p', 'h1', 'h2', 'h3', 'h4', 'li'].includes(n.tag) && !inner ? '<br>' : inner;
  return `<${n.tag}${own(n)}>${empty}</${n.tag}>`;
}

// The email's text styles as CSS rules for the canvas: what renderRich
// writes on every element in the finished email, here once per kind of
// element, and per section where a section has its own text or link colour.
export function canvasTextCss(design) {
  const styles = design.styles;
  const rule = (selector, map) => `${selector}{${styleText(Object.fromEntries(Object.entries(map).filter(([, v]) => v !== undefined && v !== null && v !== '')))}}`;
  const base = (tag) => {
    const t = styles.text[tag];
    return {
      margin: `0 0 ${px(t.spacing)} 0`, padding: '0', 'font-family': fontStack(t.font), 'font-size': px(t.size),
      'line-height': String(t.lineHeight), color: t.color, 'font-weight': t.bold ? 'bold' : 'normal',
      'font-style': t.italic ? 'italic' : 'normal', 'letter-spacing': t.letterSpacing ? px(t.letterSpacing) : 'normal',
      'text-align': t.align || 'left',
    };
  };
  const out = [];
  for (const tag of ['p', 'h1', 'h2', 'h3', 'h4']) out.push(rule(`.nl-edit ${tag}`, base(tag)));
  out.push(rule('.nl-edit ul,.nl-edit ol', { margin: `0 0 ${px(styles.text.p.spacing)} 0`, padding: '0 0 0 24px' }));
  out.push(rule('.nl-edit li', { ...base('p'), margin: '0 0 4px 0' }));
  out.push('.nl-edit>:last-child,.nl-edit li:last-child{margin-bottom:0;}');
  out.push(rule('.nl-edit a', { color: styles.link.color, 'text-decoration': styles.link.underline ? 'underline' : 'none' }));
  for (const sec of design.sections) {
    const s = sec.style || {};
    const at = `[data-section-id="${sec.id}"]`;
    if (s.textColor) out.push(rule(['p', 'h1', 'h2', 'h3', 'h4', 'li'].map((tag) => `${at} .nl-edit ${tag}`).join(','), { color: s.textColor }));
    if (s.linkColor) out.push(rule(`${at} .nl-edit a`, { color: s.linkColor }));
  }
  // The same base values, for reading typed text back: a style the browser
  // writes that only repeats these is not the editors' own.
  return out.join('');
}

// What each kind of text looks like by default, as the browser reports it,
// so styles that only repeat these can be left out of the stored text.
export function textDefaults(design, sectionStyle = {}) {
  const map = {};
  for (const tag of ['p', 'h1', 'h2', 'h3', 'h4']) {
    const t = design.styles.text[tag];
    map[tag] = {
      'font-family': fontStack(t.font), 'font-size': px(t.size), color: sectionStyle.textColor || t.color,
      'line-height': String(t.lineHeight), 'letter-spacing': t.letterSpacing ? px(t.letterSpacing) : null,
      'font-weight': t.bold ? 'bold' : 'normal', 'font-style': t.italic ? 'italic' : 'normal',
    };
  }
  map.li = map.p;
  map.a = { color: sectionStyle.linkColor || design.styles.link.color };
  return map;
}

// ---------- a block's frame ----------

function borderCss(look) {
  return look.borderStyle && look.borderStyle !== 'none' && Number(look.borderWidth) > 0
    ? `${px(look.borderWidth)} ${look.borderStyle} ${look.borderColor}` : undefined;
}

// Every block is a one-cell table: its padding, background and border.
function frame(block, inner, ctx, extra = {}) {
  const pad = blockPadding(block, ctx.styles);
  const s = block.style || {};
  const mobile = ctx.styles.background.mobilePadding;
  // On a phone the side padding shrinks to the email's mobile padding, for
  // blocks that have more than that.
  const shrink = !ctx.inColumn && (pad.left > mobile || pad.right > mobile);
  const cell = {
    padding: `${px(pad.top)} ${px(pad.right)} ${px(pad.bottom)} ${px(pad.left)}`,
    'background-color': s.background || undefined,
    border: borderCss(s),
    'border-radius': s.radius ? px(s.radius) : undefined,
    'text-align': extra.align && extra.align !== 'left' ? extra.align : undefined,
    ...(extra.cell || {}),
  };
  const attrs = [];
  if (ctx.mode === 'canvas') {
    attrs.push(`data-block-id="${escapeAttr(block.id)}"`, `data-type="${escapeAttr(block.type)}"`);
    if (block.type === 'article') attrs.push(`data-checked="${block.checked ? 'true' : 'false'}"`);
    if (block.placeholder) attrs.push('data-placeholder="true"');
  }
  const align = extra.align ? ` align="${escapeAttr(extra.align)}"` : '';
  const bg = s.background ? ` bgcolor="${escapeAttr(s.background)}"` : '';
  const mc = extra.mcEdit && ctx.mode === 'export' ? ` mc:edit="${escapeAttr(block.id)}"` : '';
  const content = `<td${shrink ? ' class="nl-pad"' : ''}${align}${bg}${mc} valign="top" style="${css(cell)}">${inner}</td>`;
  const open = `<table ${TABLE} width="100%" style="width:100%;border-collapse:separate;"${attrs.length ? ` ${attrs.join(' ')}` : ''}>`;
  // A margin keeps a coloured or bordered block in from the edges, the way
  // the pink tips box sits inside the email.
  const margin = [s.marginTop, s.marginRight, s.marginBottom, s.marginLeft].map((v) => Number(v) || 0);
  if (margin.some(Boolean)) {
    const outer = { padding: margin.map(px).join(' ') };
    return `${open}<tr><td${shrink ? ' class="nl-pad"' : ''} valign="top" style="${css(outer)}">`
      + `<table ${TABLE} width="100%" style="width:100%;border-collapse:separate;"><tr>${content.replace(' class="nl-pad"', '')}</tr></table>`
      + '</td></tr></table>';
  }
  return `${open}<tr>${content}</tr></table>`;
}

function innerWidth(block, ctx) {
  const pad = blockPadding(block, ctx.styles);
  return Math.max(40, ctx.width - pad.left - pad.right);
}

function editable(name, inner, ctx, extraClass = '') {
  if (ctx.mode !== 'canvas') return inner;
  return `<div class="nl-edit${extraClass ? ` ${extraClass}` : ''}" data-edit="${name}">${inner}</div>`;
}

function placeholderBox(text, ctx, height = 120) {
  if (ctx.mode !== 'canvas') return '';
  return `<div class="nl-ph" style="min-height:${px(height)}">${escapeText(text)}</div>`;
}

// ---------- the blocks ----------

function imageTag(src, alt, width, look, ctx, options = {}) {
  const style = {
    display: 'block', width: px(width), 'max-width': '100%', height: 'auto', border: '0', outline: 'none',
    'text-decoration': 'none', margin: options.align === 'center' ? '0 auto' : (options.align === 'right' ? '0 0 0 auto' : undefined),
    'border-radius': look.radius ? px(look.radius) : undefined,
    'border-style': undefined,
  };
  const border = borderCss(look);
  if (border) style.border = border;
  const mc = options.mcEdit && ctx.mode === 'export' ? ` mc:edit="${escapeAttr(options.mcEdit)}"` : '';
  const cls = options.fill ? ' class="nl-fill"' : '';
  return `<img src="${escapeAttr(ctx.mapSrc(src))}" alt="${escapeAttr(alt || '')}" width="${Math.round(width)}"${cls}${mc} style="${css(style)}">`;
}

function linked(link, inner) {
  const url = cleanHref(link && link.url);
  if (!url) return inner;
  return `<a href="${escapeAttr(url)}"${link.blank !== false ? ' target="_blank"' : ''} style="text-decoration:none;">${inner}</a>`;
}

function imageWidth(img, available) {
  const natural = Number(img.naturalWidth) || available;
  if (img.size === 'fill') return available;
  if (img.size === 'scale') return Math.max(20, Math.round(available * Math.min(100, Math.max(10, Number(img.scale) || 100)) / 100));
  return Math.min(natural, available);
}

const BLOCKS = {
  text(block, ctx) {
    return frame(block, editable('html', renderRich(block.html, ctx), ctx), ctx, { mcEdit: true });
  },

  footer(block, ctx) {
    return frame(block, editable('html', renderRich(block.html, ctx), ctx), ctx, { mcEdit: true });
  },

  image(block, ctx) {
    const look = { ...ctx.styles.image, ...block.style };
    const align = block.style.align || ctx.styles.image.align;
    if (!block.src) {
      if (ctx.mode !== 'canvas') return '';
      return frame(block, placeholderBox(ctx.t('canvas.addImage'), ctx, 160), ctx);
    }
    const width = imageWidth(block, innerWidth(block, ctx));
    const img = imageTag(block.src, block.alt, width, look, ctx, { align, fill: block.size === 'fill', mcEdit: `${block.id}_img` });
    return frame(block, linked(block.link, img), ctx, { align });
  },

  logo(block, ctx) {
    const align = block.style.align || ctx.styles.logo.align;
    if (!block.src) {
      if (ctx.mode !== 'canvas') return '';
      return frame(block, placeholderBox(ctx.t('canvas.addLogo'), ctx, 60), ctx, { align });
    }
    const width = Math.min(Number(block.width) || 160, innerWidth(block, ctx));
    const img = imageTag(block.src, block.alt, width, { radius: 0 }, ctx, { align, mcEdit: `${block.id}_img` });
    return frame(block, linked(block.link, img), ctx, { align });
  },

  button(block, ctx) {
    return frame(block, buttonHtml(block.text, block.link, buttonLook(ctx.styles, block.style), ctx, 'button'), ctx);
  },

  divider(block, ctx) {
    const d = { ...ctx.styles.divider, ...Object.fromEntries(Object.entries(block.style).filter(([k]) => ['line', 'color', 'thickness'].includes(k))) };
    const line = `<table ${TABLE} width="100%" style="width:100%;border-collapse:collapse;"><tr>`
      + `<td style="${css({ 'border-top': `${px(d.thickness)} ${d.line} ${d.color}`, 'font-size': '1px', 'line-height': '1px', height: '1px' })}">&nbsp;</td></tr></table>`;
    return frame(block, line, ctx);
  },

  spacer(block, ctx) {
    const h = Math.max(4, Math.min(200, Number(block.height) || 24));
    const cell = `<table ${TABLE} width="100%" style="width:100%;"><tr><td style="${css({ height: px(h), 'line-height': px(h), 'font-size': '1px' })}">&nbsp;</td></tr></table>`;
    return frame(block, cell, ctx);
  },

  social(block, ctx) {
    const items = (block.items || []).filter((i) => ctx.mode === 'canvas' || cleanHref(i.url));
    if (!items.length) {
      if (ctx.mode !== 'canvas') return '';
      return frame(block, placeholderBox(ctx.t('canvas.addSocial'), ctx, 40), ctx);
    }
    const align = block.style.align || 'left';
    const size = { small: 24, medium: 32, large: 40 }[block.iconSize] || 32;
    const gap = Math.max(0, Math.min(40, Number(block.spacing) || 0));
    const link = linkCss(ctx);
    const one = (item) => {
      const url = cleanHref(item.url) || '#';
      const label = item.label || NETWORK_NAMES[item.network] || item.network;
      const icon = block.display === 'text' ? ''
        : `<img src="${escapeAttr(ctx.mapSrc(`/img/social/${item.network}-${block.iconStyle || 'color'}.png`))}" alt="${escapeAttr(label)}" width="${size}" height="${size}" style="display:block;border:0;width:${px(size)};height:${px(size)};">`;
      const text = block.display === 'icon' ? ''
        : `<span style="${css({ ...textCss('p', ctx), margin: '0', ...link, 'font-size': px(Math.max(12, size / 2 + 2)), 'line-height': px(size) })}">${escapeText(label)}</span>`;
      return `<a href="${escapeAttr(url)}" target="_blank" style="text-decoration:none;display:inline-block;">`
        + (icon && text ? `<table ${TABLE}><tr><td valign="middle">${icon}</td><td valign="middle" style="padding-left:6px;">${text}</td></tr></table>` : `${icon}${text}`)
        + '</a>';
    };
    let inner;
    if (block.layout === 'vertical') {
      inner = `<table ${TABLE} align="${escapeAttr(align)}"${align === 'center' ? ' style="margin:0 auto;"' : ''}>`
        + items.map((item, i) => `<tr><td style="padding:${i ? px(gap) : '0'} 0 0 0;">${one(item)}</td></tr>`).join('') + '</table>';
    } else {
      inner = `<table ${TABLE} align="${escapeAttr(align)}"${align === 'center' ? ' style="margin:0 auto;"' : ''}><tr>`
        + items.map((item, i) => `<td valign="middle" style="padding:0 ${i === items.length - 1 ? '0' : px(gap)} 0 0;">${one(item)}</td>`).join('') + '</tr></table>';
    }
    return frame(block, inner, ctx, { align });
  },

  video(block, ctx) {
    const align = block.style.align || 'center';
    const look = { ...ctx.styles.image, ...block.style };
    if (!block.thumb || !block.thumb.src) {
      if (ctx.mode !== 'canvas') return '';
      return frame(block, placeholderBox(ctx.t('canvas.addVideo'), ctx, 160), ctx);
    }
    const width = Math.min(Number(block.thumb.width) || innerWidth(block, ctx), innerWidth(block, ctx));
    const img = imageTag(block.thumb.src, block.alt, width, look, ctx, { align, fill: true });
    return frame(block, linked({ url: block.url, blank: true }, img), ctx, { align });
  },

  columns(block, ctx) {
    const pad = blockPadding(block, ctx.styles);
    const available = ctx.width - pad.left - pad.right;
    const shares = columnShares(block);
    const reverse = block.mobile === 'reverse';
    const keep = block.mobile === 'side';
    const cells = block.columns.map((column, i) => {
      const width = Math.floor(available * shares[i]);
      const inner = column.blocks.map((b) => renderBlock(b, { ...ctx, width, inColumn: true })).join('');
      const empty = !column.blocks.length && ctx.mode === 'canvas'
        ? `<div class="nl-ph nl-ph-column">${escapeText(ctx.t('canvas.dropHere'))}</div>` : '';
      const attrs = ctx.mode === 'canvas' ? ` data-column-id="${escapeAttr(column.id)}"` : '';
      const cell = {
        width: px(width), 'vertical-align': block.valign || 'top',
        'background-color': block.style.columnBackground || undefined,
      };
      return `<td${keep ? '' : ' class="nl-col"'}${reverse ? ' dir="ltr"' : ''} width="${width}" valign="${escapeAttr(block.valign || 'top')}"${attrs} style="${css(cell)}">${inner}${empty}</td>`;
    }).join('');
    const row = `<table ${TABLE} width="100%" style="width:100%;border-collapse:collapse;"><tr${reverse ? ' dir="rtl"' : ''}>${cells}</tr></table>`;
    return frame(block, row, ctx);
  },

  article(block, ctx) {
    const width = innerWidth(block, ctx);
    const parts = [];
    const title = escapeText(block.title || '');
    const titleInner = block.linkTitle && cleanHref(block.url)
      ? `<a href="${escapeAttr(cleanHref(block.url))}" target="_blank" style="${css({ ...linkCss(ctx), color: 'inherit' })}">${title}</a>` : title;
    parts.push(editable('title', `<h3 class="nl-h3" style="${css(textCss('h3', ctx))}">${titleInner || '<br>'}</h3>`, ctx, 'nl-edit-line'));
    if (block.summary && toText(block.summary)) parts.push(editable('summary', renderRich(block.summary, { ...ctx }), ctx));
    else if (ctx.mode === 'canvas') parts.push(editable('summary', `<p class="nl-p" style="${css({ ...textCss('p', ctx), margin: '0' })}"><br></p>`, ctx));
    if (block.source && !block.hideSource && toText(block.source)) {
      parts.push(`<table ${TABLE} width="100%" style="width:100%;"><tr><td style="padding-top:8px;">${editable('source', renderRich(block.source, ctx), ctx)}</td></tr></table>`);
    }
    if (block.button && block.button.show) {
      parts.push(`<table ${TABLE} width="100%" style="width:100%;"><tr><td style="padding-top:12px;">${buttonHtml(block.button.text, { url: block.url, blank: true }, buttonLook(ctx.styles, block.button.style || {}), ctx, 'article-button')}</td></tr></table>`);
    }
    const text = parts.join('');
    const mc = ctx.mode === 'export' ? ` mc:edit="${escapeAttr(block.id)}"` : '';
    const img = block.image && block.image.src;
    let inner;
    if (img && (block.layout === 'image-left' || block.layout === 'image-right')) {
      const imgWidth = Math.floor(width / 3) - 12;
      const picture = linked({ url: block.url, blank: true }, imageTag(block.image.src, block.image.alt, imgWidth, ctx.styles.image, ctx, { fill: true, mcEdit: `${block.id}_img` }));
      const imageCell = `<td class="nl-col" width="${imgWidth + 12}" valign="top" style="width:${px(imgWidth + 12)};padding:0 ${block.layout === 'image-left' ? '12px' : '0'} 0 ${block.layout === 'image-right' ? '12px' : '0'};">${picture}</td>`;
      const textCell = `<td class="nl-col"${mc} valign="top" style="vertical-align:top;">${text}</td>`;
      inner = `<table ${TABLE} width="100%" style="width:100%;"><tr>${block.layout === 'image-left' ? imageCell + textCell : textCell + imageCell}</tr></table>`;
    } else if (img && block.layout === 'image-top') {
      const picture = linked({ url: block.url, blank: true }, imageTag(block.image.src, block.image.alt, width, ctx.styles.image, ctx, { fill: true, mcEdit: `${block.id}_img` }));
      inner = `${picture}<table ${TABLE} width="100%" style="width:100%;"><tr><td${mc} style="padding-top:12px;">${text}</td></tr></table>`;
    } else {
      inner = `<table ${TABLE} width="100%" style="width:100%;"><tr><td${mc}>${text}</td></tr></table>`;
    }
    return frame(block, inner, ctx);
  },
};

// A button made of a table cell and a link, which shows as a button in every
// email program, Outlook too.
function buttonHtml(text, link, look, ctx, editName) {
  const [pv, ph] = BUTTON_SIZES[look.size] || BUTTON_SIZES.medium;
  const radius = look.shape === 'pill' ? 999 : (look.shape === 'round' ? 6 : 0);
  const border = borderCss(look);
  const url = cleanHref(link && link.url) || '#';
  const label = escapeText(text || '');
  const a = {
    display: look.fullWidth ? 'block' : 'inline-block',
    padding: `${px(pv)} ${px(ph)}`,
    'font-family': fontStack(look.font),
    'font-size': px(look.fontSize),
    'font-weight': look.bold ? 'bold' : 'normal',
    'font-style': look.italic ? 'italic' : 'normal',
    'letter-spacing': look.letterSpacing ? px(look.letterSpacing) : undefined,
    'line-height': '1.2',
    color: look.color,
    'text-decoration': 'none',
    'text-align': 'center',
    'border-radius': radius ? px(radius) : undefined,
  };
  const linkHtml = `<a href="${escapeAttr(url)}" target="_blank" style="${css(a)}">${ctx.mode === 'canvas'
    ? `<span class="nl-edit nl-edit-line" data-edit="${editName}">${label || '<br>'}</span>` : label}</a>`;
  const align = look.fullWidth ? 'center' : (look.align || 'left');
  const cell = { 'background-color': look.background, 'border-radius': radius ? px(radius) : undefined, border };
  return `<table ${TABLE}${look.fullWidth ? ' width="100%"' : ''} align="${escapeAttr(align)}" style="border-collapse:separate;${align === 'center' ? 'margin:0 auto;' : ''}">`
    + `<tr><td align="center" bgcolor="${escapeAttr(look.background)}" style="${css(cell)}">${linkHtml}</td></tr></table>`;
}

function renderBlock(block, ctx) {
  const draw = BLOCKS[block.type];
  return draw ? draw(block, ctx) : '';
}

// ---------- sections and the whole email ----------

function renderSection(sec, ctx) {
  const s = sec.style || {};
  const local = { ...ctx, sectionStyle: s, width: WIDTH };
  const sent = isSent(sec);
  if (!sent && ctx.mode !== 'canvas') return '';
  let inner = sec.blocks.map((b) => renderBlock(b, local)).join('');
  if (ctx.mode === 'canvas') {
    if (!sec.blocks.length) inner += `<div class="nl-ph nl-ph-section">${escapeText(ctx.t('canvas.emptySection'))}</div>`;
    if (isArticleSection(sec) && !sent) inner += `<div class="nl-note">${escapeText(ctx.t('canvas.noArticles'))}</div>`;
  }
  const content = s.contentBackground || ctx.styles.background.content;
  const border = s.borderWidth && s.borderStyle && s.borderStyle !== 'none'
    ? `${px(s.borderWidth)} ${s.borderStyle} ${s.borderColor || '#dde4e4'}` : undefined;
  const cell = {
    padding: `${px(s.paddingTop || 0)} 0 ${px(s.paddingBottom || 0)} 0`,
    'border-top': border, 'border-bottom': border,
  };
  const attrs = ctx.mode === 'canvas'
    ? ` data-section-id="${escapeAttr(sec.id)}"${sent ? '' : ' data-unsent="true"'}` : '';
  const outerBg = s.background ? ` bgcolor="${escapeAttr(s.background)}"` : '';
  return `<table ${TABLE} width="100%" style="${css({ width: '100%', 'border-collapse': 'collapse', 'background-color': s.background || undefined })}"${outerBg}${attrs}>`
    + '<tr><td align="center" valign="top" style="padding:0;">'
    + `<table ${TABLE} class="nl-container" width="${WIDTH}" bgcolor="${escapeAttr(content)}" style="${css({ width: px(WIDTH), 'max-width': px(WIDTH), 'background-color': content, 'border-collapse': 'collapse' })}">`
    + `<tr><td valign="top" style="${css(cell)}">${inner}</td></tr></table>`
    + '</td></tr></table>';
}

function mobileCss(styles) {
  const t = styles.text;
  const m = styles.background.mobilePadding;
  const sizes = Object.keys(t).map((tag) => `.nl-${tag}{font-size:${px(t[tag].mobileSize || t[tag].size)} !important;}`).join('');
  return '@media only screen and (max-width:480px){'
    + '.nl-container{width:100% !important;max-width:100% !important;}'
    + '.nl-col{display:block !important;width:100% !important;max-width:100% !important;box-sizing:border-box;}'
    + `.nl-pad{padding-left:${px(m)} !important;padding-right:${px(m)} !important;}`
    + '.nl-fill{width:100% !important;height:auto !important;}'
    + `${sizes}}`;
}

const BASE_CSS = 'body{margin:0;padding:0;width:100% !important;-webkit-text-size-adjust:100%;-ms-text-size-adjust:100%;}'
  + 'table,td{border-collapse:collapse;mso-table-lspace:0pt;mso-table-rspace:0pt;}'
  + 'img{border:0;outline:none;text-decoration:none;-ms-interpolation-mode:bicubic;}'
  + 'p,h1,h2,h3,h4{display:block;}a img{border:0;}';

// What only the editor's canvas shows: outlines for unchecked articles, hints
// in empty places, and no clicking through links.
const CANVAS_CSS = `
html,body{min-height:100%;}
body{padding-bottom:120px;cursor:default;}
a{cursor:text;}
[data-edit]{outline:none;cursor:text;min-height:1em;}
[data-edit][contenteditable="true"]{caret-color:#2a5214;}
.nl-edit-line{display:inline-block;min-width:2em;}
table[data-type="article"][data-checked="false"]{outline:2px dashed #d0962a;outline-offset:-4px;}
table[data-placeholder="true"] [data-edit]{background-color:rgba(252,192,197,.45);}
table[data-unsent="true"]{opacity:.55;}
.nl-ph{display:flex;align-items:center;justify-content:center;box-sizing:border-box;border:2px dashed #c3cccc;background:#f6f8f8;color:#5b6869;font:14px/1.4 system-ui,-apple-system,"Segoe UI",sans-serif;text-align:center;padding:16px;border-radius:4px;}
.nl-ph-section{margin:16px 36px;min-height:72px;}
.nl-ph-column{min-height:72px;margin:8px;}
.nl-note{margin:8px 36px 16px;padding:8px 12px;border-radius:4px;background:#fff6e5;color:#7a5410;font:13px/1.45 system-ui,-apple-system,"Segoe UI",sans-serif;}
`;

// The email's pieces: the CSS for its <style>, the page colour, and the
// body. The editor's canvas keeps one document and swaps these into it.
// options: { mode, t (texts for hints), mapSrc (image addresses) }
export function renderParts(design, options = {}) {
  const mode = options.mode || 'export';
  const styles = design.styles;
  const ctx = {
    mode,
    styles,
    sectionStyle: {},
    width: WIDTH,
    inColumn: false,
    t: options.t || ((key) => key),
    mapSrc: options.mapSrc || ((src) => src),
  };
  const page = styles.background.page;
  const margin = Math.max(0, Number(styles.background.margin) || 0);
  const body = design.sections.map((s) => renderSection(s, ctx)).join('');
  const wrapper = `<table ${TABLE} width="100%" bgcolor="${escapeAttr(page)}" style="${css({ width: '100%', 'background-color': page, 'border-collapse': 'collapse' })}">`
    + `<tr><td align="center" valign="top" style="padding:${px(margin)} 0;">${body}</td></tr></table>`;
  return { css: `${BASE_CSS}${mobileCss(styles)}${mode === 'canvas' ? CANVAS_CSS + canvasTextCss(design) : ''}`, page, body: wrapper };
}

// options: { mode, issue, t (texts for hints), mapSrc (image addresses) }
export function renderEmail(design, options = {}) {
  const mode = options.mode || 'export';
  const { css: styleCss, page, body: wrapper } = renderParts(design, options);
  const styleTag = `<style type="text/css">${styleCss}</style>`;
  if (mode === 'fragment') return `${styleTag}\n${wrapper}`;
  const issue = options.issue || {};
  const preheader = mode === 'export' && issue.preheader
    ? `<div style="display:none;font-size:1px;line-height:1px;max-height:0;max-width:0;opacity:0;overflow:hidden;mso-hide:all;">${escapeText(issue.preheader)}${'&nbsp;&zwnj;'.repeat(30)}</div>`
    : '';
  return '<!doctype html>\n<html lang="fi" xmlns="http://www.w3.org/1999/xhtml">\n<head>\n<meta charset="utf-8">\n'
    + '<meta name="viewport" content="width=device-width, initial-scale=1">\n'
    + '<meta http-equiv="X-UA-Compatible" content="IE=edge">\n'
    + `<title>${mode === 'export' ? '*|MC:SUBJECT|*' : escapeText(issue.subject || issue.name || '')}</title>\n`
    + `${styleTag}\n</head>\n`
    + `<body style="margin:0;padding:0;background-color:${escapeAttr(page)};">${preheader}${wrapper}</body>\n</html>\n`;
}

// ---------- for pasting into the association's own template ----------

function pasteBlock(block, ctx) {
  switch (block.type) {
    case 'text':
    case 'footer':
      return renderRich(block.html, ctx);
    case 'image':
    case 'logo': {
      if (!block.src) return '';
      const width = block.type === 'logo' ? Number(block.width) || 160 : imageWidth(block, WIDTH - 72);
      return `<p>${linked(block.link, `<img src="${escapeAttr(ctx.mapSrc(block.src))}" alt="${escapeAttr(block.alt || '')}" width="${Math.round(width)}" style="max-width:100%;height:auto;">`)}</p>`;
    }
    case 'button': {
      const url = cleanHref(block.link && block.link.url);
      return url ? `<p><a href="${escapeAttr(url)}" style="${css({ ...linkCss(ctx), 'font-weight': 'bold' })}">${escapeText(block.text)}</a></p>` : '';
    }
    case 'divider':
      return '<p>&nbsp;</p>';
    case 'spacer':
      return '';
    case 'social': {
      const items = (block.items || []).filter((i) => cleanHref(i.url));
      return items.length ? `<p>${items.map((i) => `<a href="${escapeAttr(cleanHref(i.url))}" style="${css(linkCss(ctx))}">${escapeText(i.label || NETWORK_NAMES[i.network] || i.network)}</a>`).join(' · ')}</p>` : '';
    }
    case 'video':
      return cleanHref(block.url) ? `<p><a href="${escapeAttr(cleanHref(block.url))}" style="${css(linkCss(ctx))}">${escapeText(block.alt || block.url)}</a></p>` : '';
    case 'columns':
      return block.columns.map((c) => c.blocks.map((b) => pasteBlock(b, ctx)).join('')).join('');
    case 'article': {
      let out = `<h3 class="nl-h3" style="${css(textCss('h3', ctx))}">${escapeText(block.title)}</h3>`;
      if (block.image && block.image.src) out += `<p><img src="${escapeAttr(ctx.mapSrc(block.image.src))}" alt="${escapeAttr(block.image.alt || '')}" width="200" style="max-width:100%;height:auto;"></p>`;
      out += renderRich(block.summary, ctx);
      if (block.source && !block.hideSource && toText(block.source)) out += renderRich(block.source, ctx);
      if (block.button && block.button.show && cleanHref(block.url)) {
        out += `<p><a href="${escapeAttr(cleanHref(block.url))}" style="${css({ ...linkCss(ctx), 'font-weight': 'bold' })}">${escapeText(block.button.text)}</a></p>`;
      }
      return out;
    }
    default:
      return '';
  }
}

// Each section that goes out, as formatted text with its own plain-text
// version, to paste section by section.
export function sectionsForPaste(design, options = {}) {
  const ctx = { mode: 'paste', styles: design.styles, sectionStyle: {}, width: WIDTH, t: (k) => k, mapSrc: options.mapSrc || ((s) => s) };
  return design.sections.filter(isSent).map((sec) => {
    const local = { ...ctx, sectionStyle: {} };
    const html = sec.blocks.map((b) => pasteBlock(b, local)).join('');
    return { id: sec.id, name: sec.name, role: sec.role, html, text: plainText({ ...design, sections: [sec] }) };
  });
}

// ---------- reading the design ----------

function blockText(block) {
  switch (block.type) {
    case 'text':
    case 'footer':
      return toText(block.html);
    case 'button':
      return block.text || '';
    case 'columns':
      return block.columns.map((c) => c.blocks.map(blockText).filter(Boolean).join('\n\n')).filter(Boolean).join('\n\n');
    case 'article':
      return [block.title, toText(block.summary), block.hideSource ? '' : toText(block.source), block.button && block.button.show ? `${block.button.text}: ${block.url}` : ''].filter(Boolean).join('\n');
    default:
      return '';
  }
}

export function plainText(design) {
  return design.sections.filter(isSent).map((s) => s.blocks.map(blockText).filter(Boolean).join('\n\n')).filter(Boolean).join('\n\n');
}

// Every link in the email, with the block it is in: for the checks and the
// link checker in the preview.
export function collectLinks(design) {
  const out = [];
  const add = (block, sec, text, url, kind) => out.push({ blockId: block.id, sectionId: sec.id, text: String(text || '').trim(), url: String(url || '').trim(), kind });
  const visit = (block, sec) => {
    switch (block.type) {
      case 'text':
      case 'footer':
        textLinks(block.html).forEach((l) => add(block, sec, l.text, l.href, 'text'));
        break;
      case 'button':
        add(block, sec, block.text, block.link && block.link.url, 'button');
        break;
      case 'image':
      case 'logo':
        if (block.src && block.link && block.link.url) add(block, sec, block.alt || '', block.link.url, 'image');
        break;
      case 'video':
        if (block.url) add(block, sec, block.alt || '', block.url, 'video');
        break;
      case 'social':
        (block.items || []).forEach((i) => add(block, sec, i.label || NETWORK_NAMES[i.network], i.url, 'social'));
        break;
      case 'columns':
        block.columns.forEach((c) => c.blocks.forEach((b) => visit(b, sec)));
        break;
      case 'article':
        if (block.linkTitle) add(block, sec, block.title, block.url, 'title');
        textLinks(block.summary).forEach((l) => add(block, sec, l.text, l.href, 'text'));
        if (!block.hideSource) textLinks(block.source).forEach((l) => add(block, sec, l.text, l.href, 'text'));
        if (block.button && block.button.show) add(block, sec, block.button.text, block.url, 'button');
        break;
      default:
    }
  };
  design.sections.filter(isSent).forEach((sec) => sec.blocks.forEach((b) => visit(b, sec)));
  return out;
}

// The images the email uses, by address: what an export must carry along.
export function imageSources(design) {
  const found = new Set();
  const visit = (b) => {
    if ((b.type === 'image' || b.type === 'logo') && b.src) found.add(b.src);
    if (b.type === 'video' && b.thumb && b.thumb.src) found.add(b.thumb.src);
    if (b.type === 'article' && b.image && b.image.src) found.add(b.image.src);
    if (b.type === 'social' && b.display !== 'text') (b.items || []).filter((i) => cleanHref(i.url)).forEach((i) => found.add(`/img/social/${i.network}-${b.iconStyle || 'color'}.png`));
    if (b.type === 'columns') b.columns.forEach((c) => c.blocks.forEach(visit));
  };
  design.sections.filter(isSent).forEach((s) => s.blocks.forEach(visit));
  return [...found];
}

export function byteSize(text) {
  return new TextEncoder().encode(text).length;
}
