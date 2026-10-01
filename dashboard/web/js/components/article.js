// How one article is drawn in the list: title, who published it, the Finnish
// summary or why there is none, topics, and the details underneath. It only
// turns data into HTML; the page decides what happens on a click.

import { t, tn } from '../texts.js';
import { esc, safeUrl, date, when, number, languageName } from '../format.js';

// The reason the summarisation workflow gives when the model did not answer.
const AI_DID_NOT_ANSWER = 'waiting for the AI to answer again';

// The newsletter sections an article can be picked into.
const SECTIONS = ['own_news', 'events', 'member_news', 'highlights'];

function stateClass(item) {
  return {
    summarised: 'is-ready',
    new: 'is-waiting',
    queued: 'is-waiting',
    filtered_out: 'is-skipped',
    summary_failed: 'is-attention',
    manual: 'is-attention',
  }[item.status] ?? '';
}

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

function langAttr(code) {
  return code ? ` lang="${esc(code)}"` : '';
}

function body(item) {
  if (item.status === 'summarised' && item.summary) {
    const reason = item.status_reason || '';
    const asked = reason.startsWith('requested by ')
      ? `<p class="aside">${esc(t('item.requestedDone', { name: requester(reason) }))}</p>`
      : '';
    return `<p class="summary" lang="fi">${esc(item.summary.text)}</p>${asked}`;
  }
  const action = item.can_request_summary
    ? ` <button type="button" class="linkish" data-act="summarise" data-id="${item.id}">${esc(t(item.status === 'summary_failed' ? 'item.tryAgain' : 'item.summariseAnyway'))}</button>`
    : '';
  const excerpt = item.excerpt
    ? `<p class="excerpt"><span class="label">${esc(t('item.excerpt'))}</span> <span${langAttr(item.language)}>${esc(item.excerpt)}</span></p>`
    : '';
  return `
    <p class="state"><span class="dot" aria-hidden="true"></span><span>${esc(stateText(item))}${action}</span></p>
    <p class="row-error" role="alert" hidden></p>
    ${excerpt}`;
}

function chips(item) {
  const out = item.signals.map((s) => `
    <button type="button" class="chip" data-act="topic" data-signal="${s.id}" data-topic="${esc(s.topic)}"
            title="${esc(t('item.topicHint'))}">${esc(s.topic)}</button>`);
  if (item.copies.length) out.push(`<span class="chip copies">${esc(tn('item.alsoIn', item.copies.length))}</span>`);
  return out.length ? `<div class="chips">${out.join('')}</div>` : '';
}

function copyLink(copy) {
  const url = safeUrl(copy.url);
  const label = esc(copy.source || copy.publisher || copy.url);
  return `<li>${url ? `<a href="${esc(url)}" target="_blank" rel="noopener noreferrer">${label}</a>` : label}</li>`;
}

// A small menu of sections, the suggested one first. act is pick for a new
// pick, or move for changing the section of one already picked.
function sectionMenu(item, label, act, buttonClass) {
  const order = [item.suggested_section, ...SECTIONS.filter((s) => s !== item.suggested_section)]
    .filter((s) => act !== 'move' || s !== item.pick_section);
  const choices = order.map((s) => {
    const name = t(`section.${s}`);
    const text = act === 'pick' && s === item.suggested_section ? t('pick.suggested', { section: name }) : name;
    return `<button type="button" role="menuitem" data-act="pick" data-id="${item.id}" data-section="${s}">${esc(text)}</button>`;
  }).join('');
  return `
    <details class="menu">
      <summary class="${buttonClass}">${esc(label)}</summary>
      <div class="menu-list" role="menu">${choices}</div>
    </details>`;
}

// What the editors decided about the article, who did, and what can be done
// next. Articles still waiting for the AI have nothing to decide yet.
function decisionBar(item) {
  if (item.status === 'new' || item.status === 'queued') return '';
  const by = item.decided_by && item.decided_at
    ? `<span class="decision-by">${esc(t('pick.by', { name: item.decided_by, when: when(item.decided_at) }))}</span>`
    : '';
  const undo = `<button type="button" class="linkish" data-act="decide" data-id="${item.id}" data-decision="">${esc(t('pick.undo'))}</button>`;
  if (item.decision === 'picked' && item.pick_issue_status === 'sent') {
    return `<div class="decision is-used"><span class="decision-state">${esc(t('pick.sentIn', { issue: item.pick_issue_name }))}</span></div>`;
  }
  if (item.decision === 'picked') {
    const state = t('pick.inIssue', { issue: item.pick_issue_name, section: t(`section.${item.pick_section}`) });
    return `
      <div class="decision is-picked">
        <span class="decision-state"><span aria-hidden="true">✓</span> ${esc(state)}</span>${by}
        ${sectionMenu(item, t('pick.move'), 'move', 'linkish')}${undo}
      </div>`;
  }
  if (item.decision === 'later' || item.decision === 'dismissed') {
    const state = t(item.decision === 'later' ? 'pick.keptLater' : 'pick.notUsed');
    const add = item.decision === 'later' ? sectionMenu(item, t('pick.add'), 'pick', 'btn small') : '';
    return `
      <div class="decision is-${item.decision}">
        <span class="decision-state">${esc(state)}</span>${by}${add}${undo}
      </div>`;
  }
  return `
    <div class="decision">
      ${sectionMenu(item, t('pick.add'), 'pick', 'btn small')}
      <button type="button" class="btn ghost small" data-act="decide" data-id="${item.id}" data-decision="later">${esc(t('pick.later'))}</button>
      <button type="button" class="btn ghost small" data-act="decide" data-id="${item.id}" data-decision="dismissed">${esc(t('pick.dismiss'))}</button>
    </div>`;
}

function details(item) {
  const facts = [
    [t('details.collected'), when(item.collected_at)],
    item.published_at && [t('details.published'), date(item.published_at)],
    item.summary && [t('details.summarised'), when(item.summary.made_at)],
    [t('details.text'), item.text_length ? t('details.chars', { count: number(item.text_length) }) : t('details.noText')],
    [t('details.language'), languageName(item.language)],
    [t('details.number'), String(item.id)],
  ].filter(Boolean);
  const copies = item.copies.length
    ? `<p class="copies-title">${esc(t('details.copies'))}</p><ul class="copies">${item.copies.map(copyLink).join('')}</ul>`
    : '';
  return `
    <details class="facts">
      <summary>${esc(t('item.details'))}</summary>
      <dl>${facts.map(([name, value]) => `<dt>${esc(name)}</dt><dd>${esc(value)}</dd>`).join('')}</dl>
      ${copies}
    </details>`;
}

export function articleRow(item) {
  const url = safeUrl(item.url);
  const title = url
    ? `<a href="${esc(url)}" target="_blank" rel="noopener noreferrer"${langAttr(item.language)}>${esc(item.title)}</a>`
    : `<span${langAttr(item.language)}>${esc(item.title)}</span>`;
  const badge = item.language && item.language !== 'fi'
    ? `<span class="lang" title="${esc(languageName(item.language))}">${esc(item.language.toUpperCase())}</span> `
    : '';
  const day = item.published_at ? date(item.published_at) : t('item.collectedOn', { date: date(item.collected_at) });
  const from = item.source_type === 'manual'
    ? (item.sent_by ? t('item.sentBy', { name: item.sent_by }) : t('item.sentOnTelegram'))
    : (item.source && item.source !== item.publisher ? t('item.from', { source: item.source }) : '');
  const byline = [item.publisher, from].filter(Boolean).map(esc).join(' · ');
  return `
    <article class="item ${stateClass(item)}${item.decision ? ` decided-${item.decision}` : ''}" data-item="${item.id}">
      <div class="item-head">
        <h3 class="title">${badge}${title}</h3>
        <span class="when">${esc(day)}</span>
      </div>
      ${byline ? `<p class="by">${byline}</p>` : ''}
      ${body(item)}
      ${chips(item)}
      ${decisionBar(item)}
      ${details(item)}
    </article>`;
}
