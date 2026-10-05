// The Drive folder's files, as the guard last listed them, and what became
// of each: read into an article, waiting to be read and when, or not read
// and why (GET /api/drive/files). For whoever put a file in the folder and
// wonders whether the tool saw it. A window, opened from the folder's place
// on Artikkelit and from the Drive card on Asetukset.
// Jira: DM42-43

import { api } from '../api.js';
import { has, t } from '../texts.js';
import { esc, number, safeUrl, time, when } from '../format.js';
import { modal } from '../ui/dialogs.js';

// What kind of file, by its type, for "Ei luettu: kuva".
const KINDS = [
  [/^image\/(jpeg|png|gif|webp)$/, 'image'],
  [/^image\/hei[cf]$/, 'heic'],
  [/^video\//, 'video'],
  [/spreadsheetml|ms-excel|opendocument\.spreadsheet/, 'sheet'],
  [/presentationml|ms-powerpoint|opendocument\.presentation/, 'slides'],
  [/zip|7z|rar|tar|gzip/, 'archive'],
];

function kind(mime) {
  const found = KINDS.find(([pattern]) => pattern.test(mime || ''));
  return found ? found[1] : 'other';
}

const READ = { summarised: 'read', new: 'readComing', queued: 'readComing', filtered_out: 'readShort',
  summary_failed: 'readFailed' };

// What became of one file, in words, and whether that is done, coming or not
// happening.
export function fileState(f) {
  if (f.is_folder) {
    if (f.status === 'own') return { text: t('files.state.own'), tone: 'quiet' };
    if (f.status === 'skipped') return { text: t(`files.state.${f.reason}`), tone: 'no' };
    return { text: t('files.state.folder'), tone: 'quiet' };
  }
  if (f.status === 'read') return { text: t(`files.state.${READ[f.item_status] || 'read'}`), tone: 'ok' };
  if (f.status === 'waiting') return { text: t('files.state.waiting', { time: time(f.next_read_at) }), tone: 'wait' };
  if (f.status === 'new') return { text: t('files.state.new', { time: time(f.next_read_at) }), tone: 'wait' };
  if (f.reason === 'type') return { text: t('files.state.type', { kind: t(`files.kind.${kind(f.mime_type)}`) }), tone: 'no' };
  const key = `files.state.${f.reason}`;
  return { text: has(key) ? t(key) : t('files.state.failed'), tone: 'no' };
}

// How many files were read, are still to come, and were not read.
export function fileCounts(files) {
  const only = files.filter((f) => !f.is_folder);
  const read = only.filter((f) => f.status === 'read').length;
  const coming = only.filter((f) => f.status === 'new' || f.status === 'waiting').length;
  return { files: only.length, read, coming, not: only.length - read - coming };
}

function row(f, articleHref) {
  const state = fileState(f);
  const article = f.item_id && !f.withdrawn && articleHref
    ? `<a href="${esc(articleHref(f.item_id))}" data-act="files-open">${esc(t('files.openArticle'))}</a>` : '';
  const drive = safeUrl(f.web_link);
  return `<tr class="${f.is_folder ? 'df-folder' : ''}">
      <td class="df-name"><span class="df-path">${esc(f.path ? `${f.path}/` : '')}</span>${esc(f.name)}${f.is_folder ? '/' : ''}
        ${drive ? `<a class="df-drive" href="${esc(drive)}" target="_blank" rel="noopener noreferrer">${esc(t('files.openDrive'))} ↗</a>` : ''}</td>
      <td class="df-when">${f.is_folder || !f.modified_at ? '' : esc(when(f.modified_at))}</td>
      <td class="df-state ${state.tone}">${esc(state.text)}${article ? ` · ${article}` : ''}</td>
    </tr>`;
}

export function filesHtml(data, articleHref) {
  const files = data.files || [];
  if (!files.length) return `<p class="cf-hint">${esc(t('files.empty'))}</p>`;
  const c = fileCounts(files);
  return `
    <p class="df-summary">${esc(t('files.summary', { files: number(c.files), read: number(c.read), coming: number(c.coming), not: number(c.not) }))}
      ${data.synced ? `<span class="nl-meta">${esc(t('files.synced', { when: when(data.synced) }))}</span>` : ''}</p>
    <div class="cost-scroll df-scroll" tabindex="0" role="region" aria-label="${esc(t('files.title'))}">
      <table class="cost-table df-table">
        <thead><tr><th>${esc(t('files.col.name'))}</th><th>${esc(t('files.col.changed'))}</th><th>${esc(t('files.col.state'))}</th></tr></thead>
        <tbody>${files.map((f) => row(f, articleHref)).join('')}</tbody>
      </table>
    </div>`;
}

// The window. Opening an article from it closes it.
export async function showDriveFiles() {
  const body = document.createElement('div');
  body.className = 'df';
  body.innerHTML = `<p class="keep-lead">${esc(t('files.lead'))}</p><p class="cf-hint" role="status">…</p>`;
  const dialog = modal({ title: t('files.title'), body, wide: true, className: 'md-drive-files' });
  body.addEventListener('click', (event) => {
    if (event.target.closest('[data-act="files-open"]')) dialog.close();
  });
  try {
    const data = await api.get('/api/drive/files');
    const href = data.source_id ? (id) => `#/?place=source:${data.source_id}&item=${id}` : null;
    body.innerHTML = `<p class="keep-lead">${esc(t('files.lead'))}</p>${filesHtml(data, href)}`;
  } catch (e) {
    body.innerHTML = `<p class="problem">${esc(e.message)}</p>`;
  }
  return dialog;
}
