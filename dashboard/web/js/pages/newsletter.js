// One newsletter, laid out like Mailchimp's campaign page: a list of what it
// needs, each with a tick once done. The picked articles, the subject line
// and preview text, the content from the editor (with what still needs a
// look), and Mailchimp, where it goes to be sent. A preview sits beside it.
// Jira: DM42-37

import { api } from '../api.js';
import { t, tn } from '../texts.js';
import { esc, safeUrl, when, date, number } from '../format.js';
import { readDesign } from '../newsletter/model.js';
import { checkDesign } from '../newsletter/checks.js';
import { byteSize } from '../newsletter/render.js';
import { openHandoff } from '../newsletter/handoff.js';
import { icon } from '../ui/icons.js';
import { toast, confirmDialog, promptDialog } from '../ui/dialogs.js';
import { mailchimpLine } from './newsletters.js';
import { suggestionsBox } from '../newsletter/writing.js';

const SECTION_ORDER = ['own_news', 'events', 'member_news', 'highlights'];

export function showNewsletter(root) {
  const params = new URLSearchParams(location.hash.split('?')[1] || '');
  const wanted = Number(params.get('id')) || null;
  let issue = null;
  let design = null;
  let checks = null;
  let mailchimp = null;
  // Asked at once and waited for when needed: the answer can take a few
  // seconds when it has to come from Mailchimp itself.
  let mailchimpReady = null;
  let gone = false;
  const open = { articles: false, subject: false };
  let suggestAttempt = 0;   // how many times the AI has suggested subject lines here

  // ---------- each line of the list ----------

  function line(key, done, title, summary, action, body = '', state = done ? 'done' : 'todo') {
    const mark = state === 'done' ? icon('check', 22) : state === 'error' ? icon('error', 22) : '<span class="nl-dot"></span>';
    return `
      <section class="nl-line ${state}" id="line-${key}">
        <div class="nl-line-mark" aria-hidden="true">${mark}</div>
        <div class="nl-line-main">
          <div class="nl-line-head">
            <h3>${esc(title)}</h3>
            <div class="nl-line-action">${action}</div>
          </div>
          <div class="nl-line-summary">${summary}</div>
          ${body}
        </div>
      </section>`;
  }

  function articlesLine() {
    const by = (key) => issue.articles.filter((a) => a.section === key);
    const counts = SECTION_ORDER.map((k) => (by(k).length ? `${t(`section.${k}`)} ${by(k).length}` : '')).filter(Boolean).join(' · ');
    const summary = issue.articles.length
      ? `<p>${esc(tn('issue.articleCount', issue.articles.length))}${counts ? ` <span class="nl-meta">(${esc(counts)})</span>` : ''}</p>`
      : `<p class="nl-meta">${esc(t('issue.noArticles'))}</p>`;
    const list = !open.articles ? '' : `<div class="nl-line-body">${SECTION_ORDER.map((key) => {
      const items = by(key);
      if (!items.length) return '';
      return `<h4>${esc(t(`section.${key}`))}</h4><ul class="nl-articles">${items.map((a) => {
        const url = safeUrl(a.url);
        return `<li>
          <span class="nl-article-title">${url ? `<a href="${esc(url)}" target="_blank" rel="noopener noreferrer">${esc(a.title)}</a>` : esc(a.title)}</span>
          <span class="nl-meta">${esc(a.publisher || '')}${a.decided_by ? ` · ${esc(t('issue.pickedBy', { name: a.decided_by, when: when(a.decided_at) }))}` : ''}</span>
          ${issue.status === 'draft' ? `<button type="button" class="linkish" data-act="unpick" data-id="${a.id}">${esc(t('issue.remove'))}</button>` : ''}
        </li>`;
      }).join('')}</ul>`;
    }).join('')}</div>`;
    const action = `${issue.articles.length ? `<button type="button" class="btn ghost small" data-act="toggle" data-what="articles">${esc(open.articles ? t('issue.hide') : t('issue.show'))}</button>` : ''}
      ${issue.status === 'draft' ? `<a class="btn ghost small" href="#/">${esc(t('issue.pickMore'))}</a>` : ''}`;
    return line('articles', issue.articles.length > 0, t('issue.lineArticles'), summary, action, list);
  }

  function subjectLine() {
    const done = !!issue.subject.trim();
    if (open.subject && issue.status === 'draft') {
      const form = `
        <form class="nl-line-body nl-subject-form" data-form="subject">
          <label for="nl-subject">${esc(t('issue.subject'))}</label>
          <input id="nl-subject" class="cf-input" name="subject" maxlength="150" value="${esc(issue.subject)}">
          <p class="cf-hint"><span data-count="subject">${issue.subject.length}</span>/150 · ${esc(t('issue.subjectHint'))}</p>
          <label for="nl-preheader">${esc(t('issue.preheader'))}</label>
          <input id="nl-preheader" class="cf-input" name="preheader" maxlength="150" value="${esc(issue.preheader)}">
          <p class="cf-hint"><span data-count="preheader">${issue.preheader.length}</span>/150 · ${esc(t('issue.preheaderHint'))}</p>
          <div class="ai-suggest-row">
            <button type="button" class="btn ghost small" data-act="suggest">${esc(t(suggestAttempt ? 'ai.suggestMore' : 'ai.suggest'))}</button>
            <span class="cf-hint">${esc(t('ai.suggestHint'))}</span>
          </div>
          <div class="ai-suggest-box" id="nl-suggest"></div>
          <div class="nl-form-actions">
            <button type="button" class="btn ghost small" data-act="toggle" data-what="subject">${esc(t('dialog.cancel'))}</button>
            <button type="submit" class="btn small">${esc(t('dialog.save'))}</button>
          </div>
        </form>`;
      return line('subject', done, t('issue.lineSubject'), '', '', form);
    }
    const summary = done
      ? `<p class="nl-subject-text">${esc(issue.subject)}</p>${issue.preheader ? `<p class="nl-meta">${esc(t('issue.preheaderShown', { text: issue.preheader }))}</p>` : `<p class="nl-meta">${esc(t('issue.noPreheader'))}</p>`}`
      : `<p class="nl-meta">${esc(t('issue.subjectQuestion'))}</p>`;
    const action = issue.status === 'draft'
      ? `<button type="button" class="btn ${done ? 'ghost ' : ''}small" data-act="toggle" data-what="subject">${esc(done ? t('issue.edit') : t('issue.addSubject'))}</button>` : '';
    return line('subject', done, t('issue.lineSubject'), summary, action);
  }

  function contentLine() {
    if (!design) {
      const action = issue.status === 'draft' ? `<a class="btn small" href="editor.html?issue=${issue.id}">${esc(t('issue.design'))}</a>` : '';
      return line('content', false, t('issue.lineContent'), `<p class="nl-meta">${esc(t('issue.notDesigned'))}</p>`, action);
    }
    const errors = checks.errors.filter((e) => e.code !== 'subject');
    const warnings = checks.warnings;
    const describe = (e) => (e.items.length ? tn(`check.${e.code}`, e.count, e.params) : t(`check.${e.code}.one`, e.params));
    const list = [
      ...errors.map((e) => `<li class="error">${icon('error', 16)} ${esc(describe(e))}</li>`),
      ...warnings.map((w) => `<li class="warning">${icon('warning', 16)} ${esc(describe(w))}</li>`),
    ];
    const summary = `
      <p class="nl-meta">${esc(t('issue.savedBy', { when: when(issue.design_saved_at), name: issue.design_saved_by || '?' }))}</p>
      ${list.length ? `<ul class="nl-checks">${list.join('')}</ul>` : `<p class="nl-ok">${icon('check', 16)} ${esc(t('check.allGood'))}</p>`}`;
    const action = issue.status === 'draft' ? `<a class="btn ${errors.length ? '' : 'ghost '}small" href="editor.html?issue=${issue.id}">${esc(t('issue.editContent'))}</a>` : '';
    return line('content', errors.length === 0, t('issue.lineContent'), summary, action, '', errors.length ? 'error' : 'done');
  }

  function mailchimpSection() {
    const sent = issue.status === 'sent';
    const exported = !!issue.mailchimp_exported_at;
    const done = sent || (exported && !issue.mailchimp_changed);
    let summary = `<p>${esc(mailchimpLine(issue))}</p>`;
    if (sent && issue.mailchimp_emails_sent) summary += `<p class="nl-meta">${esc(t('issue.recipients', { n: number(issue.mailchimp_emails_sent) }))}</p>`;
    if (exported && issue.mailchimp_changed && !sent) summary += `<p class="st-warn">${esc(t('handoff.changedSince'))}</p>`;
    if (!exported && !sent) summary += `<p class="nl-meta">${esc(t('issue.mailchimpHow'))}</p>`;
    const links = issue.mailchimp_url ? `<a class="btn ghost small" href="${esc(issue.mailchimp_url)}" target="_blank" rel="noopener noreferrer">${esc(t('handoff.openInMailchimp'))} ${icon('external', 14)}</a>` : '';
    const action = sent ? links : `${links}<button type="button" class="btn small" data-act="handoff" ${design ? '' : 'disabled'}>${esc(t('issue.export'))}</button>`;
    return line('mailchimp', done, t('issue.lineMailchimp'), summary, action);
  }

  // ---------- the page ----------

  function render() {
    const sent = issue.status === 'sent';
    const done = [
      issue.articles.length > 0,
      !!issue.subject.trim(),
      !!design && checks.errors.filter((e) => e.code !== 'subject').length === 0,
      sent || (!!issue.mailchimp_exported_at && !issue.mailchimp_changed),
    ].filter(Boolean).length;
    root.innerHTML = `
      <a class="nl-back" href="#/newsletters">${icon('arrowLeft', 16)} ${esc(t('issue.toList'))}</a>
      <div class="nl-head">
        <div class="nl-title">
          <h2>${esc(issue.name)}</h2>
          ${sent ? '' : `<button type="button" class="st-icon-btn" data-act="rename" title="${esc(t('issue.rename'))}" aria-label="${esc(t('issue.rename'))}">${icon('pencil', 18)}</button>`}
          <span class="nl-status ${issue.status}">${esc(t(`list.status.${issue.status}`))}</span>
          ${issue.current && !sent ? `<span class="nl-current">${esc(t('list.current'))}</span>` : ''}
        </div>
        <div class="nl-head-actions">
          <a class="btn ghost" href="#/newsletters">${esc(sent ? t('issue.back') : t('issue.finishLater'))}</a>
          ${sent ? '' : `<button type="button" class="btn" data-act="handoff" ${design ? '' : 'disabled'}>${esc(t('issue.export'))}</button>`}
        </div>
      </div>
      <div class="nl-layout">
        <div class="card nl-checklist">
          ${sent ? `<p class="nl-sentnote">${icon('check', 18)} ${esc(t('issue.sentNote', { date: date(issue.sent_at) }))}</p>` : `
          <div class="nl-progress">
            <span>${esc(t('issue.progress', { done, total: 4 }))}</span>
            <div class="nl-progress-bar">${[0, 1, 2, 3].map((i) => `<span class="${i < done ? 'on' : ''}"></span>`).join('')}</div>
          </div>`}
          ${articlesLine()}
          ${subjectLine()}
          ${contentLine()}
          ${mailchimpSection()}
        </div>
        <aside class="card nl-side">
          <div class="nl-side-head">
            <h3>${esc(t('issue.preview'))}</h3>
            ${issue.html ? `<a class="linkish" href="/api/issues/${issue.id}/preview" target="_blank" rel="noopener">${esc(t('issue.openPreview'))}</a>` : ''}
          </div>
          ${issue.html
            ? `<div class="nl-side-frame"><iframe class="nl-frame" title="${esc(t('issue.preview'))}" sandbox="" src="/api/issues/${issue.id}/preview?at=${encodeURIComponent(issue.design_saved_at || '')}"></iframe></div>`
            : `<p class="nl-meta">${esc(t('issue.noPreview'))}</p>`}
          ${issue.status === 'draft' ? `<a class="btn ghost small nl-side-edit" href="editor.html?issue=${issue.id}">${esc(design ? t('issue.editContent') : t('issue.design'))}</a>` : ''}
        </aside>
      </div>`;
  }

  async function load() {
    mailchimpReady = api.get('/api/mailchimp').catch(() => null);
    try {
      issue = wanted ? await api.get(`/api/issues/${wanted}`) : await api.get('/api/issues/current');
      if (!wanted) history.replaceState(null, '', `#/newsletter?id=${issue.id}`);
      const stored = issue.has_design ? await api.get(`/api/issues/${issue.id}/design`) : { design: null };
      design = readDesign(stored.design);
      checks = design ? checkDesign(design, { issue, articles: issue.articles, size: issue.html ? byteSize(issue.html) : 0 }) : null;
      if (!gone) render();
    } catch (e) {
      if (e.status !== 401 && !gone) root.innerHTML = `<p class="problem">${esc(e.message)}</p><p><a href="#/newsletters">${esc(t('issue.toList'))}</a></p>`;
      return;
    }
    mailchimp = await mailchimpReady;
    // A draft exported to Mailchimp may have been sent there since.
    if (mailchimp && mailchimp.connected && issue.mailchimp_campaign_id && issue.status === 'draft') {
      try {
        const fresh = await api.get(`/api/issues/${issue.id}/mailchimp`);
        if (fresh.status !== issue.status || fresh.mailchimp_status !== issue.mailchimp_status) {
          issue = fresh;
          if (!gone) render();
        }
      } catch {
        // Mailchimp unreachable: the page shows what it knew.
      }
    }
  }

  function refreshChecks() {
    checks = design ? checkDesign(design, { issue, articles: issue.articles, size: issue.html ? byteSize(issue.html) : 0 }) : null;
  }

  root.addEventListener('click', async (event) => {
    const target = event.target.closest('[data-act]');
    if (!target) return;
    const act = target.dataset.act;
    try {
      if (act === 'toggle') {
        open[target.dataset.what] = !open[target.dataset.what];
        render();
        if (target.dataset.what === 'subject' && open.subject) root.querySelector('#nl-subject')?.focus();
      } else if (act === 'suggest') {
        // The AI's subject lines and preview texts, pressed into the fields.
        // Nothing is saved until the editor saves the form.
        target.disabled = true;
        target.textContent = t('ai.suggesting');
        const fill = (selector) => (text) => {
          const input = root.querySelector(selector);
          if (!input) return;
          input.value = text;
          input.dispatchEvent(new Event('input', { bubbles: true }));
          input.focus();
        };
        try {
          suggestAttempt += 1;
          const result = await api.post(`/api/issues/${issue.id}/ai/subject`, { attempt: suggestAttempt });
          root.querySelector('#nl-suggest')?.replaceChildren(
            suggestionsBox(result, { onSubject: fill('#nl-subject'), onPreheader: fill('#nl-preheader') }));
        } finally {
          target.disabled = false;
          target.textContent = t('ai.suggestMore');
        }
      } else if (act === 'unpick') {
        if (!(await confirmDialog(t('issue.unpickConfirm')))) return;
        await api.put(`/api/items/${target.dataset.id}/decision`, { decision: null });
        issue = await api.get(`/api/issues/${issue.id}`);
        refreshChecks();
        render();
      } else if (act === 'rename') {
        const name = await promptDialog(t('issue.rename'), issue.name, { label: t('list.nameLabel') });
        if (!name) return;
        issue = await api.patch(`/api/issues/${issue.id}`, { name });
        refreshChecks();
        render();
      } else if (act === 'handoff') {
        if (!design) return;
        target.disabled = true;
        mailchimp = await mailchimpReady;
        target.disabled = false;
        openHandoff({
          issue, design, mailchimp,
          onChanged: (fresh) => {
            issue = { ...issue, ...fresh };
            refreshChecks();
            render();
          },
        });
      }
    } catch (e) {
      toast(e.message, 'warn');
    }
  });

  root.addEventListener('input', (event) => {
    const name = event.target.name;
    if (name === 'subject' || name === 'preheader') {
      const counter = root.querySelector(`[data-count="${name}"]`);
      if (counter) counter.textContent = String(event.target.value.length);
    }
  });

  root.addEventListener('submit', async (event) => {
    const form = event.target.closest('[data-form="subject"]');
    if (!form) return;
    event.preventDefault();
    try {
      issue = await api.patch(`/api/issues/${issue.id}`, { subject: form.subject.value, preheader: form.preheader.value });
      open.subject = false;
      refreshChecks();
      render();
      toast(t('issue.fieldSaved'));
    } catch (e) {
      toast(e.message, 'warn');
    }
  });

  load();
  return { leave() { gone = true; } };
}
