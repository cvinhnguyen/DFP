// The text toolbar: shown above the email while text is being typed, with
// what Mailchimp's has. Paragraph or heading, font, size, colour,
// highlight, bold, italic, underline, strikethrough, link, alignment, line
// height, letter spacing, lists, and under "more" clearing the formatting
// and Mailchimp's merge tags, such as the reader's first name.
//
// Every button acts on the words selected in the email. The toolbar lives in
// the editor's page and the words in the email's frame, so the selection is
// put back before each command.

import { FONTS } from '../newsletter/fonts.js';
import { t } from '../texts.js';
import { h, keepFocus } from '../ui/dom.js';
import { icon } from '../ui/icons.js';
import { popover, closePopover, colourPicker, linkKind, linkValue, linkFrom, select as makeSelect } from '../ui/controls.js';

const FORMATS = ['p', 'h1', 'h2', 'h3', 'h4'];
const LINE_HEIGHTS = ['1', '1.15', '1.25', '1.5', '1.75', '2'];
const LETTER_SPACINGS = ['-0.5', '0', '0.5', '1', '2', '3'];

// Mailchimp fills these in for each reader. The links ones go in as links.
export const MERGE_TAGS = [
  { tag: '*|FNAME|*', key: 'fname' },
  { tag: '*|LNAME|*', key: 'lname' },
  { tag: '*|EMAIL|*', key: 'email' },
  { tag: '*|DATE:j.n.Y|*', key: 'date' },
  { tag: '*|CURRENT_YEAR|*', key: 'year' },
  { tag: '*|LIST:COMPANY|*', key: 'company' },
  { tag: '*|UNSUB|*', key: 'unsub', link: 'Peru tilaus' },
  { tag: '*|UPDATE_PROFILE|*', key: 'profile', link: 'Päivitä tietosi' },
  { tag: '*|ARCHIVE|*', key: 'archive', link: 'Näytä selaimessa' },
];

export function createTextTools({ store, canvas, bar }) {
  const doc = () => canvas.doc();
  const win = () => canvas.win();

  function exec(command, value = null, css = false) {
    if (!canvas.restoreRange()) return;
    doc().execCommand('styleWithCSS', false, css);
    doc().execCommand(command, false, value);
    canvas.commitText();
    update();
  }

  // Sets an inline style on the selected words. The browser has no command
  // for a size in pixels or for letter spacing, so the words are first given
  // a font nobody has, and then that font is swapped for the real style.
  function wrapStyle(props) {
    if (!canvas.restoreRange()) return;
    const sel = win().getSelection();
    if (!sel.rangeCount || sel.isCollapsed) return;
    const d = doc();
    d.execCommand('styleWithCSS', false, true);
    d.execCommand('fontName', false, 'dfp-mark');
    const root = canvas.editingEl();
    root.querySelectorAll('[style*="dfp-mark"], font[face="dfp-mark"]').forEach((el) => {
      let span = el;
      if (el.tagName === 'FONT') {
        span = d.createElement('span');
        while (el.firstChild) span.append(el.firstChild);
        el.replaceWith(span);
      }
      span.style.fontFamily = '';
      for (const [name, value] of Object.entries(props)) span.style.setProperty(name, value);
    });
    canvas.commitText();
    update();
  }

  // Line height belongs to whole paragraphs: every paragraph the selection
  // touches gets it.
  function setLineHeight(value) {
    if (!canvas.restoreRange()) return;
    const root = canvas.editingEl();
    const range = win().getSelection().getRangeAt(0);
    const blocks = [...root.querySelectorAll('p, h1, h2, h3, h4, li')].filter((el) => range.intersectsNode(el));
    blocks.forEach((el) => { el.style.lineHeight = value; });
    canvas.commitText();
    update();
  }

  // ---------- links ----------

  function currentLink() {
    const sel = win() && win().getSelection();
    if (!sel || !sel.rangeCount) return null;
    const node = sel.getRangeAt(0).commonAncestorContainer;
    const el = node.nodeType === 1 ? node : node.parentElement;
    const a = el && el.closest('a');
    return a && canvas.editingEl() && canvas.editingEl().contains(a) ? a : null;
  }

  function openLink(anchor) {
    const existing = currentLink();
    let kind = linkKind(existing && existing.getAttribute('href'));
    const value = h('input', { class: 'cf-input', value: linkValue(existing ? existing.getAttribute('href') : ''), placeholder: t(`link.placeholder.${kind}`), 'aria-label': t('link.address') });
    const kindSelect = makeSelect(['web', 'email', 'phone'].map((k) => ({ value: k, label: t(`link.kind.${k}`) })), kind, (k) => {
      kind = k;
      value.placeholder = t(`link.placeholder.${k}`);
    }, { label: t('link.kind') });
    const blank = h('input', { type: 'checkbox', id: 'tt-link-blank', checked: existing ? existing.getAttribute('target') === '_blank' : true });
    const save = () => {
      const url = linkFrom(kind, value.value);
      closePopover();
      if (!url) return;
      if (!canvas.restoreRange()) return;
      const d = doc();
      const a = currentLink();
      if (a) {
        a.setAttribute('href', url);
      } else if (win().getSelection().isCollapsed) {
        const text = kind === 'web' ? value.value.trim() : linkValue(url);
        d.execCommand('insertHTML', false, `<a href="${url.replace(/"/g, '&quot;')}">${text.replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]))}</a>`);
      } else {
        d.execCommand('createLink', false, url);
      }
      // The new link, or the one changed: open in a new tab or not.
      canvas.editingEl().querySelectorAll('a').forEach((link) => {
        if (link.getAttribute('href') !== url) return;
        if (blank.checked && kind === 'web') link.setAttribute('target', '_blank');
        else link.removeAttribute('target');
      });
      canvas.commitText();
      update();
    };
    value.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        save();
      }
    });
    const content = h('div', { class: 'tt-link' },
      h('h4', { class: 'tt-pop-title' }, t('link.title')),
      h('label', { class: 'cf-label' }, t('link.to')), kindSelect,
      h('label', { class: 'cf-label' }, t('link.address')), value,
      h('label', { class: 'cf-check', for: 'tt-link-blank' }, blank, h('span', {}, t('link.newTab'))),
      h('div', { class: 'tt-pop-actions' },
        existing ? h('button', { type: 'button', class: 'btn ghost small', onclick: () => {
          closePopover();
          if (!canvas.restoreRange()) return;
          const a = currentLink();
          if (a) {
            a.replaceWith(...a.childNodes);
            canvas.commitText();
            update();
          }
        } }, t('link.remove')) : null,
        h('button', { type: 'button', class: 'btn small', onclick: save }, t('link.save'))));
    popover(anchor, content, { className: 'tt-pop' });
    value.focus();
  }

  // ---------- menus ----------

  function menu(anchor, items) {
    const list = h('div', { class: 'tt-menu', role: 'menu' }, items.map((item) => keepFocus(h('button', {
      type: 'button', role: 'menuitem', class: `tt-menu-item${item.active ? ' active' : ''}`, onclick: () => {
        closePopover();
        item.run();
      },
    }, item.iconName ? h('span', { html: icon(item.iconName, 16) }) : null, h('span', {}, item.label)))));
    popover(anchor, list, { className: 'tt-pop' });
  }

  function insertMergeTag(tag) {
    if (!canvas.restoreRange()) return;
    if (tag.link) doc().execCommand('insertHTML', false, `<a href="${tag.tag}">${tag.link}</a>`);
    else doc().execCommand('insertText', false, tag.tag);
    canvas.commitText();
  }

  // ---------- the bar ----------

  const formatSelect = h('select', { class: 'tt-select tt-format', 'aria-label': t('tt.format') },
    FORMATS.map((f) => h('option', { value: f }, t(`tt.format.${f}`))));
  formatSelect.addEventListener('change', () => exec('formatBlock', formatSelect.value));

  const fontSelect = h('select', { class: 'tt-select tt-font', 'aria-label': t('tt.font') },
    h('option', { value: '' }, t('tt.fontDefault')),
    FONTS.map((f) => h('option', { value: f.id }, f.label)));
  fontSelect.addEventListener('change', () => {
    const font = FONTS.find((f) => f.id === fontSelect.value);
    if (font) exec('fontName', font.stack, true);
  });

  const sizeInput = h('input', { class: 'tt-size', type: 'number', min: 8, max: 72, 'aria-label': t('tt.size') });
  const applySize = (n) => {
    const v = Math.max(8, Math.min(72, Math.round(Number(n) || 15)));
    sizeInput.value = String(v);
    wrapStyle({ 'font-size': `${v}px` });
  };
  sizeInput.addEventListener('change', () => applySize(sizeInput.value));
  sizeInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      applySize(sizeInput.value);
    }
  });
  const sizeBox = h('div', { class: 'tt-sizebox' }, sizeInput, h('div', { class: 'tt-steps' },
    keepFocus(h('button', { type: 'button', class: 'tt-step', 'aria-label': t('tt.sizeUp'), html: icon('chevronUp', 12), onclick: () => applySize(Number(sizeInput.value || 15) + 1) })),
    keepFocus(h('button', { type: 'button', class: 'tt-step', 'aria-label': t('tt.sizeDown'), html: icon('chevronDown', 12), onclick: () => applySize(Number(sizeInput.value || 15) - 1) }))));

  function button(name, label, run, extra = {}) {
    const el = keepFocus(h('button', { type: 'button', class: 'tt-btn', title: label, 'aria-label': label, html: icon(name, 18), 'data-popover-anchor': extra.popover ? '' : null }));
    el.addEventListener('click', () => run(el));
    if (extra.state) el.dataset.state = extra.state;
    return el;
  }

  const colourBtn = button('textColor', t('tt.colour'), (el) => popover(el, colourPicker('', (v) => {
    closePopover();
    exec('foreColor', v || '#000000', true);
  }), { className: 'tt-pop' }), { popover: true });
  const highlightBtn = button('highlight', t('tt.highlight'), (el) => popover(el, colourPicker('', (v) => {
    closePopover();
    exec('hiliteColor', v || 'transparent', true);
  }, { allowNone: true, noneLabel: t('tt.noHighlight') }), { className: 'tt-pop' }), { popover: true });

  const bold = button('bold', t('tt.bold'), () => exec('bold'), { state: 'bold' });
  const italic = button('italic', t('tt.italic'), () => exec('italic'), { state: 'italic' });
  const underline = button('underline', t('tt.underline'), () => exec('underline'), { state: 'underline' });
  const strike = button('strike', t('tt.strike'), () => exec('strikeThrough'), { state: 'strikeThrough' });
  const link = button('link', t('tt.link'), (el) => openLink(el), { popover: true });
  const align = button('alignLeft', t('tt.align'), (el) => menu(el, [
    { label: t('tt.alignLeft'), iconName: 'alignLeft', run: () => exec('justifyLeft', null, true) },
    { label: t('tt.alignCenter'), iconName: 'alignCenter', run: () => exec('justifyCenter', null, true) },
    { label: t('tt.alignRight'), iconName: 'alignRight', run: () => exec('justifyRight', null, true) },
    { label: t('tt.alignJustify'), iconName: 'alignJustify', run: () => exec('justifyFull', null, true) },
  ]), { popover: true });
  const lineHeight = button('lineHeight', t('tt.lineHeight'), (el) => menu(el, LINE_HEIGHTS.map((v) => ({ label: v, run: () => setLineHeight(v) }))), { popover: true });
  const spacing = button('letterSpacing', t('tt.letterSpacing'), (el) => menu(el, LETTER_SPACINGS.map((v) => ({
    label: `${v} px`, run: () => wrapStyle({ 'letter-spacing': `${v}px` }),
  }))), { popover: true });
  const ul = button('listUl', t('tt.bullets'), () => exec('insertUnorderedList'), { state: 'insertUnorderedList' });
  const ol = button('listOl', t('tt.numbers'), () => exec('insertOrderedList'), { state: 'insertOrderedList' });
  const more = button('more', t('tt.more'), (el) => menu(el, [
    { label: t('tt.clear'), iconName: 'clearFormat', run: clearFormatting },
    ...MERGE_TAGS.map((m) => ({ label: t(`merge.${m.key}`), iconName: 'mergeTag', run: () => insertMergeTag(m) })),
  ]), { popover: true });

  const sep = () => h('span', { class: 'tt-sep', 'aria-hidden': 'true' });
  const rich = h('div', { class: 'tt-group' }, formatSelect, fontSelect, sizeBox, sep(), colourBtn, highlightBtn, sep(),
    bold, italic, underline, strike, sep(), link, sep(), align, lineHeight, spacing, sep(), ul, ol, sep(), more);
  const plainNote = h('p', { class: 'tt-note' });
  bar.replaceChildren(rich, plainNote);

  function clearFormatting() {
    if (!canvas.restoreRange()) return;
    const d = doc();
    d.execCommand('removeFormat', false, null);
    // removeFormat leaves spans with sizes and colours from styleWithCSS.
    const range = win().getSelection().getRangeAt(0);
    canvas.editingEl().querySelectorAll('span').forEach((s) => {
      if (range.intersectsNode(s)) s.replaceWith(...s.childNodes);
    });
    canvas.commitText();
    update();
  }

  // ---------- reflecting the selection ----------

  function update() {
    const editing = store.editing;
    bar.hidden = !editing;
    document.body.classList.toggle('ed-typing', !!editing);
    if (!editing) return;
    rich.hidden = editing.plain;
    plainNote.hidden = !editing.plain;
    if (editing.plain) {
      plainNote.textContent = t(editing.field === 'title' ? 'tt.titleNote' : 'tt.buttonNote');
      return;
    }
    const d = doc();
    const w = win();
    if (!d || !w) return;
    for (const el of [bold, italic, underline, strike, ul, ol]) {
      let on = false;
      try {
        on = d.queryCommandState(el.dataset.state);
      } catch {
        on = false;
      }
      el.classList.toggle('on', on);
      el.setAttribute('aria-pressed', String(on));
    }
    let format = 'p';
    try {
      format = String(d.queryCommandValue('formatBlock') || 'p').toLowerCase().replace(/[<>]/g, '');
    } catch {
      format = 'p';
    }
    formatSelect.value = FORMATS.includes(format) ? format : 'p';
    const sel = w.getSelection();
    if (sel.rangeCount) {
      const node = sel.getRangeAt(0).startContainer;
      const el = node.nodeType === 1 ? node : node.parentElement;
      if (el) {
        const cs = w.getComputedStyle(el);
        if (document.activeElement !== sizeInput) sizeInput.value = String(Math.round(parseFloat(cs.fontSize) || 15));
        const first = cs.fontFamily.split(',')[0].replace(/["']/g, '').trim().toLowerCase();
        const font = FONTS.find((f) => f.label.toLowerCase() === first || f.stack.split(',')[0].replace(/"/g, '').trim().toLowerCase() === first);
        fontSelect.value = font ? font.id : '';
        const a = cs.textAlign;
        align.innerHTML = icon(a === 'center' ? 'alignCenter' : a === 'right' ? 'alignRight' : a === 'justify' ? 'alignJustify' : 'alignLeft', 18);
      }
    }
  }

  store.on('editing', update);
  update();
  return { update };
}
