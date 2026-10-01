// Kuvapankki: every image uploaded for the newsletters, like Mailchimp's
// Content Studio. Upload new ones by choosing files or dropping them on the
// window, search by name, pick one for the block. An image is shrunk for
// email and stripped of its camera data on upload, by the dashboard.

import { t, tn } from '../texts.js';
import { when } from '../format.js';
import { h, clear, fill } from '../ui/dom.js';
import { icon } from '../ui/icons.js';
import { modal, confirmDialog, toast } from '../ui/dialogs.js';

const PER_PAGE = 24;

export function createLibrary({ api, issueId }) {
  async function uploadFiles(files) {
    const form = new FormData();
    [...files].slice(0, 10).forEach((f) => form.append('files', f));
    form.append('issue_id', String(issueId));
    const response = await fetch('/api/images', { method: 'POST', body: form, credentials: 'same-origin' });
    const body = await response.json().catch(() => ({}));
    if (!response.ok) {
      const error = new Error(body.code ? t(`error.${body.code}`, body.params || {}) : (body.detail || t('library.uploadFailed')));
      throw error;
    }
    return body.data || [];
  }

  // A file chooser, straight from a button: the first image goes in.
  function upload(onPick) {
    const input = h('input', { type: 'file', accept: 'image/jpeg,image/png,image/gif,image/webp', hidden: true });
    input.addEventListener('change', async () => {
      if (!input.files.length) return;
      try {
        const added = await uploadFiles(input.files);
        if (added[0]) onPick(added[0]);
        toast(tn('library.uploaded', added.length));
      } catch (e) {
        toast(e.message, 'warn');
      } finally {
        input.remove();
      }
    });
    document.body.append(input);
    input.click();
  }

  function open(onPick) {
    let page = 1;
    let query = '';
    let scope = 'all';
    let result = { data: [], total: 0 };
    const grid = h('div', { class: 'lib-grid' });
    const status = h('p', { class: 'lib-status', role: 'status' });
    const pager = h('div', { class: 'lib-pager' });
    const search = h('input', { class: 'cf-input lib-search', type: 'search', placeholder: t('library.search'), 'aria-label': t('library.search') });
    const fileInput = h('input', { type: 'file', multiple: true, accept: 'image/jpeg,image/png,image/gif,image/webp', hidden: true });
    const uploadButton = h('button', { type: 'button', class: 'btn', html: `${icon('upload', 18)} `, onclick: () => fileInput.click() }, t('library.upload'));
    const nav = h('nav', { class: 'lib-nav' },
      ['all', 'issue'].map((s) => h('button', { type: 'button', class: 'lib-nav-item', 'aria-pressed': String(s === scope), dataset: { scope: s }, html: `${icon(s === 'all' ? 'folder' : 'article', 18)} ` }, t(`library.scope.${s}`))));

    async function load() {
      status.textContent = t('library.loading');
      try {
        result = await api.get('/api/images', { q: query, page, per_page: PER_PAGE, issue_id: scope === 'issue' ? issueId : undefined });
        draw();
      } catch (e) {
        status.textContent = e.message;
      }
    }

    function draw() {
      clear(grid);
      const { data, total } = result;
      if (!total) {
        grid.append(h('div', { class: 'lib-empty' },
          h('span', { html: icon('image', 40) }),
          h('h3', {}, query ? t('library.nothingFound') : t('library.empty')),
          h('p', {}, t('library.emptyHint')),
          query ? null : h('button', { type: 'button', class: 'btn', onclick: () => fileInput.click() }, t('library.upload'))));
      }
      data.forEach((img) => {
        const card = h('div', { class: 'lib-card' },
          h('button', { type: 'button', class: 'lib-pick', title: t('library.pick'), onclick: () => {
            dialog.close();
            onPick(img);
          } },
          h('img', { src: img.src, alt: '', loading: 'lazy' })),
          h('div', { class: 'lib-meta' },
            h('span', { class: 'lib-name', title: img.name }, img.name),
            h('span', { class: 'lib-size' }, `${img.width} × ${img.height}${img.created_at ? ` · ${when(img.created_at)}` : ''}`)),
          h('button', { type: 'button', class: 'st-icon-btn lib-delete', title: t('library.delete'), 'aria-label': t('library.delete'), html: icon('trash', 16), onclick: async () => {
            if (!(await confirmDialog(t('library.deleteConfirm', { name: img.name }), { danger: true, okLabel: t('library.delete') }))) return;
            try {
              await api.del(`/api/images/${img.key}`);
              toast(t('library.deleted'));
              load();
            } catch (e) {
              toast(e.message, 'warn');
            }
          } }));
        grid.append(card);
      });
      const pages = Math.max(1, Math.ceil(total / PER_PAGE));
      status.textContent = total ? t('library.showing', { from: (page - 1) * PER_PAGE + 1, to: Math.min(total, page * PER_PAGE), total }) : '';
      fill(pager, 
        h('button', { type: 'button', class: 'btn ghost small', disabled: page <= 1, onclick: () => { page -= 1; load(); } }, t('library.previous')),
        h('span', {}, t('library.page', { page, pages })),
        h('button', { type: 'button', class: 'btn ghost small', disabled: page >= pages, onclick: () => { page += 1; load(); } }, t('library.next')));
    }

    async function addFiles(files) {
      if (!files || !files.length) return;
      status.textContent = t('library.uploading');
      try {
        const added = await uploadFiles(files);
        toast(tn('library.uploaded', added.length));
        page = 1;
        query = '';
        search.value = '';
        await load();
      } catch (e) {
        status.textContent = e.message;
        toast(e.message, 'warn');
      }
    }

    fileInput.addEventListener('change', () => addFiles(fileInput.files));
    let timer = null;
    search.addEventListener('input', () => {
      clearTimeout(timer);
      timer = setTimeout(() => {
        query = search.value.trim();
        page = 1;
        load();
      }, 250);
    });
    nav.addEventListener('click', (e) => {
      const b = e.target.closest('[data-scope]');
      if (!b) return;
      scope = b.dataset.scope;
      nav.querySelectorAll('[data-scope]').forEach((x) => x.setAttribute('aria-pressed', String(x.dataset.scope === scope)));
      page = 1;
      load();
    });

    const body = h('div', { class: 'lib' },
      nav,
      h('div', { class: 'lib-main' },
        h('div', { class: 'lib-top' }, search, uploadButton, fileInput),
        h('p', { class: 'lib-drop-hint' }, t('library.dropHint')),
        grid, h('div', { class: 'lib-bottom' }, status, pager)));
    const dialog = modal({ title: t('library.title'), body, wide: true, className: 'md-library' });
    // Files dropped anywhere on the window go in.
    const box = dialog.box;
    box.addEventListener('dragover', (e) => {
      e.preventDefault();
      box.classList.add('dropping');
    });
    box.addEventListener('dragleave', (e) => {
      if (!box.contains(e.relatedTarget)) box.classList.remove('dropping');
    });
    box.addEventListener('drop', (e) => {
      e.preventDefault();
      box.classList.remove('dropping');
      addFiles([...e.dataTransfer.files].filter((f) => f.type.startsWith('image/')));
    });
    load();
  }

  return { open, upload, uploadFiles };
}
