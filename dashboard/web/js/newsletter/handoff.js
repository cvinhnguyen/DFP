// Vie Mailchimpiin: getting the finished email into the association's
// Mailchimp, where it is sent. Three ways, the one that suits their plan
// first:
//
//   draft  n8n creates the issue's draft campaign in Mailchimp, pictures,
//          subject line, preview text and sender included. Needs the
//          Mailchimp connection, and a Standard plan to send what it makes.
//   copy   section by section into their own Mailchimp template, which
//          works on every plan, Essentials too. With the connection, the
//          pictures are copied into Mailchimp first so they show.
//   file   a ZIP for Mailchimp's Import ZIP, or the HTML. Standard plan.
//
// Sending is always an editor's click in Mailchimp.
// Jira: DM42-37

import { api } from '../api.js';
import { t } from '../texts.js';
import { when } from '../format.js';
import { sectionsForPaste, renderEmail } from './render.js';
import { h, fill } from '../ui/dom.js';
import { icon } from '../ui/icons.js';
import { modal, toast, confirmDialog } from '../ui/dialogs.js';

const ZIP_LIMIT = 1024 * 1024;

function steps(keys, params = {}) {
  return h('ol', { class: 'ho-steps' }, keys.map((k) => h('li', {}, t(k, params))));
}

// Formatted text and its plain version on the clipboard, so pasting into a
// Mailchimp text block keeps headings, links and bold. The browser's own copy
// event takes them as they are; the newer clipboard API, used when that is
// not allowed, reads the formatted text through the page first.
function copyNow(html, text) {
  let done = false;
  const onCopy = (event) => {
    event.clipboardData.setData('text/html', html);
    event.clipboardData.setData('text/plain', text);
    event.preventDefault();
    done = true;
  };
  document.addEventListener('copy', onCopy);
  try {
    document.execCommand('copy');
  } finally {
    document.removeEventListener('copy', onCopy);
  }
  return done;
}

async function copyRich(html, text) {
  if (copyNow(html, text)) return;
  if (navigator.clipboard && window.ClipboardItem) {
    await navigator.clipboard.write([new ClipboardItem({
      'text/html': new Blob([html], { type: 'text/html' }),
      'text/plain': new Blob([text], { type: 'text/plain' }),
    })]);
    return;
  }
  await navigator.clipboard.writeText(text);
}

export function openHandoff({ issue, design, mailchimp, onChanged }) {
  const connected = !!(mailchimp && mailchimp.connected);
  const plan = (mailchimp && mailchimp.plan) || 'unknown';
  const base = (mailchimp && mailchimp.dashboard_url) || location.origin;
  const local = /localhost|127\.0\.0\.1/.test(base);
  const recommended = connected && plan !== 'essentials' ? 'draft' : 'copy';
  let pictures = null;   // where Mailchimp keeps each picture, once copied
  let picturesReady = null;
  let current = issue;

  // With Mailchimp connected, the pictures are copied there as soon as the
  // window opens, so a copied section points at Mailchimp's copies.
  function copyPictures() {
    if (!connected) return Promise.resolve();
    if (!picturesReady) {
      picturesReady = api.post(`/api/issues/${current.id}/mailchimp/pictures`)
        .then((answer) => { pictures = answer.mapping; })
        .catch((e) => { picturesReady = null; throw e; });
    }
    return picturesReady;
  }
  copyPictures().catch(() => {});
  const mapSrc = (src) => (pictures && pictures[src]) || (src.startsWith('/') ? base + src : src);

  function card(key, title, body, { open = false } = {}) {
    const head = h('button', { type: 'button', class: 'ho-head', 'aria-expanded': String(open) },
      h('span', { class: 'ho-title' }, title, key === recommended ? h('span', { class: 'cf-badge' }, t('handoff.recommended')) : null),
      h('span', { class: 'ho-chevron', html: icon('chevronDown', 18) }));
    const content = h('div', { class: 'ho-body', hidden: !open }, body);
    head.addEventListener('click', () => {
      const now = head.getAttribute('aria-expanded') !== 'true';
      head.setAttribute('aria-expanded', String(now));
      content.hidden = !now;
    });
    return h('section', { class: `ho-card${key === recommended ? ' recommended' : ''}` }, head, content);
  }

  // ---------- straight into Mailchimp ----------

  const draftStatus = h('div', { class: 'ho-status', role: 'status' });
  function drawDraftStatus() {
    const parts = [];
    if (current.mailchimp_exported_at) {
      parts.push(h('p', { class: 'ho-done', html: `${icon('check', 18)} ` },
        t('handoff.exported', { when: when(current.mailchimp_exported_at), name: current.mailchimp_exported_by || '?' })));
      if (current.mailchimp_changed) parts.push(h('p', { class: 'st-warn' }, t('handoff.changedSince')));
      if (current.mailchimp_url) parts.push(h('a', { class: 'btn ghost small', href: current.mailchimp_url, target: '_blank', rel: 'noopener noreferrer' }, t('handoff.openInMailchimp'), h('span', { html: ` ${icon('external', 14)}` })));
    }
    fill(draftStatus, ...parts);
  }
  const draftButton = h('button', { type: 'button', class: 'btn' }, current.mailchimp_exported_at ? t('handoff.updateDraft') : t('handoff.createDraft'));
  draftButton.addEventListener('click', async () => {
    if (current.mailchimp_exported_at && !(await confirmDialog(t('handoff.updateConfirm'), { okLabel: t('handoff.updateDraft') }))) return;
    draftButton.disabled = true;
    draftButton.textContent = t('handoff.exporting');
    try {
      // The pictures this window started copying are waited for, so they
      // go into Mailchimp once.
      await copyPictures().catch(() => {});
      current = await api.post(`/api/issues/${current.id}/mailchimp`);
      toast(t('handoff.exportedToast'));
      onChanged(current);
    } catch (e) {
      toast(e.message, 'warn');
    } finally {
      draftButton.disabled = false;
      draftButton.textContent = current.mailchimp_exported_at ? t('handoff.updateDraft') : t('handoff.createDraft');
      drawDraftStatus();
    }
  });
  drawDraftStatus();
  const draftBody = h('div', {},
    h('p', {}, t('handoff.draftLead')),
    plan === 'essentials' ? h('p', { class: 'st-warn' }, t('handoff.essentialsWarning')) : null,
    connected
      ? h('p', { class: 'ho-connected', html: `${icon('check', 16)} ` }, t('handoff.connectedTo', { name: mailchimp.account_name || '?' }))
      : h('p', { class: 'st-warn' }, t('handoff.notConnected')),
    steps(['handoff.draftStep1', 'handoff.draftStep2', 'handoff.draftStep3']),
    connected ? h('div', { class: 'ho-actions' }, draftButton) : null,
    draftStatus);

  // ---------- copy into their own template ----------

  const sections = sectionsForPaste(design);
  async function copySection(sec, button) {
    button.disabled = true;
    try {
      if (connected && !pictures) await copyPictures();
      const fresh = sectionsForPaste(design, { mapSrc }).find((s) => s.id === sec.id);
      await copyRich(fresh.html, fresh.text);
      button.classList.add('done');
      button.textContent = t('handoff.copied');
      toast(t('handoff.copiedSection', { name: sec.name }));
    } catch (e) {
      toast(e.message || t('handoff.copyFailed'), 'warn');
    } finally {
      button.disabled = false;
    }
  }
  async function copyText(text, label) {
    try {
      await navigator.clipboard.writeText(text);
      toast(t('handoff.copiedThing', { what: label }));
    } catch {
      toast(t('handoff.copyFailed'), 'warn');
    }
  }
  const copyBody = h('div', {},
    h('p', {}, t('handoff.copyLead')),
    steps(['handoff.copyStep1', 'handoff.copyStep2', 'handoff.copyStep3']),
    connected ? h('p', { class: 'cf-hint' }, t('handoff.picturesCopied'))
      : local ? h('p', { class: 'st-warn' }, t('handoff.picturesLocal')) : null,
    h('ul', { class: 'ho-sections' }, sections.map((sec) => {
      const button = h('button', { type: 'button', class: 'btn ghost small' }, t('handoff.copy'));
      button.addEventListener('click', () => copySection(sec, button));
      return h('li', {}, h('span', { class: 'ho-section-name' }, sec.name), button);
    })),
    h('div', { class: 'ho-actions' },
      h('button', { type: 'button', class: 'btn ghost small', disabled: !current.subject, onclick: () => copyText(current.subject, t('handoff.subject')) }, t('handoff.copySubject')),
      h('button', { type: 'button', class: 'btn ghost small', disabled: !current.preheader, onclick: () => copyText(current.preheader, t('handoff.preheader')) }, t('handoff.copyPreheader'))),
    h('details', { class: 'ho-more' },
      h('summary', {}, t('handoff.codeTitle')),
      h('p', {}, t('handoff.codeLead')),
      h('button', { type: 'button', class: 'btn ghost small', onclick: async () => {
        try {
          if (connected && !pictures) await copyPictures();
          await copyText(renderEmail(design, { mode: 'fragment', mapSrc }), t('handoff.wholeEmail'));
        } catch (e) {
          toast(e.message, 'warn');
        }
      } }, t('handoff.copyCode'))));

  // ---------- as a file ----------

  async function downloadZip(button) {
    button.disabled = true;
    try {
      const response = await fetch(`/api/issues/${current.id}/export.zip`, { credentials: 'same-origin' });
      if (!response.ok) throw new Error(t('error.not_designed_yet'));
      const blob = await response.blob();
      const name = (response.headers.get('Content-Disposition') || '').match(/filename="([^"]+)"/);
      const a = h('a', { href: URL.createObjectURL(blob), download: name ? name[1] : 'uutiskirje.zip', hidden: true });
      document.body.append(a);
      a.click();
      setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 1000);
      if (blob.size > ZIP_LIMIT) toast(t('handoff.zipTooBig', { kb: Math.round(blob.size / 1024) }), 'warn');
    } catch (e) {
      toast(e.message, 'warn');
    } finally {
      button.disabled = false;
    }
  }
  const zipButton = h('button', { type: 'button', class: 'btn', html: `${icon('upload', 16)} ` }, t('handoff.downloadZip'));
  zipButton.addEventListener('click', () => downloadZip(zipButton));
  const fileBody = h('div', {},
    h('p', {}, t('handoff.fileLead')),
    plan === 'essentials' ? h('p', { class: 'st-warn' }, t('handoff.essentialsWarning')) : null,
    steps(['handoff.fileStep1', 'handoff.fileStep2', 'handoff.fileStep3', 'handoff.fileStep4']),
    h('div', { class: 'ho-actions' }, zipButton,
      h('a', { class: 'btn ghost small', href: `/api/issues/${current.id}/export`, download: '' }, t('handoff.downloadHtml')),
      h('button', { type: 'button', class: 'btn ghost small', onclick: async () => {
        const response = await fetch(`/api/issues/${current.id}/export`, { credentials: 'same-origin' });
        await copyText(await response.text(), 'HTML');
      } }, t('handoff.copyHtml'))));

  // ---------- the window ----------

  const planLine = h('p', { class: 'ho-plan' }, t(`handoff.plan.${plan}`));
  const cards = {
    draft: card('draft', t('handoff.draftTitle'), draftBody, { open: recommended === 'draft' }),
    copy: card('copy', t('handoff.copyTitle'), copyBody, { open: recommended === 'copy' }),
    file: card('file', t('handoff.fileTitle'), fileBody),
  };
  const order = recommended === 'draft' ? ['draft', 'copy', 'file'] : ['copy', 'draft', 'file'];
  const markSent = current.status === 'draft' ? h('div', { class: 'ho-sent' },
    h('p', {}, t('handoff.afterSending')),
    h('button', { type: 'button', class: 'btn ghost small', onclick: async () => {
      if (!(await confirmDialog(t('issue.markSentConfirm'), { okLabel: t('issue.markSent') }))) return;
      try {
        current = await api.post(`/api/issues/${current.id}/sent`);
        dialog.close();
        onChanged(current);
      } catch (e) {
        toast(e.message, 'warn');
      }
    } }, t('issue.markSent'))) : null;

  const dialog = modal({
    title: t('handoff.title'),
    body: h('div', { class: 'ho' }, h('p', { class: 'ho-lead' }, t('handoff.lead')), planLine, ...order.map((k) => cards[k]), markSent),
    className: 'md-handoff',
  });
  return dialog;
}
