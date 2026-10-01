// The canvas: the email as it will look, in a frame, with the editor's tools
// drawn over it the way Mailchimp's builder draws them. A click on text
// starts typing straight away; a click on anything else selects it. The
// selected block gets an outline, a label to drag it by and a small toolbar
// at its side; a section shows its name and its own toolbar.
//
// The frame holds only the email. The outlines, labels and toolbars live in
// a layer over it, in the editor's own page, so they never end up in the
// email and every drag stays in one page.

import { renderParts, textDefaults } from '../newsletter/render.js';
import { findBlock, findSection, removeBlock, duplicateBlock, moveSection } from '../newsletter/model.js';
import { fromDom } from '../newsletter/richtext.js';
import { t } from '../texts.js';
import { h, keepFocus } from '../ui/dom.js';
import { icon } from '../ui/icons.js';

const PLAIN_FIELDS = new Set(['title', 'button', 'article-button']);
const EMPTY_CSS = '[data-empty]{position:relative;}'
  + '[data-empty]::before{content:attr(data-empty);position:absolute;left:0;top:0;color:#8b9798;pointer-events:none;'
  + 'font:15px/1.6 Helvetica,Arial,sans-serif;white-space:nowrap;}';

// Writes typed text into the design, by which part of which block it is.
export function setField(design, blockId, field, value) {
  const found = findBlock(design, blockId);
  if (!found) return;
  const b = found.block;
  const before = JSON.stringify(b);
  if (field === 'html') b.html = value;
  else if (field === 'title') b.title = value;
  else if (field === 'summary') b.summary = value;
  else if (field === 'source') b.source = value;
  else if (field === 'button') b.text = value;
  else if (field === 'article-button') b.button = { ...(b.button || {}), text: value };
  if (b.placeholder && JSON.stringify(b) !== before) b.placeholder = false;
}

export function createCanvas({ store, stage, frame, layer, actions }) {
  let doc = null;
  let win = null;
  let cssEl = null;
  let hover = { block: null, section: null };
  let editingEl = null;
  let savedRange = null;
  let inputTimer = null;
  let drawQueued = false;
  const readyWaiters = [];

  // ---------- the tools over the frame ----------

  const hoverBox = h('div', { class: 'ov-box ov-hover', hidden: true });
  const selectBox = h('div', { class: 'ov-box ov-select', hidden: true });
  const sectionBox = h('div', { class: 'ov-box ov-section', hidden: true });
  const sectionChip = h('div', { class: 'ov-chip', hidden: true });
  const label = h('div', { class: 'ov-label', hidden: true });
  const toolbar = h('div', { class: 'ov-toolbar', hidden: true, role: 'toolbar' });
  const sectionTools = h('div', { class: 'ov-section-tools', hidden: true, role: 'toolbar' });
  const dropLine = h('div', { class: 'ov-drop', hidden: true }, h('span', { class: 'ov-drop-dot' }), h('span', { class: 'ov-drop-dot end' }));
  layer.append(sectionBox, hoverBox, selectBox, sectionChip, label, toolbar, sectionTools, dropLine);

  function toolButton(name, title, onClick, extra = {}) {
    return keepFocus(h('button', { type: 'button', class: `ov-tool${extra.danger ? ' danger' : ''}`, title, 'aria-label': title, html: icon(name, 18), onclick: onClick, ...extra.attrs }));
  }

  // ---------- the frame ----------

  frame.srcdoc = `<!doctype html><html lang="fi"><head><meta charset="utf-8"><style id="nl-css"></style><style>${EMPTY_CSS}</style></head><body></body></html>`;
  frame.addEventListener('load', () => {
    doc = frame.contentDocument;
    win = frame.contentWindow;
    cssEl = doc.getElementById('nl-css');
    try {
      doc.execCommand('defaultParagraphSeparator', false, 'p');
    } catch {
      // Older browsers write <div>; the text is cleaned either way.
    }
    listen();
    render();
    readyWaiters.splice(0).forEach((fn) => fn());
  });

  function ready() {
    return doc ? Promise.resolve() : new Promise((resolve) => readyWaiters.push(resolve));
  }

  function render() {
    if (!doc) return;
    if (editingEl && inputTimer) commitText();
    if (!store.editing) editingEl = null;
    const parts = renderParts(store.design, { mode: 'canvas', t });
    cssEl.textContent = parts.css;
    doc.body.style.margin = '0';
    doc.body.style.backgroundColor = parts.page;
    const y = win.scrollY;
    doc.body.innerHTML = parts.body;
    win.scrollTo(0, y);
    markEmpty();
    // Text being typed into is drawn again with the rest; keep typing in it.
    if (store.editing) resumeEditing();
    queueDraw();
  }

  function markEmpty(root = doc) {
    root.querySelectorAll('[data-edit]').forEach((el) => {
      if (el === editingEl) return;
      if ((el.textContent || '').replace(/ /g, ' ').trim() === '') el.setAttribute('data-empty', t('canvas.typeHere'));
      else el.removeAttribute('data-empty');
    });
  }

  // ---------- finding things in the frame ----------

  function blockEl(id) {
    return doc ? doc.querySelector(`[data-block-id="${CSS.escape(id)}"]`) : null;
  }

  function sectionEl(id) {
    return doc ? doc.querySelector(`[data-section-id="${CSS.escape(id)}"]`) : null;
  }

  // The editable part of a block: the one whose nearest block is this block,
  // not one of the blocks inside it.
  function fieldEl(blockId, field) {
    const el = blockEl(blockId);
    if (!el) return null;
    return [...el.querySelectorAll(`[data-edit="${CSS.escape(field)}"]`)].find((f) => f.closest('[data-block-id]') === el) || null;
  }

  function frameOffset() {
    const f = frame.getBoundingClientRect();
    const s = stage.getBoundingClientRect();
    return { x: f.left - s.left, y: f.top - s.top, width: f.width, height: f.height };
  }

  // Where an element of the email is, in the layer's coordinates.
  function place(el) {
    const r = el.getBoundingClientRect();
    const o = frameOffset();
    return { left: r.left + o.x, top: r.top + o.y, width: r.width, height: r.height, right: r.right + o.x, bottom: r.bottom + o.y };
  }

  function setBox(box, r) {
    box.style.left = `${r.left}px`;
    box.style.top = `${r.top}px`;
    box.style.width = `${r.width}px`;
    box.style.height = `${r.height}px`;
    box.hidden = false;
  }

  // ---------- drawing the tools ----------

  function queueDraw() {
    if (drawQueued) return;
    drawQueued = true;
    requestAnimationFrame(() => {
      drawQueued = false;
      draw();
    });
  }

  function hideAll() {
    [hoverBox, selectBox, sectionBox, sectionChip, label, toolbar, sectionTools].forEach((el) => { el.hidden = true; });
  }

  function draw() {
    hideAll();
    if (!doc) return;
    const sel = store.selection;
    const o = frameOffset();

    // The section under the mouse, or the selected one: a dashed outline and
    // its name, as Mailchimp marks "Body".
    const sectionId = (sel && sel.kind === 'section' && sel.id) || hover.section;
    const sEl = sectionId && sectionEl(sectionId);
    if (sEl) {
      const container = sEl.querySelector('.nl-container') || sEl;
      const r = place(container);
      setBox(sectionBox, r);
      sectionBox.classList.toggle('selected', !!(sel && sel.kind === 'section' && sel.id === sectionId));
      const found = findSection(store.design, sectionId);
      sectionChip.textContent = found ? found.section.name : '';
      sectionChip.hidden = false;
      const chipWidth = sectionChip.offsetWidth || 80;
      const left = r.left - chipWidth - 8 > o.x + 4 ? r.left - chipWidth - 8 : r.left + 6;
      sectionChip.style.left = `${left}px`;
      sectionChip.style.top = `${Math.max(o.y + 4, r.top + 6)}px`;
    }

    if (hover.block && !(sel && sel.kind === 'block' && sel.id === hover.block)) {
      const el = blockEl(hover.block);
      if (el) setBox(hoverBox, place(el));
    }

    if (sel && sel.kind === 'block') {
      const el = blockEl(sel.id);
      const found = findBlock(store.design, sel.id);
      if (el && found) {
        const r = place(el);
        setBox(selectBox, r);
        drawLabel(found.block, r, o);
        drawToolbar(found.block, r, o);
      }
    }

    if (sel && sel.kind === 'section' && sEl) {
      const r = place(sEl.querySelector('.nl-container') || sEl);
      drawSectionTools(sel.id, r, o);
    }
  }

  function drawLabel(block, r, o) {
    label.replaceChildren(
      h('span', {}, t(`block.${block.type}`).toUpperCase()),
      h('span', { class: 'ov-grip', html: icon('grip', 14) }),
    );
    label.title = t('canvas.dragToMove');
    label.hidden = false;
    const top = r.top - 20 >= o.y ? r.top - 20 : r.top;
    label.style.left = `${r.left}px`;
    label.style.top = `${top}px`;
  }

  function drawToolbar(block, r, o) {
    const buttons = [];
    if (block.type === 'article') {
      buttons.push(toolButton('tick', block.checked ? t('canvas.markUnchecked') : t('canvas.markChecked'), () => {
        store.change((d) => {
          const f = findBlock(d, block.id);
          if (f) f.block.checked = !f.block.checked;
        });
      }, { attrs: { 'aria-pressed': String(!!block.checked), class: `ov-tool ov-check${block.checked ? ' on' : ''}` } }));
    }
    const move = toolButton('move', t('canvas.move'), () => {});
    move.addEventListener('pointerdown', (event) => actions.dragBlock(block.id, event));
    buttons.push(
      move,
      toolButton('duplicate', t('canvas.duplicate'), () => {
        let copy = null;
        store.change((d) => { copy = duplicateBlock(d, block.id); });
        if (copy) store.select({ kind: 'block', id: copy.id });
      }),
      toolButton('comment', t('canvas.comment'), () => actions.comment(block.id)),
      toolButton('trash', t('canvas.delete'), () => {
        store.change((d) => { removeBlock(d, block.id); });
        store.select(null);
      }, { danger: true }),
    );
    toolbar.replaceChildren(...buttons);
    toolbar.hidden = false;
    const width = toolbar.offsetWidth || 44;
    const stageWidth = stage.clientWidth;
    let left = r.right + 10;
    if (left + width > stageWidth - 6) left = Math.max(o.x + 4, r.right - width - 6);
    toolbar.style.left = `${left}px`;
    toolbar.style.top = `${Math.max(o.y + 4, r.top)}px`;
  }

  function drawSectionTools(id, r, o) {
    const found = findSection(store.design, id);
    if (!found) return;
    const count = store.design.sections.length;
    const up = toolButton('arrowUp', t('canvas.sectionUp'), () => store.change((d) => moveSection(d, id, found.index - 1)));
    const down = toolButton('arrowDown', t('canvas.sectionDown'), () => store.change((d) => moveSection(d, id, found.index + 1)));
    up.disabled = found.index === 0;
    down.disabled = found.index === count - 1;
    const more = toolButton('more', t('canvas.sectionMore'), (event) => actions.sectionMenu(id, event.currentTarget));
    sectionTools.replaceChildren(up, down, more);
    sectionTools.hidden = false;
    const width = sectionTools.offsetWidth || 120;
    let left = r.right + 10;
    if (left + width > stage.clientWidth - 6) left = r.right - width - 6;
    sectionTools.style.left = `${left}px`;
    sectionTools.style.top = `${Math.max(o.y + 4, r.top + 4)}px`;
  }

  // ---------- typing ----------

  function startEditing(blockId, field, point) {
    const el = fieldEl(blockId, field);
    if (!el) return;
    const plain = PLAIN_FIELDS.has(field);
    el.setAttribute('contenteditable', plain ? 'plaintext-only' : 'true');
    el.setAttribute('spellcheck', 'true');
    el.removeAttribute('data-empty');
    editingEl = el;
    store.setEditing({ blockId, field, plain });
    el.focus({ preventScroll: true });
    const sel = win.getSelection();
    let range = null;
    if (point && doc.caretRangeFromPoint) {
      range = doc.caretRangeFromPoint(point.x, point.y);
      if (range && !el.contains(range.startContainer)) range = null;
    }
    if (!range) {
      range = doc.createRange();
      range.selectNodeContents(el);
      range.collapse(false);
    }
    sel.removeAllRanges();
    sel.addRange(range);
    savedRange = range.cloneRange();
    queueDraw();
  }

  // After a redraw, the text being typed into is a new element: make it
  // editable again and put the cursor at its end.
  function resumeEditing() {
    const { blockId, field, plain } = store.editing;
    const el = fieldEl(blockId, field);
    if (!el) {
      editingEl = null;
      store.setEditing(null);
      return;
    }
    el.setAttribute('contenteditable', plain ? 'plaintext-only' : 'true');
    el.removeAttribute('data-empty');
    editingEl = el;
  }

  function commitText() {
    if (!editingEl || !store.editing) return;
    clearTimeout(inputTimer);
    inputTimer = null;
    const { blockId, field, plain } = store.editing;
    const found = findBlock(store.design, blockId);
    const value = plain
      ? editingEl.textContent.replace(/\s+/g, ' ').trim()
      : fromDom(editingEl, textDefaults(store.design, found ? found.section.style : {}));
    store.change((d) => setField(d, blockId, field, value), { key: `text:${blockId}:${field}`, render: false, source: 'canvas' });
  }

  function stopEditing({ redraw = true } = {}) {
    if (!editingEl) {
      if (store.editing) store.setEditing(null);
      return;
    }
    commitText();
    editingEl.removeAttribute('contenteditable');
    editingEl.removeAttribute('spellcheck');
    editingEl = null;
    savedRange = null;
    store.setEditing(null);
    store.breakMerge();
    if (redraw) render();
  }

  // ---------- events in the frame ----------

  function targetsAt(node) {
    const el = node && node.nodeType === 1 ? node : node && node.parentElement;
    if (!el) return {};
    const editEl = el.closest('[data-edit]');
    const block = el.closest('[data-block-id]');
    const section = el.closest('[data-section-id]');
    return {
      editEl,
      blockId: block ? block.getAttribute('data-block-id') : null,
      sectionId: section ? section.getAttribute('data-section-id') : null,
      field: editEl ? editEl.getAttribute('data-edit') : null,
      editBlockId: editEl ? editEl.closest('[data-block-id]').getAttribute('data-block-id') : null,
    };
  }

  function onMouseDown(event) {
    if (event.button !== 0) return;
    if (editingEl && editingEl.contains(event.target)) return;
    const point = { x: event.clientX, y: event.clientY };
    if (editingEl) {
      stopEditing();
    }
    // A redraw may have replaced what was clicked: look again.
    const under = doc.elementFromPoint(point.x, point.y);
    const at = targetsAt(under);
    if (at.editEl && at.editBlockId) {
      event.preventDefault();
      store.select({ kind: 'block', id: at.editBlockId });
      startEditing(at.editBlockId, at.field, point);
      return;
    }
    if (at.blockId) {
      event.preventDefault();
      store.select({ kind: 'block', id: at.blockId });
      return;
    }
    if (at.sectionId) {
      event.preventDefault();
      store.select({ kind: 'section', id: at.sectionId });
      return;
    }
    store.select(null);
  }

  function onMouseMove(event) {
    const at = targetsAt(event.target);
    if (at.blockId !== hover.block || at.sectionId !== hover.section) {
      hover = { block: at.blockId || null, section: at.sectionId || null };
      queueDraw();
    }
  }

  function onInput() {
    if (!editingEl) return;
    clearTimeout(inputTimer);
    inputTimer = setTimeout(commitText, 250);
    queueDraw();
  }

  // Pasted text keeps headings, lists, links and bold; everything else a web
  // page or a word processor brings along is left behind.
  function onPaste(event) {
    if (!editingEl) return;
    event.preventDefault();
    const data = event.clipboardData;
    const text = data.getData('text/plain') || '';
    if (store.editing.plain) {
      doc.execCommand('insertText', false, text.replace(/\s+/g, ' ').trim());
      return;
    }
    const html = data.getData('text/html');
    if (html) {
      const parsed = new DOMParser().parseFromString(html, 'text/html');
      const clean = fromDom(parsed.body, null, { styles: false });
      if (clean) {
        doc.execCommand('insertHTML', false, clean);
        return;
      }
    }
    doc.execCommand('insertText', false, text);
  }

  function onKeyDown(event) {
    if (editingEl) {
      if (event.key === 'Escape') {
        event.preventDefault();
        stopEditing();
        return;
      }
      if (event.key === 'Enter' && store.editing && store.editing.plain) {
        event.preventDefault();
        stopEditing();
        return;
      }
      return;
    }
    actions.key(event);
  }

  function onSelectionChange() {
    if (!editingEl) return;
    const sel = win.getSelection();
    if (sel.rangeCount && editingEl.contains(sel.getRangeAt(0).commonAncestorContainer)) {
      savedRange = sel.getRangeAt(0).cloneRange();
      actions.selectionChanged();
    }
  }

  function listen() {
    doc.addEventListener('mousedown', onMouseDown, true);
    doc.addEventListener('mousemove', onMouseMove);
    doc.addEventListener('mouseleave', () => {
      hover = { block: null, section: null };
      queueDraw();
    });
    // Links in the canvas are for editing, not following.
    doc.addEventListener('click', (event) => {
      if (event.target.closest('a')) event.preventDefault();
    }, true);
    doc.addEventListener('dblclick', (event) => {
      const at = targetsAt(event.target);
      if (at.blockId && !at.editEl) actions.open(at.blockId);
    });
    doc.addEventListener('input', onInput);
    // Typing is saved into the design before the focus moves on, so a click
    // in the side panel never loses the last few letters.
    doc.addEventListener('focusout', () => {
      if (editingEl) commitText();
    });
    doc.addEventListener('paste', onPaste);
    doc.addEventListener('keydown', onKeyDown);
    doc.addEventListener('selectionchange', onSelectionChange);
    doc.addEventListener('dragover', (event) => event.preventDefault());
    doc.addEventListener('drop', (event) => event.preventDefault());
    win.addEventListener('scroll', queueDraw, { passive: true });
  }

  new ResizeObserver(queueDraw).observe(stage);

  // ---------- what the rest of the editor uses ----------

  store.on('change', ({ render: redraw }) => {
    if (redraw === false) queueDraw();
    else render();
  });
  store.on('select', () => {
    const sel = store.selection;
    if (editingEl && !(sel && sel.kind === 'block' && store.editing && sel.id === store.editing.blockId)) stopEditing();
    queueDraw();
  });
  store.on('device', () => {
    stage.dataset.device = store.device;
    setTimeout(queueDraw, 260);
  });

  return {
    ready,
    render,
    draw: queueDraw,
    doc: () => doc,
    win: () => win,
    frameOffset,
    place,
    blockEl,
    sectionEl,
    fieldEl,
    startEditing,
    stopEditing,
    commitText,
    editingEl: () => editingEl,
    // The words selected while typing, kept for the text toolbar, whose
    // buttons and menus take the focus for a moment.
    restoreRange() {
      if (!editingEl || !savedRange) return false;
      editingEl.focus({ preventScroll: true });
      const sel = win.getSelection();
      sel.removeAllRanges();
      sel.addRange(savedRange);
      return true;
    },
    showDrop(r) {
      dropLine.style.left = `${r.left}px`;
      dropLine.style.top = `${r.top - 1}px`;
      dropLine.style.width = `${r.width}px`;
      dropLine.hidden = false;
    },
    hideDrop() {
      dropLine.hidden = true;
    },
    scrollTo(blockId) {
      const el = blockEl(blockId);
      if (el) el.scrollIntoView({ behavior: 'smooth', block: 'center' });
    },
  };
}
