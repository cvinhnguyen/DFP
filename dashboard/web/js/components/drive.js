// The Google Drive card of the settings page: the tool's Google address to
// share the folder with, the folder, the switch, the last check of what the
// tool can reach, and every action it has taken or refused. It only turns
// GET /api/drive into HTML; the page handles the buttons.
// Jira: DM42-43

import { has, t, tn } from '../texts.js';
import { esc, number, when } from '../format.js';
import { icon } from '../ui/icons.js';

function line(kind, text) {
  const mark = kind === 'ok' ? icon('check', 18) : icon('error', 18);
  return `<li class="drive-line ${kind}">${mark}<span>${esc(text)}</span></li>`;
}

function checkLines(s) {
  const check = s.check;
  if (!check) return '';
  const out = [];
  if (check.problem) {
    const key = `drive.problem.${check.problem}`;
    out.push(line('bad', has(key) ? t(key, { account: check.account || '' }) : check.problem));
  } else {
    out.push(line('ok', t('drive.folderLine', {
      name: (check.folder || {}).name || '?', files: number(check.files || 0), folders: number(check.folders || 0),
    })));
    if (check.outside_count) {
      out.push(line('bad', tn('drive.outside', check.outside_count, { names: (check.outside || []).join(', ') })));
    } else {
      out.push(line('ok', t('drive.alone')));
    }
    const save = check.save || 'read_only';
    const name = (check.output || {}).name;
    const key = save === 'whole_folder' && !name ? 'drive.save.whole_folderNew' : `drive.save.${save}`;
    out.push(line(save === 'subfolder' ? 'ok' : 'warn', t(key, { name: name || '' })));
  }
  return `<ul class="drive-check">${out.join('')}</ul>
    <p class="cf-hint">${esc(t('drive.checkedAt', { when: when(check.at) }))}</p>`;
}

function reason(entry) {
  if (!entry.reason) return '';
  const key = `drive.reason.${entry.reason}`;
  return has(key) ? t(key) : entry.reason;
}

function logTable(log) {
  if (!log || !log.length) return `<p class="cf-hint">${esc(t('drive.logEmpty'))}</p>`;
  const rows = log.map((e) => {
    const redacted = e.detail && e.detail.redacted
      ? Object.values(e.detail.redacted).reduce((a, b) => a + b, 0) : 0;
    const result = [t(`drive.outcome.${e.outcome}`), reason(e), redacted ? t('drive.redacted', { n: redacted }) : '']
      .filter(Boolean).join(': ');
    return `<tr class="${e.outcome}">
      <td class="drive-when">${esc(when(e.at))}</td>
      <td>${esc(t(`drive.action.${e.action}`))}</td>
      <td class="drive-name">${esc(e.name || '')}</td>
      <td>${esc(e.actor === 'n8n' ? t('drive.auto') : e.actor)}</td>
      <td>${esc(result)}</td>
    </tr>`;
  }).join('');
  return `<div class="cost-scroll" tabindex="0" role="region" aria-label="${esc(t('drive.logTitle'))}">
    <table class="cost-table drive-log">
      <thead><tr><th>${esc(t('drive.col.when'))}</th><th>${esc(t('drive.col.what'))}</th><th>${esc(t('drive.col.file'))}</th>
        <th>${esc(t('drive.col.who'))}</th><th>${esc(t('drive.col.result'))}</th></tr></thead>
      <tbody>${rows}</tbody>
    </table></div>`;
}

export function driveCard(s, busy) {
  if (!s.configured) {
    const key = s.problem && has(`drive.problem.${s.problem}`) ? `drive.problem.${s.problem}` : 'drive.noKeyHint';
    return `
      <section class="card set-card drive-card">
        <div class="set-head"><h2>${esc(t('drive.title'))}</h2></div>
        <p class="set-status bad">${icon('error', 18)} ${esc(t('drive.noKey'))}<span class="nl-meta">${esc(t(key))}</span></p>
        <p class="keep-lead">${esc(t('drive.lead'))}</p>
      </section>`;
  }
  const link = s.folder_id ? `https://drive.google.com/drive/folders/${s.folder_id}` : '';
  const counts = s.counts || {};
  return `
    <section class="card set-card drive-card">
      <div class="set-head">
        <h2>${esc(t('drive.title'))}</h2>
        <button type="button" class="btn ghost small" data-act="drive-check" ${busy || !s.folder_id ? 'disabled' : ''}>${esc(busy === 'check' ? t('drive.checking') : t('drive.check'))}</button>
      </div>
      <p class="keep-lead">${esc(t('drive.lead'))}</p>

      <p class="drive-label">${esc(t('drive.account'))}</p>
      <div class="drive-account"><code>${esc(s.account)}</code>
        <button type="button" class="btn ghost small" data-act="drive-copy" data-copy="${esc(s.account)}">${esc(t('drive.copy'))}</button></div>
      <p class="cf-hint">${esc(t('drive.accountHint'))}</p>

      <form class="set-form" data-form="drive">
        <label for="drive-folder">${esc(t('drive.folder'))}</label>
        <div class="cost-row">
          <input id="drive-folder" class="cf-input" name="folder" value="${esc(link)}" maxlength="500"
                 placeholder="https://drive.google.com/drive/folders/…" autocomplete="off" spellcheck="false">
          <button type="submit" class="btn" ${busy ? 'disabled' : ''}>${esc(t('dialog.save'))}</button>
        </div>
        <p class="cf-hint">${esc(t('drive.folderHint'))}</p>
      </form>

      <label class="cf-check drive-switch"><input type="checkbox" data-act="drive-switch" ${s.switched_on ? 'checked' : ''} ${busy || !s.folder_id ? 'disabled' : ''}>
        <span>${esc(t('drive.switch'))}</span></label>
      <p class="cf-hint">${esc(t('drive.switchHint'))}</p>

      ${checkLines(s)}

      <div class="drive-sync">
        <p>${esc(s.synced ? t('drive.synced', { when: when(s.synced) }) : t('drive.notSynced'))}</p>
        <p class="nl-meta">${esc(t('drive.counts', { read: number(counts.read || 0), refused: number(counts.refused || 0),
          skipped: number(counts.skipped || 0), waiting: number(counts.waiting || 0) }))}</p>
        <button type="button" class="btn ghost small" data-act="drive-sync" ${busy || !s.enabled ? 'disabled' : ''}>${esc(busy === 'sync' ? t('drive.syncing') : t('drive.sync'))}</button>
      </div>

      <h3 class="cost-h">${esc(t('drive.logTitle'))}</h3>
      ${logTable(s.log)}
    </section>`;
}
