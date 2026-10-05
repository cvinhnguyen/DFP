// The status line above the list: when the sources were last checked, what
// is new today, problems with sources or the AI, the AI budget when it runs
// low, and the "check now" button.
// It only turns the overview into HTML; the page handles the button.

import { currentLanguage, t, tn } from '../texts.js';
import { date, esc, euros, when } from '../format.js';

// overview: GET /api/overview. checking: a check started from this page is
// still running. done: a line to show once it has finished. view: the view
// on screen, so "needs attention" does not offer to show what is shown.
export function statusLines(overview, { checking = false, done = '', view = '' } = {}) {
  const o = overview;
  const lines = [];
  if (checking || o.checking_now) {
    lines.push(`<p class="line busy"><span class="spinner" aria-hidden="true"></span><span>${esc(t('status.checking'))}</span></p>`);
  } else {
    // On a phone only the first part shows: when, and what is new today.
    const first = [
      o.last_check_at ? t('status.lastCheck', { when: when(o.last_check_at) }) : t('status.neverChecked'),
      o.new_today ? tn('status.newToday', o.new_today) : t('status.nothingToday'),
    ].join(' ');
    const more = [
      o.new_theses_today ? tn('status.thesesToday', o.new_theses_today) : '',
      o.next_check_at ? t('status.next', { when: when(o.next_check_at) }) : t('status.off'),
    ].filter(Boolean).join(' ');
    lines.push(`<p class="line"><span>${esc(first)} <span class="line-more">${esc(more)}</span></span>
      <button type="button" class="btn small" data-act="check">${esc(t('status.checkNow'))}</button></p>`);
  }
  if (done) lines.push(`<p class="line good">${esc(done)}</p>`);
  if (o.failed_sources.length) {
    // Each name in quotes, as a name can have a comma of its own:
    // "Työterveyslaitos, ajankohtaista". A phone shows only how many.
    const n = o.failed_sources.length;
    const names = new Intl.ListFormat(currentLanguage(), { type: 'conjunction' })
      .format(o.failed_sources.map((f) => t('status.sourceName', { name: f.source })));
    lines.push(`
      <div class="line warn">
        <p><span class="line-long">${esc(tn('status.failed', n, { names }))}</span><span class="line-short">${esc(tn('status.failedShort', n))}</span></p>
        <details><summary>${esc(t('status.failedDetails'))}</summary>
          <ul>${o.failed_sources.map((f) => `<li><strong>${esc(f.source)}</strong>, ${esc(when(f.at))}: ${esc(f.error)}</li>`).join('')}</ul>
        </details>
      </div>`);
  }
  const b = o.budget;
  if (b && b.state === 'over') {
    lines.push(`<p class="line warn">${esc(t('status.budgetOver', { budget: euros(b.budget_eur), date: date(b.next_month) }))}${b.waiting
      ? ` ${esc(tn('status.budgetWaiting', b.waiting))}` : ''}</p>`);
  } else if (b && b.state === 'warn') {
    lines.push(`<p class="line warn">${esc(t('status.budgetWarn', { pct: Math.floor(b.share * 100), spent: euros(b.spent_eur), budget: euros(b.budget_eur) }))}</p>`);
  }
  if (o.ai_answering === false) lines.push(`<p class="line warn">${esc(t('status.aiDown'))}</p>`);
  else if (o.waiting_for_ai) lines.push(`<p class="line warn">${esc(tn('status.aiRetry', o.waiting_for_ai))}</p>`);
  else if (o.waiting) lines.push(`<p class="line">${esc(tn('status.waiting', o.waiting))}</p>`);
  if (o.needs_attention && view !== 'attention') {
    lines.push(`<p class="line warn"><span>${esc(tn('status.attention', o.needs_attention))}</span>
      <button type="button" class="linkish" data-act="view" data-view="attention">${esc(t('status.show'))}</button></p>`);
  }
  return lines.join('');
}
