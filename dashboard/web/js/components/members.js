// The member organisations card of the settings page: the association's
// community members, read from its members page every Monday, whose articles
// are suggested for Jäsenkuulumisia. It only turns GET /api/members into HTML.
// Jira: DM42-32

import { t, tn } from '../texts.js';
import { esc, safeUrl, when } from '../format.js';

export function membersCard(state) {
  const list = (kind) => {
    const members = state.members.filter((m) => m.kind === kind);
    if (!members.length) return '';
    return `
      <h3>${esc(tn(`members.${kind}`, members.length))}</h3>
      <ul class="members-list">${members.map((m) => {
        const url = safeUrl(m.website);
        return `<li>${url ? `<a href="${esc(url)}" target="_blank" rel="noopener noreferrer">${esc(m.name)}</a>` : esc(m.name)}</li>`;
      }).join('')}</ul>`;
  };
  return `
    <section class="card set-card members-card">
      <div class="set-head"><h2>${esc(t('members.title'))}</h2></div>
      <p class="keep-lead">${esc(t('members.lead'))}</p>
      ${state.members.length
        ? `<p class="cf-hint">${esc(t('members.read', { n: state.members.length, when: when(state.read_at) }))}</p>
           <details class="members-all"><summary>${esc(t('members.show'))}</summary>${list('voting')}${list('supporting')}</details>`
        : `<p class="cf-hint">${esc(t('members.none'))}</p>`}
    </section>`;
}
