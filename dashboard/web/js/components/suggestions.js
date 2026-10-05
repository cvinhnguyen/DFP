// The section suggestions card of the settings page: how often the section
// suggested for an article was the one the editors picked it into, by why it
// was suggested and by source, and the sections the editors chose for
// sources, which an admin can take away. It only turns GET /api/suggestions
// into HTML.
// Jira: DM42-32

import { t } from '../texts.js';
import { esc, number, when } from '../format.js';

const percent = (part, whole) => (whole ? Math.round((100 * part) / whole) : 0);

function moved(row) {
  return row.moved_to ? `${esc(t(`section.${row.moved_to}`))} (${number(row.moved_to_picks)})` : '–';
}

function reasonRow(row) {
  return `<tr><td>${esc(t(`sugg.reason.${row.reason}`))}</td><td class="num">${number(row.picks)}</td>
    <td class="num">${number(row.kept)}</td><td>${moved(row)}</td></tr>`;
}

function sourceRow(row) {
  const chosen = row.section
    ? `${esc(t(`section.${row.section}`))}
       <small>${esc(t('sugg.chosenBy', { name: row.chosen_by || '?', when: when(row.chosen_at) }))}</small>
       <button type="button" class="linkish" data-act="sugg-remove" data-source="${row.source_id}">${esc(t('sugg.remove'))}</button>`
    : (row.mixed ? `<small>${esc(t('sugg.mixed'))}</small>` : '–');
  return `<tr><td>${esc(row.source || '?')}</td><td class="num">${number(row.picks)}</td>
    <td class="num">${number(row.kept)}</td><td>${moved(row)}</td><td>${chosen}</td></tr>`;
}

export function suggestionsCard(state) {
  const head = (cells) => `<thead><tr>${cells.map((c) => `<th scope="col">${esc(t(c))}</th>`).join('')}</tr></thead>`;
  return `
    <section class="card set-card sugg-card">
      <div class="set-head"><h2>${esc(t('sugg.title'))}</h2></div>
      <p class="keep-lead">${esc(t('sugg.lead'))}</p>
      <p class="cf-hint">${esc(state.picks
        ? t('sugg.kept', { kept: number(state.kept), picks: number(state.picks), pct: percent(state.kept, state.picks) })
        : t('sugg.none'))}</p>
      ${state.reasons.length ? `
        <h3>${esc(t('sugg.reasons'))}</h3>
        <div class="cost-scroll"><table class="cost-table sugg-table">
          ${head(['sugg.reason', 'sugg.picks', 'sugg.hit', 'sugg.movedTo'])}
          <tbody>${state.reasons.map(reasonRow).join('')}</tbody></table></div>` : ''}
      ${state.sources.length ? `
        <h3>${esc(t('sugg.sources'))}</h3>
        <div class="cost-scroll"><table class="cost-table sugg-table">
          ${head(['sugg.source', 'sugg.picks', 'sugg.hit', 'sugg.movedTo', 'sugg.chosen'])}
          <tbody>${state.sources.map(sourceRow).join('')}</tbody></table></div>` : ''}
    </section>`;
}
