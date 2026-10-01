// Valitse pohja: what an issue starts from, like Mailchimp's template
// gallery. The association's own layout, a few plainer ones, the designs
// the editors saved, or an earlier issue. Each card shows the template
// filled with this issue's picked articles, so what you see is what you get.

import { builtInTemplates, startDesign } from '../newsletter/templates.js';
import { t } from '../texts.js';
import { when, date } from '../format.js';
import { h, clear, fill } from '../ui/dom.js';
import { icon } from '../ui/icons.js';
import { modal } from '../ui/dialogs.js';
import { thumbnail } from './panels/sections.js';
import { openPreview } from './preview.js';

export function chooseTemplate({ api, issue, articles, closable, onChoose, backHref }) {
  let tab = 'builtin';
  let saved = null;
  let past = null;
  const grid = h('div', { class: 'ch-grid' });
  const tabBar = h('div', { class: 'st-tabs ch-tabs', role: 'tablist' });

  function card(name, description, source, meta) {
    const design = startDesign(source, issue, articles);
    const use = () => {
      dialog.close('chosen');
      onChoose(design, source);
    };
    return h('div', { class: 'ch-card' },
      h('div', { class: 'ch-thumb' }, thumbnail(design, { height: 300 }),
        h('div', { class: 'ch-hover' },
          h('button', { type: 'button', class: 'btn', onclick: use }, t('chooser.use')),
          h('button', { type: 'button', class: 'btn ghost', onclick: () => openPreview({ design, issue, title: name }) }, t('chooser.preview')))),
      h('div', { class: 'ch-card-body' },
        h('h3', {}, name, source.recommended ? h('span', { class: 'cf-badge' }, t('chooser.recommended')) : null),
        description ? h('p', {}, description) : null,
        meta ? h('p', { class: 'ch-meta' }, meta) : null,
        h('button', { type: 'button', class: 'cf-linkish ch-use', onclick: use }, t('chooser.use'), h('span', { html: icon('arrowRight', 16) }))));
  }

  async function draw() {
    fill(tabBar, ...['builtin', 'saved', 'past'].map((name) => h('button', {
      type: 'button', role: 'tab', class: 'st-tab', 'aria-selected': String(name === tab),
      onclick: () => {
        tab = name;
        draw();
      },
    }, t(`chooser.tab.${name}`))));
    clear(grid);
    if (tab === 'builtin') {
      builtInTemplates().forEach((key) => grid.append(card(t(`template.${key}`), t(`template.${key}.lead`), { kind: 'builtin', key, recommended: key === 'eok' })));
      return;
    }
    if (tab === 'saved') {
      if (!saved) {
        grid.append(h('p', { class: 'panel-lead' }, t('chooser.loading')));
        try {
          saved = await api.get('/api/templates', { kind: 'template' });
        } catch (e) {
          saved = [];
          grid.append(h('p', { class: 'st-warn' }, e.message));
        }
        if (tab === 'saved') draw();
        return;
      }
      if (!saved.length) grid.append(h('p', { class: 'ch-empty' }, t('chooser.noSaved')));
      saved.forEach((s) => grid.append(card(s.name, '', { kind: 'design', design: s.design, id: s.id }, `${s.updated_by || ''} · ${when(s.updated_at)}`)));
      return;
    }
    if (!past) {
      grid.append(h('p', { class: 'panel-lead' }, t('chooser.loading')));
      try {
        const list = (await api.get('/api/issues')).filter((i) => i.id !== issue.id && i.has_design).slice(0, 12);
        past = await Promise.all(list.map(async (i) => ({ issue: i, design: (await api.get(`/api/issues/${i.id}/design`)).design })));
      } catch (e) {
        past = [];
        grid.append(h('p', { class: 'st-warn' }, e.message));
      }
      if (tab === 'past') draw();
      return;
    }
    if (!past.length) grid.append(h('p', { class: 'ch-empty' }, t('chooser.noPast')));
    past.forEach(({ issue: i, design }) => grid.append(card(i.name, t('chooser.pastLead'), { kind: 'design', design, issueId: i.id },
      i.sent_at ? t('chooser.sentOn', { date: date(i.sent_at) }) : t('chooser.draft'))));
  }

  const dialog = modal({
    title: t('chooser.title'),
    body: h('div', { class: 'ch' },
      h('div', { class: 'ch-top' }, h('p', { class: 'ch-lead' }, t('chooser.lead')),
        backHref ? h('a', { class: 'btn ghost small', href: backHref }, t('chooser.back')) : null),
      tabBar, grid),
    wide: true,
    className: 'md-chooser',
    closable,
  });
  draw();
  return dialog;
}
