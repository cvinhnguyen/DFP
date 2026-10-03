// How an article looks on the articles page: its row in the list, and the
// whole article in the reading pane with its topics, tags and the buttons
// that decide about it. It only turns data into HTML; the page decides what
// happens on a click.
// Jira: DM42-80, DM42-31

import { t, tn, has, currentLanguage } from '../texts.js';
import { esc, safeUrl, date, when, number, languageName, finnishDay } from '../format.js';
import { colourOf } from './side.js';
import { icon } from '../ui/icons.js';

// The reason the summarisation workflow gives when the model did not answer.
const AI_DID_NOT_ANSWER = 'waiting for the AI to answer again';

// The newsletter sections, in the order of the keys 1 to 4.
export const SECTIONS = ['own_news', 'events', 'member_news', 'highlights'];

function requester(reason) {
  const name = reason.slice('requested by '.length);
  return name === 'an editor' ? t('item.anEditor') : name;
}

// The filter's reasons are stored in plain English. The known ones are put in
// the dashboard's own words; anything else is shown as it is.
function skipReason(item) {
  const reason = item.status_reason || '';
  if (item.duplicate_of) return t('reason.duplicate', { title: item.duplicate_of_title || `#${item.duplicate_of}` });
  if (reason === 'too little text to summarise') return t('reason.tooLittle');
  if (reason === 'no keyword match') return t('reason.noKeyword');
  const old = reason.match(/^older than (\d+) days$/);
  if (old) return t('reason.tooOld', { days: old[1] });
  return reason || t('item.noReason');
}

function stateText(item) {
  const reason = item.status_reason || '';
  if (item.status === 'queued' && reason === AI_DID_NOT_ANSWER) return t('item.waitingForAi');
  if (item.status === 'queued' && reason.startsWith('requested by ')) return t('item.requested', { name: requester(reason) });
  if (item.status === 'new' || item.status === 'queued') return t('item.waiting');
  if (item.status === 'filtered_out') return t('item.skipped', { reason: skipReason(item) });
  if (item.status === 'summary_failed') return t('item.failed', { reason: reason || t('item.noReason') });
  if (item.status === 'manual') return t('item.manual');
  return item.status;
}

const langAttr = (code) => (code ? ` lang="${esc(code)}"` : '');

function langBadge(item) {
  return item.language && item.language !== 'fi'
    ? `<span class="lang" title="${esc(languageName(item.language))}">${esc(item.language.toUpperCase())}</span>`
    : '';
}

function kindLabel(item) {
  if (!item.from_archive) return '';
  return t(item.details?.kind === 'publication' ? 'row.publication' : 'row.thesis');
}

function byline(item) {
  const from = item.source_type === 'manual'
    ? (item.sent_by ? t('item.sentBy', { name: item.sent_by }) : t('item.sentOnTelegram'))
    : (item.source && item.source !== item.publisher && !item.from_archive ? t('item.from', { source: item.source }) : '');
  return [item.publisher, from].filter(Boolean);
}

// The editors' decision, or else what the AI step did, as one short chip.
function stateChip(item) {
  if (item.decision === 'picked') {
    const text = item.pick_issue_status === 'sent' ? t('row.sent') : t(`section.${item.pick_section}`);
    return `<span class="chip-state picked">${esc(text)}</span>`;
  }
  if (item.decision === 'later') return `<span class="chip-state">${esc(t('row.later'))}</span>`;
  if (item.decision === 'dismissed') return `<span class="chip-state">${esc(t('row.dismissed'))}</span>`;
  if (item.status === 'new' || item.status === 'queued') return `<span class="chip-state">${esc(t('row.waiting'))}</span>`;
  if (item.status === 'filtered_out') return `<span class="chip-state">${esc(t('row.skipped'))}</span>`;
  if (item.status === 'summary_failed' || item.status === 'manual') return `<span class="chip-state warn">${esc(t('row.attention'))}</span>`;
  return '';
}

// 2026-11-02 as 2.11.2026.
function fiDay(iso) {
  const [y, m, d] = String(iso || '').split('-').map(Number);
  return y && m && d ? `${d}.${m}.${y}` : '';
}

// The event's dates, and its time, from the line the API makes: the part
// before " | " when the article gave a date.
function eventWhen(event) {
  return event && event.starts && event.line ? event.line.split(' | ')[0] : '';
}

// In the list: the dates, or the deadline when only that is known.
function eventChip(item) {
  const e = item.event;
  if (!e) return '';
  const when = eventWhen(e).split(' klo ')[0];
  const text = when || (e.deadline ? t('row.deadline', { date: fiDay(e.deadline) }) : '');
  return text ? `<span class="chip-when">${esc(text)}</span>` : '';
}

function topicDots(item, topics) {
  return item.topics.map((x) => {
    const found = topics.get(x.id);
    return `<span class="dot c${colourOf(found ? found.position : 1)}" title="${esc(x.name)}"></span>`;
  }).join('');
}

// topics: a Map of the topics by id, for their colours.
// number: the article's number in an answer from the AI, which cites it so.
export function articleRow(item, { selected = false, topics = new Map(), number = null } = {}) {
  const meta = [...byline(item).map(esc), kindLabel(item) ? `<span class="kind">${esc(kindLabel(item))}</span>` : '']
    .filter(Boolean).join(' · ');
  let tags = item.tags.slice(0, 3).map((g) => `<span class="tg${g.origin === 'signal' ? ' sig' : ''}">${esc(g.label)}</span>`).join('');
  if (!tags && item.tags_pending) tags = `<span class="tg none">${esc(t('row.tagsComing'))}</span>`;
  else if (!tags && (item.status === 'summarised' || item.from_archive)) tags = `<span class="tg none">${esc(t('row.noTags'))}</span>`;
  // A Finnish title from the AI is shown in its own language, Finnish.
  const title = item.title_fi
    ? `<span lang="fi">${esc(item.title_fi)}</span>`
    : `<span${langAttr(item.language)}>${esc(item.title)}</span>`;
  return `
    <button type="button" class="ar-row${item.decision ? ' decided' : ''}${item.seen ? '' : ' unseen'}" data-id="${item.id}" aria-current="${selected}">
      <span class="ar-row-title">${number ? `<span class="ar-row-n" title="${esc(t('row.number', { n: number }))}">${number}</span>` : ''}${langBadge(item)}${title}</span>
      <span class="ar-row-meta"><span class="ar-row-by">${meta}</span>${eventChip(item)}<span class="dots">${topicDots(item, topics)}</span>${stateChip(item)}</span>
      ${tags ? `<span class="ar-row-tags">${tags}</span>` : ''}
    </button>`;
}

// "Tänään", "Eilen", or "Tiistai 29.9.", for the headings between days.
const weekdays = {};
export function dayHeading(day) {
  const today = finnishDay();
  if (day === today) return t('day.today');
  if (day === finnishDay(Date.now() - 86400000)) return t('day.yesterday');
  const lang = currentLanguage();
  weekdays[lang] ??= new Intl.DateTimeFormat(lang === 'fi' ? 'fi-FI' : 'en-GB', { weekday: 'long', timeZone: 'UTC' });
  const [y, m, d] = day.split('-').map(Number);
  const name = weekdays[lang].format(new Date(Date.UTC(y, m - 1, d)));
  const shown = y === Number(today.slice(0, 4)) ? `${d}.${m}.` : `${d}.${m}.${y}`;
  return `${name[0].toUpperCase()}${name.slice(1)} ${shown}`;
}

// ---------- the reading pane ----------

function chips(item, topics) {
  const topicChips = item.topics.map((x) => {
    const found = topics.get(x.id);
    return `<button type="button" class="chip topic" data-act="topic" data-topic="${x.id}">
      <span class="dot c${colourOf(found ? found.position : 1)}" aria-hidden="true"></span>${esc(x.name)}</button>`;
  }).join('') || `<span class="chip none">${esc(t(item.needs_learning_tag ? 'reader.noLearningTag' : 'reader.noTopic'))}</span>`;
  const tagChips = item.tags.map((g) => `
    <span class="tagchip${g.origin === 'signal' ? ' sig' : ''}"><button type="button" data-act="tag" data-tag="${g.id}"
        title="${esc(t('reader.tagHint', { tag: g.label }))}">${esc(g.label)}</button><button type="button" class="x"
        data-act="untag" data-tag="${g.id}" aria-label="${esc(t('reader.removeTag', { tag: g.label }))}"
        title="${esc(t('reader.removeTag', { tag: g.label }))}">×</button></span>`).join('');
  return `
    <div class="rd-chips"><span class="rd-lbl">${esc(t('reader.topics'))}</span>${topicChips}</div>
    <div class="rd-chips"><span class="rd-lbl">${esc(t('reader.tags'))}</span>${tagChips}
      ${item.tags_pending ? `<span class="rd-soft">${esc(t('reader.tagsComing'))}</span>` : ''}
      <span class="addtag">
        <input type="text" id="addtag" data-yso="tag" autocomplete="off" spellcheck="false" maxlength="100"
               placeholder="+ ${esc(t('reader.addTag'))}" aria-label="${esc(t('reader.addTag'))}"
               role="combobox" aria-autocomplete="list" aria-expanded="false" aria-controls="addtag-list">
        <span class="addtag-list" id="addtag-list" role="listbox" hidden></span>
      </span>
    </div>`;
}

// When, where and the deadline, and the line the newsletter will start the
// event with. The AI read these out of the article, so they are marked so.
function eventBox(item) {
  const e = item.event;
  if (!e) return '';
  const rows = [
    eventWhen(e) && [t('event.when'), eventWhen(e)],
    e.place && [t('event.where'), e.place],
    e.deadline && [t('event.deadline'), fiDay(e.deadline)],
  ].filter(Boolean);
  return `
    <dl class="rd-event">
      ${rows.map(([name, value]) => `<dt>${esc(name)}</dt><dd>${esc(value)}</dd>`).join('')}
      ${e.line ? `<dd class="rd-event-line">${esc(t('event.line'))}: <strong>${esc(e.line)}</strong></dd>` : ''}
      <dd class="rd-event-note">${esc(t('event.byAi'))}</dd>
    </dl>`;
}

function signalNotes(item) {
  return item.signals.map((s) => `
    <p class="rd-signal"><button type="button" class="linkish" data-place="signal:${s.id}"
      title="${esc(t('reader.signalOpen', { topic: s.topic }))}"><strong>${esc(t('reader.signal', { topic: s.topic }))}.</strong></button>
      ${esc(s.reason || '')}</p>`).join('');
}

function licenceNote(item) {
  const licence = item.details?.licence;
  if (!licence) return '';
  if (/^CC\b/i.test(licence)) return `<p class="rd-licence open">${esc(t('reader.licenceOpen', { licence }))}</p>`;
  if (/all rights reserved/i.test(licence)) return `<p class="rd-licence">${esc(t('reader.licenceClosed'))}</p>`;
  return '';
}

function body(item) {
  const abstract = item.abstract || item.excerpt || '';
  if (item.summary) {
    const reason = item.status_reason || '';
    const asked = reason.startsWith('requested by ')
      ? `<p class="rd-soft">${esc(t('item.requestedDone', { name: requester(reason) }))}</p>` : '';
    const original = item.from_archive && abstract
      ? `<details class="rd-abstract"><summary>${esc(t('reader.abstract'))}</summary><p${langAttr(item.language)}>${esc(abstract)}</p></details>`
      : '';
    return `<p class="rd-label">${esc(t('reader.summary'))}</p>
      <p class="rd-text" lang="fi">${esc(item.summary.text)}</p>${asked}${original}`;
  }
  if (item.from_archive) {
    const queued = item.status === 'queued' || item.status === 'new'
      ? `<p class="rd-state">${esc(t('reader.summaryComing'))}</p>` : '';
    const now = item.status === 'on_request' && item.can_request_summary
      ? `<button type="button" class="btn ghost small" data-act="summarise">${esc(t('reader.summariseNow'))}</button>` : '';
    return `<p class="rd-label">${esc(t('reader.abstract'))}</p>
      <p class="rd-text"${langAttr(item.language)}>${esc(abstract)}</p>
      ${licenceNote(item)}${queued}${now}`;
  }
  const action = item.can_request_summary
    ? ` <button type="button" class="linkish" data-act="summarise">${esc(t(item.status === 'summary_failed' ? 'item.tryAgain' : 'item.summariseAnyway'))}</button>`
    : '';
  const excerpt = item.excerpt
    ? `<p class="rd-label">${esc(t('item.excerpt'))}</p><p class="rd-text"${langAttr(item.language)}>${esc(item.excerpt)}</p>`
    : '';
  return `<p class="rd-state attention-${item.status}">${esc(stateText(item))}${action}</p>${excerpt}`;
}

// Why a section is suggested, in a few words (services/suggest.py): an
// event's day, a member's name. Nothing for Nostoja kentältä, the default.
function suggestionWhy(item) {
  const reason = item.suggestion_reason;
  if (!reason || !has(`reader.why.${reason}`)) return '';
  const detail = item.suggestion_detail || '';
  return t(`reader.why.${reason}`, { name: detail, date: /^\d{4}-\d{2}-\d{2}$/.test(detail) ? date(detail) : detail });
}

function decision(item, target) {
  if (item.decision === 'picked' && item.pick_issue_status === 'sent') {
    return `<div class="rd-decide"><p class="rd-sent">${esc(t('reader.sentIn', { issue: item.pick_issue_name }))}</p></div>`;
  }
  const picked = item.decision === 'picked';
  // What to do here, in words an editor new to the tool can follow: which
  // newsletter, and that pressing a section is the choice. Each section says
  // what goes in it; its key is in the corner, for those who use the keys.
  const where = picked
    ? t('pick.inIssue', { issue: item.pick_issue_name, section: t(`section.${item.pick_section}`) })
    : (target ? t('reader.addTo', { issue: target }) : t('reader.addToNew'));
  const how = picked ? t('reader.howMove') : (target ? t('reader.how') : t('reader.howNew'));
  const buttons = SECTIONS.map((s, n) => {
    const chosen = picked && item.pick_section === s;
    const suggested = !item.decision && item.suggested_section === s;
    const why = suggested ? suggestionWhy(item) : '';
    const badge = chosen ? `<span class="rd-sec-badge">${esc(t('reader.chosen'))}</span>`
      : (suggested ? `<span class="rd-sec-badge">${esc(t('reader.suggested'))}</span>${why ? `<small class="rd-sec-why">${esc(why)}</small>` : ''}` : '');
    return `<button type="button" class="rd-sec${chosen ? ' chosen' : ''}${suggested ? ' suggested' : ''}"
              data-act="pick" data-section="${s}" aria-pressed="${chosen}">
              <span class="rd-sec-name">${icon(chosen ? 'check' : 'plus', 16)}<span>${esc(t(`section.${s}`))}</span></span>
              <small class="rd-sec-what">${esc(t(`reader.sectionWhat.${s}`))}</small>
              ${badge}<kbd class="rd-sec-key" aria-hidden="true">${n + 1}</kbd></button>`;
  }).join('');
  const by = item.decided_by && item.decided_at
    ? `<span class="rd-by">${esc(t('reader.decidedBy', { name: item.decided_by, when: when(item.decided_at) }))}</span>` : '';
  return `
    <div class="rd-decide">
      <p class="rd-where"><strong>${esc(where)}</strong> <span>${esc(how)}</span></p>
      <div class="rd-secs">${buttons}</div>
      <div class="rd-other">
        ${picked ? '' : `<span class="rd-other-k">${esc(t('reader.notForIt'))}</span>`}
        <button type="button" class="btn ghost small${item.decision === 'later' ? ' on' : ''}" data-act="later" aria-pressed="${item.decision === 'later'}" title="${esc(t('reader.laterHint'))}">${esc(t('reader.later'))}</button>
        <button type="button" class="btn ghost small${item.decision === 'dismissed' ? ' on' : ''}" data-act="dismiss" aria-pressed="${item.decision === 'dismissed'}" title="${esc(t('reader.dismissHint'))}">${esc(t('reader.dismiss'))}</button>
        ${item.decision ? `<button type="button" class="linkish" data-act="clear">${esc(t('reader.clear'))}</button>` : ''}
        ${by}
        <span class="rd-keys" aria-hidden="true"><kbd>J</kbd> <kbd>K</kbd> ${esc(t('reader.keysMove'))} · <kbd>L</kbd> ${esc(t('reader.keysLater'))} · <kbd>X</kbd> ${esc(t('reader.keysDismiss'))}</span>
      </div>
      <p class="row-error" role="alert" hidden></p>
    </div>`;
}

function copyLink(copy) {
  const url = safeUrl(copy.url);
  const label = esc(copy.source || copy.publisher || copy.url);
  return `<li>${url ? `<a href="${esc(url)}" target="_blank" rel="noopener noreferrer">${label}</a>` : label}</li>`;
}

function facts(item) {
  const rows = [
    [t('details.collected'), when(item.collected_at)],
    item.published_at && [t('details.published'), date(item.published_at)],
    item.summary && [t('details.summarised'), when(item.summary.made_at)],
    [t('details.text'), item.text_length ? t('details.chars', { count: number(item.text_length) })
      : item.text_removed_at ? t('details.textRemoved', { date: date(item.text_removed_at) }) : t('details.noText')],
    [t('details.language'), languageName(item.language)],
    [t('details.number'), String(item.id)],
  ].filter(Boolean);
  const copies = item.copies.length
    ? `<p class="copies-title">${esc(t('details.copies'))}</p><ul class="copies">${item.copies.map(copyLink).join('')}</ul>` : '';
  return `
    <details class="rd-facts">
      <summary>${esc(t('item.details'))}${item.copies.length ? ` · ${esc(tn('item.alsoIn', item.copies.length))}` : ''}</summary>
      <dl>${rows.map(([name, value]) => `<dt>${esc(name)}</dt><dd>${esc(value)}</dd>`).join('')}</dl>
      ${copies}
    </details>`;
}

// ctx: place (its name), index and total (for "3 / 25"), canPrev, canNext,
// target (the name of the newsletter picks go into) and topics (a Map by id).
// The picture from the article's own page, with whose it is and what using it
// in the newsletter takes (28-article-pictures.sql). Small, so the summary
// stays in sight.
function picture(item) {
  const p = item.picture;
  if (!p || !p.src) return '';
  const rights = ['own', 'open', 'check'].includes(p.rights) ? p.rights : 'check';
  const size = p.width && p.height ? ` width="${Number(p.width)}" height="${Number(p.height)}"` : '';
  return `
    <figure class="rd-picture">
      <img src="${esc(p.src)}" alt="${esc(p.alt || '')}" loading="lazy"${size}>
      <figcaption>${p.credit ? `${esc(t('reader.pictureCredit', { credit: p.credit }))} · ` : ''}<span class="rd-picture-rights ${rights}">${esc(t(`reader.pictureRights.${rights}`))}</span></figcaption>
    </figure>`;
}

export function articleReader(item, ctx) {
  const url = safeUrl(item.url);
  const kind = kindLabel(item);
  const level = item.from_archive ? [item.details?.level, item.details?.programme].filter(Boolean).join(', ') : '';
  const meta = [
    ...byline(item).map((x) => `<span>${esc(x)}</span>`),
    kind && !level ? `<span>${esc(kind)}</span>` : '',
    level ? `<span>${esc(level)}</span>` : '',
    `<span>${esc(date(item.published_at || item.collected_at))}</span>`,
    item.language && item.language !== 'fi' ? `<span>${esc(languageName(item.language))}</span>` : '',
    url ? `<a href="${esc(url)}" target="_blank" rel="noopener noreferrer">${esc(t('reader.open'))} ↗</a>` : '',
  ].filter(Boolean).join('');
  return `
    <div class="rd-top">
      <button type="button" class="btn ghost small rd-back" data-act="back">‹ ${esc(t('reader.back'))}</button>
      <span class="rd-pos">${esc(t('reader.position', { place: ctx.place, n: number(ctx.index + 1), total: number(ctx.total) }))}</span>
      <span class="rd-nav">
        <button type="button" class="btn ghost small" data-act="prev"${ctx.canPrev ? '' : ' disabled'}>‹ ${esc(t('reader.prev'))}</button>
        <button type="button" class="btn ghost small" data-act="next"${ctx.canNext ? '' : ' disabled'}>${esc(t('reader.next'))} ›</button>
      </span>
    </div>
    ${item.title_fi
    ? `<h2 class="rd-title" lang="fi">${esc(item.title_fi)}</h2>
       <p class="rd-original">${esc(t('reader.originalTitle'))}: <span${langAttr(item.language)}>${esc(item.title)}</span>. ${esc(t('reader.titleByAi'))}</p>`
    : `<h2 class="rd-title"${langAttr(item.language)}>${esc(item.title)}</h2>`}
    <p class="rd-meta">${meta}</p>
    ${picture(item)}
    ${eventBox(item)}
    ${chips(item, ctx.topics)}
    ${signalNotes(item)}
    <div class="rd-body">${body(item)}</div>
    ${decision(item, ctx.target)}
    ${facts(item)}`;
}

// The YSO terms found for what the editor typed into "add a tag".
export function termOptions(terms, active) {
  if (!terms.length) return `<span class="addtag-none">${esc(t('reader.noTerms'))}</span>`;
  return terms.map((x, n) => `
    <span class="addtag-opt" role="option" id="addtag-opt-${n}" data-uri="${esc(x.uri)}" data-label="${esc(x.label)}"
          aria-selected="${n === active}">${esc(x.label)}${x.also ? ` <small>${esc(t('reader.also', { name: x.also }))}</small>` : ''}</span>`).join('');
}
