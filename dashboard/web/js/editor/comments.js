// Kommentit: notes Kaisa and Niina leave each other on an issue, like
// Mailchimp's comments. A comment made with a block selected points at that
// block, and "show" takes the other editor straight to it. Open comments
// can be resolved; resolved ones stay readable under their own tab.

import { findBlock } from '../newsletter/model.js';
import { snippet } from '../newsletter/checks.js';
import { t } from '../texts.js';
import { when } from '../format.js';
import { h, fill } from '../ui/dom.js';
import { icon } from '../ui/icons.js';

const POLL_MS = 30000;

export function createComments({ api, store, issueId, me, panel, badge, actions }) {
  let comments = [];
  let tab = 'open';
  let writing = false;
  let pollTimer = null;

  function count() {
    const open = comments.filter((c) => !c.resolved_at).length;
    badge.textContent = open ? String(open) : '';
    badge.hidden = !open;
  }

  async function load() {
    try {
      comments = await api.get(`/api/issues/${issueId}/comments`);
      count();
      if (!panel.hidden) render();
    } catch {
      // The comments are a convenience; the editor works without them.
    }
  }

  function blockLabel(c) {
    if (!c.block_id) return null;
    const found = findBlock(store.design, c.block_id);
    const text = found ? `${t(`block.${found.block.type}`)}: ${snippet(found.block)}` : (c.block_label || t('comments.blockGone'));
    return h('button', { type: 'button', class: 'cm-block', disabled: !found, onclick: () => {
      store.select({ kind: 'block', id: c.block_id });
      actions.reveal(c.block_id);
    } }, h('span', { html: icon('cursor', 14) }), ` ${text}`);
  }

  function composer() {
    const sel = store.selection;
    const found = sel && sel.kind === 'block' ? findBlock(store.design, sel.id) : null;
    const area = h('textarea', { class: 'cf-input cf-area', rows: 3, maxlength: 2000, placeholder: t('comments.placeholder'), 'aria-label': t('comments.placeholder') });
    const send = async () => {
      const body = area.value.trim();
      if (!body) return;
      try {
        await api.post(`/api/issues/${issueId}/comments`, {
          body,
          block_id: found ? found.block.id : null,
          block_label: found ? `${t(`block.${found.block.type}`)}: ${snippet(found.block)}`.slice(0, 200) : null,
        });
        writing = false;
        await load();
        render();
      } catch (e) {
        actions.toast(e.message, 'warn');
      }
    };
    area.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) send();
    });
    setTimeout(() => area.focus(), 0);
    return h('div', { class: 'cm-compose' },
      h('div', { class: 'cm-who' }, h('span', { class: 'cm-avatar' }, (me.name || '?').slice(0, 1).toUpperCase()), h('strong', {}, me.name)),
      found ? h('p', { class: 'cf-hint' }, t('comments.about', { block: `${t(`block.${found.block.type}`)}: ${snippet(found.block)}` })) : h('p', { class: 'cf-hint' }, t('comments.aboutIssue')),
      area,
      h('div', { class: 'cm-actions' },
        h('button', { type: 'button', class: 'btn ghost small', onclick: () => { writing = false; render(); } }, t('dialog.cancel')),
        h('button', { type: 'button', class: 'btn small', onclick: send }, t('comments.send'))));
  }

  function item(c) {
    const mine = c.created_by_id === me.id;
    return h('li', { class: `cm-item${c.resolved_at ? ' resolved' : ''}` },
      h('div', { class: 'cm-who' },
        h('span', { class: 'cm-avatar' }, (c.created_by || '?').slice(0, 1).toUpperCase()),
        h('strong', {}, c.created_by || '?'),
        h('span', { class: 'cm-when' }, when(c.created_at))),
      blockLabel(c),
      h('p', { class: 'cm-body' }, c.body),
      c.resolved_at ? h('p', { class: 'cf-hint' }, t('comments.resolvedBy', { name: c.resolved_by || '?', when: when(c.resolved_at) })) : null,
      h('div', { class: 'cm-actions' },
        h('button', { type: 'button', class: 'cf-linkish', onclick: async () => {
          await api.patch(`/api/comments/${c.id}`, { resolved: !c.resolved_at });
          load();
        } }, c.resolved_at ? t('comments.reopen') : t('comments.resolve')),
        mine ? h('button', { type: 'button', class: 'cf-linkish danger', onclick: async () => {
          if (!(await actions.confirm(t('comments.deleteConfirm')))) return;
          await api.del(`/api/comments/${c.id}`);
          load();
        } }, t('comments.delete')) : null));
  }

  function render() {
    const shown = comments.filter((c) => (tab === 'open' ? !c.resolved_at : !!c.resolved_at));
    fill(panel, 
      h('div', { class: 'cm-head' },
        h('h2', {}, t('comments.title')),
        h('button', { type: 'button', class: 'md-close', 'aria-label': t('dialog.close'), html: icon('close', 20), onclick: close })),
      h('div', { class: 'st-tabs', role: 'tablist' }, ['open', 'resolved'].map((name) => h('button', {
        type: 'button', role: 'tab', class: 'st-tab', 'aria-selected': String(name === tab),
        onclick: () => { tab = name; render(); },
      }, t(`comments.tab.${name}`), ` (${comments.filter((c) => (name === 'open' ? !c.resolved_at : !!c.resolved_at)).length})`))),
      writing ? composer() : h('button', { type: 'button', class: 'btn ghost cm-add', html: `${icon('plus', 16)} `, onclick: () => { writing = true; render(); } }, t('comments.add')),
      shown.length ? h('ul', { class: 'cm-list' }, shown.map(item)) : h('p', { class: 'cm-empty' }, tab === 'open' ? t('comments.none') : t('comments.noneResolved')),
    );
  }

  function open(startWriting = false) {
    panel.hidden = false;
    document.body.classList.add('ed-comments-open');
    writing = startWriting;
    tab = 'open';
    render();
    load();
    clearInterval(pollTimer);
    pollTimer = setInterval(load, POLL_MS);
  }

  function close() {
    panel.hidden = true;
    document.body.classList.remove('ed-comments-open');
    clearInterval(pollTimer);
  }

  store.on('select', () => {
    if (!panel.hidden && writing) render();
  });

  load();
  return {
    // Someone commented: live.js says so, and the comments are asked for again.
    reload: load,
    toggle() {
      if (panel.hidden) open();
      else close();
    },
    commentOn() {
      open(true);
    },
  };
}
