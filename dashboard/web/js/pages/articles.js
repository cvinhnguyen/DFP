// The articles page: a column of topics and views, the list, and the article
// being read. The editor reads down the list and decides with one click or a
// key, and the next article opens by itself. How the parts look is in
// components/article.js and components/side.js. Kysy artikkeleilta is a
// place too: a question, the AI's answer, and the articles it is from as the
// list, each opening in the reader like any other.
// Jira: DM42-80, DM42-31, DM42-40

import { api } from '../api.js';
import { t, tn } from '../texts.js';
import { aiUsage, date, esc, number, finnishDay } from '../format.js';
import { articleRow, articleReader, dayHeading, termOptions, SECTIONS } from '../components/article.js';
import { sideHtml } from '../components/side.js';
import { topicRows, topicEditor } from '../components/topics.js';
import { statusLines } from '../components/status.js';
import { confirmDialog } from '../ui/dialogs.js';

// The lists of the editors' own decisions and of what the AI did. A topic, a
// tag, a source, a signal or "no topic" is a place too: topic:3, tag:12,
// source:5, signal:7, none. ask is asking the articles a question.
// topics is where the topics themselves are edited.
const VIEWS = ['inbox', 'picked', 'later', 'dismissed', 'used', 'waiting', 'skipped', 'attention', 'all'];
const SORTS = ['collected', 'published', 'relevance'];
const DEFAULTS = { place: 'inbox', q: '', sort: 'collected', item: '' };
const PER_PAGE = 50;
// Which newsletter picks go into, remembered in this browser.
const TARGET_KEY = 'dfp.pickTarget';
const NARROW = window.matchMedia('(max-width: 760px)');

function parsePlace(text) {
  const [kind, raw, extra] = String(text || '').split(':');
  if (extra === undefined && raw === undefined && VIEWS.includes(kind)) return { kind: 'view', view: kind };
  if ((kind === 'none' || kind === 'topics' || kind === 'ask') && raw === undefined) return { kind };
  const id = Number(raw);
  if (extra === undefined && ['topic', 'tag', 'source', 'signal'].includes(kind) && Number.isInteger(id) && id > 0) return { kind, id };
  return { kind: 'view', view: 'inbox' };
}

function placeKey(place) {
  if (place.kind === 'view') return place.view;
  if (place.kind === 'none' || place.kind === 'topics' || place.kind === 'ask') return place.kind;
  return `${place.kind}:${place.id}`;
}

function placeParams(place) {
  if (place.kind === 'view') return { view: place.view };
  if (place.kind === 'none') return { view: 'open', untopiced: 'true' };
  if (place.kind === 'topic') return { view: 'open', topic: place.id };
  if (place.kind === 'tag') return { view: 'open', tag: place.id };
  if (place.kind === 'signal') return { view: 'all', signal: place.id };
  return { view: 'all', source: place.id };
}

// Whether an article still belongs in the list after a decision about it.
// An answer's articles stay, whatever is decided about them.
function belongs(item, place) {
  if (place.kind === 'ask') return true;
  const view = place.kind === 'view' ? place.view : (['source', 'signal'].includes(place.kind) ? 'all' : 'open');
  if (view === 'inbox') return !item.decision;
  if (view === 'picked') return item.decision === 'picked' && item.pick_issue_status !== 'sent';
  if (view === 'later') return item.decision === 'later';
  if (view === 'dismissed') return item.decision === 'dismissed';
  if (view === 'used') return item.decision === 'picked' && item.pick_issue_status === 'sent';
  if (view === 'open') return item.decision !== 'dismissed';
  return true;
}

// What the page shows is kept in the address after #, so a reload or a
// copied link opens the same place and the same article.
function readState() {
  const params = new URLSearchParams(location.hash.replace(/^#\/?\??/, ''));
  const state = { ...DEFAULTS };
  for (const key of Object.keys(DEFAULTS)) {
    if (params.has(key)) state[key] = params.get(key);
  }
  if (!SORTS.includes(state.sort)) state.sort = DEFAULTS.sort;
  state.place = placeKey(parsePlace(state.place));
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

function readTarget() {
  try {
    return Number(localStorage.getItem(TARGET_KEY)) || null;
  } catch {
    return null;
  }
}

function saveTarget(id) {
  try {
    localStorage.setItem(TARGET_KEY, String(id));
  } catch {
    // Without storage the choice lasts until the page is left.
  }
}

function layout() {
  return `
    <h2 class="sr-only">${esc(t('page.articles'))}</h2>
    <section class="status" id="status" aria-live="polite"></section>
    <div class="ar" id="ar">
      <nav class="ar-side" id="side" aria-label="${esc(t('side.label'))}"></nav>
      <section class="ar-list" aria-labelledby="place-name">
        <div class="ar-head">
          <div class="ar-title">
            <button type="button" class="btn ghost small ar-sidebtn" data-act="side">${esc(t('side.open'))}</button>
            <h3 id="place-name"></h3>
            <span class="ar-count" id="place-count"></span>
          </div>
          <p class="ar-note" id="place-note"></p>
          <form class="ar-tools" id="tools" role="search">
            <input type="search" id="q" maxlength="200" autocomplete="off"
                   placeholder="${esc(t('search.hint'))}" aria-label="${esc(t('search.label'))}">
            <select id="sort" aria-label="${esc(t('filter.sort'))}"></select>
          </form>
          <form class="ar-ask" id="ask" hidden>
            <label class="sr-only" for="ask-q">${esc(t('ask.label'))}</label>
            <textarea id="ask-q" rows="2" maxlength="300" placeholder="${esc(t('ask.placeholder'))}"></textarea>
            <div class="ar-ask-row">
              <select id="ask-days" aria-label="${esc(t('ask.days'))}">
                ${[30, 90, 365, 3650].map((d) => `<option value="${d}"${d === 90 ? ' selected' : ''}>${esc(t(`ask.days.${d}`))}</option>`).join('')}
              </select>
              <button type="submit" class="btn small" id="ask-go">${esc(t('ask.submit'))}</button>
            </div>
          </form>
        </div>
        <div class="ar-rows" id="rows" aria-busy="true"></div>
      </section>
      <article class="ar-read" id="read" tabindex="-1"></article>
    </div>
    <div class="ar-toast" id="toast" role="status" hidden></div>`;
}

export function showArticles(root) {
  let state = readState();
  let place = parsePlace(state.place);
  let rows = [];            // the articles in the list, in order
  let total = 0;
  let page = 1;
  let tagLabel = null;      // the tag's name, when the place is a tag
  let latest = 0;           // the newest list request; older answers are ignored
  const side = { counts: null, topics: [], untopiced: null, windowDays: 30, sources: [], drafts: [], target: null,
    signals: [], signalsLatest: null };
  let topicsById = new Map();
  let overview = null;
  let checking = null;      // a check started from this page
  let undo = null;
  let followTimer = null;
  let searchTimer = null;
  let toastTimer = null;
  let sideTimer = null;
  // The YSO search under the box being typed in: a tag for the article, or a
  // term for the topic being edited.
  const terms = { timer: null, latest: 0, list: [], active: -1, input: null };
  // The topics view: what the topic being edited would bring.
  const tv = { preview: null, showDropped: false, creating: false };
  // Kysy artikkeleilta: the questions asked on this page, newest last, each
  // with its answer and articles; shown is the one on screen.
  const asked = { list: [], shown: -1, busy: false };
  let seenTimer = null;

  root.classList.add('wide');
  root.innerHTML = layout();
  const $ = (id) => root.querySelector(`#${id}`);
  const ar = $('ar');
  const status = $('status');
  const sideEl = $('side');
  const rowsEl = $('rows');
  const read = $('read');
  const toastEl = $('toast');
  const q = $('q');
  const sort = $('sort');

  // ---------- the column on the left ----------

  function renderSide() {
    sideEl.innerHTML = sideHtml({
      current: placeKey(place), counts: side.counts, topics: side.topics, untopiced: side.untopiced,
      sources: side.sources, drafts: side.drafts, target: side.target,
      signals: side.signals, signalsLatest: side.signalsLatest,
    });
  }

  async function loadSide({ sources = false } = {}) {
    const [topics, counts, issues, filters, signals] = await Promise.allSettled([
      api.get('/api/topics'),
      api.get('/api/items', { page: 1, per_page: 1 }),
      api.get('/api/issues'),
      sources || !side.sources.length ? api.get('/api/filters') : Promise.resolve(null),
      api.get('/api/signals'),
    ]);
    if (topics.status === 'fulfilled') {
      side.topics = topics.value.topics;
      side.untopiced = topics.value.untopiced;
      side.windowDays = topics.value.window_days ?? side.windowDays;
      topicsById = new Map(side.topics.map((x) => [x.id, x]));
    }
    if (counts.status === 'fulfilled') side.counts = counts.value.counts;
    if (issues.status === 'fulfilled') {
      side.drafts = issues.value.filter((i) => i.status === 'draft');
      const saved = readTarget();
      const newest = side.drafts.find((d) => d.current) || side.drafts[0];
      side.target = side.drafts.some((d) => d.id === saved) ? saved : (newest ? newest.id : null);
    }
    if (filters.status === 'fulfilled' && filters.value) side.sources = filters.value.sources;
    if (signals.status === 'fulfilled') {
      side.signals = signals.value.signals;
      side.signalsLatest = signals.value.latest;
    }
    renderSide();
    renderHead();
    // Never while a new topic's name is being typed.
    if (place.kind === 'topics' && !tv.creating) renderRows();
  }

  // The numbers in the column catch up shortly after a decision, in one go
  // rather than one request per click.
  function refreshSide() {
    clearTimeout(sideTimer);
    sideTimer = setTimeout(() => loadSide().catch(() => {}), 600);
  }

  // ---------- the list ----------

  function placeName() {
    if (place.kind === 'view') return place.view === 'inbox' ? t('place.inbox') : t(`view.${place.view}`);
    if (place.kind === 'none') return t('place.none');
    if (place.kind === 'topics') return t('place.topics');
    if (place.kind === 'ask') return t('place.ask');
    if (place.kind === 'topic') return topicsById.get(place.id)?.name ?? '…';
    if (place.kind === 'tag') return t('place.tag', { tag: tagLabel ?? '…' });
    if (place.kind === 'signal') return t('place.signal', { topic: side.signals.find((s) => s.id === place.id)?.topic ?? '…' });
    return side.sources.find((s) => s.id === place.id)?.name ?? '…';
  }

  function placeNote() {
    if (place.kind === 'view') return place.view === 'inbox' ? t('place.note.inbox', { days: side.windowDays }) : t(`note.${place.view}`);
    if (place.kind === 'none') return t('place.note.none');
    if (place.kind === 'topics') return t('place.note.topics');
    if (place.kind === 'ask') return t('place.note.ask');
    if (place.kind === 'topic') {
      const topic = topicsById.get(place.id);
      return topic ? t('place.note.topic', { terms: topic.tags.map((x) => x.label).join(', ') }) : '';
    }
    if (place.kind === 'tag') return t('place.note.tag', { tag: tagLabel ?? '…' });
    if (place.kind === 'signal') {
      const signal = side.signals.find((s) => s.id === place.id);
      return signal ? t('place.note.signal', { reason: signal.reason, from: date(signal.period_start), to: date(signal.period_end) }) : '';
    }
    return t('place.note.source');
  }

  function renderHead() {
    $('place-name').textContent = placeName();
    const counted = place.kind !== 'topics' && (place.kind !== 'ask' || asked.shown >= 0);
    $('place-count').textContent = counted ? tn('count', total, { n: number(total) }) : '';
    $('place-note').textContent = placeNote();
    $('tools').hidden = place.kind === 'topics' || place.kind === 'ask';
    $('ask').hidden = place.kind !== 'ask';
  }

  function dayOf(item) {
    return finnishDay(state.sort === 'published' ? (item.published_at || item.collected_at) : item.collected_at);
  }

  function emptyHtml() {
    if (state.q) {
      return `<div class="ar-empty"><p>${esc(t('results.none'))}</p>
        <button type="button" class="btn ghost small" data-act="clear-search">${esc(t('filter.clear'))}</button></div>`;
    }
    const key = place.kind === 'view'
      ? (place.view === 'inbox' ? 'place.empty.inbox' : `results.empty.${place.view}`)
      : `place.empty.${place.kind}`;
    return `<div class="ar-empty"><p>${esc(t(key))}</p></div>`;
  }

  function renderRows() {
    if (place.kind === 'topics') {
      rowsEl.innerHTML = topicRows(side.topics, Number(state.item) || null, { creating: tv.creating });
      return;
    }
    if (place.kind === 'ask') {
      rowsEl.innerHTML = askHtml() + rows.map((item, i) => articleRow(item, {
        selected: String(item.id) === state.item, topics: topicsById, number: i + 1,
      })).join('');
      return;
    }
    if (!rows.length) {
      rowsEl.innerHTML = emptyHtml();
      return;
    }
    let out = '';
    let last = '';
    for (const item of rows) {
      if (state.sort !== 'relevance') {
        const day = dayOf(item);
        if (day !== last) {
          out += `<h4 class="ar-day">${esc(dayHeading(day))}</h4>`;
          last = day;
        }
      }
      out += articleRow(item, { selected: String(item.id) === state.item, topics: topicsById });
    }
    if (rows.length < total) {
      out += `<p class="ar-more"><button type="button" class="btn ghost small" data-act="more">${esc(t('results.more'))}</button></p>`;
    }
    rowsEl.innerHTML = out;
  }

  function current() {
    if (place.kind === 'topics') return null;
    return rows.find((r) => String(r.id) === state.item) || null;
  }

  function currentTopic() {
    return place.kind === 'topics' ? side.topics.find((x) => String(x.id) === state.item) || null : null;
  }

  function renderReader({ focus = false } = {}) {
    if (place.kind === 'topics') {
      const topic = currentTopic();
      read.innerHTML = topic
        ? topicEditor(topic, tv.preview, { showDropped: tv.showDropped })
        : `<p class="ar-empty-read">${esc(t(side.topics.length ? 'topic.pick' : 'topic.none'))}</p>`;
      return;
    }
    const item = current();
    if (!item) {
      read.innerHTML = rows.length ? `<p class="ar-empty-read">${esc(t('reader.empty'))}</p>` : '';
      return;
    }
    const index = rows.indexOf(item);
    const target = side.drafts.find((d) => d.id === side.target);
    read.innerHTML = articleReader(item, {
      place: placeName(), index, total, topics: topicsById,
      canPrev: index > 0, canNext: index < rows.length - 1 || rows.length < total,
      target: target ? target.name : null,
    });
    read.scrollTop = 0;
    if (focus) read.focus({ preventScroll: true });
  }

  function setItem(id, { scroll = true, focus = false } = {}) {
    state.item = id ? String(id) : '';
    writeState(state);
    rowsEl.querySelectorAll('.ar-row').forEach((row) => row.setAttribute('aria-current', String(row.dataset.id === state.item)));
    renderReader({ focus });
    if (!id) ar.classList.remove('reading');
    const row = rowsEl.querySelector(`.ar-row[data-id="${state.item}"]`);
    if (row && scroll) row.scrollIntoView({ block: 'nearest' });
    seeLater(id);
  }

  // An article open for a moment is no longer new to this editor. Going
  // quickly past one with J does not count.
  function seeLater(id) {
    clearTimeout(seenTimer);
    const item = rows.find((r) => String(r.id) === String(id));
    if (!item || item.seen) return;
    seenTimer = setTimeout(async () => {
      if (state.item !== String(item.id)) return;
      try {
        await api.post(`/api/items/${item.id}/seen`);
      } catch {
        return;
      }
      item.seen = true;
      rowsEl.querySelector(`.ar-row[data-id="${item.id}"]`)?.classList.remove('unseen');
      if (side.counts && side.counts.unseen > 0 && !item.decision) {
        side.counts.unseen -= 1;
        renderSide();
      }
    }, 800);
  }

  // Opens an article the editor chose. On a phone the article takes the
  // screen, and Takaisin brings the list back.
  function openItem(id, { focus = false } = {}) {
    setItem(id, { scroll: !NARROW.matches, focus: focus || NARROW.matches });
    if (id && NARROW.matches) {
      ar.classList.add('reading');
      window.scrollTo({ top: ar.getBoundingClientRect().top + window.scrollY - 8 });
    }
  }

  async function loadList({ append = false, keep = null } = {}) {
    if (place.kind === 'topics') return loadTopics();
    const mine = ++latest;
    const nextPage = append ? page + 1 : 1;
    rowsEl.setAttribute('aria-busy', 'true');
    try {
      const params = { ...placeParams(place), sort: state.sort, page: nextPage, per_page: PER_PAGE };
      if (state.q) params.q = state.q;
      const data = await api.get('/api/items', params);
      if (mine !== latest) return false;
      page = nextPage;
      total = data.total;
      tagLabel = data.tag_label ?? tagLabel;
      rows = append ? [...rows, ...data.items.filter((x) => !rows.some((r) => r.id === x.id))] : data.items;
      renderHead();
      renderRows();
      // The article asked for stays open; otherwise the first one opens, on
      // a wide screen. On a phone the list comes first.
      const wanted = keep ?? state.item;
      if (rows.some((r) => String(r.id) === String(wanted))) setItem(wanted, { scroll: !append });
      else if (!append) setItem(!NARROW.matches && rows.length ? rows[0].id : null);
      return true;
    } catch (e) {
      if (mine !== latest || e.status === 401) return false;
      rowsEl.innerHTML = `<div class="ar-empty problem"><p>${esc(t('error.load'))} ${esc(e.message)}</p>
        <button type="button" class="btn ghost small" data-act="retry">${esc(t('error.retry'))}</button></div>`;
      return false;
    } finally {
      if (mine === latest) rowsEl.removeAttribute('aria-busy');
    }
  }

  function goPlace(key) {
    state = { ...state, place: key, item: '' };
    place = parsePlace(key);
    tagLabel = null;
    rows = [];
    total = 0;
    writeState(state);
    ar.classList.remove('side-open', 'reading');
    renderSide();
    renderHead();
    rowsEl.innerHTML = '';
    read.innerHTML = '';
    show();
  }

  // The place's list: articles, or in the topics view the topics.
  function show(options = {}) {
    if (place.kind === 'topics') return loadTopics();
    if (place.kind === 'ask') return showAsk();
    return loadList(options);
  }

  // ---------- asking the articles ----------

  // The answer on screen, and its articles as the list.
  function showAsk({ open = true } = {}) {
    const shown = asked.list[asked.shown];
    rows = shown ? shown.sources : [];
    total = rows.length;
    renderHead();
    renderRows();
    // The first article opens beside the answer, and the answer stays in
    // view from its start.
    if (!rows.some((r) => String(r.id) === state.item)) {
      setItem(open && !NARROW.matches && rows.length ? rows[0].id : null, { scroll: false });
    } else renderReader();
    rowsEl.scrollTop = 0;
    if (!shown && !NARROW.matches) $('ask-q').focus({ preventScroll: true });
  }

  async function askQuestion(question) {
    const text = question.trim();
    if (text.length < 3 || asked.busy) return;
    asked.busy = true;
    $('ask-go').disabled = true;
    renderRows();
    try {
      const found = await api.post('/api/ask', { question: text, days: Number($('ask-days').value) || 90 });
      asked.list.push({ question: text, ...found });
      asked.shown = asked.list.length - 1;
      state.item = '';
    } catch (e) {
      toast(e.message);
    } finally {
      asked.busy = false;
      $('ask-go').disabled = false;
    }
    if (place.kind === 'ask') showAsk();
  }

  // The answer's [1], [2]… as buttons that open those articles.
  function answerHtml(a) {
    const cite = (whole, n) => {
      const source = a.sources[Number(n) - 1];
      if (!source) return whole;
      const label = t('ask.cite', { n, title: source.title_fi || source.title });
      return `<button type="button" class="ar-cite" data-act="cite" data-id="${source.id}" title="${esc(label)}" aria-label="${esc(label)}">${n}</button>`;
    };
    return esc(a.answer).split(/\n\s*\n/).map((p) => p.trim()).filter(Boolean)
      .map((p) => `<p>${p.replace(/\[(\d{1,2})\]/g, cite).replace(/\n/g, '<br>')}</p>`).join('');
  }

  function askHtml() {
    const shown = asked.list[asked.shown];
    let out = '';
    if (asked.busy) out += `<p class="ask-busy" role="status">${esc(t('ask.busy'))}</p>`;
    if (!shown && !asked.busy) {
      out += `<div class="ask-intro"><p>${esc(t('ask.intro'))}</p><p class="ask-try">${esc(t('ask.try'))}</p>
        <div class="ask-examples">${['ask.example1', 'ask.example2', 'ask.example3'].map((k) => `
          <button type="button" class="ask-example" data-act="ask-example" data-q="${esc(t(k))}">${esc(t(k))}</button>`).join('')}</div></div>`;
    }
    if (shown && !asked.busy) {
      const usage = aiUsage(shown);
      out += `<section class="ask-answer" aria-label="${esc(t('ask.answer'))}">
        <p class="ask-q">${esc(shown.question)}</p>
        ${shown.answer === null ? `<p class="ask-none">${esc(t('ask.none'))}</p>` : `${answerHtml(shown)}
        <p class="ask-meta">${esc(tn('ask.meta', shown.sources.length))}${usage ? ` · ${esc(usage)}` : ''}</p>
        <p class="ask-meta">${esc(t('ask.check'))}</p>`}
      </section>`;
    }
    const earlier = asked.list.map((a, i) => (i === asked.shown ? '' : `
      <button type="button" class="ask-earlier-q" data-act="ask-show" data-n="${i}">${esc(a.question)}</button>`)).join('');
    if (earlier.trim()) out += `<div class="ask-earlier"><p class="ask-earlier-h">${esc(t('ask.earlier'))}</p>${earlier}</div>`;
    if (shown && shown.sources.length && !asked.busy) out += `<h4 class="ar-day">${esc(t('ask.sources'))}</h4>`;
    return `<div class="ask">${out}</div>`;
  }

  // ---------- editing topics ----------

  async function loadTopics() {
    tv.creating = false;
    await loadSide().catch(() => {});
    renderHead();
    renderRows();
    const wanted = side.topics.find((x) => String(x.id) === state.item) || (!NARROW.matches && side.topics[0]);
    if (wanted) selectTopic(wanted.id, { open: false });
    else renderReader();
  }

  async function selectTopic(id, { open = true } = {}) {
    state.item = String(id);
    writeState(state);
    tv.preview = null;
    tv.showDropped = false;
    rowsEl.querySelectorAll('.tp-row').forEach((row) => row.setAttribute('aria-current', String(row.dataset.topicRow === state.item)));
    renderReader();
    if (open && NARROW.matches) {
      ar.classList.add('reading');
      window.scrollTo({ top: ar.getBoundingClientRect().top + window.scrollY - 8 });
    }
    await loadPreview();
  }

  async function loadPreview() {
    const id = state.item;
    try {
      const found = await api.get(`/api/topics/${id}/preview`);
      if (place.kind !== 'topics' || state.item !== id) return;
      tv.preview = found;
      renderReaderKeepingFocus();
    } catch (e) {
      toast(e.message);
    }
  }

  // Draws the editor again, then puts the focus and the text being typed
  // back where they were, so a count arriving never interrupts typing.
  function renderReaderKeepingFocus() {
    const focused = document.activeElement && read.contains(document.activeElement) ? document.activeElement.id : null;
    const typed = focused ? document.getElementById(focused)?.value : null;
    renderReader();
    if (!focused) return;
    const again = document.getElementById(focused);
    if (!again) return;
    if (typed !== null && typed !== undefined && 'value' in again) again.value = typed;
    again.focus({ preventScroll: true });
  }

  function putTopic(updated) {
    const at = side.topics.findIndex((x) => x.id === updated.id);
    if (at >= 0) side.topics[at] = updated;
    topicsById = new Map(side.topics.map((x) => [x.id, x]));
  }

  async function createTopic(name) {
    try {
      const made = await api.post('/api/topics', { name });
      tv.creating = false;
      await loadSide();
      await selectTopic(made.id);
      toast(t('topic.created', { name: made.name }));
      read.querySelector('#addterm')?.focus();
    } catch (e) {
      toast(e.message);
    }
  }

  async function changeTopic(changes) {
    const topic = currentTopic();
    if (!topic) return;
    try {
      const updated = await api.patch(`/api/topics/${topic.id}`, changes);
      putTopic(updated);
      renderRows();
      refreshSide();
      if ('name' in changes) {
        const note = read.querySelector('#tp-saved');
        if (note) note.hidden = false;
      }
      if ('followed' in changes) {
        toast(t(changes.followed ? 'toast.followed' : 'toast.unfollowed', { topic: updated.name }));
        loadPreview();
      }
    } catch (e) {
      toast(e.message);
      renderReader();
    }
  }

  async function addTerm(uri) {
    const topic = currentTopic();
    if (!topic || !uri) return;
    try {
      const updated = await api.post(`/api/topics/${topic.id}/terms`, { uri });
      putTopic(updated);
      const added = updated.tags.find((g) => g.uri === uri);
      renderRows();
      renderReader();
      toast(t('topic.termAdded', { term: added ? added.label : '' }));
      read.querySelector('#addterm')?.focus();
      refreshSide();
      loadPreview();
    } catch (e) {
      toast(e.message);
    }
  }

  async function removeTerm(tagId) {
    const topic = currentTopic();
    const term = topic?.tags.find((g) => String(g.id) === String(tagId));
    if (!topic || !term) return;
    try {
      putTopic(await api.del(`/api/topics/${topic.id}/terms/${term.id}`));
      renderRows();
      renderReader();
      toast(t('topic.termRemoved', { term: term.label }), () => addTerm(term.uri));
      refreshSide();
      loadPreview();
    } catch (e) {
      toast(e.message);
    }
  }

  async function deleteTopic() {
    const topic = currentTopic();
    if (!topic) return;
    if (!(await confirmDialog(t('topic.deleteConfirm', { name: topic.name }), { danger: true, okLabel: t('topic.delete') }))) return;
    try {
      await api.del(`/api/topics/${topic.id}`);
      toast(t('topic.deleted', { name: topic.name }));
      state.item = '';
      ar.classList.remove('reading');
      await loadTopics();
    } catch (e) {
      toast(e.message);
    }
  }

  async function move(step) {
    const index = rows.findIndex((r) => String(r.id) === state.item);
    if (index + step >= rows.length && rows.length < total) await loadList({ append: true, keep: state.item });
    const next = Math.max(0, Math.min(rows.length - 1, index + step));
    if (rows[next] && next !== index) openItem(rows[next].id);
  }

  // ---------- deciding ----------

  function showError(message) {
    const box = read.querySelector('.row-error');
    if (box) {
      box.textContent = message;
      box.hidden = false;
    } else {
      toast(message);
    }
  }

  // Asks n8n to look for signals now. A run takes a few minutes, so the column
  // looks again every half minute for a while and shows what changed.
  let signalPoll = null;
  async function findSignals(button) {
    button.disabled = true;
    try {
      await api.post('/api/signals/run');
      toast(t('side.findingSignals'));
    } catch (e) {
      toast(e.message);
      button.disabled = false;
      return;
    }
    const before = JSON.stringify(side.signals.map((x) => [x.id, x.articles]));
    let tries = 0;
    clearInterval(signalPoll);
    signalPoll = setInterval(async () => {
      tries += 1;
      try {
        const found = await api.get('/api/signals');
        if (JSON.stringify(found.signals.map((x) => [x.id, x.articles])) !== before || tries >= 40) {
          clearInterval(signalPoll);
          loadSide().catch(() => {});
        }
      } catch {
        clearInterval(signalPoll);
      }
    }, 30000);
  }

  function toast(text, action = null) {
    undo = action;
    toastEl.innerHTML = `<span>${esc(text)}</span>${action ? `<button type="button" data-act="undo">${esc(t('toast.undo'))}</button>` : ''}`;
    toastEl.hidden = false;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => {
      toastEl.hidden = true;
      undo = null;
    }, 6000);
  }

  // Puts an answer from the API into the list. An article that no longer
  // belongs here leaves the list, and after a decision the next one opens.
  function applyItem(updated, { advance = false } = {}) {
    const index = rows.findIndex((r) => r.id === updated.id);
    if (index < 0) return;
    const stays = belongs(updated, place);
    if (stays) rows[index] = updated;
    else {
      rows.splice(index, 1);
      total = Math.max(0, total - 1);
    }
    renderHead();
    renderRows();
    let next = stays ? updated : null;
    if (advance || !stays) next = rows[stays ? index + 1 : index] || rows[rows.length - 1] || null;
    if (advance) openItem(next ? next.id : null);
    else setItem(next ? next.id : null, { scroll: false });
    if (rows.length < total && index >= rows.length - 3) loadList({ append: true, keep: state.item });
  }

  async function restore(item, before, index) {
    const body = before.decision
      ? { decision: before.decision, section: before.section, issue_id: before.issue ?? undefined }
      : { decision: null };
    try {
      const restored = await api.put(`/api/items/${item.id}/decision`, body);
      const at = rows.findIndex((r) => r.id === restored.id);
      if (at >= 0) rows[at] = restored;
      else if (belongs(restored, place)) {
        rows.splice(Math.min(index, rows.length), 0, restored);
        total += 1;
      }
      renderHead();
      renderRows();
      openItem(restored.id);
      refreshSide();
    } catch (e) {
      toast(e.message);
    }
  }

  async function decide(decision, section = null) {
    const item = current();
    if (!item || (item.decision === 'picked' && item.pick_issue_status === 'sent')) return;
    if (decision === 'picked' && item.decision === 'picked' && item.pick_section === section) return;
    if (decision && decision !== 'picked' && item.decision === decision) return;
    const before = { decision: item.decision, section: item.pick_section, issue: item.pick_issue_id };
    const index = rows.indexOf(item);
    const body = { decision, section };
    if (decision === 'picked') {
      // Moving a pick keeps it in its newsletter; a new pick goes where chosen.
      const issue = item.decision === 'picked' ? item.pick_issue_id : side.target;
      if (issue) body.issue_id = issue;
    }
    read.querySelectorAll('.rd-decide button').forEach((b) => { b.disabled = true; });
    try {
      const updated = await api.put(`/api/items/${item.id}/decision`, body);
      const name = section ? t(`section.${section}`) : '';
      const text = decision === 'picked'
        ? t(item.status === 'on_request' ? 'toast.pickedThesis' : 'toast.picked', { section: name })
        : t({ later: 'toast.later', dismissed: 'toast.dismissed' }[decision] || 'toast.cleared');
      applyItem(updated, { advance: Boolean(decision) });
      toast(text, () => restore(updated, before, index));
      refreshSide();
    } catch (e) {
      read.querySelectorAll('.rd-decide button').forEach((b) => { b.disabled = false; });
      showError(e.message);
    }
  }

  async function summarise() {
    const item = current();
    if (!item) return;
    try {
      applyItem(await api.post(`/api/items/${item.id}/summarise`));
      refreshSide();
    } catch (e) {
      showError(e.message);
    }
  }

  // ---------- tags and topics ----------

  async function addTag(uri) {
    const item = current();
    if (!item || !uri) return;
    try {
      const updated = await api.post(`/api/items/${item.id}/tags`, { uri });
      const added = updated.tags.find((g) => g.uri === uri);
      applyItem(updated);
      toast(t('toast.tagAdded', { tag: added ? added.label : '' }));
      refreshSide();
      read.querySelector('#addtag')?.focus();
    } catch (e) {
      toast(e.message);
    }
  }

  async function removeTag(tagId) {
    const item = current();
    const tag = item?.tags.find((g) => String(g.id) === String(tagId));
    if (!item || !tag) return;
    try {
      applyItem(await api.del(`/api/items/${item.id}/tags/${tag.id}`));
      toast(t('toast.tagRemoved', { tag: tag.label }), () => addTag(tag.uri));
      refreshSide();
    } catch (e) {
      toast(e.message);
    }
  }

  async function follow(topicId, followed) {
    const topic = topicsById.get(Number(topicId));
    try {
      await api.put(`/api/topics/${topicId}/follow`, { followed });
      toast(t(followed ? 'toast.followed' : 'toast.unfollowed', { topic: topic ? topic.name : '' }));
      await loadSide();
      // The theses of a followed topic come to Uudet, so that list changes.
      if (place.kind === 'view' && place.view === 'inbox') loadList({ keep: state.item });
    } catch (e) {
      toast(e.message);
    }
  }

  // The boxes for a tag or a topic term ask YSO as the editor types, through
  // the dashboard. Whichever box is being typed in gets the list under it.
  function termsBox() {
    const input = terms.input && read.contains(terms.input) ? terms.input : null;
    return { input, list: input ? read.querySelector(`#${input.id}-list`) : null };
  }

  function showTerms() {
    const { input, list } = termsBox();
    if (!input || !list) return;
    list.innerHTML = termOptions(terms.list, terms.active);
    list.hidden = false;
    input.setAttribute('aria-expanded', 'true');
    if (terms.active >= 0) input.setAttribute('aria-activedescendant', `addtag-opt-${terms.active}`);
    else input.removeAttribute('aria-activedescendant');
  }

  function hideTerms() {
    clearTimeout(terms.timer);
    terms.latest += 1;
    const { input, list } = termsBox();
    if (list) list.hidden = true;
    if (input) {
      input.setAttribute('aria-expanded', 'false');
      input.removeAttribute('aria-activedescendant');
    }
    terms.list = [];
    terms.active = -1;
  }

  function searchTerms(text) {
    clearTimeout(terms.timer);
    const words = text.trim();
    if (words.length < 2) {
      hideTerms();
      return;
    }
    terms.timer = setTimeout(async () => {
      const mine = ++terms.latest;
      try {
        const found = await api.get('/api/yso', { q: words });
        if (mine !== terms.latest) return;
        terms.list = found;
        terms.active = found.length ? 0 : -1;
        showTerms();
      } catch (e) {
        if (mine === terms.latest) toast(e.message);
      }
    }, 250);
  }

  function chooseTerm(uri) {
    const { input } = termsBox();
    const kind = input ? input.dataset.yso : 'tag';
    hideTerms();
    if (input) input.value = '';
    if (kind === 'term') addTerm(uri);
    else addTag(uri);
  }

  // ---------- the status line ----------

  function showStatus(extra = {}) {
    if (overview) status.innerHTML = statusLines(overview, { checking: Boolean(checking), view: placeKey(place), ...extra });
  }

  async function loadOverview(done = '') {
    try {
      overview = await api.get('/api/overview');
      showStatus({ done });
      fit();
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
    showStatus();
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
      showStatus({ done: added ? tn('status.checkDone', added) : t('status.checkDoneNothing') });
      loadSide({ sources: true }).catch(() => {});
      show({ keep: state.item });
    }, 3000);
  }

  // ---------- size ----------

  // On a wide screen the three columns fill the window under the status line
  // and each scrolls on its own. On a phone the page scrolls as usual.
  function fit() {
    if (NARROW.matches) {
      ar.style.height = '';
      return;
    }
    const top = ar.getBoundingClientRect().top + window.scrollY;
    ar.style.height = `${Math.max(520, window.innerHeight - top - 16)}px`;
  }

  // ---------- events ----------

  root.addEventListener('mousedown', (event) => {
    // Picking an option must not take the focus from the box first.
    if (event.target.closest('.addtag-opt')) event.preventDefault();
  });

  root.addEventListener('click', (event) => {
    const option = event.target.closest('.addtag-opt');
    if (option) {
      chooseTerm(option.dataset.uri);
      return;
    }
    const target = event.target.closest('[data-place], [data-act], [data-topic-row], .ar-row');
    if (!target) return;
    if (target.dataset.place) {
      goPlace(target.dataset.place);
      return;
    }
    if (target.dataset.topicRow) {
      selectTopic(Number(target.dataset.topicRow));
      return;
    }
    if (target.classList.contains('ar-row')) {
      openItem(target.dataset.id);
      return;
    }
    const { act } = target.dataset;
    if (act === 'pick') decide('picked', target.dataset.section);
    else if (act === 'later') decide('later');
    else if (act === 'dismiss') decide('dismissed');
    else if (act === 'clear') decide(null);
    else if (act === 'summarise') summarise();
    else if (act === 'prev') move(-1);
    else if (act === 'next') move(1);
    else if (act === 'back') {
      ar.classList.remove('reading');
      rowsEl.querySelector(`.ar-row[data-id="${state.item}"]`)?.scrollIntoView({ block: 'center' });
    } else if (act === 'topic') goPlace(`topic:${target.dataset.topic}`);
    else if (act === 'tag') goPlace(`tag:${target.dataset.tag}`);
    else if (act === 'untag') removeTag(target.dataset.tag);
    else if (act === 'follow') follow(target.dataset.topic, true);
    else if (act === 'unfollow') follow(target.dataset.topic, false);
    else if (act === 'side') ar.classList.toggle('side-open');
    else if (act === 'more') loadList({ append: true, keep: state.item });
    else if (act === 'retry') show();
    else if (act === 'topic-new') {
      tv.creating = true;
      renderRows();
      rowsEl.querySelector('#tp-new-name')?.focus();
    } else if (act === 'topic-new-cancel') {
      tv.creating = false;
      renderRows();
    } else if (act === 'term-remove') removeTerm(target.dataset.tag);
    else if (act === 'toggle-dropped') {
      tv.showDropped = !tv.showDropped;
      renderReader();
    } else if (act === 'topic-delete') deleteTopic();
    else if (act === 'clear-search') {
      q.value = '';
      applySearch();
    } else if (act === 'undo' && undo) {
      const action = undo;
      undo = null;
      toastEl.hidden = true;
      action();
    } else if (act === 'check') startCheck(target);
    else if (act === 'find-signals') findSignals(target);
    else if (act === 'view') goPlace(target.dataset.view);
    else if (act === 'cite') openItem(target.dataset.id);
    else if (act === 'ask-show') {
      asked.shown = Number(target.dataset.n);
      state.item = '';
      showAsk();
    } else if (act === 'ask-example') {
      $('ask-q').value = target.dataset.q;
      askQuestion(target.dataset.q);
    }
  });

  root.addEventListener('change', (event) => {
    if (event.target.id === 'pick-target') {
      side.target = Number(event.target.value);
      saveTarget(side.target);
      renderSide();
      renderReader();
    } else if (event.target.id === 'tp-follow') {
      changeTopic({ followed: event.target.checked });
    } else if (event.target.id === 'tp-name') {
      const name = event.target.value.trim();
      const topic = currentTopic();
      if (topic && name && name !== topic.name) changeTopic({ name });
    }
  });

  root.addEventListener('submit', (event) => {
    if (event.target.id === 'ask') {
      event.preventDefault();
      askQuestion($('ask-q').value);
      return;
    }
    if (event.target.id === 'tp-new') {
      event.preventDefault();
      const name = event.target.querySelector('#tp-new-name').value.trim();
      if (name) createTopic(name);
    } else if (event.target.id === 'tp-name-form') {
      event.preventDefault();
      event.target.querySelector('#tp-name').blur();
    }
  });

  root.addEventListener('input', (event) => {
    if (event.target.dataset.yso) {
      terms.input = event.target;
      searchTerms(event.target.value);
    }
    if (event.target.id === 'tp-name') {
      const note = read.querySelector('#tp-saved');
      if (note) note.hidden = true;
    }
  });

  // Enter asks; Shift+Enter starts a new line in the question.
  $('ask-q').addEventListener('keydown', (event) => {
    if (event.key === 'Enter' && !event.shiftKey && !event.isComposing) {
      event.preventDefault();
      askQuestion($('ask-q').value);
    }
  });

  root.addEventListener('focusout', (event) => {
    if (event.target.dataset && event.target.dataset.yso) hideTerms();
  });

  // Keys for going through the list fast. Never while typing.
  function onKey(event) {
    if (event.target.dataset && event.target.dataset.yso) {
      if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
        if (!terms.list.length) return;
        event.preventDefault();
        terms.active = (terms.active + (event.key === 'ArrowDown' ? 1 : -1) + terms.list.length) % terms.list.length;
        showTerms();
      } else if (event.key === 'Enter') {
        event.preventDefault();
        const chosen = terms.list[terms.active];
        if (chosen) chooseTerm(chosen.uri);
      } else if (event.key === 'Escape') {
        hideTerms();
      }
      return;
    }
    if (event.metaKey || event.ctrlKey || event.altKey || event.isComposing) return;
    if (event.target.closest('input, select, textarea, [contenteditable="true"]')) return;
    if (document.querySelector('dialog[open]')) return;
    const key = event.key.toLowerCase();
    if (key === 'escape') {
      ar.classList.remove('side-open');
      return;
    }
    if (place.kind === 'topics') return;
    if (key === 'j') move(1);
    else if (key === 'k') move(-1);
    else if (!current()) return;
    else if (['1', '2', '3', '4'].includes(key)) decide('picked', SECTIONS[Number(key) - 1]);
    else if (key === 'l') decide('later');
    else if (key === 'x') decide('dismissed');
    else return;
    event.preventDefault();
  }
  document.addEventListener('keydown', onKey);

  function fillSort() {
    sort.innerHTML = SORTS.map((s) => `<option value="${s}"${s === 'relevance' && !state.q ? ' disabled' : ''}>${esc(t(`sort.${s}`))}</option>`).join('');
    sort.value = state.sort;
  }

  function applySearch() {
    const text = q.value.trim();
    if (text === state.q) return;
    state.q = text;
    // Starting a search puts the best matches first, unless an order was chosen.
    if (text && state.sort === DEFAULTS.sort) state.sort = 'relevance';
    if (!text && state.sort === 'relevance') state.sort = DEFAULTS.sort;
    fillSort();
    state.item = '';
    writeState(state);
    loadList();
  }

  q.addEventListener('input', () => {
    clearTimeout(searchTimer);
    searchTimer = setTimeout(applySearch, 350);
  });
  $('tools').addEventListener('submit', (event) => {
    event.preventDefault();
    clearTimeout(searchTimer);
    applySearch();
  });
  sort.addEventListener('change', () => {
    state.sort = sort.value;
    writeState(state);
    loadList({ keep: state.item });
  });

  function onHash() {
    const next = readState();
    if (next.place === state.place && next.q === state.q && next.sort === state.sort) {
      if (next.item !== state.item && rows.some((r) => String(r.id) === next.item)) setItem(next.item);
      return;
    }
    state = next;
    place = parsePlace(state.place);
    q.value = state.q;
    fillSort();
    renderSide();
    show();
  }
  window.addEventListener('hashchange', onHash);
  window.addEventListener('resize', fit);
  NARROW.addEventListener('change', fit);

  // An open page keeps its status line and its numbers current, without
  // moving the list under the editor's eyes.
  const refresh = setInterval(() => {
    if (checking || document.visibilityState !== 'visible') return;
    loadOverview();
    loadSide().catch(() => {});
  }, 2 * 60000);

  writeState(state);
  q.value = state.q;
  fillSort();
  renderSide();
  renderHead();
  fit();
  loadOverview();
  loadSide({ sources: true }).catch(() => {}).finally(() => show());

  return {
    leave() {
      clearTimeout(followTimer);
      clearTimeout(searchTimer);
      clearTimeout(toastTimer);
      clearTimeout(sideTimer);
      clearTimeout(terms.timer);
      clearTimeout(seenTimer);
      clearInterval(refresh);
      clearInterval(signalPoll);
      window.removeEventListener('hashchange', onHash);
      window.removeEventListener('resize', fit);
      NARROW.removeEventListener('change', fit);
      document.removeEventListener('keydown', onKey);
      root.classList.remove('wide');
    },
  };
}
