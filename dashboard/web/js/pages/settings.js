// Asetukset, for admins: the Mailchimp connection and how drafts are set up
// there. The Mailchimp key itself is never here: it lives in n8n's
// credential store, and this page only says whether n8n can reach Mailchimp
// with it.
// Jira: DM42-37, DM42-74

import { api } from '../api.js';
import { t, tn } from '../texts.js';
import { esc, number } from '../format.js';
import { icon } from '../ui/icons.js';
import { toast } from '../ui/dialogs.js';

export function showSettings(root, { user }) {
  let state = null;
  let gone = false;
  let busy = false;

  function status() {
    if (!state) return '';
    if (state.connected) {
      const audience = state.audiences.find((a) => a.id === state.audience_id);
      return `<p class="set-status ok">${icon('check', 18)} ${esc(t('admin.connected', { name: state.account_name || '?' }))}
        ${audience ? `<span class="nl-meta">${esc(t('admin.audienceLine', { name: audience.name, n: number(audience.members || 0) }))}</span>` : ''}</p>`;
    }
    const why = state.problem ? t(`error.${state.problem}`) : t('admin.notConnected');
    return `<p class="set-status bad">${icon('error', 18)} ${esc(t('admin.notConnectedTitle'))}<span class="nl-meta">${esc(why)}</span></p>`;
  }

  function render() {
    if (user.role !== 'admin') {
      root.innerHTML = `<p class="problem">${esc(t('error.admin_only'))}</p>`;
      return;
    }
    const audiences = state.audiences || [];
    root.innerHTML = `
      <div class="pagehead"><h2>${esc(t('admin.title'))}</h2><p>${esc(t('admin.lead'))}</p></div>
      <section class="card set-card">
        <div class="set-head">
          <h3>${esc(t('admin.mailchimp'))}</h3>
          <button type="button" class="btn ghost small" data-act="test" ${busy ? 'disabled' : ''}>${esc(busy ? t('admin.testing') : t('admin.test'))}</button>
        </div>
        ${status()}
        <form class="set-form" data-form="mailchimp">
          <label for="set-server">${esc(t('admin.server'))}</label>
          <input id="set-server" class="cf-input" name="server" value="${esc(state.server)}" placeholder="us4" maxlength="8" autocomplete="off">
          <p class="cf-hint">${esc(t('admin.serverHint'))}</p>

          <label for="set-audience">${esc(t('admin.audience'))}</label>
          ${audiences.length ? `<select id="set-audience" class="cf-input" name="audience_id">
              <option value="">${esc(t('admin.audienceNone'))}</option>
              ${audiences.map((a) => `<option value="${esc(a.id)}" ${a.id === state.audience_id ? 'selected' : ''}>${esc(a.name)} (${esc(tn('admin.members', a.members || 0))})</option>`).join('')}
            </select>`
            : `<input id="set-audience" class="cf-input" name="audience_id" value="${esc(state.audience_id)}" maxlength="20" placeholder="${esc(t('admin.audienceId'))}">`}
          <p class="cf-hint">${esc(t('admin.audienceHint'))}</p>

          <fieldset class="set-plan">
            <legend>${esc(t('admin.plan'))}</legend>
            ${['standard', 'essentials', 'unknown'].map((p) => `<label class="cf-check"><input type="radio" name="plan" value="${p}" ${state.plan === p ? 'checked' : ''}> <span>${esc(t(`admin.plan.${p}`))}</span></label>`).join('')}
            <p class="cf-hint">${esc(t('admin.planHint'))}</p>
          </fieldset>

          <label for="set-from">${esc(t('admin.fromName'))}</label>
          <input id="set-from" class="cf-input" name="from_name" value="${esc(state.from_name)}" maxlength="100">
          <label for="set-reply">${esc(t('admin.replyTo'))}</label>
          <input id="set-reply" class="cf-input" name="reply_to" type="email" value="${esc(state.reply_to)}" maxlength="200" placeholder="info@eoppimiskeskus.fi">
          <p class="cf-hint">${esc(t('admin.replyToHint'))}</p>
          <div class="nl-form-actions"><button type="submit" class="btn">${esc(t('dialog.save'))}</button></div>
        </form>
        <details class="set-help">
          <summary>${esc(t('admin.howTitle'))}</summary>
          <ol>${['how1', 'how2', 'how3', 'how4'].map((k) => `<li>${esc(t(`admin.${k}`))}</li>`).join('')}</ol>
          <p class="cf-hint">${esc(t('admin.howSafety'))}</p>
        </details>
      </section>`;
  }

  async function load(refresh = false) {
    try {
      state = await api.get('/api/mailchimp', refresh ? { refresh: 'true' } : undefined);
      if (!gone) render();
    } catch (e) {
      if (e.status !== 401 && !gone) root.innerHTML = `<p class="problem">${esc(e.message)}</p>`;
    }
  }

  root.addEventListener('click', async (event) => {
    const target = event.target.closest('[data-act="test"]');
    if (!target) return;
    busy = true;
    render();
    await load(true);
    busy = false;
    render();
    toast(state.connected ? t('admin.testOk') : t('admin.testBad'), state.connected ? 'good' : 'warn');
  });

  root.addEventListener('submit', async (event) => {
    const form = event.target.closest('[data-form="mailchimp"]');
    if (!form) return;
    event.preventDefault();
    try {
      state = await api.put('/api/mailchimp', {
        server: form.server.value.trim().toLowerCase(),
        audience_id: form.audience_id.value.trim(),
        plan: (form.querySelector('input[name="plan"]:checked') || {}).value || 'unknown',
        from_name: form.from_name.value.trim(),
        reply_to: form.reply_to.value.trim(),
      });
      render();
      toast(t('admin.saved'));
    } catch (e) {
      toast(e.message, 'warn');
    }
  });

  load();
  return { leave() { gone = true; } };
}
