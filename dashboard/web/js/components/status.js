// The status bar above the list: when the sources were last checked, what
// is new today and when the next check is, in one quiet line with the
// "check now" button. A problem is a short chip beside it: a source whose
// check failed opens its details under the bar, and articles that need
// attention open their view. The AI's budget and an AI that does not answer
// get a line of their own, as they change what the list shows.
// It only turns the overview into HTML; the page handles the buttons.

import { t, tn } from '../texts.js';
import { date, esc, euros, when } from '../format.js';
import { icon } from '../ui/icons.js';

// overview: GET /api/overview, or null when it could not be read. checking:
// a check started from this page is still running. view: the view on
// screen, so "needs attention" does not offer to show what is shown.
// failedOpen: the failed sources' details are open. note: { kind, text }, a
// line under the bar, such as a finished check. admin: the details lead to
// Lähteet, where a source is mended.
export function statusLines(overview, { checking = false, view = '', failedOpen = false, note = null, admin = false } = {}) {
  const o = overview;
  const notes = [];
  if (note) notes.push(noteLine(note.kind, note.text));
  if (!o) return notes.join('');

  const busy = checking || o.checking_now;
  // What came today first, then when the sources were checked.
  const facts = [
    newToday(o),
    `<li>${esc(o.last_check_at ? t('status.checked', { when: when(o.last_check_at) }) : t('status.neverChecked'))}</li>`,
  ];
  const b = o.budget;
  const aiNote = o.ai_answering === false || o.waiting_for_ai;
  if (o.waiting && !aiNote && b?.state !== 'over') facts.push(`<li>${esc(tn('status.waitingShort', o.waiting))}</li>`);
  facts.push(`<li class="sb-more">${esc(o.next_check_at ? t('status.nextShort', { when: when(o.next_check_at) }) : t('status.offShort'))}</li>`);

  const chips = [];
  const failed = o.failed_sources;
  if (failed.length) {
    chips.push(`<button type="button" class="sb-chip" data-act="failed" aria-expanded="${failedOpen}" aria-controls="sb-failed">
      ${icon('warning', 16)}<span>${esc(tn('status.failedChip', failed.length))}</span>${icon('chevronDown', 16)}</button>`);
  }
  if (o.needs_attention && view !== 'attention') {
    chips.push(`<button type="button" class="sb-chip" data-act="view" data-view="attention">
      ${icon('info', 16)}<span>${esc(tn('status.attentionChip', o.needs_attention))}</span>${icon('chevronRight', 16)}</button>`);
  }
  // On a phone only its icon shows, so its name is given to it as well.
  const check = busy
    ? `<button type="button" class="btn ghost small sb-check" data-act="check" aria-disabled="true" aria-label="${esc(t('status.checkingShort'))}"><span class="spinner" aria-hidden="true"></span><span class="sb-check-word">${esc(t('status.checkingShort'))}</span></button>`
    : `<button type="button" class="btn ghost small sb-check" data-act="check" aria-label="${esc(t('status.checkNow'))}" title="${esc(t('status.checkNow'))}">${icon('refresh', 16)}<span class="sb-check-word">${esc(t('status.checkNow'))}</span></button>`;

  const bar = `
    <div class="sb-bar">
      <ul class="sb-facts" role="list">${facts.join('')}</ul>
      <div class="sb-end">${chips.join('')}${check}</div>
    </div>`;
  const panel = failed.length ? `
    <div class="sb-panel" id="sb-failed"${failedOpen ? '' : ' hidden'}>
      <ul>${failed.map((f) => `<li><strong>${esc(f.source)}</strong><span class="sb-at">${esc(when(f.at))}</span><span class="sb-err">${esc(f.error)}</span></li>`).join('')}</ul>
      <p>${esc(tn('status.failedAgain', failed.length))}${admin ? ` <a href="#/sources">${esc(t('status.openSources'))} ›</a>` : ''}</p>
    </div>` : '';

  if (b && b.state === 'over') {
    notes.push(noteLine('warn', `${t('status.budgetOver', { budget: euros(b.budget_eur), date: date(b.next_month) })}${b.waiting
      ? ` ${tn('status.budgetWaiting', b.waiting)}` : ''}`));
  } else if (b && b.state === 'warn') {
    notes.push(noteLine('warn', t('status.budgetWarn', { pct: Math.floor(b.share * 100), spent: euros(b.spent_eur), budget: euros(b.budget_eur) })));
  }
  if (o.ai_answering === false) notes.push(noteLine('warn', t('status.aiDown')));
  else if (o.waiting_for_ai) notes.push(noteLine('warn', tn('status.aiRetry', o.waiting_for_ai)));
  return bar + panel + notes.join('');
}

// "12 new articles and 36 theses today": theses are counted on their own,
// as some 45 a day would drown the news.
function newToday(o) {
  const parts = [
    o.new_today ? tn('status.articles', o.new_today) : '',
    o.new_theses_today ? tn('status.theses', o.new_theses_today) : '',
  ].filter(Boolean);
  if (!parts.length) return `<li>${esc(t('status.nothingNew'))}</li>`;
  const what = parts.length === 2 ? t('status.both', { a: parts[0], b: parts[1] }) : parts[0];
  return `<li class="${o.new_today ? 'sb-new' : ''}">${esc(t('status.today', { what }))}</li>`;
}

function noteLine(kind, text) {
  return `<p class="sb-note ${kind}">${icon(kind === 'good' ? 'check' : 'warning', 16)}<span>${esc(text)}</span></p>`;
}
