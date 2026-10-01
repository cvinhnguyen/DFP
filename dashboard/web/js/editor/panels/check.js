// Tarkistus: what still needs a look before export, like Mailchimp's
// Optimize panel, with the email's links and merge tags listed below. Each
// item can show its block in the email, and the common fixes are a click.

import { findBlock, removeBlock, footerBlock, section, FOOTER_HTML } from '../../newsletter/model.js';
import { placeArticles } from '../../newsletter/templates.js';
import { t, tn } from '../../texts.js';
import { h, fill } from '../../ui/dom.js';
import { icon } from '../../ui/icons.js';
import { accordion } from '../../ui/controls.js';

export function createCheckPanel({ store, root, context, actions }) {
  let result = null;

  function show(blockId) {
    if (!blockId) return;
    store.select({ kind: 'block', id: blockId });
    actions.reveal(blockId);
  }

  function itemLine(item, code) {
    const label = item.snippet || t(`block.${item.type}`);
    const buttons = [];
    if (item.blockId) buttons.push(h('button', { type: 'button', class: 'cf-linkish', onclick: () => show(item.blockId) }, t('check.show')));
    if (code === 'unchecked') {
      buttons.push(h('button', { type: 'button', class: 'btn small', onclick: () => store.change((d) => {
        const f = findBlock(d, item.blockId);
        if (f) f.block.checked = true;
      }) }, t('check.markChecked')));
    }
    if (code === 'missing') {
      buttons.push(h('button', { type: 'button', class: 'btn small', onclick: () => {
        const article = context.articles.find((a) => Number(a.id) === item.itemId);
        let added = [];
        if (article) store.change((d) => { added = placeArticles(d, [article]); });
        if (added[0]) show(added[0].id);
      } }, t('check.insert')));
    }
    if (code === 'orphans') {
      buttons.push(h('button', { type: 'button', class: 'btn ghost small', onclick: () => store.change((d) => removeBlock(d, item.blockId)) }, t('check.removeFromEmail')));
    }
    return h('li', { class: 'ck-item' }, h('span', { class: 'ck-snippet' }, `${t(`block.${item.type}`)}: ${label}`), h('span', { class: 'ck-actions' }, buttons));
  }

  function fixFor(entry) {
    if (entry.code === 'unsubscribe') {
      return h('button', { type: 'button', class: 'btn small', onclick: () => store.change((d) => {
        let footer = null;
        d.sections.forEach((s) => s.blocks.forEach((b) => { if (b.type === 'footer') footer = b; }));
        if (footer) footer.html += '<p><a href="*|UNSUB|*">Peru tilaus</a></p>';
        else d.sections.push(section('Alatunniste', 'footer', [footerBlock(FOOTER_HTML)]));
      }) }, t('check.addUnsub'));
    }
    if (entry.code === 'address') {
      return h('button', { type: 'button', class: 'btn small', onclick: () => store.change((d) => {
        let footer = null;
        d.sections.forEach((s) => s.blocks.forEach((b) => { if (b.type === 'footer') footer = b; }));
        if (footer) footer.html += '<p>*|LIST:ADDRESSLINE|*</p>';
        else d.sections.push(section('Alatunniste', 'footer', [footerBlock(FOOTER_HTML)]));
      }) }, t('check.addAddress'));
    }
    if (entry.code === 'subject') return h('button', { type: 'button', class: 'btn small', onclick: () => actions.editSubject() }, t('check.addSubject'));
    if (entry.code === 'unchecked' && entry.count > 1) {
      return h('button', { type: 'button', class: 'btn ghost small', onclick: async () => {
        if (!(await actions.confirm(t('check.markAllConfirm', { n: entry.count })))) return;
        store.change((d) => entry.items.forEach((i) => {
          const f = findBlock(d, i.blockId);
          if (f) f.block.checked = true;
        }));
      } }, t('check.markAll'));
    }
    if (entry.code === 'missing' && entry.count > 1) {
      return h('button', { type: 'button', class: 'btn ghost small', onclick: () => store.change((d) => placeArticles(d, context.articles)) }, t('check.insertAll'));
    }
    return null;
  }

  function entryBox(entry, level) {
    return h('section', { class: `ck-entry ck-${level}` },
      h('div', { class: 'ck-head' },
        h('span', { class: 'ck-icon', html: icon(level === 'error' ? 'error' : 'warning', 18) }),
        h('h4', {}, entry.count > 1 || entry.items.length ? tn(`check.${entry.code}`, entry.count, entry.params) : t(`check.${entry.code}.one`, entry.params))),
      h('p', { class: 'ck-hint' }, t(`check.${entry.code}Hint`, entry.params)),
      entry.items.length ? h('ul', { class: 'ck-items' }, entry.items.slice(0, 30).map((item) => itemLine(item, entry.code))) : null,
      fixFor(entry));
  }

  function render() {
    if (!result) return;
    const { errors, warnings, links, mergeTags } = result;
    const ok = !errors.length && !warnings.length;
    fill(root, 
      h('h2', { class: 'panel-title' }, t('check.title')),
      h('p', { class: 'panel-lead' }, t('check.lead')),
      h('div', { class: 'ck-summary' },
        h('span', { class: `ck-pill ${result.errorCount ? 'error' : 'ok'}` }, tn('check.errorCount', result.errorCount)),
        h('span', { class: `ck-pill ${result.warningCount ? 'warning' : 'ok'}` }, tn('check.warningCount', result.warningCount))),
      ok ? h('p', { class: 'ck-ok', html: `${icon('check', 20)} ` }, t('check.allGood')) : null,
      ...errors.map((e) => entryBox(e, 'error')),
      ...warnings.map((w) => entryBox(w, 'warning')),
      accordion(`${t('check.links')} [${links.length}]`, () => h('ul', { class: 'ck-links' }, links.map((l) => h('li', {},
        h('span', { class: 'ck-link-text' }, l.text || t(`linkKind.${l.kind}`)),
        h('span', { class: 'ck-link-url' }, l.url || t('check.noAddress')),
        h('span', { class: 'ck-actions' },
          h('button', { type: 'button', class: 'cf-linkish', onclick: () => show(l.blockId) }, t('check.show')),
          /^https?:\/\//.test(l.url) ? h('a', { href: l.url, target: '_blank', rel: 'noopener noreferrer', class: 'cf-linkish' }, t('check.open')) : null))))),
      accordion(`${t('check.mergeTags')} [${mergeTags.length}]`, () => h('div', {},
        h('p', { class: 'ck-hint' }, t('check.mergeTagsHint')),
        h('ul', { class: 'ck-tags' }, mergeTags.map((m) => h('li', {}, h('code', {}, m)))))),
    );
  }

  return {
    update(next) {
      result = next;
      render();
    },
    render,
  };
}
