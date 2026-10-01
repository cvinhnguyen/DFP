// The status line above the list: when the sources were last checked, what
// is new today, problems with sources or the AI, and the "check now" button.
// It only turns the overview into HTML; the page handles the button.

import { t, tn } from '../texts.js';
import { esc, when } from '../format.js';

// overview: GET /api/overview. checking: a check started from this page is
// still running. done: a line to show once it has finished. view: the view
// on screen, so "needs attention" does not offer to show what is shown.
export function statusLines(overview, { checking = false, done = '', view = '' } = {}) {
  const o = overview;
  const lines = [];
  if (checking || o.checking_now) {
    lines.push(`<p class="line busy"><span class="spinner" aria-hidden="true"></span><span>${esc(t('status.checking'))}</span></p>`);
  } else {
    const text = [
      o.last_check_at ? t('status.lastCheck', { when: when(o.last_check_at) }) : t('status.neverChecked'),
      o.new_today ? tn('status.newToday', o.new_today) : t('status.nothingToday'),
      o.new_theses_today ? tn('status.thesesToday', o.new_theses_today) : '',
      o.next_check_at ? t('status.next', { when: when(o.next_check_at) }) : t('status.off'),
    ].filter(Boolean).join(' ');
    lines.push(`<p class="line"><span>${esc(text)}</span>
      <button type="button" class="btn small" data-act="check">${esc(t('status.checkNow'))}</button></p>`);
  }
  if (done) lines.push(`<p class="line good">${esc(done)}</p>`);
  if (o.failed_sources.length) {
    const names = o.failed_sources.map((f) => f.source).join(', ');
    lines.push(`
      <div class="line warn">
        <p>${esc(tn('status.failed', o.failed_sources.length, { names }))}</p>
        <details><summary>${esc(t('status.failedDetails'))}</summary>
          <ul>${o.failed_sources.map((f) => `<li><strong>${esc(f.source)}</strong>, ${esc(when(f.at))}: ${esc(f.error)}</li>`).join('')}</ul>
        </details>
      </div>`);
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
