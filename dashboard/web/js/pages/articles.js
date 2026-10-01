// The articles page: what is shown, loading it, and what each click does.
// How an article and the status line look is in components/.
// Jira: DM42-80, DM42-31

import { api } from '../api.js';
import { t, tn, has } from '../texts.js';
import { esc, number, languageName, finnishDay } from '../format.js';
import { articleRow } from '../components/article.js';
import { statusLines } from '../components/status.js';

// The editors' decisions first, then what the AI step did with an article.
const VIEWS = ['review', 'picked', 'later', 'dismissed', 'used', 'all'];
const AI_VIEWS = ['waiting', 'skipped', 'attention'];
const ALL_VIEWS = [...VIEWS, ...AI_VIEWS];
const PERIODS = { any: null, today: 0, week: 6, month: 29 };
const SORTS = ['collected', 'published', 'relevance'];
const DEFAULTS = { view: 'review', q: '', source: '', language: '', signal: '', period: 'any', sort: 'collected' };
const PER_PAGE = 25;

// What the list shows is kept in the address after #, so a reload or a
// copied link opens the same view.
function readState() {
  const params = new URLSearchParams(location.hash.replace(/^#\/?\??/, ''));
  const state = { ...DEFAULTS };
  for (const key of Object.keys(DEFAULTS)) {
    if (params.has(key)) state[key] = params.get(key);
  }
  if (!ALL_VIEWS.includes(state.view)) state.view = DEFAULTS.view;
  if (!(state.period in PERIODS)) state.period = DEFAULTS.period;
  if (!SORTS.includes(state.sort)) state.sort = DEFAULTS.sort;
  return state;
}

function writeState(state) {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(state)) {
    if (value && value !== DEFAULTS[key]) params.set(key, value);
  }
  const hash = params.toString() ? `#/?${params}` : '#/';
  if (location.hash !== hash) history.replaceState(null, '', hash);
}

function layout() {
  const field = (name, label, control) => `
    <div class="field field-${name}">
      <label for="f-${name}">${esc(label)}</label>
      ${control}
    </div>`;
  return `
    <div class="pagehead">
      <h2>${esc(t('page.articles'))}</h2>
      <p>${esc(t('page.articlesLead'))}</p>
    </div>
    <section class="status" id="status" aria-live="polite"></section>
    <form class="filters" id="filters" role="search">
      <div class="views" id="views" role="group" aria-label="${esc(t('view.label'))}"></div>
      <div class="controls">
        ${field('q', t('filter.search'), `<input id="f-q" type="search" maxlength="200" autocomplete="off" placeholder="${esc(t('filter.searchHint'))}">`)}
        ${field('source', t('filter.source'), '<select id="f-source"></select>')}
        ${field('language', t('filter.language'), '<select id="f-language"></select>')}
        ${field('period', t('filter.period'), '<select id="f-period"></select>')}
        ${field('sort', t('filter.sort'), '<select id="f-sort"></select>')}
      </div>
      <div class="active" id="active" hidden></div>
    </form>
    <p class="viewnote" id="viewnote" hidden></p>
    <p class="resultline" id="resultline" aria-live="polite"></p>
    <div class="list" id="list" aria-busy="true"></div>
    <p class="more"><button type="button" class="btn ghost" id="more" hidden>${esc(t('results.more'))}</button></p>`;
}

export function showArticles(root) {
  let state = readState();
  let options = null;       // what the filters can choose from
  let counts = null;        // articles in each view, for the buttons
  let overview = null;
  let checking = null;      // a check started from this page
  let page = 1;
  let shown = 0;
  let latest = 0;           // the newest list request; older answers are ignored
  let followTimer = null;
  let searchTimer = null;
  const topics = {};        // topic names seen on chips, for the filter label

  root.innerHTML = layout();
  const $ = (id) => root.querySelector(`#${id}`);
  const status = $('status');
  const views = $('views');
  const active = $('active');
  const note = $('viewnote');
  const line = $('resultline');
  const list = $('list');
  const more = $('more');
  const fields = { q: $('f-q'), source: $('f-source'), language: $('f-language'), period: $('f-period'), sort: $('f-sort') };

  const filtering = () => Boolean(state.q || state.source || state.language || state.signal || state.period !== 'any');

  // ---------- the filters ----------

  function fill(select, choices, value) {
    select.innerHTML = choices.map(([v, label]) => `<option value="${esc(v)}">${esc(label)}</option>`).join('');
    select.value = value;
    if (select.value !== value) select.value = choices[0][0];
  }

  function syncControls() {
    // Never rewrite the search box while someone is typing in it.
    if (fields.q.value.trim() !== state.q) fields.q.value = state.q;
    const placeholder = (value) => (value ? [[value, '…']] : []);
    fill(fields.source, [['', t('filter.allSources')],
      ...(options ? options.sources.map((s) => [String(s.id), `${s.name} (${number(s.items)})`]) : placeholder(state.source))],
    state.source);
    fill(fields.language, [['', t('filter.allLanguages')],
      ...(options ? options.languages.map((l) => [l.code ?? 'unknown', `${languageName(l.code)} (${number(l.items)})`]) : placeholder(state.language))],
    state.language);
    fill(fields.period, Object.keys(PERIODS).map((p) => [p, t(`period.${p}`)]), state.period);
    fill(fields.sort, SORTS.map((s) => [s, t(`sort.${s}`)]), state.sort);
    fields.sort.querySelector('option[value="relevance"]').disabled = !state.q;
    renderViews();
    renderActive();
    const noteKey = `note.${state.view}`;
    note.hidden = !has(noteKey);
    note.textContent = has(noteKey) ? t(noteKey) : '';
  }

  function renderViews() {
    const button = (v) => `
      <button type="button" data-act="view" data-view="${v}" aria-pressed="${state.view === v}">
        ${esc(t(`view.${v}`))}${counts ? ` <span class="n">${number(counts[v])}</span>` : ''}
      </button>`;
    views.innerHTML = `${VIEWS.map(button).join('')}<span class="views-gap" aria-hidden="true"></span>${AI_VIEWS.map(button).join('')}`;
  }

  function renderActive() {
    const parts = [];
    if (state.signal) {
      const topic = options?.signals.find((s) => String(s.id) === state.signal)?.topic ?? topics[state.signal] ?? '…';
      parts.push(`
        <span class="chip on">${esc(t('filter.topic', { topic }))}
          <button type="button" class="x" data-act="no-topic" aria-label="${esc(t('filter.removeTopic'))}">×</button>
        </span>`);
    }
    if (filtering()) parts.push(`<button type="button" class="linkish" data-act="clear">${esc(t('filter.clear'))}</button>`);
    active.innerHTML = parts.join('');
    active.hidden = !parts.length;
  }

  function setState(changes) {
    state = { ...state, ...changes };
    if (!state.q && state.sort === 'relevance') state.sort = DEFAULTS.sort;
    writeState(state);
    syncControls();
    if (overview) status.innerHTML = statusLines(overview, { checking: Boolean(checking), view: state.view });
    loadList();
  }

  // ---------- the list ----------

  function listParams() {
    const params = { view: state.view, sort: state.sort };
    for (const key of ['q', 'source', 'language', 'signal']) {
      if (state[key]) params[key] = state[key];
    }
    const days = PERIODS[state.period];
    if (days !== null) params.from = finnishDay(Date.now() - days * 86400000);
    return params;
  }

  function emptyMessage() {
    if (filtering()) {
      return `<div class="empty"><p>${esc(t('results.none'))}</p>
        <button type="button" class="btn ghost" data-act="clear">${esc(t('filter.clear'))}</button></div>`;
    }
    const view = counts && counts.all === 0 ? 'all' : state.view;
    return `<div class="empty"><p>${esc(t(`results.empty.${view}`))}</p></div>`;
  }

  async function loadList(append = false) {
    const mine = ++latest;
    const nextPage = append ? page + 1 : 1;
    list.setAttribute('aria-busy', 'true');
    more.disabled = true;
    try {
      const data = await api.get('/api/items', { ...listParams(), page: nextPage, per_page: PER_PAGE });
      if (mine !== latest) return;
      page = nextPage;
      counts = data.counts;
      renderViews();
      const rows = data.items.map(articleRow).join('');
      if (append) list.insertAdjacentHTML('beforeend', rows);
      else list.innerHTML = rows || emptyMessage();
      shown = (append ? shown : 0) + data.items.length;
      line.textContent = data.total ? t('results.count', { shown: number(shown), total: number(data.total) }) : '';
      more.hidden = shown >= data.total;
    } catch (e) {
      if (mine !== latest || e.status === 401) return;
      if (append) {
        line.textContent = e.message;
      } else {
        list.innerHTML = `<div class="empty problem"><p>${esc(t('error.load'))} ${esc(e.message)}</p>
          <button type="button" class="btn ghost" data-act="retry">${esc(t('error.retry'))}</button></div>`;
        line.textContent = '';
        more.hidden = true;
      }
    } finally {
      if (mine === latest) {
        list.removeAttribute('aria-busy');
        more.disabled = false;
      }
    }
  }

  async function refreshCounts() {
    try {
      counts = (await api.get('/api/items', { ...listParams(), page: 1, per_page: 1 })).counts;
      renderViews();
    } catch {
      // The numbers catch up on the next load.
    }
  }

  async function loadOptions() {
    try {
      options = await api.get('/api/filters');
      syncControls();
    } catch {
      // The filters still work, only without their lists of choices.
    }
  }

  // Picking, keeping for later, leaving out, or taking a decision back. The
  // article stays where it is with its new state, so the editor sees what
  // happened and can undo it; it leaves the view on the next load.
  async function decide(button, decision, section) {
    const id = button.dataset.id;
    const article = list.querySelector(`[data-item="${id}"]`);
    button.disabled = true;
    try {
      const item = await api.put(`/api/items/${id}/decision`, { decision: decision || null, section: section || null });
      article.outerHTML = articleRow(item);
      refreshCounts();
    } catch (e) {
      button.disabled = false;
      const box = article?.querySelector('.row-error');
      if (box) {
        box.textContent = e.message;
        box.hidden = false;
      }
    }
  }

  async function summarise(button) {
    const article = list.querySelector(`[data-item="${button.dataset.id}"]`);
    button.disabled = true;
    try {
      const item = await api.post(`/api/items/${button.dataset.id}/summarise`);
      article.outerHTML = articleRow(item);
      refreshCounts();
      loadOverview();
    } catch (e) {
      button.disabled = false;
      const box = article?.querySelector('.row-error');
      if (box) {
        box.textContent = e.message;
        box.hidden = false;
      }
    }
  }

  // ---------- the status line ----------

  async function loadOverview(done = '') {
    try {
      overview = await api.get('/api/overview');
      status.innerHTML = statusLines(overview, { checking: Boolean(checking), done, view: state.view });
      return overview;
    } catch (e) {
      if (e.status !== 401) status.insertAdjacentHTML('beforeend', `<p class="line warn">${esc(e.message)}</p>`);
      return null;
    }
  }

  async function startCheck(button) {
    button.disabled = true;
    try {
      await api.post('/api/collect');
    } catch (e) {
      // 409 means a check is already running, so this page follows that one.
      if (e.status !== 409) {
        button.disabled = false;
        status.insertAdjacentHTML('beforeend', `<p class="line warn">${esc(e.message)}</p>`);
        return;
      }
    }
    checking = { started: Date.now(), seen: false, before: overview?.new_today ?? 0 };
    status.innerHTML = statusLines(overview, { checking: true, view: state.view });
    followCheck();
  }

  // The check runs in n8n and sends nothing back, so the page watches the
  // overview until no source is being checked any more.
  function followCheck() {
    clearTimeout(followTimer);
    followTimer = setTimeout(async () => {
      const o = await loadOverview();
      if (!checking) return;
      if (!o) {
        followCheck();
        return;
      }
      if (o.checking_now) checking.seen = true;
      const waited = Date.now() - checking.started;
      const finished = (!o.checking_now && (checking.seen || waited > 20000)) || waited > 5 * 60000;
      if (!finished) {
        followCheck();
        return;
      }
      const added = Math.max(0, o.new_today - checking.before);
      checking = null;
      status.innerHTML = statusLines(o, {
        done: added ? tn('status.checkDone', added) : t('status.checkDoneNothing'),
        view: state.view,
      });
      loadOptions();
      loadList();
    }, 3000);
  }

  // ---------- events ----------

  // A section menu closes when the editor clicks anywhere else.
  function closeMenus(event) {
    root.querySelectorAll('details.menu[open]').forEach((menu) => {
      if (!menu.contains(event.target)) menu.open = false;
    });
  }
  document.addEventListener('click', closeMenus);

  root.addEventListener('click', (event) => {
    const target = event.target.closest('[data-act]');
    if (!target) return;
    const { act } = target.dataset;
    if (act === 'view') setState({ view: target.dataset.view });
    else if (act === 'check') startCheck(target);
    else if (act === 'summarise') summarise(target);
    else if (act === 'pick') decide(target, 'picked', target.dataset.section);
    else if (act === 'decide') decide(target, target.dataset.decision);
    else if (act === 'retry') loadList();
    else if (act === 'no-topic') setState({ signal: '' });
    else if (act === 'topic') {
      topics[target.dataset.signal] = target.dataset.topic;
      setState({ signal: target.dataset.signal });
    } else if (act === 'clear') {
      setState({ q: '', source: '', language: '', signal: '', period: DEFAULTS.period });
    }
  });

  function applySearch() {
    const q = fields.q.value.trim();
    if (q === state.q) return;
    // Starting a search puts the best matches first, unless an order was chosen.
    const changes = { q };
    if (q && !state.q && state.sort === DEFAULTS.sort) changes.sort = 'relevance';
    setState(changes);
  }

  fields.q.addEventListener('input', () => {
    clearTimeout(searchTimer);
    searchTimer = setTimeout(applySearch, 350);
  });
  $('filters').addEventListener('submit', (event) => {
    event.preventDefault();
    clearTimeout(searchTimer);
    applySearch();
  });
  for (const name of ['source', 'language', 'period', 'sort']) {
    fields[name].addEventListener('change', () => setState({ [name]: fields[name].value }));
  }
  more.addEventListener('click', () => loadList(true));

  function onHash() {
    state = readState();
    syncControls();
    loadList();
  }
  window.addEventListener('hashchange', onHash);

  // An open page keeps its status line current, without moving the list
  // under the editor's eyes.
  const refresh = setInterval(() => {
    if (!checking && document.visibilityState === 'visible') loadOverview();
  }, 2 * 60000);

  writeState(state);
  syncControls();
  loadOverview();
  loadOptions();
  loadList();

  return {
    leave() {
      clearTimeout(followTimer);
      clearTimeout(searchTimer);
      clearInterval(refresh);
      window.removeEventListener('hashchange', onHash);
      document.removeEventListener('click', closeMenus);
    },
  };
}
