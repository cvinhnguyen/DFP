// Uutiskirjeet: every newsletter, drafts first, like Mailchimp's list of
// campaigns. Each row says where the issue is: still a draft, exported to
// Mailchimp, changed since, or sent. A new one starts here and opens on its
// own page, where picking its articles comes first; one made from an earlier
// issue opens in the editor with that issue's look. Either way the next
// picks go into it.
// Jira: DM42-37

import { api } from '../api.js';
import { t, tn } from '../texts.js';
import { esc, when, date } from '../format.js';
import { icon } from '../ui/icons.js';
import { h } from '../ui/dom.js';
import { promptDialog, confirmDialog, toast } from '../ui/dialogs.js';
import { popover, closePopover } from '../ui/controls.js';
import { saveTarget } from './articles.js';

export function mailchimpLine(issue) {
  if (issue.status === 'sent') return issue.mailchimp_status === 'sent' ? t('list.mcSent') : t('list.mcMarked');
  if (!issue.mailchimp_exported_at) return t('list.mcNone');
  if (issue.mailchimp_status === 'schedule') return t('list.mcScheduled');
  if (issue.mailchimp_status === 'deleted') return t('list.mcDeleted');
  return t('list.mcDraft', { when: when(issue.mailchimp_exported_at) });
}

export function showNewsletters(root) {
  let issues = [];
  let query = '';
  let filter = 'all';
  let gone = false;

  function row(i) {
    const href = `#/newsletter?id=${i.id}`;
    const thumb = i.has_design
      ? `<iframe class="nl-thumb-frame" src="/api/issues/${i.id}/preview?at=${encodeURIComponent(i.design_saved_at || '')}" title="" tabindex="-1" aria-hidden="true" sandbox="" loading="lazy"></iframe>`
      : `<span class="nl-thumb-empty">${icon('template', 22)}</span>`;
    const meta = [
      tn('list.articles', i.picked),
      i.open_comments ? tn('list.comments', i.open_comments) : '',
    ].filter(Boolean).join(' · ');
    return `
      <tr data-status="${i.status}" data-text="${esc(`${i.name} ${i.subject}`.toLowerCase())}">
        <td><div class="nl-cell-name">
          <a class="nl-thumb" href="${href}" tabindex="-1" aria-hidden="true">${thumb}</a>
          <div class="nl-name-box">
            <a class="nl-name" href="${href}">${esc(i.name)}</a>
            <span class="nl-sub">${i.subject ? esc(t('list.subject', { subject: i.subject })) : `<em>${esc(t('list.noSubject'))}</em>`}</span>
            <span class="nl-meta">${esc(meta)}</span>
            ${i.current ? `<span class="nl-current">${esc(t('list.current'))}</span>` : ''}
          </div>
        </div></td>
        <td class="nl-cell-edited">${esc(when(i.design_saved_at || i.updated_at))}<span class="nl-meta">${esc(i.design_saved_by || i.updated_by || '')}</span></td>
        <td><span class="nl-status ${i.status}">${esc(t(`list.status.${i.status}`))}</span>${i.sent_at ? `<span class="nl-meta">${esc(date(i.sent_at))}</span>` : ''}</td>
        <td class="nl-cell-mc">${esc(mailchimpLine(i))}</td>
        <td class="nl-cell-actions">
          ${i.status === 'draft' ? `<a class="btn ghost small" href="editor.html?issue=${i.id}">${esc(t('list.edit'))}</a>` : `<a class="btn ghost small" href="${href}">${esc(t('list.open'))}</a>`}
          <button type="button" class="st-icon-btn" data-act="menu" data-id="${i.id}" data-popover-anchor aria-label="${esc(t('list.more', { name: i.name }))}" title="${esc(t('list.more', { name: i.name }))}">${icon('more', 18)}</button>
        </td>
      </tr>`;
  }

  // Searching and filtering hide rows instead of drawing the list again, so
  // the previews do not load again with every letter typed.
  function applyFilter() {
    let visible = 0;
    root.querySelectorAll('tbody tr[data-status]').forEach((tr) => {
      const show = (filter === 'all' || tr.dataset.status === filter) && (!query || tr.dataset.text.includes(query.toLowerCase()));
      tr.hidden = !show;
      if (show) visible += 1;
    });
    root.querySelectorAll('[data-filter]').forEach((b) => b.setAttribute('aria-checked', String(b.dataset.filter === filter)));
    const none = root.querySelector('.nl-none-row');
    if (none) none.hidden = visible > 0;
  }

  function render() {
    const shown = issues;
    const drafts = issues.filter((i) => i.status === 'draft').length;
    root.innerHTML = `
      <div class="pagehead nl-listhead">
        <div>
          <h2>${esc(t('list.title'))}</h2>
          <p>${esc(t('list.lead'))}</p>
        </div>
        <div class="nl-listhead-acts">
          <a class="btn ghost" href="#/archive">${icon('folder', 16)} ${esc(t('list.archive'))}</a>
          <button type="button" class="btn" data-act="create">${icon('plus', 16)} ${esc(t('list.create'))}</button>
        </div>
      </div>
      <div class="nl-filters">
        <input type="search" class="cf-input nl-search" value="${esc(query)}" placeholder="${esc(t('list.search'))}" aria-label="${esc(t('list.search'))}">
        <div class="cf-seg compact" role="radiogroup" aria-label="${esc(t('list.filter'))}">
          ${['all', 'draft', 'sent'].map((f) => `<button type="button" role="radio" class="cf-seg-item" data-filter="${f}" aria-checked="${f === filter}">${esc(t(`list.filter.${f}`))}</button>`).join('')}
        </div>
      </div>
      ${issues.length ? `
      <div class="card nl-list">
        <table class="nl-table">
          <thead><tr>
            <th scope="col">${esc(t('list.col.name'))}</th>
            <th scope="col">${esc(t('list.col.edited'))}</th>
            <th scope="col">${esc(t('list.col.status'))}</th>
            <th scope="col">${esc(t('list.col.mailchimp'))}</th>
            <th scope="col"><span class="sr-only">${esc(t('list.col.actions'))}</span></th>
          </tr></thead>
          <tbody>${shown.map(row).join('')}<tr class="nl-none-row" hidden><td colspan="5" class="nl-none">${esc(t('list.nothing'))}</td></tr></tbody>
        </table>
      </div>` : `
      <div class="card nl-empty">
        ${icon('template', 40)}
        <h3>${esc(t('list.emptyTitle'))}</h3>
        <p>${esc(t('list.emptyLead'))}</p>
        <button type="button" class="btn" data-act="create">${esc(t('list.create'))}</button>
      </div>`}
      ${drafts > 1 ? `<p class="nl-hint">${esc(t('list.manyDrafts'))}</p>` : ''}`;
    applyFilter();
  }

  async function load() {
    try {
      issues = await api.get('/api/issues');
      if (!gone) render();
    } catch (e) {
      if (e.status !== 401 && !gone) root.innerHTML = `<p class="problem">${esc(e.message)}</p>`;
    }
  }

  // Issues sent from Mailchimp show as sent here: asked in the background,
  // so the list does not wait for Mailchimp.
  async function refreshFromMailchimp() {
    if (!issues.some((i) => i.status === 'draft' && i.mailchimp_exported_at)) return;
    try {
      await api.post('/api/mailchimp/refresh');
      await load();
    } catch {
      // Mailchimp unreachable: the list shows what it knew.
    }
  }

  async function create() {
    const name = await promptDialog(t('list.createTitle'), '', { label: t('list.nameLabel'), hint: t('list.nameHint'), okLabel: t('list.create') });
    if (name === null) return;
    try {
      const issue = await api.post('/api/issues', { name: name || undefined });
      saveTarget(issue.id);
      location.hash = `#/newsletter?id=${issue.id}`;
    } catch (e) {
      toast(e.message, 'warn');
    }
  }

  function menu(anchor, issue) {
    const items = [
      { label: t('list.open'), iconName: 'arrowRight', run: () => { location.hash = `#/newsletter?id=${issue.id}`; } },
      issue.status === 'draft' ? { label: t('list.editContent'), iconName: 'pencil', run: () => { location.href = `editor.html?issue=${issue.id}`; } } : null,
      issue.has_design ? { label: t('list.preview'), iconName: 'eye', run: () => window.open(`/api/issues/${issue.id}/preview`, '_blank', 'noopener') } : null,
      issue.status === 'draft' ? { label: t('list.rename'), iconName: 'pencil', run: async () => {
        const name = await promptDialog(t('list.rename'), issue.name, { label: t('list.nameLabel') });
        if (!name) return;
        await api.patch(`/api/issues/${issue.id}`, { name });
        load();
      } } : null,
      issue.has_design ? { label: t('list.replicate'), iconName: 'duplicate', run: async () => {
        const name = await promptDialog(t('list.replicateTitle'), '', { label: t('list.nameLabel'), hint: t('list.replicateHint'), okLabel: t('list.createButton') });
        if (name === null) return;
        const created = await api.post('/api/issues', { name: name || undefined, template: `issue:${issue.id}` });
        saveTarget(created.id);
        location.href = `editor.html?issue=${created.id}`;
      } } : null,
      issue.status === 'draft' ? { label: t('list.delete'), iconName: 'trash', danger: true, run: async () => {
        if (!(await confirmDialog(t('list.deleteConfirm', { name: issue.name, n: issue.picked }), { danger: true, okLabel: t('list.delete') }))) return;
        await api.del(`/api/issues/${issue.id}`);
        toast(t('list.deleted', { name: issue.name }));
        load();
      } } : null,
    ].filter(Boolean);
    popover(anchor, h('div', { class: 'tt-menu', role: 'menu' }, items.map((item) => h('button', {
      type: 'button', role: 'menuitem', class: `tt-menu-item${item.danger ? ' danger' : ''}`,
      onclick: async () => {
        closePopover();
        try {
          await item.run();
        } catch (e) {
          toast(e.message, 'warn');
        }
      },
    }, h('span', { html: icon(item.iconName, 16) }), h('span', {}, item.label)))), { className: 'tt-pop', align: 'right' });
  }

  root.addEventListener('click', (event) => {
    const target = event.target.closest('[data-act], [data-filter]');
    if (!target) return;
    if (target.dataset.filter) {
      filter = target.dataset.filter;
      applyFilter();
      return;
    }
    if (target.dataset.act === 'create') create();
    if (target.dataset.act === 'menu') {
      const issue = issues.find((i) => i.id === Number(target.dataset.id));
      if (issue) menu(target, issue);
    }
  });
  root.addEventListener('input', (event) => {
    if (!event.target.classList.contains('nl-search')) return;
    query = event.target.value.trim();
    applyFilter();
  });

  load().then(refreshFromMailchimp);
  return { leave() { gone = true; closePopover(); } };
}
