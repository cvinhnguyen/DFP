// The topics view of the articles page: the topics in the list, and one
// topic in the pane on the right, to rename, follow, give terms or delete,
// with what it would bring. It only turns data into HTML; the page decides
// what a click does.
// Jira: DM42-80, DM42-31

import { t, tn } from '../texts.js';
import { esc, number, safeUrl } from '../format.js';
import { colourOf } from './side.js';

export function topicRows(topics, selectedId, { creating = false } = {}) {
  const top = creating
    ? `<form class="tp-new" id="tp-new">
         <input type="text" id="tp-new-name" maxlength="80" required autocomplete="off"
                placeholder="${esc(t('topic.newName'))}" aria-label="${esc(t('topic.newName'))}">
         <button type="submit" class="btn small">${esc(t('topic.create'))}</button>
         <button type="button" class="btn ghost small" data-act="topic-new-cancel">${esc(t('topic.cancel'))}</button>
       </form>`
    : `<p class="tp-newbar"><button type="button" class="btn ghost small" data-act="topic-new">+ ${esc(t('topic.new'))}</button></p>`;
  const rows = topics.map((x) => {
    const meta = [tn('topic.rowTerms', x.tags.length), t('topic.rowNew', { n: number(x.new) }),
      x.followed ? t('topic.rowFollowed') : ''].filter(Boolean).join(' · ');
    return `
      <button type="button" class="ar-row tp-row" data-topic-row="${x.id}" aria-current="${x.id === selectedId}">
        <span class="ar-row-title"><span class="dot c${colourOf(x.position)}" aria-hidden="true"></span> ${esc(x.name)}</span>
        <span class="ar-row-meta">${esc(meta)}</span>
      </button>`;
  }).join('');
  return top + (rows || `<div class="ar-empty"><p>${esc(t('topic.none'))}</p></div>`);
}

function thesis(x) {
  const url = safeUrl(x.url);
  const title = url
    ? `<a href="${esc(url)}" target="_blank" rel="noopener noreferrer">${esc(x.title)}</a>`
    : esc(x.title);
  return `<li class="${x.kept ? '' : 'out'}">${title}
    <small>${esc(x.publisher || '')}${x.kept ? '' : ` · ${esc(t('topic.dropped'))}`}</small></li>`;
}

// preview: GET /api/topics/{id}/preview, or null while it loads.
export function topicEditor(topic, preview, { showDropped = false, saved = false } = {}) {
  const terms = topic.tags.map((g) => `
    <span class="tagchip"><button type="button" data-act="tag" data-tag="${g.id}"
        title="${esc(t('topic.termHint', { term: g.label }))}">${esc(g.label)}</button><button type="button" class="x"
        data-act="term-remove" data-tag="${g.id}" aria-label="${esc(t('topic.removeTerm', { term: g.label }))}"
        title="${esc(t('topic.removeTerm', { term: g.label }))}">×</button></span>`).join('');
  const p = preview;
  const counts = p
    ? `<div class="tp-counts">
         <div><strong>${number(p.news)}</strong><span>${esc(t('topic.news', { days: p.window_days }))}</span></div>
         <div><strong>${number(p.theses)}</strong><span>${esc(t('topic.theses'))}</span></div>
         <div class="muted"><strong>${number(p.theses_without_rule)}</strong><span>${esc(t('topic.thesesAll'))}</span></div>
       </div>`
    : '<div class="tp-counts" aria-busy="true"><div><strong>…</strong></div></div>';
  const kept = p ? p.theses_list.filter((x) => x.kept) : [];
  const dropped = p ? p.theses_list.filter((x) => !x.kept) : [];
  const shown = [...kept, ...(showDropped ? dropped : [])];
  return `
    <div class="rd-top"><button type="button" class="btn ghost small rd-back" data-act="back">‹ ${esc(t('reader.back'))}</button></div>
    <form class="tp-name" id="tp-name-form">
      <label class="rd-lbl" for="tp-name">${esc(t('topic.name'))}</label>
      <input type="text" id="tp-name" maxlength="80" required autocomplete="off" value="${esc(topic.name)}">
      <span class="tp-saved" id="tp-saved"${saved ? '' : ' hidden'}>${esc(t('topic.saved'))}</span>
    </form>
    <label class="tp-follow"><input type="checkbox" id="tp-follow"${topic.followed ? ' checked' : ''}> ${esc(t('topic.follow'))}</label>
    <div class="rd-chips"><span class="rd-lbl">${esc(t('topic.terms'))}</span>
      ${terms || `<span class="rd-soft">${esc(t('topic.noTerms'))}</span>`}
      <span class="addtag">
        <input type="text" id="addterm" data-yso="term" autocomplete="off" spellcheck="false" maxlength="100"
               placeholder="+ ${esc(t('topic.addTerm'))}" aria-label="${esc(t('topic.addTerm'))}"
               role="combobox" aria-autocomplete="list" aria-expanded="false" aria-controls="addterm-list">
        <span class="addtag-list" id="addterm-list" role="listbox" hidden></span>
      </span>
    </div>
    ${counts}
    <div class="tp-theses">
      <p class="rd-label">${esc(t('topic.thesesTitle'))}</p>
      ${shown.length ? `<ul>${shown.map(thesis).join('')}</ul>` : (p ? `<p class="rd-soft">${esc(t('topic.thesesNone'))}</p>` : '')}
      ${dropped.length ? `<button type="button" class="linkish" data-act="toggle-dropped">${esc(showDropped
        ? t('topic.hideDropped') : t('topic.showDropped', { n: number(dropped.length) }))}</button>` : ''}
    </div>
    <div class="tp-actions">
      <button type="button" class="btn ghost small" data-act="topic" data-topic="${topic.id}">${esc(t('topic.open'))} ›</button>
      <button type="button" class="btn ghost small tp-delete" data-act="topic-delete">${esc(t('topic.delete'))}</button>
    </div>`;
}
