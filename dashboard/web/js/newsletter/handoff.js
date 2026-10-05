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
// None of them opens while Tarkistus lists an error (newsletter/checks.js):
// the window says what is left and leads to the editor instead. The server
// refuses the draft, the test email and the files the same way.
// Sending is always an editor's click in Mailchimp.
// Jira: DM42-37, DM42-38

import { api } from '../api.js';
import { t, tn, has } from '../texts.js';
import { when } from '../format.js';
import { sectionsForPaste, renderEmail } from './render.js';
import { h, fill } from '../ui/dom.js';
import { icon } from '../ui/icons.js';
import { modal, toast, confirmDialog } from '../ui/dialogs.js';

const ZIP_LIMIT = 1024 * 1024;

function steps(keys, params = {}) {
  return h('ol', { class: 'ho-steps' }, keys.map((k) => h('li', {}, t(k, params))));
}

// The email as a file from the server, or why it cannot have it: not saved in
// the editor yet, or Tarkistus still lists an error.
async function fetchFile(path) {
  const response = await fetch(path, { credentials: 'same-origin' });
  if (response.ok) return response;
  const data = await response.json().catch(() => null);
  const code = data && data.code ? `error.${data.code}` : null;
  throw new Error(code && has(code) ? t(code, data.params || {}) : t('error.not_designed_yet'));
}

// One line of Tarkistus, as its list says it: "3 artikkelia tarkistamatta".
export function describeCheck(entry) {
  return entry.items.length ? tn(`check.${entry.code}`, entry.count, entry.params) : t(`check.${entry.code}.one`, entry.params);
}

// What Tarkistus still lists, at the top of a window that cannot go on until
// it is fixed: this one, and the editor's test email. action leads to fixing.
export function notReadyBox(errors, { title, lead, action }) {
  return h('div', { class: 'not-ready', role: 'alert' },
    h('p', { class: 'not-ready-title', html: `${icon('error', 18)} ` }, title),
    h('p', {}, lead),
    h('ul', { class: 'not-ready-list' }, errors.map((e) => h('li', {}, describeCheck(e)))),
    action ? h('div', { class: 'not-ready-actions' }, action) : null);
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

// errors: what Tarkistus lists for the issue's design and subject line.
export function openHandoff({ issue, design, mailchimp, errors = [], onChanged }) {
  const ready = errors.length === 0;
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
  if (ready) copyPictures().catch(() => {});
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
  const draftButton = h('button', { type: 'button', class: 'btn', disabled: !ready }, current.mailchimp_exported_at ? t('handoff.updateDraft') : t('handoff.createDraft'));
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
      draftButton.disabled = !ready;
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
      const button = h('button', { type: 'button', class: 'btn ghost small', disabled: !ready }, t('handoff.copy'));
      button.addEventListener('click', () => copySection(sec, button));
      return h('li', {}, h('span', { class: 'ho-section-name' }, sec.name), button);
    })),
    h('div', { class: 'ho-actions' },
      h('button', { type: 'button', class: 'btn ghost small', disabled: !ready || !current.subject, onclick: () => copyText(current.subject, t('handoff.subject')) }, t('handoff.copySubject')),
      h('button', { type: 'button', class: 'btn ghost small', disabled: !ready || !current.preheader, onclick: () => copyText(current.preheader, t('handoff.preheader')) }, t('handoff.copyPreheader'))),
    h('details', { class: 'ho-more' },
      h('summary', {}, t('handoff.codeTitle')),
      h('p', {}, t('handoff.codeLead')),
      h('button', { type: 'button', class: 'btn ghost small', disabled: !ready, onclick: async () => {
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
      const response = await fetchFile(`/api/issues/${current.id}/export.zip`);
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
  const zipButton = h('button', { type: 'button', class: 'btn', disabled: !ready, html: `${icon('upload', 16)} ` }, t('handoff.downloadZip'));
  zipButton.addEventListener('click', () => downloadZip(zipButton));
  const fileBody = h('div', {},
    h('p', {}, t('handoff.fileLead')),
    plan === 'essentials' ? h('p', { class: 'st-warn' }, t('handoff.essentialsWarning')) : null,
    steps(['handoff.fileStep1', 'handoff.fileStep2', 'handoff.fileStep3', 'handoff.fileStep4']),
    h('div', { class: 'ho-actions' }, zipButton,
      ready
        ? h('a', { class: 'btn ghost small', href: `/api/issues/${current.id}/export`, download: '' }, t('handoff.downloadHtml'))
        : h('button', { type: 'button', class: 'btn ghost small', disabled: true }, t('handoff.downloadHtml')),
      h('button', { type: 'button', class: 'btn ghost small', disabled: !ready, onclick: async () => {
        try {
          const response = await fetchFile(`/api/issues/${current.id}/export`);
          await copyText(await response.text(), 'HTML');
        } catch (e) {
          toast(e.message, 'warn');
        }
      } }, t('handoff.copyHtml'))));

  // ---------- into the association's Drive ----------

  // Shown when an admin has switched Drive on and the tool may save in the
  // folder (GET /api/drive). The association's own copy: nothing is sent,
  // and nothing already in the folder is changed (services/drive.py).
  const driveSlot = h('div', {});
  api.get('/api/drive').then((drive) => {
    if (!drive.enabled || !drive.can_save) return;
    const status = h('div', { class: 'ho-status', role: 'status' });
    const button = h('button', { type: 'button', class: 'btn', disabled: !ready, html: `${icon('upload', 16)} ` }, t('handoff.driveSave'));
    button.addEventListener('click', async () => {
      button.disabled = true;
      status.replaceChildren(h('p', {}, t('handoff.driveSaving')));
      try {
        const saved = await api.post(`/api/issues/${current.id}/drive`);
        status.replaceChildren(
          h('p', { class: 'ho-done', html: `${icon('check', 18)} ` }, t('handoff.driveSaved', { folder: saved.folder.name })),
          saved.folder.link ? h('a', { class: 'btn ghost small', href: saved.folder.link, target: '_blank', rel: 'noopener noreferrer' },
            t('handoff.driveOpen'), h('span', { html: ` ${icon('external', 14)}` })) : null);
      } catch (e) {
        status.replaceChildren(h('p', { class: 'st-warn' }, e.message));
      } finally {
        button.disabled = !ready;
      }
    });
    driveSlot.replaceChildren(card('drive', t('handoff.driveTitle'), h('div', {},
      h('p', {}, t('handoff.driveLead', { folder: drive.save_folder || drive.folder_name })),
      drive.autosave ? h('p', { class: 'cf-hint' }, t('handoff.driveAuto')) : null,
      h('div', { class: 'ho-actions' }, button), status)));
  }).catch(() => {});

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

  const blocked = ready ? null : notReadyBox(errors, {
    title: t('handoff.notReady'),
    lead: t('handoff.notReadyLead'),
    action: h('a', { class: 'btn small', href: `editor.html?issue=${current.id}&panel=check` }, t('handoff.fixInEditor')),
  });
  const dialog = modal({
    title: t('handoff.title'),
    body: h('div', { class: 'ho' }, blocked, h('p', { class: 'ho-lead' }, t('handoff.lead')), planLine, ...order.map((k) => cards[k]), driveSlot, markSent),
    className: 'md-handoff',
  });
  return dialog;
}
