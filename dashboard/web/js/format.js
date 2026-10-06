// Putting data on the page safely, and dates the Finnish way.

import { t, has, currentLanguage } from './texts.js';

// Everything from the database goes through this before it becomes HTML.
// Titles and summaries come from other people's websites and from a language
// model, and either could contain something that looks like markup.
export function esc(value) {
  return String(value ?? '').replace(/[&<>"']/g, (c) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  }[c]));
}

// Only web addresses become links. A feed could put javascript: or data: in
// a link, and that must never be clickable.
export function safeUrl(value) {
  try {
    const url = new URL(value);
    return url.protocol === 'https:' || url.protocol === 'http:' ? url.href : null;
  } catch {
    return null;
  }
}

// The editors are in Finland and their check times are Finnish time, so every
// date and time is shown in Finnish time, wherever the browser is.
const ZONE = 'Europe/Helsinki';
const dayFormat = new Intl.DateTimeFormat('fi-FI', { day: 'numeric', month: 'numeric', year: 'numeric', timeZone: ZONE });
const isoDay = new Intl.DateTimeFormat('en-CA', { year: 'numeric', month: '2-digit', day: '2-digit', timeZone: ZONE });
// Times as each language writes them: 8.45 in Finnish, 08:45 in English.
const timeFormats = {
  fi: new Intl.DateTimeFormat('fi-FI', { hour: 'numeric', minute: '2-digit', timeZone: ZONE }),
  en: new Intl.DateTimeFormat('en-GB', { hour: '2-digit', minute: '2-digit', hour12: false, timeZone: ZONE }),
};

// 14.25 in Finnish, 14:25 in English: a time today.
export function time(value) {
  return value ? timeFormats[currentLanguage()].format(new Date(value)) : '';
}

// 30.9.2026
export function date(value) {
  return value ? dayFormat.format(new Date(value)) : '';
}

// 2026-09-30, the Finnish day it is now or was at the given time.
export function finnishDay(value = Date.now()) {
  return isoDay.format(new Date(value));
}

// "today at 08:45", "yesterday at 08:45", "tomorrow at 08:00", "28.9.2026 at 08:45"
export function when(value) {
  const days = Math.round((Date.parse(finnishDay(value)) - Date.parse(finnishDay())) / 86400000);
  const day = { 0: t('when.today'), '-1': t('when.yesterday'), 1: t('when.tomorrow') }[days] ?? date(value);
  return t('when.at', { day, time: timeFormats[currentLanguage()].format(new Date(value)) });
}

// "juuri nyt", "12 min sitten", "3 t sitten", and after that as when()
// says it: what was just done on a newsletter.
export function ago(value) {
  const minutes = Math.floor((Date.now() - new Date(value)) / 60000);
  if (minutes < 1) return t('ago.now');
  if (minutes < 60) return t('ago.minutes', { n: minutes });
  if (minutes < 6 * 60) return t('ago.hours', { n: Math.floor(minutes / 60) });
  return when(value);
}

// Whole days from today, Finnish time, to a day such as 2026-11-19: 0 for
// today, 1 for tomorrow, -1 for yesterday.
export function daysUntil(day) {
  return Math.round((Date.parse(String(day).slice(0, 10)) - Date.parse(finnishDay())) / 86400000);
}

// "tänään", "huomenna", "6 pv päästä", "eilen", "3 pv sitten".
export function inDays(day) {
  const n = daysUntil(day);
  if (n === 0) return t('days.today');
  if (n === 1) return t('days.tomorrow');
  if (n === -1) return t('days.yesterday');
  return n > 0 ? t('days.in', { n }) : t('days.ago', { n: -n });
}

// 19.11. in this year, 19.11.2027 in another, from 2027-11-19.
export function shortDay(day) {
  const [y, m, d] = String(day || '').slice(0, 10).split('-').map(Number);
  if (!y || !m || !d) return '';
  return y === Number(finnishDay().slice(0, 4)) ? `${d}.${m}.` : `${d}.${m}.${y}`;
}

// "ti 7.10." in Finnish, "Tue 7.10." in English.
const weekdayNames = {};
export function weekdayDay(day) {
  const lang = currentLanguage();
  weekdayNames[lang] ??= new Intl.DateTimeFormat(lang === 'fi' ? 'fi-FI' : 'en-GB', { weekday: 'short', timeZone: 'UTC' });
  const [y, m, d] = String(day || '').slice(0, 10).split('-').map(Number);
  if (!y) return '';
  return `${weekdayNames[lang].format(new Date(Date.UTC(y, m - 1, d)))} ${shortDay(day)}`;
}

// 6 000 in Finnish, 6,000 in English.
export function number(n) {
  return Number(n).toLocaleString(currentLanguage() === 'fi' ? 'fi-FI' : 'en-GB');
}

// 0,05 € in Finnish, €0.05 in English. Less than a cent keeps four decimals,
// so a small cost does not show as nothing.
export function euros(n) {
  const v = Number(n) || 0;
  const digits = v !== 0 && Math.abs(v) < 0.01 ? 4 : 2;
  return v.toLocaleString(currentLanguage() === 'fi' ? 'fi-FI' : 'en-GB',
    { style: 'currency', currency: 'EUR', minimumFractionDigits: digits, maximumFractionDigits: digits });
}

// "lokakuu 2026" or "October 2026", from 2026-10.
export function monthName(yearMonth) {
  return new Date(`${yearMonth}-15T12:00:00Z`).toLocaleDateString(currentLanguage() === 'fi' ? 'fi-FI' : 'en-GB',
    { month: 'long', year: 'numeric', timeZone: ZONE });
}

export function languageName(code) {
  const key = `lang.${code || 'unknown'}`;
  return has(key) ? t(key) : String(code).toUpperCase();
}

// What the AI read and wrote and what it cost, as the bot says it under a
// summary: "2 321 tokenia · maksuton malli". The client asked about costs,
// on their own text.
export function aiUsage(r) {
  if (!r || r.tokens == null) return '';
  const cost = r.cost_eur == null ? '' : Number(r.cost_eur) === 0 ? t('ai.free') : euros(r.cost_eur);
  return [t('ai.tokens', { n: number(r.tokens) }), cost].filter(Boolean).join(' · ');
}
