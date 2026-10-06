// The articles page: a column of topics and views, the list, and the article
// being read. The editor reads down the list and decides with one click or a
// key, and the next article opens by itself. How the parts look is in
// components/article.js and components/side.js. Kysy artikkeleilta is a
// place too: a question, the AI's answer, and the articles it is from as the
// list, each opening in the reader like any other: an answer's articles can
// be added to the newsletter from it, the AI suggests what to ask next, and
// each editor's questions are kept for asking again. Tapahtumakalenteri is a
// place as well, the events by month, and so is a section's suggestions,
// what a newsletter's page opens from "3 waiting".
// Jira: DM42-80, DM42-31, DM42-40, DM42-37

import { api } from '../api.js';
import { pageTitle, t, tn } from '../texts.js';
import { aiUsage, date, esc, number, finnishDay, safeUrl } from '../format.js';
import { emptyState } from '../ui/empty.js';
import { openMenu } from '../ui/menu.js';
import { addMonths, calendarHtml, itemsInOrder, thisMonth } from '../components/calendar.js';
import { articleRow, articleReader, dayHeading, offerBox, termOptions, SECTIONS } from '../components/article.js';
import { colourOf, sideHtml } from '../components/side.js';
import { topicRows, topicEditor } from '../components/topics.js';
import { statusLines } from '../components/status.js';
import { confirmDialog, modal } from '../ui/dialogs.js';
import { isLive, onLive } from '../live.js';
import { fileCounts, showDriveFiles } from '../components/driveFiles.js';
import { icon } from '../ui/icons.js';

// The lists of the editors' own decisions and of what the AI did. A topic, a
// tag, a source, a signal or "no topic" is a place too: topic:3, tag:12,
// source:5, signal:7, none. ask is asking the articles a question.
// topics is where the topics themselves are edited, events the calendar, and
// suggested:events the articles in Uudet suggested for that section.
const VIEWS = ['inbox', 'picked', 'later', 'dismissed', 'used', 'waiting', 'skipped', 'attention', 'all'];
const SORTS = ['collected', 'published', 'relevance'];
const DEFAULTS = { place: 'inbox', q: '', sort: 'collected', item: '', month: '' };
const PER_PAGE = 50;
// Which newsletter picks go into, remembered in this browser.
const TARGET_KEY = 'dfp.pickTarget';
// Kysy artikkeleilta keeps its conversation, the last 15 questions, for as
// long as the browser tab is open.
const ASK_KEY = 'dfp.ask';
const ASK_KEEP = 15;
const ASK_DAYS = [30, 90, 365, 3650];
const NARROW = window.matchMedia('(max-width: 760px)');

const SECTION_KEYS = ['own_news', 'events', 'member_news', 'highlights', 'training'];

function parsePlace(text) {
  const [kind, raw, extra] = String(text || '').split(':');
  if (extra === undefined && raw === undefined && VIEWS.includes(kind)) return { kind: 'view', view: kind };
  if (['none', 'topics', 'ask', 'events'].includes(kind) && raw === undefined) return { kind };
  if (kind === 'suggested' && extra === undefined && SECTION_KEYS.includes(raw)) return { kind, section: raw };
  const id = Number(raw);
  if (extra === undefined && ['topic', 'tag', 'source', 'signal'].includes(kind) && Number.isInteger(id) && id > 0) return { kind, id };
  return { kind: 'view', view: 'inbox' };
}

function placeKey(place) {
  if (place.kind === 'view') return place.view;
  if (['none', 'topics', 'ask', 'events'].includes(place.kind)) return place.kind;
  if (place.kind === 'suggested') return `suggested:${place.section}`;
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
// An answer's articles and the calendar's stay, whatever is decided about
// them; a section's suggestions are Uudet, and go once decided.
function belongs(item, place) {
  if (place.kind === 'ask' || place.kind === 'events') return true;
  if (place.kind === 'suggested') return !item.decision;
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

function hashOf(state) {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(state)) {
    if (value && value !== DEFAULTS[key]) params.set(key, value);
  }
  return params.toString() ? `#/?${params}` : '#/';
}

function writeState(state) {
  const hash = hashOf(state);
  if (location.hash !== hash) history.replaceState(null, '', hash);
}

function readTarget() {
  try {
    return Number(localStorage.getItem(TARGET_KEY)) || null;
  } catch {
    return null;
  }
}

// Also from the newsletter pages: a newsletter just made, or the one whose
// "Valitse artikkeleita" was pressed, is where the next picks go.
export function saveTarget(id) {
  try {
    localStorage.setItem(TARGET_KEY, String(id));
  } catch {
    // Without storage the choice lasts until the page is left.
  }
}

function layout() {
  return `
    <h1 class="sr-only">${esc(t('page.articles'))}</h1>
    <div class="status" id="status"></div>
    <p class="sr-only" id="status-said" role="status"></p>
    <div class="ar" id="ar">
      <nav class="ar-side" id="side" aria-label="${esc(t('side.label'))}"></nav>
      <section class="ar-list" aria-labelledby="place-name">
        <nav class="ar-places" id="places" aria-label="${esc(t('places.label'))}"></nav>
        <div class="ar-head">
          <div class="ar-title">
            <h2 id="place-name"></h2>
            <span class="ar-count" id="place-count"></span>
            <button type="button" class="btn ghost small ask-new" id="ask-new" data-act="ask-new" hidden>${icon('plus', 16)}<span>${esc(t('ask.new'))}</span></button>
            <button type="button" class="btn ghost small ar-list-drive" id="list-drive" data-act="list-drive" hidden
              aria-label="${esc(t('driveList.button'))}" title="${esc(t('driveList.button'))}">${icon('save', 16)}<span>${esc(t('driveList.button'))}</span></button>
          </div>
          <p class="ar-note" id="place-note"></p>
          <p class="ar-drive-line" id="drive-line" hidden></p>
          <form class="ar-tools" id="tools" role="search">
            <input type="search" id="q" maxlength="200" autocomplete="off"
                   placeholder="${esc(t('search.hint'))}" aria-label="${esc(t('search.label'))}">
            <select id="sort" aria-label="${esc(t('filter.sort'))}"></select>
          </form>
        </div>
        <button type="button" class="ar-fresh" id="fresh" data-act="fresh" hidden></button>
        <div class="ar-rows" id="rows" aria-busy="true"></div>
        <form class="chat-compose" id="ask" hidden>
          <label class="sr-only" for="ask-q">${esc(t('ask.label'))}</label>
          <div class="chat-box">
            <textarea id="ask-q" rows="1" maxlength="300" placeholder="${esc(t('ask.placeholder'))}"></textarea>
            <div class="chat-box-row">
              <span class="chat-range">${icon('clock', 16)}<select id="ask-days" aria-label="${esc(t('ask.days'))}">
                ${ASK_DAYS.map((d) => `<option value="${d}"${d === 90 ? ' selected' : ''}>${esc(t(`ask.days.${d}`))}</option>`).join('')}
              </select></span>
              <span class="chat-count" id="ask-count" aria-live="polite"></span>
              <button type="submit" class="btn small chat-send" id="ask-go" disabled>${icon('send', 16)}<span>${esc(t('ask.submit'))}</span></button>
            </div>
          </div>
          <p class="chat-alone">${esc(t('ask.memory'))}</p>
        </form>
      </section>
      <article class="ar-read" id="read" tabindex="-1"></article>
    </div>
    <div class="ar-toast" id="toast" role="status" hidden></div>`;
}

export function showArticles(root, { user = null } = {}) {
  const admin = Boolean(user && user.role === 'admin');
  let state = readState();
  let place = parsePlace(state.place);
  let rows = [];            // the articles in the list, in order
  let total = 0;
  let page = 1;
  let tagLabel = null;      // the tag's name, when the place is a tag
  let latest = 0;           // the newest list request; older answers are ignored
  const side = { counts: null, topics: [], untopiced: null, windowDays: 30, sources: [], drafts: [], target: null,
    signals: [], signalsLatest: null, upcoming: null };
  // Tapahtumakalenteri: the month shown and its events.
  const cal = { month: null, items: [], latest: 0 };
  // Kysy artikkeleilta: the editor's questions asked before.
  let recent = [];
  let recentAsked = false;
  let topicsById = new Map();
  let overview = null;
  let checking = null;      // a check started from this page
  let failedOpen = false;   // the failed sources' details are open
  let statusNote = null;    // { kind, text } under the bar until the next refresh
  let statusHtml = '';
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
  const asked = { list: loadAsked(), busy: false, pending: null };
  let seenTimer = null;
  let readingStep = false;  // the history step a phone's open article added
  // Sources whose last three articles went to another section than the one
  // suggested; the first is asked about above the sections.
  let offers = [];
  let offerBusy = false;
  // The association's Drive folder: whether it is in use and saving works
  // (GET /api/drive), and in its own place, what became of its files.
  let drive = null;
  let driveFiles = null;
  // New articles that came into the list above what is on the screen.
  let fresher = 0;

  root.classList.add('wide');
  root.innerHTML = layout();
  const $ = (id) => root.querySelector(`#${id}`);
  const ar = $('ar');
  const status = $('status');
  const statusSaid = $('status-said');
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
      signals: side.signals, signalsLatest: side.signalsLatest, upcoming: side.upcoming, admin,
    });
    renderPlaces();
  }

  // The newsletter picks go into, and the day it is planned to go out:
  // what events and sign-up deadlines are measured against.
  function targetDraft() {
    return side.drafts.find((d) => d.id === side.target) || null;
  }

  function sendOn() {
    return targetDraft()?.planned_for || null;
  }

  // On a narrow screen the column on the left is folded away. This bar takes
  // its place at the top of the list: the editors' lists, Kysy and the
  // followed topics one tap away, and Valikko for the rest of the column.
  function renderPlaces() {
    const bar = $('places');
    const c = side.counts || {};
    const current = placeKey(place);
    const followed = side.topics.filter((x) => x.followed);
    const chip = (key, label, n) => `<button type="button" class="ar-place" data-place="${esc(key)}"
        aria-current="${key === current}">${label}${n ? `<span class="ar-place-n">${number(n)}</span>` : ''}</button>`;
    // A place the bar has no button for, such as a topic not followed or a
    // source, shows first, so the editor sees where they are.
    const listed = ['inbox', 'ask', 'events', 'picked', 'later', 'dismissed', ...followed.map((x) => `topic:${x.id}`)];
    const here = listed.includes(current) ? ''
      : `<button type="button" class="ar-place" aria-current="true" data-place="${esc(current)}"><span class="ar-place-name">${esc(placeName())}</span></button>`;
    bar.innerHTML = `
      <button type="button" class="ar-place menu" data-act="side" aria-expanded="${ar.classList.contains('side-open')}">${icon('blocks', 16)}<span>${esc(t('places.menu'))}</span></button>
      ${here}
      ${chip('inbox', esc(t('place.inbox')), c.inbox)}
      ${chip('ask', `${icon('comment', 15)}<span>${esc(t('places.ask'))}</span>`, null)}
      ${chip('events', `${icon('calendar', 15)}<span>${esc(t('places.calendar'))}</span>`, null)}
      ${chip('picked', esc(t('view.picked')), c.picked)}
      ${chip('later', esc(t('view.later')), c.later)}
      ${chip('dismissed', esc(t('view.dismissed')), c.dismissed)}
      ${followed.length ? '<span class="ar-places-gap" aria-hidden="true"></span>' : ''}
      ${followed.map((x) => chip(`topic:${x.id}`, `<span class="dot c${colourOf(x.position)}" aria-hidden="true"></span><span class="ar-place-name">${esc(x.name)}</span>`, x.new)).join('')}`;
    const on = bar.querySelector('.ar-place[aria-current="true"]');
    if (on) {
      const left = on.getBoundingClientRect().left - bar.getBoundingClientRect().left;
      if (left < 0 || left + on.offsetWidth > bar.clientWidth) bar.scrollLeft += left - 48;
    }
  }

  function toggleMenu(open = !ar.classList.contains('side-open')) {
    ar.classList.toggle('side-open', open);
    $('places').querySelector('.menu')?.setAttribute('aria-expanded', String(open));
  }

  async function loadSide({ sources = false } = {}) {
    const [topics, counts, issues, filters, signals, events] = await Promise.allSettled([
      api.get('/api/topics'),
      api.get('/api/items', { page: 1, per_page: 1 }),
      api.get('/api/issues'),
      sources || !side.sources.length ? api.get('/api/filters') : Promise.resolve(null),
      api.get('/api/signals'),
      api.get('/api/events', { month: thisMonth() }),
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
    if (events.status === 'fulfilled') side.upcoming = events.value.upcoming;
    renderSide();
    renderHead();
    // Never while a new topic's name is being typed.
    if (place.kind === 'topics' && !tv.creating) renderRows();
    if (isDrivePlace() && !driveFiles) loadDriveFiles();
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
    if (place.kind === 'events') return t('place.events');
    if (place.kind === 'suggested') return t('place.suggested', { section: t(`section.${place.section}`) });
    if (place.kind === 'topic') return topicsById.get(place.id)?.name ?? '…';
    if (place.kind === 'tag') return t('place.tag', { tag: tagLabel ?? '…' });
    if (place.kind === 'signal') return t('place.signal', { topic: side.signals.find((s) => s.id === place.id)?.topic ?? '…' });
    return side.sources.find((s) => s.id === place.id)?.name ?? '…';
  }

  function placeNote() {
    if (place.kind === 'view') return place.view === 'inbox' ? t('place.note.inbox', { days: side.windowDays }) : t(`note.${place.view}`);
    if (place.kind === 'none') return t('place.note.none');
    if (place.kind === 'topics') return t('place.note.topics');
    if (place.kind === 'ask' || place.kind === 'events') return '';
    if (place.kind === 'suggested') return t('place.note.suggested', { section: t(`section.${place.section}`) });
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
    pageTitle(placeName(), t('page.articles'));
    const counted = !['topics', 'ask', 'events'].includes(place.kind);
    $('place-count').textContent = counted ? tn('count', total, { n: number(total) })
      : (place.kind === 'events' && cal.month ? tn('cal.count', total, { n: number(total) }) : '');
    $('place-note').textContent = placeNote();
    // A section's suggestions and the calendar have their own order, and no
    // search of their own.
    $('tools').hidden = ['topics', 'ask', 'events', 'suggested'].includes(place.kind);
    $('ask').hidden = place.kind !== 'ask';
    $('ask-new').hidden = place.kind !== 'ask' || !asked.list.length;
    ar.classList.toggle('asking', place.kind === 'ask');
    ar.classList.toggle('calendar', place.kind === 'events');
    $('place-note').classList.toggle('of-view', place.kind === 'view' || place.kind === 'ask');
    // Not in the Drive folder's own place: its articles are in the folder.
    $('list-drive').hidden = !(drive && drive.enabled && counted && total > 0) || isDrivePlace() || place.kind === 'suggested';
    renderDriveLine();
    renderPlaces();
  }

  function dayOf(item) {
    return finnishDay(state.sort === 'published' ? (item.published_at || item.collected_at) : item.collected_at);
  }

  function emptyHtml() {
    if (state.q) {
      return emptyState({ icon: 'search', title: t('results.noneTitle'), text: t('results.none'),
        actions: `<button type="button" class="btn ghost small" data-act="clear-search">${esc(t('filter.clear'))}</button>` });
    }
    const inbox = place.kind === 'view' && place.view === 'inbox';
    const key = place.kind === 'view' ? (inbox ? 'place.empty.inbox' : `results.empty.${place.view}`) : `place.empty.${place.kind}`;
    return emptyState({ icon: inbox ? 'check' : 'article', title: t(inbox ? 'place.emptyTitle.inbox' : 'place.emptyTitle'), text: t(key) });
  }

  function renderRows() {
    if (place.kind === 'topics') {
      rowsEl.innerHTML = topicRows(side.topics, Number(state.item) || null, { creating: tv.creating });
      return;
    }
    if (place.kind === 'ask') {
      rowsEl.innerHTML = chatHtml();
      saveAsked();
      return;
    }
    if (place.kind === 'events') {
      const target = targetDraft();
      const now = new Map(rows.map((r) => [r.id, r]));
      rowsEl.innerHTML = cal.month ? calendarHtml({ month: cal.month, items: cal.items.map((i) => now.get(i.id) || i), sendOn: sendOn(),
        sendName: target ? target.name : '', selected: state.item }) : '';
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
          out += `<h3 class="ar-day">${esc(dayHeading(day))}</h3>`;
          last = day;
        }
      }
      out += articleRow(item, { selected: String(item.id) === state.item, topics: topicsById, sendOn: sendOn() });
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
        : `<div class="ar-empty-read">${emptyState({ icon: 'blocks', title: t(side.topics.length ? 'topic.pickTitle' : 'topic.noneTitle'),
          text: t(side.topics.length ? 'topic.pick' : 'topic.none') })}</div>`;
      return;
    }
    const item = current();
    if (!item) {
      read.innerHTML = place.kind === 'ask'
        ? `<div class="ar-empty-read">${emptyState({ icon: 'comment', title: t('ask.readerTitle'), text: t('ask.readerEmpty') })}</div>`
        : (rows.length ? `<div class="ar-empty-read">${emptyState({ icon: 'article', title: t('reader.emptyTitle'), text: t('reader.emptyHint') })}</div>` : '');
      return;
    }
    const index = rows.indexOf(item);
    const target = side.drafts.find((d) => d.id === side.target);
    read.innerHTML = articleReader(item, {
      place: placeName(), index, total, topics: topicsById,
      canPrev: index > 0, canNext: index < rows.length - 1 || rows.length < total,
      target: target ? target.name : null, offer: offers[0] || null, drive, sendOn: sendOn(),
    });
    read.scrollTop = 0;
    if (focus) read.focus({ preventScroll: true });
  }

  function setItem(id, { scroll = true, focus = false } = {}) {
    state.item = id ? String(id) : '';
    writeState(state);
    rowsEl.querySelectorAll('.ar-row, .chat-src, .cal-row').forEach((row) => row.setAttribute('aria-current', String(row.dataset.id === state.item)));
    renderReader({ focus });
    if (!id) ar.classList.remove('reading');
    const row = rowsEl.querySelector(`.ar-row[data-id="${state.item}"], .cal-row[data-id="${state.item}"]`);
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
  // On a phone, opening an article from the list adds a step to the
  // browser's history, so the phone's Back returns to the list rather than
  // leaving the page. Going from one article to the next does not.
  function openItem(id, { focus = false } = {}) {
    if (id && NARROW.matches && !ar.classList.contains('reading')) {
      // The step back is the list without the article, also when a link
      // named the article.
      const list = hashOf({ ...state, item: '' });
      history.replaceState(null, '', list);
      history.pushState(null, '', list);
      readingStep = true;
    }
    setItem(id, { scroll: !NARROW.matches, focus: focus || NARROW.matches });
    if (id && NARROW.matches) {
      ar.classList.add('reading');
      window.scrollTo({ top: ar.getBoundingClientRect().top + window.scrollY - 8 });
    }
  }

  // Back to the list on a phone, where the article is in it: its row, or in
  // a conversation the answer that cites it.
  function closeReading() {
    const was = state.item;
    ar.classList.remove('reading');
    const cited = [...rowsEl.querySelectorAll(`.chat-src[data-id="${was}"]`)].pop();
    (rowsEl.querySelector(`.ar-row[data-id="${was}"], .cal-row[data-id="${was}"]`) || cited)?.scrollIntoView({ block: 'center' });
  }

  async function loadList({ append = false, keep = null } = {}) {
    if (place.kind === 'topics') return loadTopics();
    const mine = ++latest;
    const nextPage = append ? page + 1 : 1;
    rowsEl.setAttribute('aria-busy', 'true');
    try {
      const data = await api.get(...listRequest(nextPage));
      if (mine !== latest) return false;
      page = nextPage;
      total = data.total;
      tagLabel = data.tag_label ?? tagLabel;
      if (!append) {
        fresher = 0;
        renderFresh();
      }
      rows = append ? [...rows, ...data.items.filter((x) => !rows.some((r) => r.id === x.id))] : data.items;
      renderHead();
      renderRows();
      // The article asked for stays open; otherwise the first one opens, on
      // a wide screen. On a phone the list comes first.
      const wanted = keep ?? state.item;
      if (rows.some((r) => String(r.id) === String(wanted))) {
        // An article named in the address, as a link from the bot names it,
        // opens on a phone as well.
        if (NARROW.matches && !append && keep === null && !ar.classList.contains('reading')) openItem(wanted);
        else setItem(wanted, { scroll: !append });
      }
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

  // The request for a page of the place's articles: a section's suggestions
  // have an endpoint of their own.
  function listRequest(pageNumber) {
    if (place.kind === 'suggested') {
      return ['/api/items/suggested', { section: place.section, page: pageNumber, per_page: PER_PAGE }];
    }
    const params = { ...placeParams(place), sort: state.sort, page: pageNumber, per_page: PER_PAGE };
    if (state.q) params.q = state.q;
    return ['/api/items', params];
  }

  function goPlace(key) {
    state = { ...state, place: key, item: '', month: '' };
    place = parsePlace(key);
    tagLabel = null;
    rows = [];
    total = 0;
    fresher = 0;
    renderFresh();
    driveFiles = null;
    loadDriveFiles();
    writeState(state);
    ar.classList.remove('side-open', 'reading');
    renderSide();
    renderHead();
    rowsEl.innerHTML = '';
    read.innerHTML = '';
    showStatus();
    show();
  }

  // The place's list: articles, or in the topics view the topics.
  function show(options = {}) {
    if (place.kind === 'topics') return loadTopics();
    if (place.kind === 'ask') return showAsk();
    if (place.kind === 'events') return showCalendar(options);
    return loadList(options);
  }

  // ---------- Tapahtumakalenteri ----------

  // The month in the address, or this one. Its events become the list, in
  // the order of the days, so the reader and J and K work as anywhere; the
  // one nearest today opens, on a wide screen.
  async function showCalendar({ keep = null } = {}) {
    const month = /^\d{4}-(0[1-9]|1[0-2])$/.test(state.month) ? state.month : thisMonth();
    const mine = ++latest;
    rowsEl.setAttribute('aria-busy', 'true');
    let data;
    try {
      data = await api.get('/api/events', { month });
    } catch (e) {
      if (mine === latest && e.status !== 401) {
        rowsEl.innerHTML = emptyState({ icon: 'error', title: t('error.load'), text: e.message, tone: 'is-problem',
          actions: `<button type="button" class="btn ghost small" data-act="retry">${esc(t('error.retry'))}</button>` });
      }
      return;
    } finally {
      if (mine === latest) rowsEl.removeAttribute('aria-busy');
    }
    if (mine !== latest || place.kind !== 'events') return;
    cal.month = data.month;
    cal.items = data.items;
    side.upcoming = data.upcoming;
    rows = itemsInOrder(cal.items, cal.month);
    total = rows.length;
    renderHead();
    renderRows();
    const wanted = keep ?? state.item;
    if (rows.some((r) => String(r.id) === String(wanted))) setItem(wanted, { scroll: false });
    else if (!NARROW.matches && rows.length) {
      const today = finnishDay();
      const next = rows.find((r) => (r.event?.ends || r.event?.starts || r.event?.deadline || '') >= today) || rows[0];
      setItem(next.id, { scroll: false });
    } else setItem(null);
  }

  function moveMonth(step) {
    state.month = step === 0 ? '' : addMonths(cal.month || thisMonth(), step);
    state.item = '';
    writeState(state);
    showCalendar();
  }

  // ---------- asking the articles ----------

  // A conversation: each question with its answer, and under the answer the
  // articles it cites, numbered as it cites them. An article opens beside
  // the conversation, to read and to pick. A question goes with the one
  // answered before it, so a follow-up such as "Entä lukioissa?" works: the
  // AI writes it out whole, and the conversation shows how.
  function loadAsked() {
    try {
      const saved = JSON.parse(sessionStorage.getItem(ASK_KEY) || '[]');
      return Array.isArray(saved)
        ? saved.filter((a) => a && typeof a.question === 'string' && Array.isArray(a.sources) && ASK_DAYS.includes(a.days))
        : [];
    } catch {
      return [];
    }
  }

  function saveAsked() {
    try {
      const kept = asked.list.slice(-ASK_KEEP).map((a) => ({ ...a, sources: a.sources.map(fresh) }));
      sessionStorage.setItem(ASK_KEY, JSON.stringify(kept));
    } catch {
      // Without storage the conversation lasts until the page is left.
    }
  }

  // An article as it is now: a decision made about it since is in rows.
  function fresh(source) {
    return rows.find((r) => r.id === source.id) || source;
  }

  // Every article the answers cite, once, in the order they came: what J
  // and K go through.
  function askedRows() {
    const found = new Map();
    for (const a of asked.list) for (const s of a.sources) if (!found.has(s.id)) found.set(s.id, fresh(s));
    return [...found.values()];
  }

  function showAsk({ open = true } = {}) {
    if (!recentAsked) {
      recentAsked = true;
      loadRecent();
    }
    rows = askedRows();
    total = rows.length;
    renderHead();
    renderRows();
    rowsEl.removeAttribute('aria-busy');
    // The newest answer's first article opens beside it, on a wide screen.
    if (!rows.some((r) => String(r.id) === state.item)) {
      const last = asked.list[asked.list.length - 1];
      const first = open && !NARROW.matches && last && last.sources[0];
      setItem(first ? first.id : null, { scroll: false });
    } else renderReader();
    toLatest();
    updateComposer();
    if (!NARROW.matches) $('ask-q').focus({ preventScroll: true });
  }

  // The newest question at the top of the conversation, its answer under it.
  function toLatest() {
    const turns = rowsEl.querySelectorAll('.chat-turn');
    const last = turns[turns.length - 1];
    if (!last) return;
    if (NARROW.matches) last.scrollIntoView({ block: 'start' });
    else rowsEl.scrollTop += last.getBoundingClientRect().top - rowsEl.getBoundingClientRect().top - 12;
  }

  // The question before, for a follow-up: the last one that was answered.
  function previousTurn() {
    const last = [...asked.list].reverse().find((a) => !a.error && typeof a.answer === 'string' && a.answer);
    return last ? {
      question: last.asked_as || last.question,
      answer: last.answer.slice(0, 3000),
      titles: last.sources.slice(0, 8).map((s) => (s.title_fi || s.title || '').slice(0, 300)),
    } : null;
  }

  // While a question waits its turn with the AI (services/ai_line.py), how
  // many are before it: the page asks after a moment, and then every second
  // and a half until the answer comes.
  function lineKey() {
    if (crypto.randomUUID) return crypto.randomUUID();
    return [...crypto.getRandomValues(new Uint8Array(16))].map((b) => b.toString(16).padStart(2, '0')).join('');
  }

  function waitText(pending) {
    const wait = pending && pending.wait;
    if (!wait || wait.state !== 'waiting') return t('ask.busy');
    return wait.ahead ? tn('ask.inLine', wait.ahead, { n: number(wait.ahead) }) : t('ask.nextInLine');
  }

  function watchLine(key) {
    let timer = null;
    let stopped = false;
    const look = async () => {
      try {
        const place = await api.get(`/api/ai/line/${key}`);
        if (stopped || !asked.pending || asked.pending.line !== key) return;
        asked.pending.wait = place;
        const el = rowsEl.querySelector('.chat-a.busy .chat-wait');
        if (el) el.textContent = waitText(asked.pending);
      } catch {
        // The answer is what matters; the place in line is only shown.
      }
      if (!stopped) timer = setTimeout(look, 1500);
    };
    timer = setTimeout(look, 1200);
    return () => {
      stopped = true;
      clearTimeout(timer);
    };
  }

  async function askQuestion(question, days = Number($('ask-days').value) || 90, { alone = false } = {}) {
    const text = String(question || '').replace(/\s+/g, ' ').trim();
    if (text.length < 3 || asked.busy) return;
    const previous = alone ? null : previousTurn();
    asked.busy = true;
    const key = lineKey();
    asked.pending = { question: text, days, line: key, wait: null };
    $('ask-q').value = '';
    updateComposer();
    renderRows();
    rowsEl.removeAttribute('aria-busy');
    toLatest();
    let turn;
    const stopWatching = watchLine(key);
    try {
      turn = { question: text, days, ...(await api.post('/api/ask', { question: text, days, line: key, ...(previous ? { previous } : {}) })) };
    } catch (e) {
      turn = { question: text, days, answer: null, sources: [], error: e.message };
    } finally {
      stopWatching();
    }
    asked.busy = false;
    asked.pending = null;
    asked.list = [...asked.list, turn].slice(-ASK_KEEP);
    saveAsked();
    if (place.kind === 'ask') showAsk();
    if (typeof turn.answer === 'string' && turn.answer && turn.sources.length) loadFollowups(turn);
    loadRecent();
  }

  // The answer's paragraphs, its [1], [2]… as buttons that open those
  // articles.
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

  function questionHtml(a) {
    const whole = a.asked_as ? `<small class="chat-asked">${esc(t('ask.askedAs', { q: a.asked_as }))}</small>` : '';
    return `<div class="chat-q"><p>${esc(a.question)}</p>${whole}<small>${esc(t(`ask.days.${a.days}`))}</small></div>`;
  }

  // An article an answer cites, and beside it the way to put it in the
  // newsletter without opening it first.
  function sourceHtml(s, n, turn) {
    const decided = s.decision === 'picked' ? t('ask.state.picked', { section: t(`section.${s.pick_section}`) })
      : (s.decision ? t(`ask.state.${s.decision}`) : '');
    const meta = [s.publisher || s.source, date(s.published_at || s.collected_at), decided].filter(Boolean).join(' · ');
    const title = s.title_fi || s.title;
    const label = t('ask.cite', { n, title });
    const sent = s.decision === 'picked' && s.pick_issue_status === 'sent';
    const picked = s.decision === 'picked' && !sent;
    const add = sent
      ? `<span class="chat-add is-sent">${esc(t('ask.sentPick'))}</span>`
      : `<button type="button" class="chat-add${picked ? ' is-picked' : ''}" id="ask-add-${turn}-${n}" data-act="ask-add" data-id="${s.id}"
          aria-label="${esc(picked ? t('ask.pickedLabel', { title, section: t(`section.${s.pick_section}`) }) : t('ask.addLabel', { title }))}">
          ${icon(picked ? 'check' : 'plus', 15)}<span>${esc(picked ? t(`section.${s.pick_section}`) : t('ask.add'))}</span></button>`;
    return `<li class="chat-src-row"><button type="button" class="chat-src" data-act="cite" data-id="${s.id}" aria-label="${esc(label)}"
        aria-current="${String(s.id) === state.item}">
        <span class="chat-src-n" aria-hidden="true">${n}</span>
        <span class="chat-src-body"><span class="chat-src-t">${esc(title)}</span><small>${esc(meta)}</small></span>
      </button>${add}</li>`;
  }

  function askMenu(button) {
    const item = rows.find((r) => String(r.id) === button.dataset.id);
    if (!item) return;
    const target = targetDraft();
    const picked = item.decision === 'picked';
    const suggested = item.decision ? null : item.suggested_section;
    openMenu(button, [
      { kind: 'head', title: t('ask.menuTitle'), sub: picked ? item.pick_issue_name : (target ? target.name : t('target.new')) },
      { kind: 'group', label: t('ask.menuSection'), options: SECTIONS.map((section) => ({
        label: section === suggested ? t('ask.suggestedOption', { section: t(`section.${section}`) }) : t(`section.${section}`),
        checked: picked && item.pick_section === section,
        onSelect: () => decideFromAsk(item, 'picked', section),
      })) },
      ...(picked ? [{ kind: 'separator' }, { kind: 'item', label: t('ask.removePick'), icon: 'close', onSelect: () => decideFromAsk(item, null) }] : []),
    ]);
  }

  // A decision made from an answer: the conversation shows it where it is,
  // and the toast can take it back.
  async function decideFromAsk(item, decision, section = null) {
    if (decision === 'picked' && item.decision === 'picked' && item.pick_section === section) return;
    const before = { decision: item.decision, section: item.pick_section, issue: item.pick_issue_id };
    const body = { decision, section };
    if (decision === 'picked') {
      const issue = item.decision === 'picked' ? item.pick_issue_id : side.target;
      if (issue) body.issue_id = issue;
    }
    try {
      const updated = await api.put(`/api/items/${item.id}/decision`, body);
      putInAsk(updated);
      toast(decision === 'picked' ? t('toast.picked', { section: t(`section.${section}`) }) : t('toast.cleared'),
        async () => {
          const back = before.decision
            ? { decision: before.decision, section: before.section, issue_id: before.issue ?? undefined } : { decision: null };
          try {
            putInAsk(await api.put(`/api/items/${item.id}/decision`, back));
            refreshSide();
          } catch (e) {
            toast(e.message);
          }
        });
      refreshSide();
    } catch (e) {
      toast(e.message);
    }
  }

  function putInAsk(updated) {
    rows = rows.map((r) => (r.id === updated.id ? updated : r));
    asked.list.forEach((a) => { a.sources = a.sources.map((x) => (x.id === updated.id ? updated : x)); });
    const top = rowsEl.scrollTop;
    renderRows();
    rowsEl.scrollTop = top;
    if (String(updated.id) === state.item) redrawOpen();
    rowsEl.querySelector(`[data-act="ask-add"][data-id="${updated.id}"]`)?.focus({ preventScroll: true });
  }

  // Questions to ask next, once an answer is on the page: asked from the AI
  // separately, so the answer never waits for them.
  async function loadFollowups(turn) {
    let found;
    try {
      found = await api.post('/api/ask/followups', {
        question: (turn.asked_as || turn.question).slice(0, 300), answer: turn.answer.slice(0, 3000),
        titles: turn.sources.slice(0, 8).map((x) => (x.title_fi || x.title || '').slice(0, 300)),
      });
    } catch {
      return;
    }
    turn.followups = found.questions;
    saveAsked();
    if (place.kind === 'ask' && asked.list[asked.list.length - 1] === turn && !asked.busy) {
      const top = rowsEl.scrollTop;
      renderRows();
      rowsEl.scrollTop = top;
    }
  }

  async function loadRecent() {
    try {
      recent = await api.get('/api/ask/recent');
    } catch {
      recent = [];
    }
    if (place.kind === 'ask' && !asked.list.length && !asked.pending) renderRows();
  }

  async function forgetQuestion(id) {
    try {
      await api.del(`/api/ask/recent/${id}`);
      recent = recent.filter((r) => String(r.id) !== String(id));
      renderRows();
      toast(t('ask.forgotten'));
      rowsEl.querySelector('.chat-recent .chat-chip, .chat-try .chat-chip')?.focus({ preventScroll: true });
    } catch (e) {
      toast(e.message);
    }
  }

  function turnHtml(a, n) {
    let answer;
    if (a.error) {
      answer = `<div class="chat-a problem" role="alert"><p>${esc(a.error)}</p>
        <div><button type="button" class="btn ghost small" data-act="ask-retry" data-n="${n}">${esc(t('ask.retry'))}</button></div></div>`;
    } else if (a.answer === null) {
      const wider = ASK_DAYS[ASK_DAYS.indexOf(a.days) + 1];
      answer = `<div class="chat-a none"><p>${esc(t('ask.none', { when: t(`ask.days.${a.days}`).toLowerCase() }))}</p>
        ${wider ? `<div><button type="button" class="btn ghost small" data-act="ask-wider" data-n="${n}">${esc(t('ask.wider', { when: t(`ask.days.${wider}`).toLowerCase() }))}</button></div>` : ''}</div>`;
    } else {
      const usage = aiUsage(a);
      answer = `<div class="chat-a">
        <div class="chat-a-text">${answerHtml(a)}</div>
        <ol class="chat-sources" aria-label="${esc(t('ask.sources'))}">${a.sources.map((s, i) => sourceHtml(fresh(s), i + 1, n)).join('')}</ol>
        <div class="chat-a-foot">
          <span>${esc(tn('ask.meta', a.sources.length))}${usage ? ` · ${esc(usage)}` : ''}. ${esc(t('ask.check'))}</span>
          <button type="button" class="linkish" data-act="ask-copy" data-n="${n}">${esc(t('ask.copy'))}</button>
        </div>
      </div>`;
    }
    const last = n === asked.list.length - 1 && !asked.pending;
    const next = last && a.answer && Array.isArray(a.followups) && a.followups.length
      ? `<div class="chat-next" role="group" aria-label="${esc(t('ask.next'))}"><span class="chat-next-k">${esc(t('ask.next'))}</span>
          ${a.followups.map((q) => `<button type="button" class="chat-chip" data-act="ask-follow" data-q="${esc(q)}">${esc(q)}</button>`).join('')}</div>`
      : '';
    return `<article class="chat-turn" data-n="${n}">${questionHtml(a)}${answer}${next}</article>`;
  }

  function chatHtml() {
    let out = '';
    if (!asked.list.length && !asked.pending) {
      out += `<div class="chat-empty">
        <span class="chat-mark" aria-hidden="true">${icon('comment', 26)}</span>
        <h3>${esc(t('ask.emptyTitle'))}</h3>
        <p>${esc(t('ask.intro'))}</p>
        <div class="chat-try" role="group" aria-label="${esc(t('ask.try'))}">${['ask.example1', 'ask.example2', 'ask.example3']
          .map((k) => `<button type="button" class="chat-chip" data-act="ask-example" data-q="${esc(t(k))}">${esc(t(k))}</button>`).join('')}</div>
        ${recent.length ? `<div class="chat-recent">
          <p class="chat-recent-k">${esc(t('ask.recent'))}</p>
          <ul>${recent.map((r) => `<li><button type="button" class="chat-chip" data-act="ask-recent" data-q="${esc(r.question)}" data-days="${r.days}">${esc(r.question)}</button><button
            type="button" class="chat-forget" data-act="ask-forget" data-id="${r.id}" aria-label="${esc(t('ask.forget', { q: r.question }))}"
            title="${esc(t('ask.forget', { q: r.question }))}">${icon('close', 14)}</button></li>`).join('')}</ul>
        </div>` : ''}
      </div>`;
    }
    out += asked.list.map(turnHtml).join('');
    if (asked.pending) {
      out += `<article class="chat-turn">${questionHtml(asked.pending)}
        <div class="chat-a busy" role="status"><span class="chat-dots" aria-hidden="true"><i></i><i></i><i></i></span><span class="chat-wait">${esc(waitText(asked.pending))}</span></div></article>`;
    }
    return `<div class="chat">${out}</div>`;
  }

  // The box grows with the question, up to a few lines, and says how much
  // room is left near the end.
  function updateComposer() {
    const box = $('ask-q');
    $('ask-go').disabled = asked.busy || box.value.trim().length < 3;
    const left = 300 - box.value.length;
    $('ask-count').textContent = left <= 50 ? t('ask.left', { n: left }) : '';
    box.style.height = 'auto';
    box.style.height = `${Math.min(box.scrollHeight, 160)}px`;
  }

  async function copyAnswer(n) {
    const a = asked.list[n];
    if (!a || !a.answer) return;
    const list = a.sources.map((s, i) => `[${i + 1}] ${[s.title_fi || s.title, s.publisher, s.url].filter(Boolean).join(', ')}`);
    try {
      await navigator.clipboard.writeText(`${a.question}\n\n${a.answer}\n\n${t('ask.sources')}:\n${list.join('\n')}`);
      toast(t('ask.copied'));
    } catch {
      toast(t('ask.copyFailed'));
    }
  }

  function newConversation() {
    if (!asked.list.length || asked.busy) return;
    const before = asked.list;
    asked.list = [];
    saveAsked();
    showAsk({ open: false });
    toast(t('ask.cleared'), () => {
      asked.list = before;
      saveAsked();
      if (place.kind === 'ask') showAsk({ open: false });
    });
  }

  function askAgain(n, wider) {
    const a = asked.list[n];
    if (!a || asked.busy) return;
    const days = wider ? ASK_DAYS[ASK_DAYS.indexOf(a.days) + 1] : a.days;
    if (!days) return;
    if (!wider) asked.list = asked.list.filter((_, i) => i !== n);
    $('ask-days').value = String(days);
    // A longer time asks the question as it was searched, on its own.
    if (wider) askQuestion(a.asked_as || a.question, days, { alone: true });
    else askQuestion(a.question, days);
  }

  // ---------- editing topics ----------

  async function loadTopics() {
    tv.creating = false;
    // A list still loading for the place before is not shown over the topics.
    ++latest;
    rowsEl.setAttribute('aria-busy', 'true');
    await loadSide().catch(() => {});
    renderHead();
    renderRows();
    rowsEl.removeAttribute('aria-busy');
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
      loadOffers();
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
      loadOffers();
    } catch (e) {
      read.querySelectorAll('.rd-decide button').forEach((b) => { b.disabled = false; });
      showError(e.message);
    }
  }

  // ---------- a section for a source ----------

  // After a pick, or when the page opens: is there a source to ask about?
  // The question goes into the open article's panel without drawing the
  // article again, so nothing moves under the editor's eyes.
  async function loadOffers() {
    try {
      offers = (await api.get('/api/suggestions/offers')).offers;
    } catch {
      offers = [];
    }
    const panel = read.querySelector('.rd-decide');
    if (!panel || offerBusy) return;
    panel.querySelector('.rd-offer')?.remove();
    if (panel.querySelector('.rd-secs')) panel.insertAdjacentHTML('afterbegin', offerBox(offers[0]));
  }

  async function answerOffer(yes) {
    const offer = offers[0];
    if (!offer || offerBusy) return;
    offerBusy = true;
    read.querySelectorAll('.rd-offer button').forEach((b) => { b.disabled = true; });
    const section = t(`section.${offer.section}`);
    try {
      if (!yes) {
        await api.post(`/api/sources/${offer.source_id}/section/declined`);
        toast(t('toast.sourceSectionKept'));
      } else {
        await api.put(`/api/sources/${offer.source_id}/section`, { section: offer.kind === 'set' ? offer.section : null });
        toast(offer.kind === 'set' ? t('toast.sourceSection', { source: offer.source, section })
          : t('toast.sourceSectionStopped', { source: offer.source }));
        // The source's articles in the list are suggested anew.
        const at = read.scrollTop;
        offers = offers.slice(1);
        await loadList({ keep: state.item });
        read.scrollTop = at;
      }
    } catch (e) {
      toast(e.message);
    } finally {
      offerBusy = false;
    }
    loadOffers();
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

  // ---------- live ----------

  // What n8n and the other editors change shows here as it happens
  // (live.js). The articles on screen and the open one are asked for again
  // and drawn where they stand, the numbers in the column and above the page
  // catch up, and new articles come into the list, without moving what the
  // editor is looking at. Nothing is redrawn while the editor types in the
  // article; it is once the typing stops.
  const coming = (item) => item.tags_pending || item.status === 'new' || item.status === 'queued';
  const looks = (item) => JSON.stringify([item.status, item.summary?.text, item.title_fi, item.event,
    item.tags_pending, item.tags.map((g) => g.id), item.topics.map((x) => x.id), item.picture?.src,
    item.decision, item.pick_section, item.pick_issue_id, item.pick_issue_status, item.decided_by,
    item.drive_saved?.at, item.drive_changed_at]);
  const typing = () => read.contains(document.activeElement) && document.activeElement.matches('input, textarea, select');
  const heard = { ids: new Set(), all: false, timer: null };
  let openStale = false;
  let draftsTimer = null;
  let overviewTimer = null;

  // The open article drawn again as it is now, where the editor was in it.
  function redrawOpen() {
    if (typing()) {
      openStale = true;
      return;
    }
    openStale = false;
    const top = read.scrollTop;
    const open = [...read.querySelectorAll('details[open]')].map((d) => d.classList[0]);
    renderReaderKeepingFocus();
    open.forEach((name) => read.querySelector(`details.${name}`)?.setAttribute('open', ''));
    read.scrollTop = top;
  }

  // The articles with these ids as they are now. A changed one is drawn
  // again where it stands; one that is gone, such as an article whose Drive
  // document left the folder, leaves the list.
  async function refreshRows(ids) {
    let found;
    try {
      found = (await api.get('/api/items/batch', { ids: ids.join(',') })).items;
    } catch {
      return;
    }
    const now = new Map(found.map((x) => [x.id, x]));
    const openId = current()?.id;
    let changed = false;
    let openChanged = false;
    for (const id of ids) {
      const at = rows.findIndex((r) => r.id === id);
      if (at < 0) continue;
      const fresh = now.get(id);
      if (fresh && looks(fresh) === looks(rows[at])) continue;
      if (fresh) rows[at] = fresh;
      else {
        rows.splice(at, 1);
        total = Math.max(0, total - 1);
      }
      changed = true;
      if (id === openId) openChanged = true;
    }
    if (!changed) return;
    // In Kysy artikkeleilta the conversation is the list, and it stays.
    if (place.kind !== 'ask') {
      renderHead();
      renderRows();
    }
    if (!openChanged) return;
    if (current()) redrawOpen();
    else {
      setItem(null);
      toast(t('live.gone'));
    }
  }

  function hear(change) {
    if (change.ids && change.k !== 'resync') change.ids.forEach((id) => heard.ids.add(Number(id)));
    else heard.all = true;
    clearTimeout(heard.timer);
    heard.timer = setTimeout(catchUp, 500);
  }

  async function catchUp() {
    const { all, ids } = heard;
    heard.all = false;
    heard.ids = new Set();
    refreshSide();
    refreshOverview();
    if (place.kind === 'topics') return;
    const shown = rows.filter((r) => all || ids.has(Number(r.id))).map((r) => r.id);
    if (shown.length) await refreshRows(shown.slice(0, 100));
    if (place.kind === 'events') refreshCalendar();
    else if (place.kind !== 'ask') lookForNew();
  }

  // The line above the page counts today's new articles, so it catches up
  // as well; a check started from this page follows its own course.
  function refreshOverview() {
    clearTimeout(overviewTimer);
    overviewTimer = setTimeout(() => {
      if (!checking) loadOverview();
    }, 1500);
  }

  // New articles for this place come into the list by themselves, where the
  // list has them, and stand out for a moment. What the editor is looking
  // at stays where it is on the screen: when they come in above it, out of
  // sight, a button above the list counts them and leads up to them. An
  // empty list fills at once.
  async function lookForNew() {
    const mine = latest;
    let data;
    try {
      data = await api.get(...listRequest(1));
    } catch {
      return;
    }
    if (mine !== latest || ['topics', 'ask', 'events'].includes(place.kind)) return;
    if (!rows.length) {
      if (data.items.length) loadList({ keep: state.item });
      return;
    }
    const { list, arrived } = withNew(data.items);
    if (!arrived.length) return;
    const anchor = rowOnTop();
    rows = list;
    total = Math.max(data.total, rows.length);
    renderHead();
    renderRows();
    const ids = new Set(arrived.map((x) => x.id));
    rowsEl.querySelectorAll('.ar-row').forEach((row) => {
      if (ids.has(Number(row.dataset.id))) row.classList.add('arrived');
    });
    if (anchor) {
      const at = rows.findIndex((r) => r.id === anchor.id);
      fresher += arrived.filter((x) => rows.indexOf(x) < at).length;
      renderFresh();
      keepInPlace(anchor);
    }
    renumberOpen();
    say(tn('live.arrived', arrived.length, { n: number(arrived.length) }));
  }

  // Page 1 of the place as it is now, laid over the list: an article the
  // list does not have goes in before the one that follows it there. One at
  // the very end of page 1, with nothing the list has after it, came up from
  // page 2 as another left the place: it is no news, and comes with Näytä
  // lisää, unless the list already held every article of the place.
  function withNew(items) {
    const known = new Set(rows.map((r) => r.id));
    const complete = rows.length >= total;
    const list = [...rows];
    const arrived = [];
    items.forEach((item, at) => {
      if (known.has(item.id)) return;
      const next = items.slice(at + 1).find((x) => known.has(x.id));
      if (!next && !complete) return;
      list.splice(next ? list.findIndex((r) => r.id === next.id) : list.length, 0, item);
      arrived.push(item);
    });
    return { list, arrived };
  }

  // The first article on the screen and how far down it is, so the list can
  // keep it there; none while the list is at its top, where new articles
  // are meant to be seen. On a phone the bar of places covers the top.
  function rowOnTop() {
    if (ar.classList.contains('reading')) return null;
    const covered = NARROW.matches ? $('places').getBoundingClientRect().bottom : 0;
    const top = Math.max(rowsEl.getBoundingClientRect().top, covered);
    const row = [...rowsEl.querySelectorAll('.ar-row')].find((r) => r.getBoundingClientRect().bottom > top + 1);
    if (!row || (rowsEl.scrollTop < 4 && row === rowsEl.querySelector('.ar-row'))) return null;
    return { id: Number(row.dataset.id), top: row.getBoundingClientRect().top };
  }

  // The list scrolled by what came in above that article. A wide screen
  // scrolls the list, a phone the page.
  function keepInPlace(anchor) {
    const row = rowsEl.querySelector(`.ar-row[data-id="${anchor.id}"]`);
    const moved = row ? row.getBoundingClientRect().top - anchor.top : 0;
    if (!moved) return;
    if (getComputedStyle(rowsEl).overflowY === 'visible') window.scrollBy({ top: moved, behavior: 'instant' });
    else rowsEl.scrollBy({ top: moved, behavior: 'instant' });
  }

  // Up to the new articles.
  function toTop() {
    fresher = 0;
    renderFresh();
    rowsEl.scrollTo({ top: 0 });
    if (NARROW.matches) window.scrollTo({ top: ar.getBoundingClientRect().top + window.scrollY - 8 });
  }

  // Scrolled up to them, the new articles need the button no more.
  function sawTop() {
    if (fresher && !rowOnTop()) {
      fresher = 0;
      renderFresh();
    }
  }

  function renderFresh() {
    const button = $('fresh');
    button.hidden = !fresher;
    if (fresher) button.innerHTML = `${icon('arrowUp', 16)}<span>${esc(tn('live.above', fresher, { n: number(fresher) }))}</span>`;
  }

  // The open article's place in the list, "3 / 25", once the list has grown
  // around it. Only that, so nothing the editor is doing in it is disturbed.
  function renumberOpen() {
    const item = current();
    if (!item) return;
    const index = rows.indexOf(item);
    const pos = read.querySelector('.rd-pos');
    if (pos) pos.textContent = t('reader.position', { place: placeName(), n: number(index + 1), total: number(total) });
    read.querySelector('[data-act="prev"]')?.toggleAttribute('disabled', index <= 0);
    read.querySelector('[data-act="next"]')?.toggleAttribute('disabled', !(index < rows.length - 1 || rows.length < total));
  }

  // In the calendar: an article whose event the AI has just read comes into
  // the month, and one whose event moved to another month leaves it.
  async function refreshCalendar() {
    const mine = latest;
    let data;
    try {
      data = await api.get('/api/events', { month: cal.month || thisMonth() });
    } catch {
      return;
    }
    if (mine !== latest || place.kind !== 'events' || data.month !== cal.month) return;
    if (data.upcoming !== side.upcoming) {
      side.upcoming = data.upcoming;
      renderSide();
    }
    const shape = (items) => JSON.stringify(items.map((i) => [i.id, i.event]));
    if (shape(data.items) === shape(cal.items)) return;
    const top = rowsEl.scrollTop;
    cal.items = data.items;
    rows = itemsInOrder(cal.items, cal.month);
    total = rows.length;
    renderHead();
    renderRows();
    rowsEl.scrollTop = top;
    renumberOpen();
  }

  // A newsletter made, renamed or sent elsewhere changes the drafts in the
  // column. Saving an email being edited changes nothing here, so only the
  // drafts are asked for, and the column is drawn again only if they differ.
  function refreshDrafts() {
    clearTimeout(draftsTimer);
    draftsTimer = setTimeout(async () => {
      let issues;
      try {
        issues = await api.get('/api/issues');
      } catch {
        return;
      }
      const drafts = issues.filter((i) => i.status === 'draft');
      // Its day and its picks too: the events are measured against the day,
      // and the column shows how full each section is.
      const key = (list) => JSON.stringify(list.map((d) => [d.id, d.name, d.current, d.planned_for, d.sections]));
      if (key(drafts) === key(side.drafts)) return;
      const daysBefore = sendOn();
      side.drafts = drafts;
      const saved = readTarget();
      const newest = drafts.find((d) => d.current) || drafts[0];
      side.target = drafts.some((d) => d.id === saved) ? saved : (newest ? newest.id : null);
      renderSide();
      if (sendOn() !== daysBefore && !['topics', 'ask'].includes(place.kind)) {
        const top = rowsEl.scrollTop;
        renderRows();
        rowsEl.scrollTop = top;
      }
      if (current()) redrawOpen();
    }, 1500);
  }

  // Without the live stream, an open article waiting for its summary or
  // tags is asked for again every minute instead.
  async function refreshOpen() {
    const item = current();
    if (isLive() || !item || !coming(item) || document.visibilityState !== 'visible' || typing()) return;
    await refreshRows([item.id]);
  }

  // ---------- the association's Drive ----------

  async function loadDrive() {
    try {
      drive = await api.get('/api/drive');
    } catch {
      drive = null;
    }
    renderHead();
    if (current()) redrawOpen();
  }

  function isDrivePlace() {
    const folder = side.sources.find((x) => x.type === 'drive');
    return place.kind === 'source' && Boolean(folder) && place.id === folder.id;
  }

  // In the folder's own place: how much of the folder became articles, and
  // the way to every file in it and what became of each.
  async function loadDriveFiles() {
    if (!isDrivePlace()) {
      renderDriveLine();
      return;
    }
    try {
      driveFiles = await api.get('/api/drive/files');
    } catch {
      driveFiles = null;
    }
    renderDriveLine();
  }

  function renderDriveLine() {
    const line = $('drive-line');
    if (!isDrivePlace() || !driveFiles) {
      line.hidden = true;
      return;
    }
    const c = fileCounts(driveFiles.files || []);
    line.innerHTML = `${esc(t('files.summary', { files: number(c.files), read: number(c.read), coming: number(c.coming), not: number(c.not) }))}
      <button type="button" class="linkish" data-act="drive-files">${esc(t('drivePlace.files'))}</button>`;
    line.hidden = false;
  }

  // Tallenna Driveen: the folder the article goes in, suggested from its
  // topic or section and free to change, and what is saved, before
  // anything is.
  async function saveToDrive() {
    const item = current();
    if (!item) return;
    let options;
    try {
      options = await api.get(`/api/items/${item.id}/drive`);
    } catch (e) {
      toast(e.message);
      return;
    }
    const canSave = ['subfolder', 'whole_folder'].includes(options.save);
    const names = [...new Set([options.suggested, ...options.folders])];
    const picture = options.picture ? (['own', 'open'].includes(options.picture) ? options.picture : 'check') : null;
    const why = ['my_drive', 'read_only', 'ambiguous'].includes(options.save) ? options.save : 'off';
    const body = document.createElement('div');
    body.className = 'dv-save';
    body.innerHTML = canSave ? `
        <label class="cf-label" for="dv-folder">${esc(t('driveSave.folder'))}</label>
        <select id="dv-folder" class="cf-input">
          ${names.map((n) => `<option value="${esc(n)}">${esc(n)}</option>`).join('')}
          <option value="">${esc(t('driveSave.newFolder'))}</option>
        </select>
        <input id="dv-new" class="cf-input" maxlength="80" hidden placeholder="${esc(t('driveSave.newName'))}" aria-label="${esc(t('driveSave.newName'))}">
        <p class="cf-hint" id="dv-where"></p>
        <ul class="dv-what">
          <li>${esc(t('driveSave.doc'))}</li>
          ${picture ? `<li>${esc(t(`driveSave.picture.${picture}`))}</li>` : ''}
          <li>${esc(t('driveSave.noText'))}</li>
        </ul>
        ${options.saved ? `<p class="cf-hint">${esc(t('driveSave.savedBefore', { date: date(options.saved.at), folder: options.saved.folder }))}</p>` : ''}
        <p class="problem" id="dv-error" role="alert" hidden></p>`
      : `<p class="problem">${esc(t(`driveSave.cannot.${why}`))}</p>`;
    const select = body.querySelector('#dv-folder');
    const typed = body.querySelector('#dv-new');
    const where = body.querySelector('#dv-where');
    const chosen = () => (select && select.value) || (typed ? typed.value.trim() : '');
    const showWhere = () => {
      if (!select) return;
      typed.hidden = select.value !== '';
      where.textContent = t('driveSave.where', { path: [...options.path, chosen() || '…'].join(' / ') });
    };
    select?.addEventListener('change', () => {
      showWhere();
      if (!typed.hidden) typed.focus();
    });
    typed?.addEventListener('input', showWhere);
    showWhere();
    let busy = false;
    const dialog = modal({
      title: t('driveSave.title'),
      body,
      className: 'md-drive-save',
      actions: canSave
        ? [{ label: t('dialog.cancel'), value: null }, { label: t('driveSave.save'), primary: true, onClick: () => save() }]
        : [{ label: t('dialog.close'), value: null }],
    });
    async function save() {
      if (busy) return;
      const folder = chosen();
      if (!folder) {
        typed.focus();
        return;
      }
      busy = true;
      const button = dialog.box.querySelector('.md-actions .btn:not(.ghost)');
      button.disabled = true;
      button.textContent = t('driveSave.saving');
      try {
        const saved = await api.post(`/api/items/${item.id}/drive`, { folder });
        dialog.close();
        toast(t('driveSave.done', { folder: saved.folder.name }));
        refreshRows([item.id]);
      } catch (e) {
        busy = false;
        button.disabled = false;
        button.textContent = t('driveSave.save');
        const error = body.querySelector('#dv-error');
        error.textContent = e.message;
        error.hidden = false;
      }
    }
  }

  // Tallenna lista Driveen: the list as the page shows it, its first 100
  // articles, into one Google Doc and the same as a sheet. A topic's list
  // goes in the topic's folder; any other in Koosteet, as the tool names
  // the folder in Drive whatever the page's language.
  function saveListToDrive() {
    const title = placeName();
    const topic = place.kind === 'topic' ? topicsById.get(place.id)?.name : null;
    const body = document.createElement('div');
    body.className = 'dv-save';
    body.innerHTML = `
      <p>${esc(t('driveList.lead'))}</p>
      <p class="cf-hint">${esc(total > 100 ? t('driveList.max', { total: number(total) }) : t('driveList.count', { n: number(total) }))}</p>
      <label class="cf-label" for="dv-list-folder">${esc(t('driveSave.folder'))}</label>
      <input id="dv-list-folder" class="cf-input" maxlength="80" value="${esc(topic || 'Koosteet')}">
      <p class="problem" id="dv-error" role="alert" hidden></p>
      <p class="dv-done" id="dv-done" role="status" hidden></p>`;
    let busy = false;
    const dialog = modal({
      title: t('driveList.button'),
      body,
      className: 'md-drive-save',
      actions: [{ label: t('dialog.cancel'), value: null }, { label: t('driveSave.save'), primary: true, onClick: () => save() }],
    });
    async function save() {
      const folder = body.querySelector('#dv-list-folder').value.trim();
      if (busy || !folder) return;
      busy = true;
      const button = dialog.box.querySelector('.md-actions .btn:not(.ghost)');
      button.disabled = true;
      button.textContent = t('driveSave.saving');
      const p = placeParams(place);
      const list = { view: p.view, sort: state.sort, q: state.q || null, source: p.source ?? null, topic: p.topic ?? null,
        tag: p.tag ?? null, signal: p.signal ?? null, untopiced: p.untopiced === 'true' };
      try {
        const saved = await api.post('/api/drive/lists', { place: list, title, folder });
        const link = safeUrl(saved.folder.link);
        const done = body.querySelector('#dv-done');
        done.innerHTML = `${esc(t('driveList.done', { folder: saved.folder.name, n: number(saved.count) }))}${link
          ? ` <a href="${esc(link)}" target="_blank" rel="noopener noreferrer">${esc(t('driveSave.openFolder'))} ↗</a>` : ''}`;
        done.hidden = false;
        body.querySelector('#dv-error').hidden = true;
        button.hidden = true;
      } catch (e) {
        busy = false;
        button.disabled = false;
        button.textContent = t('driveSave.save');
        const error = body.querySelector('#dv-error');
        error.textContent = e.message;
        error.hidden = false;
      }
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

  // ---------- the status bar ----------

  // Drawn again only when something in it changed, keeping the focus on
  // the button that had it.
  function showStatus() {
    const html = statusLines(overview, { checking: Boolean(checking), view: placeKey(place), failedOpen, note: statusNote, admin });
    if (html === statusHtml) return;
    const had = status.contains(document.activeElement) ? document.activeElement.dataset.act : null;
    statusHtml = html;
    status.innerHTML = html;
    if (had) status.querySelector(`[data-act="${had}"]`)?.focus({ preventScroll: true });
    fit();
  }

  // What a screen reader hears of the bar: a check starting and finishing,
  // and problems. The bar itself is drawn again quietly.
  function say(text) {
    statusSaid.textContent = text;
  }

  async function loadOverview() {
    try {
      overview = await api.get('/api/overview');
      showStatus();
      return overview;
    } catch (e) {
      if (e.status !== 401) {
        statusNote = { kind: 'warn', text: e.message };
        showStatus();
      }
      return null;
    }
  }

  async function startCheck(button) {
    if (checking || button.getAttribute('aria-disabled') === 'true') return;
    checking = { started: Date.now(), seen: false, before: overview?.new_today ?? 0 };
    statusNote = null;
    showStatus();
    say(t('status.checking'));
    try {
      await api.post('/api/collect');
    } catch (e) {
      // 409 means a check is already running, so this page follows that one.
      if (e.status !== 409) {
        checking = null;
        statusNote = { kind: 'warn', text: e.message };
        showStatus();
        say(e.message);
        return;
      }
    }
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
      statusNote = { kind: 'good', text: added ? tn('status.checkDone', added) : t('status.checkDoneNothing') };
      showStatus();
      say(statusNote.text);
      loadSide({ sources: true }).catch(() => {});
      show({ keep: state.item });
    }, 3000);
  }

  // A failed source's details open under the bar and stay open while the
  // bar refreshes.
  function toggleFailed() {
    failedOpen = !failedOpen;
    showStatus();
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
    if (event.target === ar && ar.classList.contains('side-open')) {
      toggleMenu(false);
      return;
    }
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
      // Takaisin goes the way the phone's Back does, when there is a step to go back to.
      if (readingStep) history.back();
      else closeReading();
    } else if (act === 'topic') goPlace(`topic:${target.dataset.topic}`);
    else if (act === 'tag') goPlace(`tag:${target.dataset.tag}`);
    else if (act === 'untag') removeTag(target.dataset.tag);
    else if (act === 'follow') follow(target.dataset.topic, true);
    else if (act === 'unfollow') follow(target.dataset.topic, false);
    else if (act === 'side') toggleMenu();
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
    } else if (act === 'offer-yes') answerOffer(true);
    else if (act === 'offer-no') answerOffer(false);
    else if (act === 'check') startCheck(target);
    else if (act === 'failed') toggleFailed();
    else if (act === 'find-signals') findSignals(target);
    else if (act === 'view') goPlace(target.dataset.view);
    else if (act === 'cite' || act === 'cal-open') openItem(target.dataset.id);
    else if (act === 'cal-prev') moveMonth(-1);
    else if (act === 'cal-next') moveMonth(1);
    else if (act === 'cal-this') moveMonth(0);
    else if (act === 'cal-day') rowsEl.querySelector(`#cal-${CSS.escape(target.dataset.day)}`)?.scrollIntoView({ block: 'start' });
    else if (act === 'ask-add') askMenu(target);
    else if (act === 'ask-follow') askQuestion(target.dataset.q);
    else if (act === 'ask-recent') {
      const days = Number(target.dataset.days);
      if (ASK_DAYS.includes(days)) $('ask-days').value = String(days);
      askQuestion(target.dataset.q, days || undefined, { alone: true });
    } else if (act === 'ask-forget') forgetQuestion(target.dataset.id);
    else if (act === 'ask-example') askQuestion(target.dataset.q);
    else if (act === 'ask-new') newConversation();
    else if (act === 'ask-copy') copyAnswer(Number(target.dataset.n));
    else if (act === 'ask-retry') askAgain(Number(target.dataset.n), false);
    else if (act === 'ask-wider') askAgain(Number(target.dataset.n), true);
    else if (act === 'drive-save') saveToDrive();
    else if (act === 'list-drive') saveListToDrive();
    else if (act === 'drive-files') showDriveFiles();
    else if (act === 'fresh') toTop();
  });

  root.addEventListener('change', (event) => {
    if (event.target.id === 'pick-target') {
      side.target = Number(event.target.value);
      saveTarget(side.target);
      renderSide();
      if (!['topics', 'ask'].includes(place.kind)) renderRows();
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

  $('ask-q').addEventListener('input', updateComposer);

  // Pointing at a number in an answer lights up its article under it.
  rowsEl.addEventListener('mouseover', (event) => {
    const cite = event.target.closest('.ar-cite');
    const lit = cite && cite.closest('.chat-turn')?.querySelector(`.chat-src[data-id="${cite.dataset.id}"]`);
    rowsEl.querySelectorAll('.chat-src.lit').forEach((b) => { if (b !== lit) b.classList.remove('lit'); });
    if (lit) lit.classList.add('lit');
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
      toggleMenu(false);
      return;
    }
    if (place.kind === 'topics') return;
    // J is the key on the left, so the article before; K the one after.
    if (key === 'j') move(-1);
    else if (key === 'k') move(1);
    else if (!current()) return;
    else if (/^[1-9]$/.test(key) && SECTIONS[Number(key) - 1]) decide('picked', SECTIONS[Number(key) - 1]);
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
    if (next.place === state.place && next.q === state.q && next.sort === state.sort && next.month === state.month) {
      if (ar.classList.contains('reading') && next.item !== state.item) {
        // The phone's Back, or Takaisin: from the article to the list.
        readingStep = false;
        closeReading();
        state.item = next.item;
        return;
      }
      if (next.item !== state.item && rows.some((r) => String(r.id) === next.item)) setItem(next.item);
      return;
    }
    readingStep = false;
    state = next;
    place = parsePlace(state.place);
    q.value = state.q;
    fillSort();
    renderSide();
    showStatus();
    show();
  }
  window.addEventListener('hashchange', onHash);
  window.addEventListener('resize', fit);
  rowsEl.addEventListener('scroll', sawTop, { passive: true });
  window.addEventListener('scroll', sawTop, { passive: true });
  NARROW.addEventListener('change', fit);

  // An open page keeps its status line and its numbers current, without
  // moving the list under the editor's eyes.
  const refresh = setInterval(() => {
    if (checking || document.visibilityState !== 'visible') return;
    statusNote = null;
    loadOverview();
    loadSide().catch(() => {});
  }, 2 * 60000);
  const waiting = setInterval(refreshOpen, 60000);
  const unlisten = [
    onLive('items', hear),
    onLive('picks', hear),
    onLive('resync', (change) => {
      hear(change);
      refreshDrafts();
      loadDriveFiles();
    }),
    onLive('topics', refreshSide),
    onLive('sources', () => loadSide({ sources: true }).catch(() => {})),
    onLive('signals', refreshSide),
    onLive('issues', refreshDrafts),
    onLive('drive', () => {
      loadDriveFiles();
      refreshSide();
    }),
  ];
  read.addEventListener('focusout', () => {
    if (openStale) setTimeout(() => { if (openStale && !typing()) redrawOpen(); }, 0);
  });

  writeState(state);
  q.value = state.q;
  fillSort();
  renderSide();
  renderHead();
  fit();
  loadOverview();
  loadSide({ sources: true }).catch(() => {}).finally(() => show());
  loadOffers();
  loadDrive();

  return {
    leave() {
      clearTimeout(followTimer);
      clearTimeout(searchTimer);
      clearTimeout(toastTimer);
      clearTimeout(sideTimer);
      clearTimeout(terms.timer);
      clearTimeout(seenTimer);
      clearInterval(refresh);
      clearInterval(waiting);
      unlisten.forEach((stop) => stop());
      clearTimeout(heard.timer);
      clearTimeout(draftsTimer);
      clearTimeout(overviewTimer);
      clearInterval(signalPoll);
      window.removeEventListener('hashchange', onHash);
      window.removeEventListener('scroll', sawTop);
      window.removeEventListener('resize', fit);
      NARROW.removeEventListener('change', fit);
      document.removeEventListener('keydown', onKey);
      root.classList.remove('wide');
    },
  };
}
