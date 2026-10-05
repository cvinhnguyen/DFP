// The AI costs card of the settings page: this month against the budget,
// the budget itself, and what each month and each newsletter took. It only
// turns GET /api/costs into HTML; the page saves the budget.
// Jira: DM42-39

import { t, tn } from '../texts.js';
import { date, esc, euros, monthName, number } from '../format.js';

const capital = (text) => text.charAt(0).toUpperCase() + text.slice(1);

function now(costs) {
  const b = costs.budget;
  const month = costs.months[0];
  const name = capital(monthName(month ? month.month : new Date().toISOString().slice(0, 7)));
  const pct = b.share === null ? 0 : Math.min(100, Math.floor(b.share * 100));
  const of = b.state === 'none' ? t('cost.noCap') : `/ ${euros(b.budget_eur)}`;
  let state = '';
  if (b.state === 'over') {
    state = `<p class="set-status bad">${esc(t('cost.over', { date: date(b.next_month) }))}${b.waiting
      ? `<span class="nl-meta">${esc(tn('cost.waiting', b.waiting))}</span>` : ''}</p>`;
  } else if (b.state === 'warn') {
    state = `<p class="set-status warn">${esc(t('cost.warn', { pct }))}</p>`;
  }
  const paid = costs.paid_rate_model && month && month.paid_rate_eur !== null
    ? ` ${t('cost.paidRate', { model: costs.paid_rate_model, eur: euros(month.paid_rate_eur) })}` : '';
  const free = month && Number(month.eur) === 0 && month.calls ? t('cost.free', { model: costs.model || '?' }) : '';
  return `
    <div class="cost-now">
      <p class="cost-big"><span>${esc(name)}</span> <strong>${esc(euros(b.spent_eur))}</strong> <span>${esc(of)}</span></p>
      ${b.state === 'none' ? '' : `<progress class="cost-bar ${b.state}" max="100" value="${pct}"
          aria-label="${esc(t('cost.used', { pct }))}"></progress>`}
      ${state}
      ${free || paid ? `<p class="cf-hint">${esc((free + paid).trim())}</p>` : ''}
    </div>`;
}

function budgetForm(costs) {
  return `
    <form class="set-form" data-form="budget">
      <label for="set-budget">${esc(t('cost.budget'))}</label>
      <div class="cost-row">
        <input id="set-budget" class="cf-input" name="eur" type="number" min="0" max="100000" step="any"
               inputmode="decimal" value="${esc(String(costs.budget.budget_eur))}" required>
        <button type="submit" class="btn">${esc(t('dialog.save'))}</button>
      </div>
      <p class="cf-hint">${esc(t('cost.budgetHint'))}</p>
    </form>`;
}

function monthsTable(months) {
  if (!months.length) return '';
  const rows = months.map((m) => `
    <tr>
      <td>${esc(monthName(m.month))}</td>
      <td class="num">${number(m.calls)}${m.cached ? `<small>${esc(t('cost.cached', { n: number(m.cached) }))}</small>` : ''}</td>
      <td class="num">${number(m.tokens_in + m.tokens_out)}</td>
      <td class="num">${esc(euros(m.eur))}${m.paid_rate_eur !== null && Number(m.eur) === 0 && m.calls
        ? `<small>${esc(t('cost.paidShort', { eur: euros(m.paid_rate_eur) }))}</small>` : ''}</td>
      <td class="num">${m.filtered ? `${esc(tn('cost.filtered', m.filtered))}<small>${esc(t('cost.savedTokens', { n: number(m.saved_tokens) }))}</small>` : '0'}</td>
    </tr>`).join('');
  const theses = months.reduce((sum, m) => sum + m.on_request, 0);
  return `
    <h3 class="cost-h">${esc(t('cost.months'))}</h3>
    <div class="cost-scroll" tabindex="0" role="region" aria-label="${esc(t('cost.months'))}"><table class="cost-table">
      <thead><tr><th>${esc(t('cost.month'))}</th><th>${esc(t('cost.calls'))}</th><th>${esc(t('cost.tokens'))}</th>
        <th>${esc(t('cost.eur'))}</th><th>${esc(t('cost.filter'))}</th></tr></thead>
      <tbody>${rows}</tbody>
    </table></div>
    <p class="cf-hint">${esc(t('cost.filterHint'))}${theses ? ` ${esc(tn('cost.theses', theses))}` : ''}</p>`;
}

function issuesTable(issues) {
  const rows = issues.map((i) => `
    <tr>
      <td><a href="#/newsletter?id=${i.id}">${esc(i.name)}</a>
        <small>${esc(i.status === 'sent' ? date(i.date) : t('cost.draft'))}</small></td>
      <td class="num">${number(i.articles)}</td>
      <td class="num">${number(i.tokens)}<small>${esc(euros(i.eur))}</small></td>
      <td class="num">${number(i.period_tokens)}<small>${esc(euros(i.period_eur))}</small></td>
    </tr>`).join('');
  return `
    <h3 class="cost-h">${esc(t('cost.issues'))}</h3>
    ${issues.length ? `<div class="cost-scroll" tabindex="0" role="region" aria-label="${esc(t('cost.issues'))}"><table class="cost-table">
      <thead><tr><th>${esc(t('cost.issue'))}</th><th>${esc(t('cost.articles'))}</th>
        <th>${esc(t('cost.own'))}</th><th>${esc(t('cost.period'))}</th></tr></thead>
      <tbody>${rows}</tbody>
    </table></div>
    <p class="cf-hint">${esc(t('cost.issuesHint'))}</p>` : `<p class="cf-hint">${esc(t('cost.noIssues'))}</p>`}`;
}

export function costsCard(costs) {
  return `
    <section class="card set-card cost-card">
      <div class="set-head"><h2>${esc(t('cost.title'))}</h2></div>
      ${now(costs)}
      ${budgetForm(costs)}
      ${monthsTable(costs.months)}
      ${issuesTable(costs.issues)}
    </section>`;
}
