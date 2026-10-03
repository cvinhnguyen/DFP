// Asetukset, for admins: the Mailchimp connection and how drafts are set up
// there, the banners and logo, what the AI costs against its monthly budget,
// how long the text of collected articles is kept, the member organisations,
// and how often the suggested sections were right. The Mailchimp key itself
// is never here: it lives in n8n's credential store, and this page only says
// whether n8n can reach Mailchimp with it.
// Jira: DM42-37, DM42-74, DM42-39, DM42-45, DM42-32

import { api } from '../api.js';
import { t, tn } from '../texts.js';
import { esc, number } from '../format.js';
import { icon } from '../ui/icons.js';
import { toast } from '../ui/dialogs.js';
import { costsCard } from '../components/costs.js';
import { retentionCard } from '../components/retention.js';
import { brandCard } from '../components/brand.js';
import { membersCard } from '../components/members.js';
import { suggestionsCard } from '../components/suggestions.js';
import { sourcePicturesCard } from '../components/sourcePictures.js';

export function showSettings(root, { user }) {
  let state = null;
  let costs = null;
  let keep = null;
  let brand = null;
  let brandBusy = null;   // the banner or logo being uploaded
  let members = null;
  let sugg = null;
  let pics = null;
  let picsBusy = null;    // the source whose pictures are being saved
  let gone = false;
  let busy = false;
  const problems = { mailchimp: '', costs: '', keep: '', brand: '', members: '', sugg: '', pics: '' };

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
    root.innerHTML = `
      <div class="pagehead"><h2>${esc(t('admin.title'))}</h2><p>${esc(t('admin.lead'))}</p></div>
      ${problems.mailchimp ? `<p class="problem">${esc(problems.mailchimp)}</p>` : (state ? mailchimpCard() : '')}
      ${problems.brand ? `<p class="problem">${esc(problems.brand)}</p>` : (brand ? brandCard(brand, brandBusy) : '')}
      ${problems.costs ? `<p class="problem">${esc(problems.costs)}</p>` : (costs ? costsCard(costs) : '')}
      ${problems.keep ? `<p class="problem">${esc(problems.keep)}</p>` : (keep ? retentionCard(keep) : '')}
      ${problems.members ? `<p class="problem">${esc(problems.members)}</p>` : (members ? membersCard(members) : '')}
      ${problems.pics ? `<p class="problem">${esc(problems.pics)}</p>` : (pics ? sourcePicturesCard(pics, picsBusy) : '')}
      ${problems.sugg ? `<p class="problem">${esc(problems.sugg)}</p>` : (sugg ? suggestionsCard(sugg) : '')}`;
  }

  function mailchimpCard() {
    const audiences = state.audiences || [];
    return `
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
      problems.mailchimp = '';
    } catch (e) {
      if (e.status === 401) return;
      problems.mailchimp = e.message;
    }
    if (!gone) render();
  }

  async function loadRetention() {
    try {
      keep = await api.get('/api/retention');
      problems.keep = '';
    } catch (e) {
      if (e.status === 401) return;
      problems.keep = e.message;
    }
    if (!gone) render();
  }

  async function loadPictures() {
    try {
      pics = await api.get('/api/sources/pictures');
      problems.pics = '';
    } catch (e) {
      if (e.status === 401) return;
      problems.pics = e.message;
    }
    if (!gone) render();
  }

  // What a source's pictures are, saved as soon as it is chosen.
  async function savePictures(select) {
    const id = Number(select.dataset.source);
    const rights = select.value;
    picsBusy = id;
    render();
    try {
      const done = await api.put(`/api/sources/${id}/pictures`, { rights });
      pics.sources = pics.sources.map((x) => (x.id === id ? done.source : x));
      toast([t('pics.saved', { source: done.source.name, rights: t(`pics.rights.${rights}`) }),
        done.changed ? tn('pics.changed', done.changed) : '', done.removed ? tn('pics.removed', done.removed) : '']
        .filter(Boolean).join(' '), 'good');
    } catch (e) {
      toast(e.message, 'warn');
    }
    picsBusy = null;
    if (!gone) render();
  }

  async function loadSuggestions() {
    try {
      sugg = await api.get('/api/suggestions');
      problems.sugg = '';
    } catch (e) {
      if (e.status === 401) return;
      problems.sugg = e.message;
    }
    if (!gone) render();
  }

  async function loadMembers() {
    try {
      members = await api.get('/api/members');
      problems.members = '';
    } catch (e) {
      if (e.status === 401) return;
      problems.members = e.message;
    }
    if (!gone) render();
  }

  async function loadBrand() {
    try {
      brand = await api.get('/api/brand');
      problems.brand = '';
    } catch (e) {
      if (e.status === 401) return;
      problems.brand = e.message;
    }
    if (!gone) render();
  }

  // A picture into Kuvapankki, the way the editor uploads one: the address
  // it gets there is what the banner or logo points at.
  async function upload(file) {
    const form = new FormData();
    form.append('files', file);
    const response = await fetch('/api/images', { method: 'POST', body: form, credentials: 'same-origin' });
    const body = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(body.code ? t(`error.${body.code}`, body.params || {}) : (body.detail || t('brand.uploadFailed')));
    const added = (body.data || [])[0];
    if (!added) throw new Error(t('brand.uploadFailed'));
    return added;
  }

  function chooseBrand(which) {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'image/png,image/jpeg,image/gif,image/webp';
    input.hidden = true;
    root.append(input);
    input.addEventListener('change', async () => {
      const file = input.files && input.files[0];
      input.remove();
      if (!file) return;
      brandBusy = which;
      render();
      try {
        const added = await upload(file);
        brand = await api.put(`/api/brand/${which}`, { src: added.src });
        toast(t('brand.saved'));
      } catch (e) {
        toast(e.message, 'warn');
      } finally {
        brandBusy = null;
        if (!gone) render();
      }
    });
    input.click();
  }

  async function loadCosts() {
    try {
      costs = await api.get('/api/costs');
      problems.costs = '';
    } catch (e) {
      if (e.status === 401) return;
      problems.costs = e.message;
    }
    if (!gone) render();
  }

  root.addEventListener('click', async (event) => {
    const brandAct = event.target.closest('[data-act="brand-upload"], [data-act="brand-reset"]');
    if (brandAct) {
      const which = brandAct.dataset.which;
      if (brandAct.dataset.act === 'brand-upload') {
        chooseBrand(which);
        return;
      }
      try {
        brand = await api.del(`/api/brand/${which}`);
        render();
        toast(t('brand.restored'));
      } catch (e) {
        toast(e.message, 'warn');
      }
      return;
    }
    const remove = event.target.closest('[data-act="sugg-remove"]');
    if (remove) {
      remove.disabled = true;
      try {
        const done = await api.put(`/api/sources/${remove.dataset.source}/section`, { section: null });
        toast(t('sugg.removed', { source: done.source }));
      } catch (e) {
        toast(e.message, 'warn');
      }
      await loadSuggestions();
      return;
    }
    const target = event.target.closest('[data-act="test"]');
    if (!target) return;
    busy = true;
    render();
    await load(true);
    busy = false;
    render();
    toast(state && state.connected ? t('admin.testOk') : t('admin.testBad'), state && state.connected ? 'good' : 'warn');
  });

  root.addEventListener('change', (event) => {
    if (event.target.classList.contains('pics-select')) savePictures(event.target);
  });

  root.addEventListener('submit', async (event) => {
    const days = event.target.closest('[data-form="retention"]');
    if (days) {
      event.preventDefault();
      try {
        keep = await api.put('/api/retention', { days: Number(days.days.value) });
        render();
        toast(t('keep.saved'));
      } catch (e) {
        toast(e.message, 'warn');
      }
      return;
    }
    const budget = event.target.closest('[data-form="budget"]');
    if (budget) {
      event.preventDefault();
      try {
        costs = await api.put('/api/costs/budget', { eur: Number(budget.eur.value) });
        render();
        toast(t('cost.saved'));
      } catch (e) {
        toast(e.message, 'warn');
      }
      return;
    }
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
  loadBrand();
  loadCosts();
  loadRetention();
  loadMembers();
  loadPictures();
  loadSuggestions();
  return { leave() { gone = true; } };
}
