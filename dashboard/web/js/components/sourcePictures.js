// The pictures card of the settings page: what the pictures on each source's
// pages are, which decides whether an article's own picture goes into a
// newsletter as it is, with its credit, after an editor's "Saa käyttää", or
// not at all. It only turns GET /api/sources/pictures into HTML; the page
// saves a change.
// Jira: DM42-37

import { t, tn } from '../texts.js';
import { esc, number } from '../format.js';

export const RIGHTS = ['own', 'open', 'check', 'none'];

function row(source, busy) {
  const options = RIGHTS.map((r) => `<option value="${r}"${r === source.rights ? ' selected' : ''}>${esc(t(`pics.rights.${r}`))}</option>`).join('');
  return `<tr>
    <td>${esc(source.name)}${source.active ? '' : ` <small>${esc(t('pics.off'))}</small>`}
      ${source.pictures ? `<span class="pics-n">${esc(tn('pics.countShort', source.pictures, { n: number(source.pictures) }))}</span>` : ''}</td>
    <td class="num">${source.pictures ? number(source.pictures) : '–'}</td>
    <td><select class="cf-input pics-select" data-source="${source.id}" aria-label="${esc(t('pics.label', { source: source.name }))}"
      ${busy === source.id ? 'disabled' : ''}>${options}</select></td>
  </tr>`;
}

export function sourcePicturesCard(state, busy = null) {
  const active = state.sources.filter((s) => s.active);
  const off = state.sources.filter((s) => !s.active);
  const table = (list) => `<div class="cost-scroll"><table class="cost-table pics-table">
      <thead><tr><th scope="col">${esc(t('pics.source'))}</th><th scope="col">${esc(t('pics.count'))}</th>
        <th scope="col">${esc(t('pics.use'))}</th></tr></thead>
      <tbody>${list.map((s) => row(s, busy)).join('')}</tbody></table></div>`;
  return `
    <section class="card set-card pics-card">
      <div class="set-head"><h2>${esc(t('pics.title'))}</h2></div>
      <p class="keep-lead">${esc(t('pics.lead'))}</p>
      <dl class="pics-meanings">${RIGHTS.map((r) => `<dt>${esc(t(`pics.rights.${r}`))}</dt><dd>${esc(t(`pics.means.${r}`))}</dd>`).join('')}</dl>
      ${table(active)}
      ${off.length ? `<details class="pics-off"><summary>${esc(t('pics.offList', { n: number(off.length) }))}</summary>${table(off)}</details>` : ''}
    </section>`;
}
