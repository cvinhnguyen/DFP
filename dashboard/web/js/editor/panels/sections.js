// Osiot: the email's sections, as Mailchimp's Sections panel has them.
// Manage puts them in order, renames, copies, saves and deletes them.
// Ready-made adds a section from the list below; Trends adds a topic the
// latest signal detection found, as a box for Nostoja kentältä; Saved adds
// one an editor saved earlier.

import { moveSection, removeSection, duplicateSection, withNewIds, isSent, readDesign, emptyDesign } from '../../newsletter/model.js';
import { PREBUILT, PREBUILT_GROUPS, trendSection, trendTopic, trendPlace } from '../../newsletter/templates.js';
import { renderEmail } from '../../newsletter/render.js';
import { t, tn } from '../../texts.js';
import { when, date } from '../../format.js';
import { h, fill } from '../../ui/dom.js';
import { icon } from '../../ui/icons.js';
import { popover, closePopover } from '../../ui/controls.js';

let tab = 'manage';

// A small picture of a design, drawn by the email's own renderer and shrunk
// to fit its box, however wide the box is.
export function thumbnail(design, { height = 120 } = {}) {
  const WIDTH = 700;
  const html = renderEmail(design, { mode: 'export', t: (k) => k, sketch: true });
  const frame = h('iframe', { class: 'thumb-frame', title: '', tabindex: '-1', 'aria-hidden': 'true', sandbox: 'allow-same-origin', loading: 'lazy' });
  frame.srcdoc = html;
  frame.style.width = `${WIDTH}px`;
  const box = h('div', { class: 'thumb', style: { height: `${height}px` } }, frame);
  const fit = () => {
    const scale = (box.clientWidth || 280) / WIDTH;
    frame.style.transform = `scale(${scale})`;
    frame.style.height = `${Math.ceil(height / scale)}px`;
  };
  new ResizeObserver(fit).observe(box);
  fit();
  return box;
}

export function createSectionsPanel({ store, dnd, root, context, actions, api }) {
  let saved = null;     // the saved sections, once fetched
  let trends = null;    // the latest signals, once fetched
  let query = '';

  function menu(anchor, sectionId) {
    const items = [
      { label: t('sections.rename'), iconName: 'pencil', run: () => actions.renameSection(sectionId) },
      { label: t('sections.duplicate'), iconName: 'duplicate', run: () => {
        let copy = null;
        store.change((d) => { copy = duplicateSection(d, sectionId); });
        if (copy) store.select({ kind: 'section', id: copy.id });
      } },
      { label: t('sections.save'), iconName: 'save', run: () => actions.saveSection(sectionId) },
      { label: t('sections.delete'), iconName: 'trash', danger: true, run: () => {
        store.change((d) => removeSection(d, sectionId));
        store.select(null);
      } },
    ];
    popover(anchor, h('div', { class: 'tt-menu', role: 'menu' }, items.map((item) => h('button', {
      type: 'button', role: 'menuitem', class: `tt-menu-item${item.danger ? ' danger' : ''}`,
      onclick: () => {
        closePopover();
        item.run();
      },
    }, h('span', { html: icon(item.iconName, 16) }), h('span', {}, item.label)))), { className: 'tt-pop' });
  }

  function manage() {
    const sections = store.design.sections;
    const list = h('ol', { class: 'sp-list' }, sections.map((s, i) => {
      const selected = store.selection && store.selection.kind === 'section' && store.selection.id === s.id;
      const more = h('button', { type: 'button', class: 'st-icon-btn', title: t('sections.more', { name: s.name }), 'aria-label': t('sections.more', { name: s.name }), 'data-popover-anchor': '', html: icon('more', 18) });
      more.addEventListener('click', () => menu(more, s.id));
      return h('li', { class: `sp-item${selected ? ' selected' : ''}`, draggable: 'true', dataset: { id: s.id } },
        h('span', { class: 'sp-grip', html: icon('grip', 16), title: t('sections.drag') }),
        h('button', { type: 'button', class: 'sp-name', onclick: () => {
          store.select({ kind: 'section', id: s.id });
          actions.revealSection(s.id);
        } }, s.name, isSent(s) ? null : h('span', { class: 'sp-badge' }, t('sections.notSent'))),
        h('button', { type: 'button', class: 'st-icon-btn', title: t('sections.up'), 'aria-label': t('sections.up'), html: icon('arrowUp', 16), disabled: i === 0, onclick: () => store.change((d) => moveSection(d, s.id, i - 1)) }),
        h('button', { type: 'button', class: 'st-icon-btn', title: t('sections.down'), 'aria-label': t('sections.down'), html: icon('arrowDown', 16), disabled: i === sections.length - 1, onclick: () => store.change((d) => moveSection(d, s.id, i + 1)) }),
        more);
    }));
    // Dragging rows of the list reorders the sections.
    let dragged = null;
    list.addEventListener('dragstart', (e) => {
      const li = e.target.closest('.sp-item');
      if (!li) return;
      dragged = li.dataset.id;
      e.dataTransfer.effectAllowed = 'move';
      e.dataTransfer.setData('text/plain', dragged);
      li.classList.add('dragging');
    });
    list.addEventListener('dragover', (e) => {
      if (!dragged) return;
      e.preventDefault();
      const li = e.target.closest('.sp-item');
      list.querySelectorAll('.sp-item').forEach((x) => x.classList.remove('drop-before', 'drop-after'));
      if (li && li.dataset.id !== dragged) {
        const r = li.getBoundingClientRect();
        li.classList.add(e.clientY < r.top + r.height / 2 ? 'drop-before' : 'drop-after');
      }
    });
    list.addEventListener('drop', (e) => {
      e.preventDefault();
      const li = e.target.closest('.sp-item');
      if (!dragged || !li || li.dataset.id === dragged) return;
      const r = li.getBoundingClientRect();
      const ids = store.design.sections.map((s) => s.id);
      let to = ids.indexOf(li.dataset.id) + (e.clientY < r.top + r.height / 2 ? 0 : 1);
      if (ids.indexOf(dragged) < to) to -= 1;
      const id = dragged;
      dragged = null;
      store.change((d) => moveSection(d, id, to));
    });
    list.addEventListener('dragend', () => {
      dragged = null;
      list.querySelectorAll('.sp-item').forEach((x) => x.classList.remove('dragging', 'drop-before', 'drop-after'));
    });
    return [
      list,
      h('button', { type: 'button', class: 'btn ghost small sp-add', html: `${icon('plus', 16)} `, onclick: () => actions.addBlankSection() }, t('sections.addBlank')),
    ];
  }

  function sectionCard(name, create, extra = {}) {
    const preview = emptyDesign();
    preview.styles = store.design.styles;
    try {
      preview.sections = [create()];
    } catch {
      preview.sections = [];
    }
    const card = h('div', { class: 'sp-card', tabindex: '0', role: 'button', title: t('sections.addHint') },
      thumbnail(preview, { height: 110 }),
      h('div', { class: 'sp-card-name' }, name, extra.meta ? h('span', { class: 'sp-card-meta' }, extra.meta) : null),
      extra.menu || null);
    card.addEventListener('pointerdown', (event) => {
      if (event.target.closest('.st-icon-btn')) return;
      dnd.begin(event, { kind: 'new-section', label: name, iconName: 'sections', create: () => withNewIds(create()), place: extra.place });
    });
    card.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        dnd.click({ kind: 'new-section', create: () => withNewIds(create()), place: extra.place });
      }
    });
    return card;
  }

  function prebuilt() {
    return PREBUILT_GROUPS.map((group) => h('div', { class: 'sp-group' },
      h('h3', { class: 'panel-subtitle' }, t(`sections.group.${group}`)),
      h('div', { class: 'sp-cards' }, PREBUILT.filter((p) => p.group === group).map((p) => sectionCard(p.name, () => p.create(context.issue, store.design))))));
  }

  async function loadTrends() {
    try {
      trends = await api.get('/api/signals');
    } catch (e) {
      trends = { error: e.message };
    }
    if (tab === 'trends') render();
  }

  // The topics of the latest signal detection that more than one article
  // came up with, most articles first, as the articles page lists them.
  function trendList() {
    if (!trends) {
      loadTrends();
      return [h('p', { class: 'panel-lead' }, t('sections.loading'))];
    }
    if (trends.error) return [h('p', { class: 'st-warn' }, trends.error)];
    const shown = trends.signals.filter((s) => s.detected_on === trends.latest && s.articles > 1);
    if (!shown.length) return [h('p', { class: 'panel-lead' }, t('sections.trendsNone'))];
    return [
      h('p', { class: 'panel-lead' }, t('sections.trendsLead', { date: date(trends.latest) })),
      h('div', { class: 'sp-cards' }, shown.map((s) => sectionCard(trendTopic(s), () => trendSection(s, store.design),
        { meta: tn('sections.trendsCount', s.articles), place: trendPlace }))),
    ];
  }

  async function loadSaved() {
    try {
      saved = await api.get('/api/templates', { kind: 'section' });
    } catch (e) {
      saved = { error: e.message };
    }
    if (tab === 'saved') render();
  }

  function savedList() {
    if (!saved) {
      loadSaved();
      return [h('p', { class: 'panel-lead' }, t('sections.loading'))];
    }
    if (saved.error) return [h('p', { class: 'st-warn' }, saved.error)];
    const search = h('input', { class: 'cf-input', type: 'search', placeholder: t('sections.search'), value: query, 'aria-label': t('sections.search') });
    search.addEventListener('input', () => {
      query = search.value;
      const pos = search.selectionStart;
      render();
      const again = root.querySelector('input[type="search"]');
      if (again) {
        again.focus();
        again.setSelectionRange(pos, pos);
      }
    });
    const items = saved.filter((s) => !query || s.name.toLowerCase().includes(query.toLowerCase()));
    if (!saved.length) return [search, h('p', { class: 'panel-lead' }, t('sections.noSaved'))];
    return [search, h('div', { class: 'sp-cards' }, items.map((s) => {
      const sec = readDesign({ version: 2, styles: store.design.styles, sections: [s.design] });
      const more = h('button', { type: 'button', class: 'st-icon-btn sp-card-more', title: t('sections.savedMore'), 'aria-label': t('sections.savedMore'), 'data-popover-anchor': '', html: icon('more', 18) });
      more.addEventListener('click', (e) => {
        e.stopPropagation();
        popover(more, h('div', { class: 'tt-menu', role: 'menu' },
          h('button', { type: 'button', role: 'menuitem', class: 'tt-menu-item', onclick: async () => {
            closePopover();
            const name = await actions.prompt(t('sections.renameSaved'), s.name);
            if (!name) return;
            await api.patch(`/api/templates/${s.id}`, { name });
            saved = null;
            render();
          } }, t('sections.rename')),
          h('button', { type: 'button', role: 'menuitem', class: 'tt-menu-item danger', onclick: async () => {
            closePopover();
            if (!(await actions.confirm(t('sections.deleteSavedConfirm', { name: s.name })))) return;
            await api.del(`/api/templates/${s.id}`);
            saved = null;
            render();
          } }, t('sections.delete'))), { className: 'tt-pop' });
      });
      return sectionCard(s.name, () => (sec ? sec.sections[0] : s.design), { meta: `${s.updated_by || ''} · ${when(s.updated_at)}`, menu: more });
    }))];
  }

  function render() {
    const tabs = ['manage', 'prebuilt', 'trends', 'saved'];
    fill(root, 
      h('h2', { class: 'panel-title' }, t('sections.title')),
      h('p', { class: 'panel-lead' }, t('sections.lead')),
      h('div', { class: 'st-tabs', role: 'tablist' }, tabs.map((name) => h('button', {
        type: 'button', role: 'tab', class: 'st-tab', 'aria-selected': String(name === tab),
        onclick: () => {
          tab = name;
          render();
        },
      }, t(`sections.tab.${name}`)))),
      ...(tab === 'manage' ? manage() : tab === 'prebuilt' ? prebuilt() : tab === 'trends' ? trendList() : savedList()),
    );
  }

  store.on('change', ({ source }) => {
    if (tab === 'manage' && source !== 'canvas') render();
  });
  store.on('select', () => {
    if (tab === 'manage') render();
  });

  return {
    render,
    savedChanged() {
      saved = null;
    },
  };
}
