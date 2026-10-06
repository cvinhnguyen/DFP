// One newsletter, laid out like Mailchimp's campaign page: a list of what it
// needs, each with a tick once done. The picked articles, with how full each
// section is and what waits for it in Uudet, the subject line and preview
// text, the content from the editor (with what still needs a look), and
// Mailchimp, where it goes to be sent. A preview sits beside it. Above them
// the day it is planned to go out, and under them what has been done to it.
// Jira: DM42-37, DM42-32

import { api } from '../api.js';
import { pageTitle, t, tn } from '../texts.js';
import { esc, safeUrl, when, date, number, ago, daysUntil, finnishDay, inDays, weekdayDay } from '../format.js';
import { articleIds, readDesign } from '../newsletter/model.js';
import { checkDesign } from '../newsletter/checks.js';
import { byteSize } from '../newsletter/render.js';
import { openHandoff, describeCheck } from '../newsletter/handoff.js';
import { icon } from '../ui/icons.js';
import { toast, confirmDialog, promptDialog } from '../ui/dialogs.js';
import { openMenu } from '../ui/menu.js';
import { mailchimpLine } from './newsletters.js';
import { suggestionsBox } from '../newsletter/writing.js';
import { saveTarget } from './articles.js';
import { onLive, touches } from '../live.js';

const SECTION_ORDER = ['own_news', 'events', 'member_news', 'highlights', 'training'];

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
  // The first step not done yet is the one to do next: its button is the
  // only filled one on the page, and its mark stands out.
  let next = null;
  const button = (key) => (key === next ? 'btn small' : 'btn ghost small');
  let suggestAttempt = 0;   // how many times the AI has suggested subject lines here
  let activity = [];        // what has been done to it, newest first
  let waiting = null;       // how many articles in Uudet each section is suggested for
  let planning = false;     // the day is being chosen
  let historyAll = false;   // the whole history, not only the latest

  // ---------- each line of the list ----------

  function line(key, done, title, summary, action, body = '', state = done ? 'done' : 'todo') {
    const mark = state === 'done' ? icon('check', 22) : state === 'error' ? icon('error', 22) : '<span class="nl-dot"></span>';
    return `
      <section class="nl-line ${state}${key === next ? ' next' : ''}" id="line-${key}">
        <div class="nl-line-mark" aria-hidden="true">${mark}</div>
        <div class="nl-line-main">
          <div class="nl-line-head">
            <h2>${esc(title)}</h2>
            <div class="nl-line-action">${action}</div>
          </div>
          <div class="nl-line-summary">${summary}</div>
          ${body}
        </div>
      </section>`;
  }

  // How full each section is, and how many articles in Uudet are suggested
  // for it: "3 waiting" opens them on Artikkelit, picking into this one.
  // Nostoja kentältä is where everything else is suggested, so a count for
  // it would only be the size of Uudet.
  function fillHtml() {
    const counts = issue.sections || {};
    return `<ul class="nl-fill" aria-label="${esc(t('fill.label'))}">${SECTION_ORDER.map((key) => {
      const n = counts[key] || 0;
      const wait = issue.status === 'draft' && waiting && key !== 'highlights' ? waiting[key] || 0 : 0;
      const link = wait ? `<a class="nl-fill-wait" href="#/?place=suggested:${key}" data-act="waiting"
          aria-label="${esc(`${tn('fill.waiting', wait, { n: number(wait) })}. ${t('fill.waitingLabel', { section: t(`section.${key}`) })}`)}">${esc(tn('fill.waiting', wait, { n: number(wait) }))}</a>` : '';
      return `<li class="nl-fill-sec${n ? ' has' : ''}"><span class="nl-fill-dot" aria-hidden="true"></span>
        <span class="nl-fill-name">${esc(t(`section.${key}`))}</span>
        <span class="nl-fill-n">${n ? number(n) : esc(t('fill.empty'))}</span>${link}</li>`;
    }).join('')}</ul>`;
  }

  function articlesLine() {
    const by = (key) => issue.articles.filter((a) => a.section === key);
    const summary = `${issue.articles.length
      ? `<p>${esc(tn('issue.articleCount', issue.articles.length))}</p>`
      : `<p class="nl-meta">${esc(t('issue.noArticles'))}</p>`}${fillHtml()}`;
    // An article already in the email moves there, in the editor: saving
    // the email puts its pick where the email has it.
    const inEmail = design ? articleIds(design) : new Set();
    const list = !open.articles ? '' : `<div class="nl-line-body">${SECTION_ORDER.map((key) => {
      const items = by(key);
      if (!items.length) return '';
      return `<h3>${esc(t(`section.${key}`))} <span class="nl-h-n">${number(items.length)}</span></h3><ul class="nl-articles">${items.map((a) => {
        const url = safeUrl(a.url);
        const title = a.title_fi || a.title;
        const placed = inEmail.has(Number(a.id));
        return `<li>
          <span class="nl-article-title">${url ? `<a href="${esc(url)}" target="_blank" rel="noopener noreferrer">${esc(title)}</a>` : esc(title)}</span>
          <span class="nl-meta">${esc(a.publisher || '')}${a.decided_by ? ` · ${esc(t('issue.pickedBy', { name: a.decided_by, when: when(a.decided_at) }))}` : ''}${design
            ? ` · ${esc(t(placed ? 'issue.inEmail' : 'issue.notInEmail'))}` : ''}</span>
          ${issue.status === 'draft' ? `<span class="nl-article-acts">
            ${placed ? '' : `<button type="button" class="linkish" id="nl-move-${a.id}" data-act="move" data-id="${a.id}"
              aria-label="${esc(t('issue.moveLabel', { title }))}">${esc(t('issue.move'))}</button>`}
            <button type="button" class="linkish" data-act="unpick" data-id="${a.id}">${esc(t('issue.remove'))}</button></span>` : ''}
        </li>`;
      }).join('')}</ul>`;
    }).join('')}</div>`;
    const action = `${issue.articles.length ? `<button type="button" class="btn ghost small" data-act="toggle" data-what="articles">${esc(open.articles ? t('issue.hide') : t('issue.show'))}</button>` : ''}
      ${issue.status === 'draft' ? `<a class="${button('articles')}" href="#/" data-act="pick-more">${esc(t('issue.pickMore'))}</a>` : ''}`;
    return line('articles', issue.articles.length > 0, t('issue.lineArticles'), summary, action, list);
  }

  // ---------- the day it goes out ----------

  function planLine() {
    if (issue.status !== 'draft') return '';
    if (planning) {
      return `<form class="nl-plan-form" data-form="plan">
        <label for="nl-plan-day">${esc(t('plan.label'))}</label>
        <input type="date" id="nl-plan-day" class="cf-input" name="day" required value="${esc(issue.planned_for || '')}" min="${finnishDay()}">
        <button type="submit" class="btn small">${esc(t('dialog.save'))}</button>
        <button type="button" class="btn ghost small" data-act="plan-cancel">${esc(t('dialog.cancel'))}</button>
        ${issue.planned_for ? `<button type="button" class="linkish" data-act="plan-clear">${esc(t('plan.clear'))}</button>` : ''}
        <p class="cf-hint">${esc(t('plan.hint'))}</p>
      </form>`;
    }
    if (!issue.planned_for) {
      return `<p class="nl-plan none">${icon('calendar', 16)}<span>${esc(t('plan.none'))}</span>
        <button type="button" class="linkish" data-act="plan-edit">${esc(t('plan.set'))}</button></p>`;
    }
    const passed = daysUntil(issue.planned_for) < 0;
    return `<p class="nl-plan${passed ? ' passed' : ''}">${icon('flag', 16)}<span><strong>${esc(t('plan.on', { day: weekdayDay(issue.planned_for) }))}</strong>
      · ${esc(passed ? t('plan.passed') : inDays(issue.planned_for))}</span>
      <button type="button" class="linkish" data-act="plan-edit">${esc(t('plan.change'))}</button></p>`;
  }

  // ---------- what has been done to it ----------

  const HISTORY_SHOWN = 8;

  function historyText(a) {
    const who = a.who || t('hist.someone');
    const section = a.section ? t(`section.${a.section}`) : '';
    const from = a.from_section ? t(`section.${a.from_section}`) : '';
    const whole = a.title || '';
    const title = whole.length > 64 ? `${whole.slice(0, 62).trimEnd()}…` : whole;
    switch (a.kind) {
      case 'picked': return t('hist.picked', { who, title, section });
      case 'moved': return t(a.in_editor ? 'hist.movedEditor' : 'hist.moved', { who, title, section, from });
      case 'removed': return t('hist.removed', { who, title, section });
      case 'planned': return a.detail ? t('hist.planned', { who, date: weekdayDay(a.detail) }) : t('hist.plannedNone', { who });
      case 'subject': return a.detail ? t('hist.subject', { who, detail: a.detail }) : t('hist.subjectNone', { who });
      case 'renamed': return t('hist.renamed', { who, detail: a.detail || '' });
      case 'created': return t('hist.created', { who });
      case 'saved': return `${t('hist.saved', { who })} (${t('hist.latest')})`;
      case 'exported': return `${t('hist.exported', { who })} (${t('hist.latest')})`;
      case 'sent': return a.detail ? t('hist.sent', { n: number(Number(a.detail)) }) : t('hist.sentNoCount');
      case 'drive': return t('hist.drive', { who, detail: a.detail || '' });
      case 'comment': return a.detail ? t('hist.comment', { who, detail: a.detail }) : t('hist.commentPlain', { who });
      default: return a.kind;
    }
  }

  function initials(name) {
    const words = String(name || '').trim().split(/\s+/).filter(Boolean);
    if (!words.length) return '?';
    return (words.length > 1 ? words[0][0] + words[words.length - 1][0] : words[0].slice(0, 2)).toUpperCase();
  }

  function historyCard() {
    if (!activity.length) return '';
    const shown = historyAll ? activity : activity.slice(0, HISTORY_SHOWN);
    return `<section class="card nl-history" aria-labelledby="nl-history-h">
      <h2 id="nl-history-h">${icon('clock', 18)}<span>${esc(t('hist.title'))}</span></h2>
      <ol class="nl-hist">${shown.map((a) => `<li class="nl-hist-row">
        <span class="nl-hist-who" aria-hidden="true">${a.kind === 'sent' ? icon('mail', 14) : esc(initials(a.who))}</span>
        <span class="nl-hist-text">${esc(historyText(a))}</span>
        <time datetime="${esc(a.at)}" title="${esc(when(a.at))}">${esc(ago(a.at))}</time></li>`).join('')}</ol>
      ${activity.length > HISTORY_SHOWN ? `<button type="button" class="linkish" data-act="history-all" aria-expanded="${historyAll}">${esc(historyAll
        ? t('hist.less') : t('hist.more', { n: number(activity.length) }))}</button>` : ''}
    </section>`;
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
      ? `<button type="button" class="${button('subject')}" data-act="toggle" data-what="subject">${esc(done ? t('issue.edit') : t('issue.addSubject'))}</button>` : '';
    return line('subject', done, t('issue.lineSubject'), summary, action);
  }

  function contentLine() {
    if (!design) {
      const action = issue.status === 'draft' ? `<a class="${button('content')}" href="editor.html?issue=${issue.id}">${esc(t('issue.design'))}</a>` : '';
      return line('content', false, t('issue.lineContent'), `<p class="nl-meta">${esc(t('issue.notDesigned'))}</p>`, action);
    }
    const errors = checks.errors.filter((e) => e.code !== 'subject');
    const warnings = checks.warnings;
    const list = [
      ...errors.map((e) => `<li class="error">${icon('error', 16)} ${esc(describeCheck(e))}</li>`),
      ...warnings.map((w) => `<li class="warning">${icon('warning', 16)} ${esc(describeCheck(w))}</li>`),
    ];
    const summary = `
      <p class="nl-meta">${esc(t('issue.savedBy', { when: when(issue.design_saved_at), name: issue.design_saved_by || '?' }))}</p>
      ${list.length ? `<ul class="nl-checks">${list.join('')}</ul>` : `<p class="nl-ok">${icon('check', 16)} ${esc(t('check.allGood'))}</p>`}`;
    const action = issue.status === 'draft' ? `<a class="${button('content')}" href="editor.html?issue=${issue.id}">${esc(t('issue.editContent'))}</a>` : '';
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
    const action = sent ? links : `${links}<button type="button" class="${button('mailchimp')}" data-act="handoff" ${design ? '' : 'disabled'}>${esc(t('issue.export'))}</button>`;
    return line('mailchimp', done, t('issue.lineMailchimp'), summary, action);
  }

  // ---------- the page ----------

  function render() {
    const sent = issue.status === 'sent';
    const steps = {
      articles: issue.articles.length > 0,
      subject: !!issue.subject.trim(),
      content: !!design && checks.errors.filter((e) => e.code !== 'subject').length === 0,
      mailchimp: sent || (!!issue.mailchimp_exported_at && !issue.mailchimp_changed),
    };
    next = sent ? null : Object.keys(steps).find((k) => !steps[k]) || null;
    const done = Object.values(steps).filter(Boolean).length;
    pageTitle(issue.name);
    root.innerHTML = `
      <a class="nl-back" href="#/newsletters">${icon('arrowLeft', 16)} ${esc(t('issue.toList'))}</a>
      <div class="nl-head">
        <div class="nl-title">
          <h1>${esc(issue.name)}</h1>
          ${sent ? '' : `<button type="button" class="st-icon-btn" data-act="rename" title="${esc(t('issue.rename'))}" aria-label="${esc(t('issue.rename'))}">${icon('pencil', 18)}</button>`}
          <span class="nl-status ${issue.status}">${esc(t(`list.status.${issue.status}`))}</span>
          ${issue.current && !sent ? `<span class="nl-current">${esc(t('list.current'))}</span>` : ''}
        </div>
        ${planLine()}
      </div>
      <div class="nl-layout">
        <div class="nl-main">
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
        ${historyCard()}
        </div>
        <aside class="card nl-side">
          <div class="nl-side-head">
            <h2>${esc(t('issue.preview'))}</h2>
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
      const [stored, done, suggested] = await Promise.all([
        issue.has_design ? api.get(`/api/issues/${issue.id}/design`) : Promise.resolve({ design: null }),
        api.get(`/api/issues/${issue.id}/activity`).catch(() => []),
        issue.status === 'draft' ? api.get('/api/suggestions/waiting').catch(() => null) : Promise.resolve(null),
      ]);
      design = readDesign(stored.design);
      activity = done;
      waiting = suggested;
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
      if (act === 'pick-more' || act === 'waiting') {
        // The articles page picks into this newsletter from now on; the link
        // itself goes there.
        saveTarget(issue.id);
      } else if (act === 'plan-edit') {
        planning = true;
        render();
        root.querySelector('#nl-plan-day')?.focus();
      } else if (act === 'plan-cancel') {
        planning = false;
        render();
        root.querySelector('[data-act="plan-edit"]')?.focus();
      } else if (act === 'plan-clear') {
        issue = await api.patch(`/api/issues/${issue.id}`, { planned_for: null });
        planning = false;
        refreshChecks();
        render();
        toast(t('plan.cleared'));
      } else if (act === 'history-all') {
        historyAll = !historyAll;
        render();
        root.querySelector('[data-act="history-all"]')?.focus();
      } else if (act === 'move') {
        const article = issue.articles.find((a) => String(a.id) === target.dataset.id);
        if (!article) return;
        openMenu(target, [{ kind: 'group', label: t('fill.label'), options: SECTION_ORDER.map((key) => ({
          label: t(`section.${key}`), checked: key === article.section,
          onSelect: () => movePick(article, key),
        })) }], { align: 'left' });
      } else if (act === 'toggle') {
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
          errors: checks ? checks.errors : [],
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

  // Moves a pick to another section of this newsletter, before it is in
  // the email.
  async function movePick(article, section) {
    if (section === article.section) return;
    try {
      await api.put(`/api/items/${article.id}/decision`, { decision: 'picked', section, issue_id: issue.id });
      issue = await api.get(`/api/issues/${issue.id}`);
      refreshChecks();
      render();
      toast(t('issue.moved', { section: t(`section.${section}`) }));
      root.querySelector(`#nl-move-${article.id}`)?.focus();
    } catch (e) {
      toast(e.message, 'warn');
    }
  }

  root.addEventListener('submit', async (event) => {
    const plan = event.target.closest('[data-form="plan"]');
    if (plan) {
      event.preventDefault();
      try {
        issue = await api.patch(`/api/issues/${issue.id}`, { planned_for: plan.day.value || null });
        planning = false;
        refreshChecks();
        render();
        toast(t('plan.saved'));
        root.querySelector('[data-act="plan-edit"]')?.focus();
      } catch (e) {
        toast(e.message, 'warn');
      }
      return;
    }
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

  // Another editor's save, a pick, a comment, or an article's Drive document
  // gone or changed: the page catches up as it happens (live.js). Not while
  // someone types on it or a window is open over it; then once they stop.
  let liveTimer = null;
  const busyHere = () => (root.contains(document.activeElement) && document.activeElement.matches('input, textarea, select'))
    || document.querySelector('.md-overlay');
  function changed() {
    clearTimeout(liveTimer);
    liveTimer = setTimeout(() => {
      if (gone) return;
      if (busyHere()) changed();
      else load();
    }, 2000);
  }
  const unlisten = [
    onLive('issues', (c) => { if (issue && touches(c, [issue.id])) changed(); }),
    onLive('picks', changed),
    onLive('items', (c) => { if (issue && touches(c, issue.articles.map((a) => a.id))) changed(); }),
    onLive('comments', (c) => { if (issue && touches(c, [issue.id])) changed(); }),
    onLive('resync', changed),
  ];

  load();
  return {
    leave() {
      gone = true;
      clearTimeout(liveTimer);
      unlisten.forEach((stop) => stop());
    },
  };
}
