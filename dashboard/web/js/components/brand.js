// The banners and logo card of the settings page: which pictures new emails
// start with, the association's own or ones an admin uploaded. It only turns
// GET /api/brand into HTML; the page uploads and saves.
// Jira: DM42-37

import { t } from '../texts.js';
import { esc } from '../format.js';
import { BRAND_DEFAULTS } from '../newsletter/brand.js';

const ROWS = ['newsletter', 'members', 'logo'];

// busy: the one being uploaded now, if any.
export function brandCard(state, busy = null) {
  const row = (which) => {
    const uploaded = state[which];
    const pic = uploaded || BRAND_DEFAULTS[which];
    const working = busy === which;
    return `
      <div class="brand-row">
        <div class="brand-pic${which === 'logo' ? ' logo' : ''}"><img src="${esc(pic.src)}" alt="${esc(t(`brand.${which}`))}" width="${which === 'logo' ? 152 : 282}"></div>
        <div class="brand-info">
          <h4>${esc(t(`brand.${which}`))}</h4>
          <p class="cf-hint">${esc(t(uploaded ? 'brand.uploaded' : 'brand.own', { w: pic.width, h: pic.height }))}</p>
          <div class="brand-actions">
            <button type="button" class="btn ghost small" data-act="brand-upload" data-which="${which}"${working ? ' disabled' : ''}>${esc(t(working ? 'brand.uploading' : 'brand.upload'))}</button>
            ${uploaded ? `<button type="button" class="btn ghost small" data-act="brand-reset" data-which="${which}">${esc(t('brand.reset'))}</button>` : ''}
          </div>
        </div>
      </div>`;
  };
  return `
    <section class="card set-card brand-card">
      <div class="set-head"><h3>${esc(t('brand.title'))}</h3></div>
      <p class="keep-lead">${esc(t('brand.lead'))}</p>
      <div class="brand-list">${ROWS.map(row).join('')}</div>
      <p class="cf-hint">${esc(t('brand.hint'))}</p>
    </section>`;
}
