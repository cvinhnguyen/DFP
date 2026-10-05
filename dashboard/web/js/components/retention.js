// The retention card of the settings page: how long the text of collected
// articles is kept, and what the nightly cleanup has taken. It only turns
// GET /api/retention into HTML; the page saves the period.
// Jira: DM42-45

import { t, tn } from '../texts.js';
import { esc, number, when } from '../format.js';

export function retentionCard(state) {
  const run = state.last_run;
  const lastRun = run
    ? t('keep.lastRun', { when: when(run.ran_at), cleared: tn('keep.articles', run.items_cleared), kept: number(run.kept_in_use) })
      + (run.pictures_removed ? ` ${tn('keep.pictures', run.pictures_removed)}` : '')
    : t('keep.notRunYet');
  return `
    <section class="card set-card keep-card">
      <div class="set-head"><h2>${esc(t('keep.title'))}</h2></div>
      <p class="keep-lead">${esc(t('keep.lead', { days: number(state.keep_days) }))}</p>
      <form class="set-form" data-form="retention">
        <label for="set-keep">${esc(t('keep.days'))}</label>
        <div class="cost-row">
          <input id="set-keep" class="cf-input" name="days" type="number" min="30" max="365" step="1"
                 inputmode="numeric" value="${esc(String(state.keep_days))}" required>
          <button type="submit" class="btn">${esc(t('dialog.save'))}</button>
        </div>
        <p class="cf-hint">${esc(t('keep.hint'))}</p>
      </form>
      <ul class="keep-facts">
        <li>${esc(lastRun)}</li>
        <li>${esc(t('keep.removed', { n: number(state.removed) }))}</li>
        <li>${esc(t('keep.next', { n: number(state.next_night) }))}</li>
      </ul>
    </section>`;
}
