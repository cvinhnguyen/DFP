// Dragging into the email: a block or column layout from the panel, a saved
// or ready-made section, or a block already in the email to a new place.
// While something is dragged, a line shows where it will land, the way
// Mailchimp's builder shows it. A click without dragging adds the block
// below whatever is selected, for anyone who would rather not drag.

import {
  insertBlock, moveBlock, insertSection, findBlock, findSection, listIdOf, isArticleSection,
} from '../newsletter/model.js';
import { h } from '../ui/dom.js';
import { icon } from '../ui/icons.js';

const START_DISTANCE = 5;
const EDGE = 48;

export function createDnd({ store, canvas, stage, frame, after }) {
  let active = null;

  // Where a click on a block in the panel puts it: after the selected block,
  // at the end of the selected section, or at the end of the main content.
  function defaultTarget(kind) {
    const d = store.design;
    const sel = store.selection;
    if (sel && sel.kind === 'block') {
      const found = findBlock(d, sel.id);
      if (found) {
        if (kind === 'columns' && found.parent) {
          const outer = findBlock(d, found.parent.id);
          return { listId: outer.section.id, index: outer.index + 1 };
        }
        return { listId: listIdOf(d, sel.id), index: found.index + 1 };
      }
    }
    if (sel && sel.kind === 'section') {
      const found = findSection(d, sel.id);
      if (found) return { listId: found.section.id, index: found.section.blocks.length };
    }
    const main = d.sections.find((s) => s.role === 'body')
      || [...d.sections].reverse().find((s) => isArticleSection(s) && s.blocks.some((b) => b.type === 'article'))
      || [...d.sections].reverse().find((s) => s.role !== 'footer')
      || d.sections[0];
    return main ? { listId: main.id, index: main.blocks.length } : null;
  }

  // ---------- where the pointer would drop ----------

  function nearestList(el) {
    return el.parentElement ? el.parentElement.closest('[data-column-id], [data-section-id]') : null;
  }

  function containerRect(listEl) {
    if (listEl.hasAttribute('data-section-id')) return canvas.place(listEl.querySelector('.nl-container') || listEl);
    return canvas.place(listEl);
  }

  function sectionTarget(doc, y) {
    const sections = [...doc.querySelectorAll('[data-section-id]')];
    if (!sections.length) return { kind: 'section', index: 0, line: null };
    let index = sections.length;
    for (let i = 0; i < sections.length; i += 1) {
      const r = sections[i].getBoundingClientRect();
      if (y < r.top + r.height / 2) {
        index = i;
        break;
      }
    }
    const ref = sections[Math.min(index, sections.length - 1)];
    const box = canvas.place(ref.querySelector('.nl-container') || ref);
    const top = index < sections.length ? box.top : box.bottom;
    return { kind: 'section', index, line: { left: box.left, width: box.width, top } };
  }

  function blockTarget(doc, x, y, spec) {
    const columnsAllowed = spec.blockType !== 'columns';
    let el = doc.elementFromPoint(x, y);
    let listEl = el ? el.closest(columnsAllowed ? '[data-column-id], [data-section-id]' : '[data-section-id]') : null;
    // A block cannot go inside itself.
    if (spec.kind === 'move' && listEl) {
      const self = doc.querySelector(`[data-block-id="${CSS.escape(spec.id)}"]`);
      if (self && self.contains(listEl) && listEl !== self) listEl = self.parentElement.closest('[data-column-id], [data-section-id]');
    }
    if (!listEl) {
      // Beside the email: the section at that height.
      const sections = [...doc.querySelectorAll('[data-section-id]')];
      listEl = sections.find((s) => {
        const r = s.getBoundingClientRect();
        return y >= r.top && y <= r.bottom;
      }) || null;
      if (!listEl) return null;
      el = null;
    }
    const listId = listEl.getAttribute('data-column-id') || listEl.getAttribute('data-section-id');
    const children = [...listEl.querySelectorAll('[data-block-id]')].filter((b) => nearestList(b) === listEl);
    let index = children.length;
    for (let i = 0; i < children.length; i += 1) {
      const r = children[i].getBoundingClientRect();
      if (y < r.top + r.height / 2) {
        index = i;
        break;
      }
    }
    const box = containerRect(listEl);
    let top;
    if (!children.length) {
      const hint = [...listEl.querySelectorAll('.nl-ph')].find((p) => p.closest('[data-column-id], [data-section-id]') === listEl);
      top = hint ? canvas.place(hint).top + canvas.place(hint).height / 2 : box.top + 12;
    } else if (index < children.length) top = canvas.place(children[index]).top;
    else top = canvas.place(children[children.length - 1]).bottom;
    return { kind: 'block', listId, index, line: { left: box.left, width: box.width, top } };
  }

  function targetAt(clientX, clientY, spec) {
    const doc = canvas.doc();
    const f = frame.getBoundingClientRect();
    if (!doc || clientX < f.left || clientX > f.right || clientY < f.top || clientY > f.bottom) return null;
    const x = clientX - f.left;
    const y = clientY - f.top;
    return spec.kind === 'new-section' ? sectionTarget(doc, y) : blockTarget(doc, x, y, spec);
  }

  // ---------- dropping ----------

  function drop(spec, target) {
    if (spec.kind === 'new-section') {
      const sec = spec.create();
      store.change((d) => insertSection(d, target.index, sec));
      store.select({ kind: 'section', id: sec.id });
      after({ section: sec });
      return;
    }
    if (spec.kind === 'move') {
      store.change((d) => moveBlock(d, spec.id, target.listId, target.index));
      store.select({ kind: 'block', id: spec.id });
      return;
    }
    const block = spec.create();
    let ok = false;
    store.change((d) => { ok = insertBlock(d, target.listId, target.index, block); });
    if (!ok) return;
    store.select({ kind: 'block', id: block.id });
    after({ block });
  }

  // ---------- the drag itself ----------

  function cancel() {
    if (!active) return;
    active.cleanup();
    active = null;
  }

  // spec: { kind: 'new' | 'move' | 'new-section', create, id, blockType, label, iconName }
  function begin(event, spec) {
    if (event.button !== 0 || active) return;
    const source = event.currentTarget;
    const startX = event.clientX;
    const startY = event.clientY;
    let dragging = false;
    let target = null;
    let ghost = null;
    let scroller = null;
    let lastY = startY;
    const shield = h('div', { class: 'ed-drag-shield' });
    try {
      source.setPointerCapture(event.pointerId);
    } catch {
      // Without capture the shield below still catches the pointer.
    }

    function autoscroll() {
      const f = frame.getBoundingClientRect();
      const win = canvas.win();
      if (!win) return;
      if (lastY < f.top + EDGE) win.scrollBy(0, -14);
      else if (lastY > f.bottom - EDGE) win.scrollBy(0, 14);
    }

    function move(e) {
      lastY = e.clientY;
      if (!dragging) {
        if (Math.hypot(e.clientX - startX, e.clientY - startY) < START_DISTANCE) return;
        dragging = true;
        canvas.stopEditing();
        document.body.append(shield);
        document.body.classList.add('ed-dragging');
        ghost = h('div', { class: 'ed-ghost', html: icon(spec.iconName || 'blocks', 18) }, spec.label || '');
        document.body.append(ghost);
        scroller = setInterval(autoscroll, 30);
      }
      ghost.style.transform = `translate(${e.clientX + 12}px, ${e.clientY + 12}px)`;
      target = targetAt(e.clientX, e.clientY, spec);
      if (target && target.line) canvas.showDrop(target.line);
      else canvas.hideDrop();
    }

    function up(e) {
      const wasDragging = dragging;
      const final = wasDragging ? targetAt(e.clientX, e.clientY, spec) : null;
      cleanup();
      active = null;
      if (!wasDragging) {
        if (spec.onClick) spec.onClick();
        else if (spec.kind === 'new' || spec.kind === 'new-section') click(spec);
        return;
      }
      if (final) drop(spec, final);
    }

    function key(e) {
      if (e.key === 'Escape') cancel();
    }

    function cleanup() {
      source.removeEventListener('pointermove', move);
      source.removeEventListener('pointerup', up);
      source.removeEventListener('pointercancel', cleanup);
      window.removeEventListener('keydown', key, true);
      clearInterval(scroller);
      shield.remove();
      if (ghost) ghost.remove();
      document.body.classList.remove('ed-dragging');
      canvas.hideDrop();
    }

    source.addEventListener('pointermove', move);
    source.addEventListener('pointerup', up);
    source.addEventListener('pointercancel', cleanup);
    window.addEventListener('keydown', key, true);
    active = { cleanup };
  }

  // A click on a tile: in at the usual place, no dragging. A section can say
  // where it belongs with spec.place(design), as a trend goes after Nostoja
  // kentältä; a section the editor has selected still comes first.
  function click(spec) {
    if (spec.kind === 'new-section') {
      const d = store.design;
      const sel = store.selection;
      let index = d.sections.findIndex((s) => s.role === 'footer');
      const placed = spec.place ? spec.place(d) : -1;
      if (placed >= 0) index = placed;
      if (sel && sel.kind === 'section') index = findSection(d, sel.id).index + 1;
      if (index < 0) index = d.sections.length;
      drop(spec, { index });
      return;
    }
    const target = defaultTarget(spec.blockType);
    if (target) drop(spec, target);
  }

  return { begin, cancel, click, defaultTarget };
}
