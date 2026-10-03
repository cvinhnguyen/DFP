// The newsletter editor, laid out like Mailchimp's builder: the panels on
// the left (Blocks, Sections, Styles, Check), the email in the middle, the
// text toolbar above it while typing, and comments on the right.
// Jira: DM42-37
//
// It saves by itself a moment after each change. Two people share the
// work, so a save made on top of an older version is refused, and the editor
// is asked which version stays. The finished email is saved with every save,
// ready for Mailchimp.

import { api } from '../api.js';
import { t, tn, applyTexts } from '../texts.js';
import { when } from '../format.js';
import {
  readDesign, findBlock, findSection, section as makeSection, withoutArticles, removeBlock, insertSection,
} from '../newsletter/model.js';
import { renderEmail, byteSize } from '../newsletter/render.js';
import { checkDesign } from '../newsletter/checks.js';
import { startDesign } from '../newsletter/templates.js';
import { setBrand } from '../newsletter/brand.js';
import { draftTask, draftReplacesEdits, greetingOpening, draftedHtml, suggestionsBox } from '../newsletter/writing.js';
import { notReadyBox } from '../newsletter/handoff.js';
import { createStore } from './store.js';
import { createCanvas, setField } from './canvas.js';
import { createDnd } from './dnd.js';
import { createTextTools } from './texttools.js';
import { createSettings } from './settings.js';
import { createBlocksPanel } from './panels/blocks.js';
import { createSectionsPanel } from './panels/sections.js';
import { createStylesPanel } from './panels/styles.js';
import { createCheckPanel } from './panels/check.js';
import { createLibrary } from './library.js';
import { openPreview } from './preview.js';
import { chooseTemplate } from './chooser.js';
import { createComments } from './comments.js';
import { modal, confirmDialog, promptDialog, toast } from '../ui/dialogs.js';
import { h, $ } from '../ui/dom.js';
import { icon } from '../ui/icons.js';
import { popover, closePopover, textInput, field } from '../ui/controls.js';

const issueId = Number(new URLSearchParams(location.search).get('issue'));
const BACK = `index.html#/newsletter?id=${issueId}`;
const LIST = 'index.html#/newsletters';
const RAIL = ['blocks', 'sections', 'styles', 'check'];
const ICONS = { blocks: 'image', heading: 'heading', text: 'paragraph', image: 'image', button: 'button', divider: 'divider', spacer: 'spacer', video: 'video', social: 'social', logo: 'logo', footer: 'footer', columns: 'sections', article: 'article' };

const context = { issue: null, articles: [], me: null, mailchimp: null };
let store = null;
let canvas = null;
let dnd = null;
let library = null;
let textTools = null;
let comments = null;
let checkPanel = null;
let sectionsPanel = null;
let settingsPanel = null;
let lastChecks = null;
let basedOn = null;
let saving = null;
let saveAgain = false;
let saveTimer = null;
let checkTimer = null;
let railPanel = 'blocks';

// ---------- the page's own words and icons ----------

function fillIcons(root = document) {
  root.querySelectorAll('[data-icon]').forEach((el) => {
    el.innerHTML = icon(el.dataset.icon, Number(el.dataset.iconSize) || 20);
  });
}

function fail(message, link) {
  document.body.classList.add('ed-failed');
  const box = $('ed-message');
  box.textContent = message;
  if (link) box.append(' ', h('a', { href: link.href }, link.label));
  box.hidden = false;
}

function setStatus(kind, value) {
  const box = $('ed-saved');
  box.dataset.kind = kind;
  box.textContent = {
    saved: () => t('editor.saved', { when: when(value) }),
    saving: () => t('editor.saving'),
    unsaved: () => t('editor.unsaved'),
    error: () => t('editor.saveFailed', { message: value }),
    loggedOut: () => t('editor.loggedOut'),
  }[kind]();
}

// ---------- saving ----------

// The finished email. The copy saved for the dashboard also carries the
// preview's wireframes for pictures not added yet, which every export drops.
function exportHtml({ markers = false } = {}) {
  return renderEmail(store.design, { mode: 'export', issue: context.issue, t, markers });
}

async function save({ force = false } = {}) {
  if (saving) {
    saveAgain = true;
    return saving;
  }
  clearTimeout(saveTimer);
  const version = store.version;
  setStatus('saving');
  saving = (async () => {
    try {
      const result = await api.put(`/api/issues/${issueId}/design`, { design: store.design, html: exportHtml({ markers: true }), based_on: basedOn, force });
      basedOn = result.saved_at;
      store.saved(version);
      setStatus(store.dirty ? 'unsaved' : 'saved', result.saved_at);
    } catch (e) {
      if (e.code === 'edited_elsewhere') showConflict(e.params);
      else if (e.status === 401) setStatus('loggedOut');
      else setStatus('error', e.message);
    }
  })();
  await saving;
  saving = null;
  if (saveAgain) {
    saveAgain = false;
    await save();
  }
  return null;
}

function scheduleSave() {
  setStatus('unsaved');
  clearTimeout(saveTimer);
  saveTimer = setTimeout(save, 1500);
}

function showConflict(params) {
  modal({
    title: t('editor.conflictTitle'),
    body: h('p', {}, t('editor.conflictText', { name: params.name || '?', when: params.at ? when(params.at) : '' })),
    closable: false,
    actions: [
      { label: t('editor.conflictReload'), onClick: () => { store.saved(store.version); location.reload(); } },
      { label: t('editor.conflictOverwrite'), primary: true, onClick: (close) => { close(); save({ force: true }); } },
    ],
  });
}

// ---------- checks ----------

function runChecks() {
  lastChecks = checkDesign(store.design, { issue: context.issue, articles: context.articles, size: byteSize(exportHtml()) });
  checkPanel.update(lastChecks);
  const badge = $('ed-check-badge');
  badge.textContent = lastChecks.errorCount ? String(lastChecks.errorCount) : '';
  badge.hidden = !lastChecks.errorCount;
}

function scheduleChecks() {
  clearTimeout(checkTimer);
  checkTimer = setTimeout(runChecks, 300);
}

// ---------- panels ----------

function showPanel(name) {
  ['blocks', 'sections', 'styles', 'check', 'settings'].forEach((p) => { $(`panel-${p}`).hidden = p !== name; });
  document.querySelectorAll('.ed-rail-item').forEach((b) => {
    if (b.dataset.panel === name) b.setAttribute('aria-current', 'true');
    else b.removeAttribute('aria-current');
  });
  $('ed-panel').scrollTop = 0;
}

function openRail(name) {
  railPanel = name;
  if (store.selection) store.select(null);
  showPanel(name);
}

// ---------- what the parts of the editor ask for ----------

const actions = {
  dragBlock(id, event) {
    const found = findBlock(store.design, id);
    if (!found) return;
    dnd.begin(event, { kind: 'move', id, blockType: found.block.type, label: t(`block.${found.block.type}`), iconName: ICONS[found.block.type] || 'blocks' });
  },
  comment(blockId) {
    store.select({ kind: 'block', id: blockId });
    comments.commentOn();
  },
  sectionMenu(id, anchor) {
    const items = [
      { label: t('sections.rename'), iconName: 'pencil', run: () => actions.renameSection(id) },
      { label: t('sections.save'), iconName: 'save', run: () => actions.saveSection(id) },
      { label: t('sections.delete'), iconName: 'trash', run: () => { store.change((d) => { d.sections = d.sections.filter((s) => s.id !== id); }); store.select(null); } },
    ];
    popover(anchor, h('div', { class: 'tt-menu', role: 'menu' }, items.map((item) => h('button', {
      type: 'button', role: 'menuitem', class: 'tt-menu-item', onclick: () => { closePopover(); item.run(); },
    }, h('span', { html: icon(item.iconName, 16) }), h('span', {}, item.label)))), { className: 'tt-pop', align: 'right' });
  },
  // A double click on an image opens the image library to replace it.
  open(blockId) {
    const found = findBlock(store.design, blockId);
    if (!found) return;
    const b = found.block;
    if (b.type === 'image' || b.type === 'logo') actions.library((img) => setImage(blockId, img));
  },
  key: onKey,
  selectionChanged() {
    textTools.update();
  },
  upload(onPick) {
    library.upload(onPick);
  },
  library(onPick) {
    library.open(onPick);
  },
  videoThumbnail(url) {
    return api.post('/api/images/video', { url, issue_id: issueId });
  },
  async saveSection(id) {
    const found = findSection(store.design, id);
    if (!found) return;
    const name = await promptDialog(t('editor.saveSectionTitle'), found.section.name, { label: t('editor.nameLabel'), hint: t('editor.saveSectionHint') });
    if (!name) return;
    try {
      await api.post('/api/templates', { kind: 'section', name, design: withoutArticles(found.section) });
      sectionsPanel.savedChanged();
      toast(t('editor.sectionSaved', { name }));
    } catch (e) {
      toast(e.message, 'warn');
    }
  },
  async renameSection(id) {
    const found = findSection(store.design, id);
    if (!found) return;
    const name = await promptDialog(t('sections.rename'), found.section.name, { label: t('editor.nameLabel'), maxlength: 60 });
    if (name) store.change((d) => { findSection(d, id).section.name = name; });
  },
  addBlankSection() {
    const sec = makeSection(t('editor.newSection'), null, []);
    store.change((d) => {
      const footer = d.sections.findIndex((s) => s.role === 'footer');
      insertSection(d, footer < 0 ? d.sections.length : footer, sec);
    });
    store.select({ kind: 'section', id: sec.id });
    actions.revealSection(sec.id);
  },
  reveal(blockId) {
    canvas.scrollTo(blockId);
  },
  revealSection(id) {
    const el = canvas.sectionEl(id);
    if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
  },
  toast,
  confirm: (text) => confirmDialog(text),
  prompt: (title, value) => promptDialog(title, value),
  help: showHelp,
  editSubject,
  draft: (blockId) => draft(blockId),
  isDrafting: (blockId) => drafting.has(blockId),
};

function setImage(blockId, img) {
  store.change((d) => {
    const found = findBlock(d, blockId);
    if (!found) return;
    const b = found.block;
    if (b.type === 'image') {
      b.src = img.src;
      b.naturalWidth = img.width || 0;
      b.naturalHeight = img.height || 0;
    } else if (b.type === 'logo') b.src = img.src;
  });
}

// After something new is dropped in: an image asks for its picture, text is
// ready for typing.
function afterInsert({ block }) {
  if (!block) return;
  if (block.type === 'image' || block.type === 'logo') {
    library.open((img) => setImage(block.id, img));
  } else if (block.type === 'text') {
    canvas.startEditing(block.id, 'html');
  }
  actions.reveal(block.id);
}

// ---------- writing help from the AI ----------

// The blocks the AI is writing for now, so the panel can say it is busy.
const drafting = new Set();

// A draft of the greeting, or of why a trend matters, into its block. It
// goes in unchecked, and a new one replaces the last only after asking, if
// someone has changed the text since.
async function draft(blockId) {
  const found = findBlock(store.design, blockId);
  const task = found && draftTask(found.block, found.section);
  if (task !== 'greeting' && task !== 'trend') return;
  if (draftReplacesEdits(found.block) && !(await confirmDialog(t('ai.replaceConfirm')))) return;
  const attempt = found.block.ai ? (Number(found.block.ai.attempt) || 1) + 1 : 1;
  const signal = found.section.signal;
  drafting.add(blockId);
  settingsPanel.refresh();
  try {
    const result = task === 'greeting'
      ? await api.post(`/api/issues/${issueId}/ai/greeting`, { attempt })
      : await api.post(`/api/signals/${signal}/ai/trend`, { attempt });
    store.change((d) => {
      const f = findBlock(d, blockId);
      if (!f) return;
      const opening = task === 'greeting' ? greetingOpening(f.block) : '';
      const html = draftedHtml(task, f.block, result, opening);
      f.block.html = html;
      f.block.placeholder = false;
      f.block.checked = false;
      f.block.ai = { task, attempt, opening, html, tokens: result.tokens, cost_eur: result.cost_eur };
    });
    if (result.truncated) toast(t('ai.truncated'), 'warn');
  } catch (e) {
    toast(e.message, 'warn');
  } finally {
    drafting.delete(blockId);
    settingsPanel.refresh();
  }
}

// ---------- the subject line, from the editor ----------

function editSubject() {
  const issue = context.issue;
  let subject = issue.subject;
  let preheader = issue.preheader;
  const subjectInput = textInput(subject, (v) => { subject = v; }, { maxlength: 150 });
  const preheaderInput = textInput(preheader, (v) => { preheader = v; }, { maxlength: 150 });
  // Suggestions from the AI, pressed into the fields; saving is still the
  // editor's own.
  const suggestions = h('div', { class: 'ai-suggest-box' });
  let attempt = 0;
  const ask = h('button', { type: 'button', class: 'btn ghost small', onclick: async () => {
    ask.disabled = true;
    ask.textContent = t('ai.suggesting');
    try {
      attempt += 1;
      const result = await api.post(`/api/issues/${issueId}/ai/subject`, { attempt });
      suggestions.replaceChildren(suggestionsBox(result, {
        onSubject: (text) => { subjectInput.value = text; subject = text; subjectInput.focus(); },
        onPreheader: (text) => { preheaderInput.value = text; preheader = text; preheaderInput.focus(); },
      }));
    } catch (e) {
      toast(e.message, 'warn');
    } finally {
      ask.disabled = false;
      ask.textContent = t(attempt ? 'ai.suggestMore' : 'ai.suggest');
    }
  } }, t('ai.suggest'));
  modal({
    title: t('editor.subjectTitle'),
    body: h('div', {},
      field(t('issue.subject'), subjectInput, t('issue.subjectHint')),
      field(t('issue.preheader'), preheaderInput, t('issue.preheaderHint')),
      h('div', { class: 'ai-suggest-row' }, ask, h('span', { class: 'cf-hint' }, t('ai.suggestHint'))),
      suggestions),
    actions: [
      { label: t('dialog.cancel'), value: null },
      { label: t('dialog.save'), primary: true, onClick: async (close) => {
        try {
          context.issue = await api.patch(`/api/issues/${issueId}`, { subject, preheader });
          close();
          runChecks();
          toast(t('issue.fieldSaved'));
        } catch (e) {
          toast(e.message, 'warn');
        }
      } },
    ],
  });
}

function showHelp() {
  modal({
    title: t('help.title'),
    body: h('div', { class: 'help' }, ['add', 'type', 'select', 'move', 'styles', 'check', 'save'].map((k) => h('div', { class: 'help-row' },
      h('h3', {}, t(`help.${k}`)), h('p', {}, t(`help.${k}Text`))))),
    actions: [{ label: t('dialog.ok'), primary: true, value: true }],
  });
}

// ---------- top bar ----------

function renderName() {
  const button = $('ed-name');
  button.textContent = context.issue.name;
  button.title = t('editor.rename');
  document.title = `${context.issue.name} · ${t('editor.title')}`;
}

function startRename() {
  const button = $('ed-name');
  const input = h('input', { class: 'ed-name-input', value: context.issue.name, maxlength: 120, 'aria-label': t('editor.rename') });
  button.hidden = true;
  button.after(input);
  input.focus();
  input.select();
  let done = false;
  const finish = async (keep) => {
    if (done) return;
    done = true;
    const name = input.value.trim();
    input.remove();
    button.hidden = false;
    if (!keep || !name || name === context.issue.name) return;
    try {
      context.issue = await api.patch(`/api/issues/${issueId}`, { name });
      renderName();
    } catch (e) {
      toast(e.message, 'warn');
    }
  };
  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') finish(true);
    if (e.key === 'Escape') finish(false);
  });
  input.addEventListener('blur', () => finish(true));
}

async function saveAndExit() {
  canvas.stopEditing({ redraw: false });
  await save();
  if (store.dirty) return;
  runChecks();
  if (!lastChecks.errorCount) {
    location.href = BACK;
    return;
  }
  modal({
    title: tn('editor.exitErrors', lastChecks.errorCount),
    body: h('div', {},
      h('p', {}, t('editor.exitErrorsLead')),
      h('ul', { class: 'exit-errors' }, lastChecks.errors.map((e) => h('li', {}, h('span', { html: icon('error', 16) }),
        ` ${e.items.length ? tn(`check.${e.code}`, e.count, e.params) : t(`check.${e.code}.one`, e.params)}`)))),
    actions: [
      { label: t('editor.exitAnyway'), onClick: () => { location.href = BACK; } },
      { label: t('editor.resolve'), primary: true, onClick: (close) => { close(); openRail('check'); } },
    ],
  });
}

function exitMenu(anchor) {
  const items = [
    { label: t('editor.saveAsTemplate'), iconName: 'save', run: saveAsTemplate },
    { label: t('editor.changeTemplate'), iconName: 'template', run: changeTemplate },
    { label: t('editor.backWithoutChecks'), iconName: 'arrowLeft', run: async () => { await save(); if (!store.dirty) location.href = BACK; } },
  ];
  popover(anchor, h('div', { class: 'tt-menu', role: 'menu' }, items.map((item) => h('button', {
    type: 'button', role: 'menuitem', class: 'tt-menu-item', onclick: () => { closePopover(); item.run(); },
  }, h('span', { html: icon(item.iconName, 16) }), h('span', {}, item.label)))), { className: 'tt-pop', align: 'right' });
}

async function saveAsTemplate() {
  const name = await promptDialog(t('editor.saveTemplateTitle'), context.issue.name, { label: t('editor.nameLabel'), hint: t('editor.saveTemplateHint') });
  if (!name) return;
  try {
    await api.post('/api/templates', { kind: 'template', name, design: withoutArticles(store.design) });
    toast(t('editor.templateSaved', { name }));
  } catch (e) {
    toast(e.message, 'warn');
  }
}

async function changeTemplate() {
  if (!(await confirmDialog(t('editor.changeTemplateConfirm'), { okLabel: t('editor.changeTemplate') }))) return;
  chooseTemplate({
    api,
    issue: context.issue,
    articles: context.articles,
    closable: true,
    onChoose: (design) => {
      store.replace(design);
      save();
    },
  });
}

// ---------- sending a test through Mailchimp ----------

function sendTest() {
  // A test brings the draft in Mailchimp up to date first, so it waits for
  // Tarkistus like the way into Mailchimp does. The preview works any time.
  runChecks();
  if (lastChecks.errorCount) {
    modal({
      title: t('test.title'),
      body: notReadyBox(lastChecks.errors, { title: t('test.notReady'), lead: t('test.notReadyLead') }),
      actions: [
        { label: t('dialog.cancel'), value: null },
        { label: t('editor.resolve'), primary: true, onClick: (close) => { close(); openRail('check'); } },
      ],
    });
    return;
  }
  let saved = '';
  try {
    saved = localStorage.getItem('dfp.testEmails') || '';
  } catch {
    saved = '';
  }
  let emails = saved || context.me.email || '';
  const status = h('p', { class: 'cf-hint', role: 'status' });
  modal({
    title: t('test.title'),
    body: h('div', {},
      field(t('test.to'), textInput(emails, (v) => { emails = v; }, { placeholder: 'kaisa@esimerkki.fi, niina@esimerkki.fi', maxlength: 400 }), t('test.toHint')),
      h('p', { class: 'st-note' }, t('test.note')),
      status),
    actions: [
      { label: t('dialog.cancel'), value: null },
      { label: t('test.send'), primary: true, onClick: async (close) => {
        const list = emails.split(/[\s,;]+/).map((e) => e.trim()).filter(Boolean);
        if (!list.length) {
          status.textContent = t('test.noAddress');
          return;
        }
        try {
          localStorage.setItem('dfp.testEmails', list.join(', '));
        } catch {
          // Remembering the addresses is a convenience.
        }
        status.textContent = t('test.sending');
        await save();
        try {
          await api.post(`/api/issues/${issueId}/mailchimp/test`, { emails: list });
          close();
          toast(t('test.sent', { to: list.join(', ') }));
        } catch (e) {
          status.textContent = e.message;
        }
      } },
    ],
  });
}

// ---------- keys ----------

function onKey(event) {
  const target = event.target;
  const inField = target && (target.closest && target.closest('input, textarea, select, [contenteditable="true"]'));
  const mod = event.metaKey || event.ctrlKey;
  const key = event.key.toLowerCase();
  if (mod && key === 's') {
    event.preventDefault();
    save();
    return;
  }
  if (inField) return;
  if (mod && key === 'z') {
    event.preventDefault();
    if (event.shiftKey) store.redo();
    else store.undo();
  } else if (mod && key === 'y') {
    event.preventDefault();
    store.redo();
  } else if ((event.key === 'Delete' || event.key === 'Backspace') && store.selection && store.selection.kind === 'block' && !store.editing) {
    event.preventDefault();
    const id = store.selection.id;
    store.change((d) => { removeBlock(d, id); });
    store.select(null);
  } else if (event.key === 'Escape' && store.selection && !document.querySelector('.md-overlay, .cf-popover')) {
    store.select(null);
  }
}

// ---------- starting ----------

async function sourceFor(template) {
  const [kind, id] = String(template || '').split(':');
  if (kind === 'builtin') return { kind: 'builtin', key: id };
  try {
    if (kind === 'saved') return { kind: 'design', design: (await api.get(`/api/templates/${Number(id)}`)).design };
    if (kind === 'issue') return { kind: 'design', design: (await api.get(`/api/issues/${Number(id)}/design`)).design };
  } catch {
    return null;
  }
  return null;
}

async function refreshArticles() {
  try {
    const fresh = await api.get(`/api/issues/${issueId}`);
    context.issue = fresh;
    context.articles = fresh.articles;
    runChecks();
    blocksPanel.render();
  } catch {
    // Kept as it was; the next focus tries again.
  }
}

let blocksPanel = null;

function bindUi() {
  $('ed-name').addEventListener('click', startRename);
  $('ed-exit').addEventListener('click', saveAndExit);
  $('ed-exit-menu').addEventListener('click', (e) => exitMenu(e.currentTarget));
  $('ed-test').addEventListener('click', sendTest);
  document.querySelectorAll('.ed-rail-item').forEach((b) => b.addEventListener('click', () => openRail(b.dataset.panel)));
  for (const device of ['desktop', 'mobile']) {
    $(`ed-${device}`).addEventListener('click', () => {
      store.setDevice(device);
      $('ed-desktop').setAttribute('aria-pressed', String(device === 'desktop'));
      $('ed-mobile').setAttribute('aria-pressed', String(device === 'mobile'));
    });
  }
  $('ed-undo').addEventListener('click', () => store.undo());
  $('ed-redo').addEventListener('click', () => store.redo());
  $('ed-comments-toggle').addEventListener('click', () => comments.toggle());
  $('ed-preview').addEventListener('click', () => {
    canvas.stopEditing({ redraw: false });
    openPreview({
      design: store.design,
      issue: context.issue,
      from: context.mailchimp && context.mailchimp.from_name ? `${context.mailchimp.from_name}${context.mailchimp.reply_to ? ` <${context.mailchimp.reply_to}>` : ''}` : '',
      onEditBlock: (id) => {
        store.select({ kind: 'block', id });
        actions.reveal(id);
      },
      onSendTest: context.mailchimp && context.mailchimp.connected ? sendTest : null,
    });
  });
  document.addEventListener('keydown', onKey);
  window.addEventListener('beforeunload', (event) => {
    if (store && (store.dirty || saving)) {
      event.preventDefault();
      event.returnValue = '';
    }
  });
  window.addEventListener('focus', refreshArticles);
  window.addEventListener('auth-lost', () => setStatus('loggedOut'));
}

async function start() {
  applyTexts(document);
  fillIcons();
  if (!issueId) {
    fail(t('editor.noIssue'), { href: LIST, label: t('editor.toList') });
    return;
  }
  let stored;
  try {
    [context.me, context.issue, stored] = await Promise.all([
      api.get('/api/me'),
      api.get(`/api/issues/${issueId}`),
      api.get(`/api/issues/${issueId}/design`),
    ]);
  } catch (e) {
    if (e.status === 401) {
      location.href = 'index.html';
      return;
    }
    fail(e.message, { href: LIST, label: t('editor.toList') });
    return;
  }
  if (context.issue.status !== 'draft') {
    fail(t('error.issue_sent'), { href: BACK, label: t('editor.toIssue') });
    return;
  }
  try {
    context.mailchimp = await api.get('/api/mailchimp');
  } catch {
    context.mailchimp = null;
  }
  // The banners and logo templates start with, before any template is built.
  try {
    setBrand(await api.get('/api/brand'));
  } catch {
    // The association's own, then.
  }
  context.articles = context.issue.articles;
  basedOn = stored.saved_at;
  renderName();

  let design = readDesign(stored.design);
  let firstOpen = null;
  if (!design) {
    const source = context.issue.template ? await sourceFor(context.issue.template) : null;
    if (source) {
      design = startDesign(source, context.issue, context.articles);
      firstOpen = 'started';
    } else {
      design = startDesign({ kind: 'builtin', key: 'eok' }, context.issue, context.articles);
      firstOpen = 'choose';
    }
  }

  store = createStore(design);
  canvas = createCanvas({ store, stage: $('ed-stage'), frame: $('ed-frame'), layer: $('ed-layer'), actions });
  dnd = createDnd({ store, canvas, stage: $('ed-stage'), frame: $('ed-frame'), after: afterInsert });
  textTools = createTextTools({ store, canvas, bar: $('ed-texttools') });
  library = createLibrary({ api, issueId });
  settingsPanel = createSettings({ store, root: $('panel-settings'), actions, context });
  blocksPanel = createBlocksPanel({ store, dnd, root: $('panel-blocks'), context, actions });
  sectionsPanel = createSectionsPanel({ store, dnd, root: $('panel-sections'), context, actions, api });
  createStylesPanel({ store, root: $('panel-styles'), buttonStyles: settingsPanel.buttonStyles }).render();
  checkPanel = createCheckPanel({ store, root: $('panel-check'), context, actions });
  comments = createComments({ api, store, issueId, me: context.me, panel: $('ed-comments'), badge: $('ed-comments-badge'), actions });
  blocksPanel.render();
  sectionsPanel.render();

  store.on('change', () => {
    scheduleSave();
    scheduleChecks();
    $('ed-undo').disabled = !store.canUndo();
    $('ed-redo').disabled = !store.canRedo();
  });
  store.on('select', () => showPanel(store.selection ? 'settings' : railPanel));
  $('ed-test').hidden = !(context.mailchimp && context.mailchimp.connected);
  $('ed-undo').disabled = true;
  $('ed-redo').disabled = true;
  // "Korjaa editorissa", from the way into Mailchimp, opens on Tarkistus.
  const firstPanel = new URLSearchParams(location.search).get('panel');
  if (RAIL.includes(firstPanel)) openRail(firstPanel);
  else showPanel('blocks');
  runChecks();
  await canvas.ready();
  document.body.classList.add('ed-ready');
  setStatus(stored.saved_at ? 'saved' : 'unsaved', stored.saved_at);

  if (firstOpen === 'choose') {
    chooseTemplate({
      api, issue: context.issue, articles: context.articles, closable: false, backHref: BACK,
      onChoose: (chosen) => {
        store.replace(chosen);
        save();
      },
    });
  } else if (firstOpen === 'started') {
    save();
  }
}

// For the browser's console and the team's tests: the editor's state.
window.dfpEditor = { store: () => store, setField };
bindUi();
start();
