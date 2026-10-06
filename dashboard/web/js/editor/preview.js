// Esikatselu: the finished email on a computer and on a phone, with the
// email's details beside it, a link checker that goes through every link
// one by one, and the email's size against Gmail's limit, as Mailchimp's
// preview has them.

import { renderEmail, collectLinks, byteSize } from '../newsletter/render.js';
import { GMAIL_CLIP } from '../newsletter/checks.js';
import { t } from '../texts.js';
import { h, fill } from '../ui/dom.js';
import { icon } from '../ui/icons.js';
import { modal } from '../ui/dialogs.js';
import { openMenu } from '../ui/menu.js';
import { KINDS, device as deviceOf, deviceShell, lastDevice, layOutAgain, modelEntries, modelFor, remember, showDevice } from './devices.js';

const checkedLinks = new Set();

export function openPreview({ design, issue, from, onEditBlock, onSendTest, title }) {
  // Pictures not added yet show as wireframes; the size is the email's own.
  const html = renderEmail(design, { mode: 'export', issue, t, wireframe: true });
  const size = byteSize(renderEmail(design, { mode: 'export', issue, t }));
  const links = collectLinks(design);
  let device = lastDevice();

  const frame = h('iframe', { class: 'pv-frame', title: t('preview.frameTitle'), sandbox: 'allow-same-origin' });
  const { shell, screen } = deviceShell('pv-dv');
  screen.append(frame);
  frame.srcdoc = html;
  const frameBox = h('div', { class: 'pv-stage', dataset: { device: 'desktop' } }, shell);
  const side = h('aside', { class: 'pv-side' });

  // A computer, a tablet or a phone, and which model (devices.js).
  const LABEL = { desktop: 'editor.desktop', tablet: 'editor.tablet', phone: 'editor.mobile' };
  const ICON = { desktop: 'desktop', tablet: 'tablet', phone: 'mobile' };
  const model = h('button', { type: 'button', class: 'pv-model', 'aria-haspopup': 'menu' });
  const tabs = h('div', { class: 'pv-tabs', role: 'tablist' },
    KINDS.map((k) => h('button', { type: 'button', role: 'tab', class: 'pv-tab', dataset: { kind: k }, html: `${icon(ICON[k], 18)} ` }, t(LABEL[k]))),
    model,
    onSendTest ? h('button', { type: 'button', class: 'pv-tab pv-send', html: `${icon('send', 18)} `, onclick: () => onSendTest() }, t('preview.sendTest')) : null);
  function show(id) {
    device = id;
    const d = showDevice(shell, id);
    frameBox.dataset.device = d.kind;
    tabs.querySelectorAll('[data-kind]').forEach((x) => x.setAttribute('aria-selected', String(x.dataset.kind === d.kind)));
    model.hidden = d.kind === 'desktop';
    model.innerHTML = d.kind === 'desktop' ? '' : `<span>${d.name}</span>${icon('chevronDown', 16)}`;
    model.setAttribute('aria-label', d.kind === 'desktop' ? '' : `${t('editor.model')}: ${d.name}`);
    requestAnimationFrame(() => layOutAgain(frame));
  }
  function choose(id) {
    remember(id);
    show(id);
  }
  tabs.addEventListener('click', (e) => {
    const b = e.target.closest('[data-kind]');
    if (b) choose(modelFor(b.dataset.kind));
  });
  model.addEventListener('click', () => openMenu(model, modelEntries(deviceOf(device).kind, device, choose), { align: 'left' }));
  show(device);

  function highlight(link) {
    const doc = frame.contentDocument;
    if (!doc) return;
    doc.querySelectorAll('[data-pv-hl]').forEach((el) => {
      el.removeAttribute('data-pv-hl');
      el.style.outline = '';
    });
    const target = [...doc.querySelectorAll('a')].find((a) => a.getAttribute('href') === link.url && (a.textContent || '').trim() === link.text)
      || [...doc.querySelectorAll('a')].find((a) => a.getAttribute('href') === link.url);
    if (target) {
      target.setAttribute('data-pv-hl', '');
      target.style.outline = '3px solid #d97706';
      target.style.outlineOffset = '2px';
      target.scrollIntoView({ block: 'center', behavior: 'smooth' });
    }
  }

  function info() {
    const kb = Math.round(size / 1024);
    const limit = Math.round(GMAIL_CLIP / 1024);
    fill(side, 
      h('h3', { class: 'pv-side-title' }, t('preview.info')),
      h('dl', { class: 'pv-info' },
        h('dt', {}, t('preview.from')), h('dd', {}, from || t('preview.fromMailchimp')),
        h('dt', {}, t('preview.subject')), h('dd', {}, issue.subject || h('span', { class: 'pv-missing' }, t('preview.noSubject'))),
        h('dt', {}, t('preview.preheader')), h('dd', {}, issue.preheader || h('span', { class: 'pv-missing' }, t('preview.noPreheader')))),
      h('button', { type: 'button', class: 'pv-links-button', onclick: linkList },
        h('span', {}, t('preview.checkLinks', { checked: links.filter((l) => checkedLinks.has(l.url)).length, total: links.length })),
        h('span', { html: icon('arrowRight', 18) })),
      h('div', { class: 'pv-size' },
        h('div', { class: 'pv-size-row' }, h('span', {}, t('preview.size')), h('span', {}, `${kb} / ${limit} kt`)),
        h('div', { class: `pv-bar${size > GMAIL_CLIP ? ' over' : ''}` }, h('span', { style: { width: `${Math.min(100, (size / GMAIL_CLIP) * 100)}%` } })),
        h('p', { class: 'cf-hint' }, size > GMAIL_CLIP ? t('preview.clipped') : t('preview.notClipped'))),
    );
  }

  function linkList() {
    fill(side, 
      h('div', { class: 'pv-side-head' },
        h('button', { type: 'button', class: 'st-back', 'aria-label': t('settings.back'), html: icon('arrowLeft', 20), onclick: info }),
        h('h3', { class: 'pv-side-title' }, t('preview.linksChecked', { checked: links.filter((l) => checkedLinks.has(l.url)).length, total: links.length }))),
      links.length ? h('ul', { class: 'pv-links' }, links.map((l, i) => h('li', {},
        h('button', { type: 'button', class: `pv-link${checkedLinks.has(l.url) ? ' done' : ''}`, onclick: () => linkDetail(i) },
          h('span', { class: 'pv-link-icon', html: icon(checkedLinks.has(l.url) ? 'tick' : l.kind === 'button' ? 'button' : l.kind === 'social' ? 'social' : 'link', 18) }),
          h('span', { class: 'pv-link-text' }, h('strong', {}, l.text || t(`linkKind.${l.kind}`)), h('span', {}, l.url || t('check.noAddress'))),
          h('span', { html: icon('chevronRight', 16) }))))) : h('p', { class: 'cf-hint' }, t('preview.noLinks')),
      h('p', { class: 'cf-hint' }, t('preview.linksHint')));
  }

  function linkDetail(i) {
    const l = links[i];
    highlight(l);
    const opens = /^(https?:|mailto:|tel:)/.test(l.url);
    fill(side, 
      h('div', { class: 'pv-side-head' },
        h('button', { type: 'button', class: 'st-back', 'aria-label': t('settings.back'), html: icon('arrowLeft', 20), onclick: linkList }),
        h('h3', { class: 'pv-side-title' }, t('preview.linkDetails'))),
      h('div', { class: 'pv-link-detail' },
        h('strong', {}, l.text || t(`linkKind.${l.kind}`)),
        h('code', {}, l.url || t('check.noAddress')),
        l.url.startsWith('*|') ? h('p', { class: 'cf-hint' }, t('preview.mergeLink')) : null,
        !l.url || l.url === '#' ? h('p', { class: 'st-warn' }, t('preview.emptyLink')) : null,
        h('div', { class: 'pv-link-actions' },
          opens ? h('a', { class: 'btn small', href: l.url, target: '_blank', rel: 'noopener noreferrer', onclick: () => checkedLinks.add(l.url) }, t('preview.openLink')) : null,
          h('button', { type: 'button', class: 'btn ghost small', onclick: () => {
            checkedLinks.add(l.url);
            linkDetail(i);
          } }, t('preview.markChecked')),
          onEditBlock ? h('button', { type: 'button', class: 'btn ghost small', onclick: () => {
            dialog.close();
            onEditBlock(l.blockId);
          } }, t('preview.editLink')) : null)),
      h('div', { class: 'pv-pager' },
        h('span', {}, t('preview.linkOf', { n: i + 1, total: links.length })),
        h('button', { type: 'button', class: 'btn ghost small', disabled: i === 0, onclick: () => linkDetail(i - 1) }, t('library.previous')),
        h('button', { type: 'button', class: 'btn small', disabled: i === links.length - 1, onclick: () => linkDetail(i + 1) }, t('library.next'))));
  }

  info();
  const dialog = modal({
    title: title || t('preview.title'),
    body: h('div', { class: 'pv' }, h('div', { class: 'pv-main' }, tabs, frameBox), side),
    wide: true,
    className: 'md-preview',
  });
  return dialog;
}
