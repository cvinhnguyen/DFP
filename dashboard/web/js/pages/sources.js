// Asetukset → Lähteet, for admins: every source and how it is doing, the
// sites worth adding, and the chosen source beside the list, where it is
// changed, switched off, checked now, given a new address, or deleted when
// it never brought anything. #/sources lists them, #/sources?id=5 opens one.
// Jira: DM42-29, DM42-36, DM42-47

import { api } from '../api.js';
import { pageTitle, t } from '../texts.js';
import { esc, number, when } from '../format.js';
import { icon } from '../ui/icons.js';
import { confirmDialog, toast } from '../ui/dialogs.js';
import { emptyState } from '../ui/empty.js';
import { onLive } from '../live.js';
import { ATTENTION, noSource, sortSources, sourceDetail, sourceRow, suggestionsCard } from '../components/sources.js';
import { openSourceWindow } from '../components/sourceAdd.js';

const TABS = ['on', 'attention', 'off', 'all'];
const NARROW = window.matchMedia('(max-width: 900px)');

export function showSources(root, { user }) {
  const params = new URLSearchParams(location.hash.split('?')[1] || '');
  let selected = Number(params.get('id')) || null;
  let tab = 'on';
  let query = '';
  let list = null;
  let detail = null;
  let sugg = null;
  const show = { all: false, hidden: false };
  let busy = null;          // check, switch, save or delete, while it runs
  let dirty = false;        // the form has changes not saved yet
  let staleDetail = false;  // a change arrived while the form was being edited
  let gone = false;

  pageTitle(t('src.title'), t('admin.title'));
  if (user.role !== 'admin') {
    root.innerHTML = `<p class="problem">${esc(t('error.admin_only'))}</p>`;
    return { leave() {} };
  }
  root.innerHTML = `
    <a class="nl-back" href="#/settings">${icon('arrowLeft', 16)} ${esc(t('src.back'))}</a>
    <div class="pagehead src-pagehead">
      <div><h1>${esc(t('src.title'))}</h1><p id="src-lead"></p></div>
      <button type="button" class="btn" data-act="src-add">${icon('plus', 16)}<span>${esc(t('src.add'))}</span></button>
    </div>
    <section class="card sg" id="src-sugg" aria-labelledby="sg-title" hidden></section>
    <div class="src-tools">
      <div class="cf-seg compact" role="radiogroup" id="src-tabs" aria-label="${esc(t('src.tabs'))}"></div>
      <input type="search" class="cf-input src-search" id="src-search" maxlength="100" autocomplete="off"
             placeholder="${esc(t('src.search'))}" aria-label="${esc(t('src.search'))}">
    </div>
    <div class="src-layout">
      <div class="card src-list" id="src-list" aria-label="${esc(t('src.list'))}" aria-busy="true"></div>
      <section class="card src-detail" id="src-detail" aria-labelledby="src-title"></section>
    </div>`;
  const $ = (id) => root.querySelector(`#${id}`);

  // ---------- the list ----------

  function inTab(s, which = tab) {
    if (which === 'on') return s.active;
    if (which === 'attention') return ATTENTION.includes(s.health);
    if (which === 'off') return !s.active;
    return true;
  }

  function matches(s) {
    if (!query) return true;
    const q = query.toLowerCase();
    return [s.name, s.url, s.homepage, s.publisher].some((x) => (x || '').toLowerCase().includes(q));
  }

  function renderLead() {
    if (!list) return;
    const times = (list.collection_times || 'off').trim();
    $('src-lead').textContent = times === 'off' ? t('src.leadOff') : t('src.lead', { times: times.split(/\s+/).join(', ') });
  }

  function renderTabs() {
    if (!list) return;
    $('src-tabs').innerHTML = TABS.map((x) => {
      const n = list.sources.filter((s) => inTab(s, x)).length;
      return `<button type="button" role="radio" class="cf-seg-item" data-tab="${x}" aria-checked="${x === tab}">
        ${esc(t(`src.tab.${x}`))}<span class="cf-seg-n">${number(n)}</span></button>`;
    }).join('');
  }

  function renderList() {
    const el = $('src-list');
    if (!list) return;
    el.removeAttribute('aria-busy');
    const shown = sortSources(list.sources.filter((s) => inTab(s) && matches(s)));
    el.innerHTML = shown.length
      ? `<div class="src-rows">${shown.map((s) => sourceRow(s, s.id === selected)).join('')}</div>`
      : emptyState({ icon: 'search', title: t(query ? 'src.none' : 'src.noneTab') });
  }

  // ---------- the chosen source ----------

  function renderDetail({ focus = false } = {}) {
    const el = $('src-detail');
    if (!selected || !detail) {
      el.innerHTML = noSource();
      return;
    }
    el.innerHTML = sourceDetail(detail, { busy, nextCheck: list ? list.next_check_at : null });
    dirty = false;
    if (focus) {
      if (NARROW.matches) el.scrollIntoView({ block: 'start' });
      el.querySelector('#src-title')?.focus({ preventScroll: !NARROW.matches });
    }
  }

  async function loadList() {
    try {
      list = await api.get('/api/sources');
    } catch (e) {
      if (e.status !== 401 && !gone) $('src-list').innerHTML = emptyState({ icon: 'error', title: e.message, tone: 'is-problem' });
      return;
    }
    if (gone) return;
    renderLead();
    renderTabs();
    renderList();
  }

  async function loadDetail({ focus = false } = {}) {
    if (!selected) {
      detail = null;
      renderDetail();
      return;
    }
    try {
      detail = await api.get(`/api/sources/${selected}`);
    } catch (e) {
      if (e.status === 404) {
        select(null);
        return;
      }
      if (e.status !== 401 && !gone) $('src-detail').innerHTML = emptyState({ icon: 'error', title: e.message, tone: 'is-problem' });
      return;
    }
    if (gone) return;
    renderDetail({ focus });
  }

  function select(id, { focus = true } = {}) {
    selected = id;
    history.replaceState(null, '', id ? `#/sources?id=${id}` : '#/sources');
    root.querySelectorAll('.src-row').forEach((r) => r.setAttribute('aria-current', String(Number(r.dataset.source) === id)));
    // A source not in the tab shown, as one just added or opened from a
    // link, brings the tab that has it.
    const found = list && list.sources.find((s) => s.id === id);
    if (found && !inTab(found)) {
      tab = 'all';
      renderTabs();
      renderList();
    }
    loadDetail({ focus });
  }

  // ---------- the sites worth adding ----------

  function renderSugg() {
    const el = $('src-sugg');
    if (!sugg || !sugg.suggestions.length) {
      el.hidden = true;
      return;
    }
    el.hidden = false;
    const had = el.contains(document.activeElement) ? document.activeElement.dataset : null;
    el.innerHTML = suggestionsCard(sugg, show);
    el.querySelector('h2')?.setAttribute('id', 'sg-title');
    if (had && had.act) {
      const again = el.querySelector(`[data-act="${had.act}"]${had.host ? `[data-host="${CSS.escape(had.host)}"]` : ''}`);
      again?.focus({ preventScroll: true });
    }
  }

  async function loadSugg() {
    try {
      sugg = await api.get('/api/sources/suggestions');
    } catch {
      sugg = null;
    }
    if (!gone) renderSugg();
  }

  // ---------- doing things ----------

  async function saveForm(form) {
    if (!detail || busy) return;
    const changes = {};
    const name = form.name.value.trim();
    if (name && name !== detail.name) changes.name = name;
    if (form.publisher.value.trim() !== (detail.publisher || '')) changes.publisher = form.publisher.value.trim();
    if (form.language.value && form.language.value !== (detail.language || '')) changes.language = form.language.value;
    const filter = form.querySelector('input[name="filter_mode"]:checked');
    if (filter && filter.value !== detail.filter_mode) changes.filter_mode = filter.value;
    if (form.notes.value.trim() !== (detail.notes || '')) changes.notes = form.notes.value.trim();
    const section = form.section ? (form.section.value || null) : detail.suggested_section;
    const pictures = form.pictures.value;
    if (pictures === 'none' && detail.picture_rights !== 'none'
      && !(await confirmDialog(t('src.picturesConfirm', { name: detail.name }), { danger: true }))) return;
    busy = 'save';
    const submit = form.querySelector('[type="submit"]');
    submit.disabled = true;
    submit.textContent = t('src.saving');
    try {
      if (Object.keys(changes).length) await api.patch(`/api/sources/${detail.id}`, changes);
      if (section !== detail.suggested_section) await api.put(`/api/sources/${detail.id}/section`, { section });
      if (pictures !== detail.picture_rights) await api.put(`/api/sources/${detail.id}/pictures`, { rights: pictures });
      toast(t('src.saved', { name: changes.name || detail.name }));
    } catch (e) {
      toast(e.message, 'warn');
    }
    busy = null;
    await Promise.all([loadList(), loadDetail()]);
  }

  async function switchSource(input) {
    if (!detail) return;
    const on = input.checked;
    busy = 'switch';
    try {
      await api.patch(`/api/sources/${detail.id}`, { active: on });
      toast(t(on ? 'src.switchedOn' : 'src.switchedOff', { name: detail.name }));
    } catch (e) {
      input.checked = !on;
      toast(e.message, 'warn');
    }
    busy = null;
    await Promise.all([loadList(), loadDetail()]);
  }

  async function check() {
    if (!detail) return;
    busy = 'check';
    renderDetail();
    try {
      await api.post(`/api/sources/${detail.id}/check`);
      toast(t('src.checkStarted', { name: detail.name }));
    } catch (e) {
      toast(e.message, 'warn');
    }
    busy = null;
    loadDetail();
  }

  async function remove() {
    if (!detail) return;
    const name = detail.name;
    if (!(await confirmDialog(t('src.deleteConfirm', { name }), { danger: true, okLabel: t('src.delete') }))) return;
    try {
      await api.del(`/api/sources/${detail.id}`);
      toast(t('src.deleted', { name }));
      select(null, { focus: false });
      loadList();
    } catch (e) {
      toast(e.message, 'warn');
    }
  }

  function done(source, how) {
    if (how === 'changed') toast(t('src.changed', { name: source.name }));
    else {
      const next = list && list.next_check_at;
      toast(next ? t('src.added', { name: source.name, when: when(next) }) : t('src.addedNow', { name: source.name }));
    }
    loadList().then(() => select(source.id));
    loadSugg();
  }

  root.addEventListener('click', async (event) => {
    const row = event.target.closest('.src-row');
    if (row) {
      select(Number(row.dataset.source));
      return;
    }
    const tabButton = event.target.closest('[data-tab]');
    if (tabButton) {
      tab = tabButton.dataset.tab;
      renderTabs();
      renderList();
      return;
    }
    const target = event.target.closest('[data-act]');
    if (!target) return;
    const act = target.dataset.act;
    if (act === 'src-add') openSourceWindow({ onDone: done, onOpen: (id) => select(id) });
    else if (act === 'src-check') check();
    else if (act === 'src-delete') remove();
    else if (act === 'src-address' && detail) openSourceWindow({ change: detail, onDone: done, onOpen: (id) => select(id) });
    else if (act === 'sugg-add') openSourceWindow({ address: target.dataset.address, onDone: done, onOpen: (id) => select(id) });
    else if (act === 'sugg-all') {
      show.all = !show.all;
      renderSugg();
    } else if (act === 'sugg-hidden') {
      show.hidden = !show.hidden;
      renderSugg();
    } else if (act === 'sugg-dismiss' || act === 'sugg-restore') {
      const host = target.dataset.host;
      try {
        await api.put(`/api/sources/suggestions/${encodeURIComponent(host)}`, { dismissed: act === 'sugg-dismiss' });
        if (act === 'sugg-dismiss') toast(t('src.sugg.dismissed', { host }));
      } catch (e) {
        toast(e.message, 'warn');
      }
      loadSugg();
    } else if (act === 'sugg-look') {
      try {
        sugg = await api.post('/api/sources/suggestions/look');
        renderSugg();
      } catch (e) {
        toast(e.message, 'warn');
      }
    }
  });

  root.addEventListener('change', (event) => {
    if (event.target.dataset.act === 'src-switch') switchSource(event.target);
    else if (event.target.id === 'src-pictures') {
      const means = root.querySelector('#src-pictures-means');
      if (means) means.textContent = t(`pics.means.${event.target.value}`);
    }
  });

  root.addEventListener('input', (event) => {
    if (event.target.id === 'src-search') {
      query = event.target.value.trim();
      renderList();
    } else if (event.target.closest('[data-form="source"]')) dirty = true;
  });

  root.addEventListener('submit', (event) => {
    if (event.target.dataset.form !== 'source') return;
    event.preventDefault();
    saveForm(event.target);
  });

  // A check running or finishing, another admin's change, a suggested site
  // looked at: the page catches up as it happens (live.js), but the source
  // being edited waits until its form is saved or left alone.
  let liveTimer = null;
  const editing = () => dirty || ($('src-detail').contains(document.activeElement)
    && document.activeElement.matches('input, textarea, select'));
  function changed() {
    clearTimeout(liveTimer);
    liveTimer = setTimeout(() => {
      if (gone) return;
      loadList();
      if (sugg && (sugg.looking || sugg.suggestions.some((x) => !x.result))) loadSugg();
      if (selected && !busy) {
        if (editing()) staleDetail = true;
        else loadDetail();
      }
    }, 700);
  }
  root.addEventListener('focusout', () => {
    setTimeout(() => {
      if (staleDetail && !editing() && !gone) {
        staleDetail = false;
        loadDetail();
      }
    }, 0);
  });
  const unlisten = [onLive('sources', changed), onLive('resync', changed)];

  renderDetail();
  loadList().then(() => {
    if (selected) select(selected, { focus: false });
  });
  loadSugg();
  return {
    leave() {
      gone = true;
      clearTimeout(liveTimer);
      unlisten.forEach((stop) => stop());
    },
  };
}
