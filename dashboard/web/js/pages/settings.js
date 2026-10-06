// Asetukset, for admins: how the sources are doing, with the way to
// Lähteet where they are kept (pages/sources.js), the Mailchimp connection
// and how drafts are set up there, the Google Drive folder, the banners and
// logo, the member organisations, how often the suggested sections were
// right, what the AI costs against its monthly budget, and how long the text
// of collected articles is kept. The Mailchimp key itself is never here: it
// lives in n8n's credential store, and this page only says whether n8n can
// reach Mailchimp with it.
// Jira: DM42-37, DM42-74, DM42-39, DM42-45, DM42-32, DM42-43, DM42-29

import { api } from '../api.js';
import { pageTitle, t, tn } from '../texts.js';
import { esc, number } from '../format.js';
import { icon } from '../ui/icons.js';
import { confirmDialog, toast } from '../ui/dialogs.js';
import { costsCard } from '../components/costs.js';
import { retentionCard } from '../components/retention.js';
import { brandCard } from '../components/brand.js';
import { membersCard } from '../components/members.js';
import { suggestionsCard } from '../components/suggestions.js';
import { sourcesSummary } from '../components/sources.js';
import { driveCard } from '../components/drive.js';
import { showDriveFiles } from '../components/driveFiles.js';
import { onLive } from '../live.js';

// The sections in the order of the page, under three headings in the list
// beside them: where articles come from and go to, what goes into the
// emails, and what the AI does and costs and how long articles are kept.
// A source's pictures and section are chosen on Lähteet now.
const SECTIONS = [
  { key: 'sources', group: 'connections', title: 'src.title' },
  { key: 'mailchimp', group: 'connections', title: 'admin.mailchimp' },
  { key: 'drive', group: 'connections', title: 'drive.title' },
  { key: 'brand', group: 'content', title: 'brand.title' },
  { key: 'members', group: 'content', title: 'members.title' },
  { key: 'sugg', group: 'data', title: 'sugg.title' },
  { key: 'costs', group: 'data', title: 'cost.title' },
  { key: 'keep', group: 'data', title: 'keep.title' },
];
const GROUPS = ['connections', 'content', 'data'];
const REDUCED = window.matchMedia('(prefers-reduced-motion: reduce)');

export function showSettings(root, { user }) {
  let state = null;
  let costs = null;
  let keep = null;
  let brand = null;
  let brandBusy = null;   // the banner or logo being uploaded
  let members = null;
  let sugg = null;
  let sources = null;     // GET /api/sources, for how they are doing
  let drive = null;
  let driveBusy = null;   // check or sync, while it runs
  let driveLogAll = false; // the whole Drive log, not only the latest
  let current = SECTIONS[0].key;   // the section in view, marked in the list
  let held = 0;           // until then a press in the list decides the mark
  let watcher = null;
  const seen = new Map();  // which sections are in the band that marks one
  let heldTimer = null;
  let refocus = null;     // the control that had the focus before a redraw
  let gone = false;
  let busy = false;
  const problems = { sources: '', mailchimp: '', costs: '', keep: '', brand: '', members: '', sugg: '', drive: '' };

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

  // What needs an admin's eye, as a mark beside the section's name.
  function flag(key) {
    if (key === 'sources' && sources) {
      const on = sources.sources.filter((x) => x.active);
      if (on.some((x) => x.health === 'failed')) return 'bad';
      if (on.some((x) => ['quiet', 'unread'].includes(x.health))) return 'warn';
    }
    if (key === 'mailchimp' && state && !state.connected) return 'bad';
    if (key === 'drive' && drive && (!drive.configured || drive.check?.problem || drive.check?.outside_count)) return 'bad';
    if (key === 'costs' && costs && ['warn', 'over'].includes(costs.budget?.state)) return costs.budget.state === 'over' ? 'bad' : 'warn';
    return '';
  }

  function card(key) {
    if (key === 'sources') return sources ? sourcesSummary(sources) : '';
    if (key === 'mailchimp') return state ? mailchimpCard() : '';
    if (key === 'drive') return drive ? driveCard(drive, driveBusy, { logAll: driveLogAll }) : '';
    if (key === 'brand') return brand ? brandCard(brand, brandBusy) : '';
    if (key === 'costs') return costs ? costsCard(costs) : '';
    if (key === 'keep') return keep ? retentionCard(keep) : '';
    if (key === 'members') return members ? membersCard(members) : '';
    return sugg ? suggestionsCard(sugg) : '';
  }

  // A section not read yet, or that could not be read, keeps its place and
  // its heading, so the page does not jump as the others arrive.
  function section(s) {
    const body = problems[s.key]
      ? `<p class="problem">${esc(problems[s.key])}</p>`
      : card(s.key);
    const inner = body && !problems[s.key] ? body : `
      <section class="card set-card"${problems[s.key] ? '' : ' aria-busy="true"'}>
        <div class="set-head"><h2>${esc(t(s.title))}</h2></div>
        ${body || `<p class="loading">${esc(t('admin.loading'))}</p>`}
      </section>`;
    return `<div class="set-sec" id="set-${s.key}" data-sec="${s.key}">${inner}</div>`;
  }

  function nav() {
    return GROUPS.map((g) => `
      <div class="set-nav-group">
        <p class="set-nav-h" aria-hidden="true">${esc(t(`admin.group.${g}`))}</p>
        ${SECTIONS.filter((s) => s.group === g).map((s) => {
          const f = flag(s.key);
          return `<button type="button" class="set-nav-item" data-goto="${s.key}"${s.key === current ? ' aria-current="true"' : ''}>
            <span>${esc(t(s.title))}</span>${f ? `<span class="set-flag ${f}"><span class="sr-only">${esc(t('admin.needsLook'))}</span></span>` : ''}</button>`;
        }).join('')}
      </div>`).join('');
  }

  function render() {
    pageTitle(t('admin.title'));
    if (user.role !== 'admin') {
      root.innerHTML = `<p class="problem">${esc(t('error.admin_only'))}</p>`;
      return;
    }
    // The page is drawn whole again as its parts arrive and change; the
    // focus goes back to the control that had it, so a keyboard keeps its
    // place.
    const had = document.activeElement;
    if (had && had !== document.body && root.contains(had)) refocus = focusKey(had);
    root.innerHTML = `
      <div class="pagehead"><h1>${esc(t('admin.title'))}</h1><p>${esc(t('admin.lead'))}</p></div>
      <div class="set-layout">
        <nav class="set-nav" id="set-nav" aria-label="${esc(t('admin.nav'))}">${nav()}</nav>
        <div class="set-list">${SECTIONS.map(section).join('')}</div>
      </div>`;
    if (refocus) {
      const back = root.querySelector(refocus);
      if (back && !back.disabled) {
        back.focus({ preventScroll: true });
        refocus = null;
      }
    }
    watch();
  }

  // One section drawn again, and the marks in the list, leaving the rest
  // of the page as it is: a form being filled in elsewhere keeps its text.
  function update(key) {
    if (gone) return;
    if (!root.querySelector('.set-layout')) {
      render();
      return;
    }
    const had = document.activeElement;
    if (had && had !== document.body && root.contains(had)) refocus = focusKey(had);
    const el = root.querySelector(`#set-${key}`);
    if (el) el.outerHTML = section(SECTIONS.find((x) => x.key === key));
    root.querySelector('#set-nav').innerHTML = nav();
    if (refocus) {
      const back = root.querySelector(refocus);
      if (back && !back.disabled) {
        back.focus({ preventScroll: true });
        refocus = null;
      }
    }
    watch();
  }

  function focusKey(el) {
    if (el.id) return `#${CSS.escape(el.id)}`;
    const attrs = ['act', 'goto', 'which', 'source', 'form'].filter((k) => el.dataset[k] !== undefined)
      .map((k) => `[data-${k}="${CSS.escape(el.dataset[k])}"]`).join('');
    if (attrs) return attrs;
    if (el.name) return `[name="${CSS.escape(el.name)}"]`;
    return null;
  }

  // The section in view is marked in the list beside the page.
  function watch() {
    watcher?.disconnect();
    if (!('IntersectionObserver' in window)) return;
    seen.clear();
    watcher = new IntersectionObserver((entries) => {
      entries.forEach((e) => seen.set(e.target.dataset.sec, e.isIntersecting));
      if (Date.now() >= held) markSeen();
    }, { rootMargin: '-10% 0px -65% 0px' });
    root.querySelectorAll('.set-sec').forEach((el) => watcher.observe(el));
  }

  function markSeen() {
    const first = SECTIONS.find((x) => seen.get(x.key));
    if (first) mark(first.key);
  }

  function mark(key) {
    if (key === current) return;
    current = key;
    root.querySelectorAll('.set-nav-item').forEach((b) => {
      if (b.dataset.goto === key) b.setAttribute('aria-current', 'true');
      else b.removeAttribute('aria-current');
    });
    // On a phone the list is one row that scrolls sideways: the marked one
    // stays in it.
    const navEl = root.querySelector('#set-nav');
    const item = root.querySelector(`.set-nav-item[data-goto="${key}"]`);
    if (navEl && item && navEl.scrollWidth > navEl.clientWidth) {
      navEl.scrollTo({ left: item.offsetLeft - 16, behavior: REDUCED.matches ? 'auto' : 'smooth' });
    }
  }

  function goTo(key) {
    const target = root.querySelector(`#set-${key}`);
    if (!target) return;
    // While the page scrolls there, the pressed one stays marked; then
    // whatever is in view, in case the page moved on meanwhile.
    held = Date.now() + 900;
    clearTimeout(heldTimer);
    heldTimer = setTimeout(markSeen, 950);
    mark(key);
    target.scrollIntoView({ behavior: REDUCED.matches ? 'auto' : 'smooth', block: 'start' });
    const heading = target.querySelector('h2');
    if (heading) {
      heading.setAttribute('tabindex', '-1');
      heading.focus({ preventScroll: true });
    }
  }

  function mailchimpCard() {
    const audiences = state.audiences || [];
    return `
      <section class="card set-card">
        <div class="set-head">
          <h2>${esc(t('admin.mailchimp'))}</h2>
          <button type="button" class="btn ghost small" data-act="test" ${busy ? 'disabled' : ''}>${esc(busy ? t('admin.testing') : t('admin.test'))}</button>
        </div>
        ${status()}
        <form class="set-form" data-form="mailchimp">
          <label for="set-server">${esc(t('admin.server'))}</label>
          <input id="set-server" class="cf-input short" name="server" value="${esc(state.server)}" placeholder="us4" maxlength="8" autocomplete="off">
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
    update('mailchimp');
  }

  async function loadDrive() {
    try {
      drive = await api.get('/api/drive');
      problems.drive = '';
    } catch (e) {
      if (e.status === 401) return;
      problems.drive = e.message;
    }
    update('drive');
  }

  // Drive's check and the folder's reading take a moment: the button says so
  // meanwhile, and the card shows the answer.
  async function driveRun(kind) {
    driveBusy = kind;
    update('drive');
    try {
      if (kind === 'check') {
        drive = await api.post('/api/drive/check');
      } else {
        const done = await api.post('/api/drive/sync');
        toast(t('drive.syncDone', { read: number(done.read || 0) }));
        drive = await api.get('/api/drive');
      }
    } catch (e) {
      toast(e.message, 'warn');
      await loadDrive();
    }
    driveBusy = null;
    update('drive');
  }

  async function driveSave(body, message) {
    driveBusy = 'save';
    update('drive');
    try {
      drive = await api.put('/api/drive', body);
      toast(message);
    } catch (e) {
      toast(e.message, 'warn');
    }
    driveBusy = null;
    update('drive');
  }

  async function loadRetention() {
    try {
      keep = await api.get('/api/retention');
      problems.keep = '';
    } catch (e) {
      if (e.status === 401) return;
      problems.keep = e.message;
    }
    update('keep');
  }

  async function loadSources() {
    try {
      sources = await api.get('/api/sources');
      problems.sources = '';
    } catch (e) {
      if (e.status === 401) return;
      problems.sources = e.message;
    }
    update('sources');
  }

  async function loadSuggestions() {
    try {
      sugg = await api.get('/api/suggestions');
      problems.sugg = '';
    } catch (e) {
      if (e.status === 401) return;
      problems.sugg = e.message;
    }
    update('sugg');
  }

  async function loadMembers() {
    try {
      members = await api.get('/api/members');
      problems.members = '';
    } catch (e) {
      if (e.status === 401) return;
      problems.members = e.message;
    }
    update('members');
  }

  async function loadBrand() {
    try {
      brand = await api.get('/api/brand');
      problems.brand = '';
    } catch (e) {
      if (e.status === 401) return;
      problems.brand = e.message;
    }
    update('brand');
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
      update('brand');
      try {
        const added = await upload(file);
        brand = await api.put(`/api/brand/${which}`, { src: added.src });
        toast(t('brand.saved'));
      } catch (e) {
        toast(e.message, 'warn');
      } finally {
        brandBusy = null;
        update('brand');
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
    update('costs');
  }

  root.addEventListener('click', async (event) => {
    const goto = event.target.closest('[data-goto]');
    if (goto) {
      goTo(goto.dataset.goto);
      return;
    }
    if (event.target.closest('[data-act="drive-log-all"]')) {
      driveLogAll = !driveLogAll;
      update('drive');
      return;
    }
    if (event.target.closest('[data-act="drive-files"]')) {
      showDriveFiles();
      return;
    }
    if (event.target.closest('[data-act="drive-withdraw"]')) {
      if (!(await confirmDialog(t('drive.withdrawConfirm'), { danger: true, okLabel: t('drive.withdrawAll') }))) return;
      try {
        const done = await api.post('/api/drive/withdraw');
        toast(t('drive.withdrawDone', { deleted: number(done.deleted), withdrawn: number(done.withdrawn) }));
      } catch (e) {
        toast(e.message, 'warn');
      }
      await loadDrive();
      return;
    }
    const driveAct = event.target.closest('[data-act="drive-check"], [data-act="drive-sync"], [data-act="drive-copy"]');
    if (driveAct) {
      if (driveAct.dataset.act === 'drive-copy') {
        try {
          await navigator.clipboard.writeText(driveAct.dataset.copy);
          toast(t('drive.copied'));
        } catch {
          const code = driveAct.parentElement.querySelector('code');
          if (code) window.getSelection().selectAllChildren(code);
        }
        return;
      }
      driveRun(driveAct.dataset.act === 'drive-check' ? 'check' : 'sync');
      return;
    }
    const brandAct = event.target.closest('[data-act="brand-upload"], [data-act="brand-reset"]');
    if (brandAct) {
      const which = brandAct.dataset.which;
      if (brandAct.dataset.act === 'brand-upload') {
        chooseBrand(which);
        return;
      }
      try {
        brand = await api.del(`/api/brand/${which}`);
        update('brand');
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
    update('mailchimp');
    await load(true);
    busy = false;
    update('mailchimp');
    toast(state && state.connected ? t('admin.testOk') : t('admin.testBad'), state && state.connected ? 'good' : 'warn');
  });

  root.addEventListener('change', (event) => {
    if (event.target.dataset.act === 'drive-switch') {
      driveSave({ enabled: event.target.checked }, t(event.target.checked ? 'drive.on' : 'drive.off'));
    }
    if (event.target.dataset.act === 'drive-autosave') {
      driveSave({ autosave: event.target.checked }, t(event.target.checked ? 'drive.autosaveOn' : 'drive.autosaveOff'));
    }
  });

  root.addEventListener('submit', async (event) => {
    const driveForm = event.target.closest('[data-form="drive"]');
    if (driveForm) {
      event.preventDefault();
      driveSave({ folder: driveForm.folder.value.trim() }, t('drive.folderSaved'));
      return;
    }
    const days = event.target.closest('[data-form="retention"]');
    if (days) {
      event.preventDefault();
      try {
        keep = await api.put('/api/retention', { days: Number(days.days.value) });
        update('keep');
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
        update('costs');
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
      update('mailchimp');
      toast(t('admin.saved'));
    } catch (e) {
      toast(e.message, 'warn');
    }
  });

  // The folder read every 15 minutes, or a Drive setting changed by another
  // admin: the card shows it as it happens (live.js). The page is drawn
  // again for it, so not while someone is typing anywhere on it or a check
  // runs; then once the typing stops.
  let driveTimer = null;
  let driveStale = false;
  const typing = () => root.contains(document.activeElement) && document.activeElement.matches('input, textarea, select');
  function driveChanged() {
    clearTimeout(driveTimer);
    driveTimer = setTimeout(() => {
      driveStale = Boolean(driveBusy) || typing();
      if (!driveStale) loadDrive();
    }, 800);
  }
  const quiet = onLive('drive', driveChanged);
  // A source checked or changed: its card says how they are doing now.
  let sourcesTimer = null;
  const sourcesQuiet = onLive('sources', () => {
    clearTimeout(sourcesTimer);
    sourcesTimer = setTimeout(() => { if (!gone) loadSources(); }, 1000);
  });
  root.addEventListener('focusout', () => {
    if (driveStale) setTimeout(() => { if (driveStale && !typing()) driveChanged(); }, 0);
  });

  const forget = (event) => {
    if (refocus && !(root.contains(event.target) && focusKey(event.target) === refocus)) refocus = null;
  };
  document.addEventListener('focusin', forget);

  render();
  load();
  loadDrive();
  loadBrand();
  loadCosts();
  loadRetention();
  loadMembers();
  loadSources();
  loadSuggestions();
  return {
    leave() {
      gone = true;
      watcher?.disconnect();
      clearTimeout(heldTimer);
      document.removeEventListener('focusin', forget);
      quiet();
      sourcesQuiet();
      clearTimeout(driveTimer);
      clearTimeout(sourcesTimer);
    },
  };
}
