// Tapahtumakalenteri on the articles page: a month of the events and the
// last days to sign up that the AI read from the articles, with the day the
// newsletter goes out marked on it, and the same as a list by day under it.
// It only turns data into HTML; the page opens an article in the reader
// when one is pressed.
// Jira: DM42-80, DM42-37

import { t, tn, currentLanguage } from '../texts.js';
import { esc, finnishDay, monthName, number, weekdayDay } from '../format.js';
import { icon } from '../ui/icons.js';
import { emptyState } from '../ui/empty.js';
import { AI_MARK, beforeSend } from './article.js';

const CHIPS = 2;          // events written in a day's cell; the rest as "+2 muuta"
const LONGEST = 31;       // the days of one event shown, at most

const iso = (y, m, d) => `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;

export function thisMonth() {
  return finnishDay().slice(0, 7);
}

// 2026-10 and a number of months on: 2026-11 for 1, 2026-09 for -1.
export function addMonths(month, n) {
  const [y, m] = month.split('-').map(Number);
  const at = new Date(Date.UTC(y, m - 1 + n, 1));
  return iso(at.getUTCFullYear(), at.getUTCMonth() + 1, 1).slice(0, 7);
}

function nextDay(day) {
  const [y, m, d] = day.split('-').map(Number);
  const at = new Date(Date.UTC(y, m - 1, d + 1));
  return iso(at.getUTCFullYear(), at.getUTCMonth() + 1, at.getUTCDate());
}

// Every day of the month an article has something on: each day of its
// event, and the last day to sign up, as [{day, kind, item}] in day order.
export function entriesOf(items, month) {
  const found = [];
  for (const item of items) {
    const e = item.event;
    if (!e) continue;
    if (e.starts) {
      let day = e.starts;
      for (let n = 0; n < LONGEST && day <= (e.ends || e.starts); n += 1, day = nextDay(day)) {
        if (day.startsWith(month)) found.push({ day, kind: 'event', item });
      }
    }
    if (e.deadline && e.deadline.startsWith(month)) found.push({ day: e.deadline, kind: 'deadline', item });
  }
  return found.sort((a, b) => a.day.localeCompare(b.day) || (a.kind === 'event' ? -1 : 1));
}

// The articles in the order the list under the month has them, each once:
// what J and K go through.
export function itemsInOrder(items, month) {
  const seen = new Map();
  for (const e of entriesOf(items, month)) if (!seen.has(e.item.id)) seen.set(e.item.id, e.item);
  return [...seen.values()];
}

const titleOf = (item) => item.title_fi || item.title;

function pickedText(item) {
  if (item.decision !== 'picked') return '';
  return item.pick_issue_status === 'sent' ? t('row.sent') : t(`section.${item.pick_section}`);
}

function chip(entry) {
  const { item, kind, day } = entry;
  const label = t(kind === 'deadline' ? 'cal.label.deadline' : 'cal.label.event', { day: weekdayDay(day), title: titleOf(item) });
  return `<button type="button" class="cal-chip ${kind === 'deadline' ? 'is-deadline' : 'is-event'}${item.decision === 'picked' ? ' is-picked' : ''}"
      data-act="cal-open" data-id="${item.id}" title="${esc(label)}" aria-label="${esc(label)}">${kind === 'deadline' ? icon('clock', 12) : ''}<span>${esc(titleOf(item))}</span></button>`;
}

function weekdays() {
  const lang = currentLanguage();
  const short = new Intl.DateTimeFormat(lang === 'fi' ? 'fi-FI' : 'en-GB', { weekday: 'short', timeZone: 'UTC' });
  const long = new Intl.DateTimeFormat(lang === 'fi' ? 'fi-FI' : 'en-GB', { weekday: 'long', timeZone: 'UTC' });
  // 5 Jan 2026 was a Monday.
  return Array.from({ length: 7 }, (_, n) => {
    const at = new Date(Date.UTC(2026, 0, 5 + n));
    return { short: short.format(at), long: long.format(at) };
  });
}

function grid(month, byDay, sendOn, today) {
  const [y, m] = month.split('-').map(Number);
  const lead = (new Date(Date.UTC(y, m - 1, 1)).getUTCDay() + 6) % 7;
  const days = new Date(Date.UTC(y, m, 0)).getUTCDate();
  const cells = [...Array(lead).fill(null), ...Array.from({ length: days }, (_, n) => iso(y, m, n + 1))];
  while (cells.length % 7) cells.push(null);
  const weeks = [];
  for (let n = 0; n < cells.length; n += 7) weeks.push(cells.slice(n, n + 7));
  const head = weekdays().map((d) => `<th scope="col" abbr="${esc(d.long)}">${esc(d.short)}</th>`).join('');
  const body = weeks.map((week) => `<tr>${week.map((day) => {
    if (!day) return '<td class="cal-out"></td>';
    const list = byDay.get(day) || [];
    const marks = [day === today ? 'is-today' : '', day === sendOn ? 'is-send' : '', day < today ? 'is-past' : '', list.length ? 'has' : '']
      .filter(Boolean).join(' ');
    const more = list.length - CHIPS;
    return `<td class="cal-cell ${marks}">
      <span class="cal-n"><span class="cal-d">${Number(day.slice(8))}</span>${day === sendOn ? `<span class="cal-flag" title="${esc(t('cal.legend.send'))}">${icon('flag', 13)}<span class="sr-only">${esc(t('cal.legend.send'))}</span></span>` : ''}</span>
      ${list.slice(0, CHIPS).map(chip).join('')}
      ${list.length ? `<span class="cal-marks" aria-hidden="true">${list.slice(0, 4).map((e) => `<span class="cal-mark${e.kind === 'deadline' ? ' is-deadline' : ''}"></span>`).join('')}</span>` : ''}
      ${more > 0 ? `<button type="button" class="cal-more" data-act="cal-day" data-day="${day}" aria-label="${esc(t('cal.moreLabel', { day: weekdayDay(day) }))}">${esc(tn('cal.more', more, { n: number(more) }))}</button>` : ''}
    </td>`;
  }).join('')}</tr>`).join('');
  return `<table class="cal-grid"><caption class="sr-only">${esc(t('cal.caption', { month: monthName(month) }))}</caption>
    <thead><tr>${head}</tr></thead><tbody>${body}</tbody></table>`;
}

function agendaRow(entry, { selected, sendOn }) {
  const { item, kind } = entry;
  const e = item.event || {};
  const when = kind === 'deadline' ? t('cal.deadline') : (e.line || '');
  const meta = [when, item.publisher || item.source].filter(Boolean).join(' · ');
  const picked = pickedText(item);
  const early = beforeSend(e, sendOn);
  return `<button type="button" class="cal-row ${kind === 'deadline' ? 'is-deadline' : 'is-event'}${early ? ' is-early' : ''}" data-act="cal-open"
      data-id="${item.id}" aria-current="${String(item.id) === selected}">
      <span class="cal-row-kind" aria-hidden="true">${icon(kind === 'deadline' ? 'clock' : 'calendar', 16)}</span>
      <span class="cal-row-main">
        <span class="cal-row-title">${esc(titleOf(item))}</span>
        <span class="cal-row-meta">${esc(meta)}${picked ? `<span class="chip-state picked">${esc(picked)}</span>` : ''}${early
    ? `<span class="ar-row-early">${esc(t('row.beforeSend'))}</span>` : ''}</span>
      </span>
    </button>`;
}

// month: 2026-10. sendOn and sendName: the newsletter picks go into, when
// it has a day. selected: the article open in the reader.
export function calendarHtml({ month, items, sendOn = null, sendName = '', selected = '' }) {
  const today = finnishDay();
  const entries = entriesOf(items, month);
  const byDay = new Map();
  for (const entry of entries) byDay.set(entry.day, [...(byDay.get(entry.day) || []), entry]);
  const bar = `
    <div class="cal-bar">
      <button type="button" class="btn ghost small" data-act="cal-prev" aria-label="${esc(t('cal.prev'))}" title="${esc(t('cal.prev'))}">${icon('arrowLeft', 16)}</button>
      <h3 class="cal-month" aria-live="polite">${esc(monthName(month))}</h3>
      <button type="button" class="btn ghost small" data-act="cal-next" aria-label="${esc(t('cal.next'))}" title="${esc(t('cal.next'))}">${icon('arrowRight', 16)}</button>
      ${month !== thisMonth() ? `<button type="button" class="btn ghost small" data-act="cal-this">${esc(t('cal.thisMonth'))}</button>` : ''}
    </div>`;
  const legend = `
    <p class="cal-legend">${AI_MARK}<span>${esc(t('place.note.events'))}</span></p>
    <ul class="cal-keys" aria-hidden="true">
      <li><span class="cal-key is-event"></span>${esc(t('cal.legend.event'))}</li>
      <li><span class="cal-key is-deadline"></span>${esc(t('cal.legend.deadline'))}</li>
      <li><span class="cal-key is-picked"></span>${esc(t('cal.legend.picked'))}</li>
      ${sendOn ? `<li>${icon('flag', 13)}${esc(t('cal.legend.send'))}</li>` : ''}
    </ul>`;
  let list = '';
  if (entries.length) {
    const days = [...byDay.keys()];
    const send = sendOn && sendOn.startsWith(month) ? sendOn : null;
    const groups = [];
    let sendShown = !send;
    for (const day of days) {
      if (!sendShown && send <= day) {
        groups.push(`<li class="cal-send-row">${icon('flag', 16)}<span>${esc(t('cal.send', { name: sendName }))} ${esc(weekdayDay(send))}</span></li>`);
        sendShown = true;
      }
      groups.push(`<li class="cal-day-group" id="cal-${day}">
        <h4 class="cal-day-h${day === today ? ' is-today' : ''}">${esc(weekdayDay(day))}${day === today ? ` · ${esc(t('days.today'))}` : ''}</h4>
        <div class="cal-day-rows">${byDay.get(day).map((entry) => agendaRow(entry, { selected, sendOn })).join('')}</div>
      </li>`);
    }
    if (!sendShown) groups.push(`<li class="cal-send-row">${icon('flag', 16)}<span>${esc(t('cal.send', { name: sendName }))} ${esc(weekdayDay(send))}</span></li>`);
    list = `<ol class="cal-agenda">${groups.join('')}</ol>`;
  } else {
    list = emptyState({ icon: 'calendar', title: t('cal.emptyTitle'), text: t('cal.empty'),
      actions: `<button type="button" class="btn ghost small" data-act="cal-next">${esc(t('cal.nextMonth'))} ›</button>` });
  }
  return `<div class="cal">${bar}${grid(month, byDay, sendOn, today)}${legend}${list}</div>`;
}
