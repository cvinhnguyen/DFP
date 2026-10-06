// Adding a source, or giving one a new address, on Asetukset → Lähteet:
// the admin types any address, the dashboard finds what is there
// (POST /api/sources/lookup), and the window shows it with its newest
// articles before anything is saved. A site with no feed can be watched
// instead; one that refuses robots is not added at all.
// Jira: DM42-29

import { api } from '../api.js';
import { t, tn } from '../texts.js';
import { esc, date, number, languageName } from '../format.js';
import { icon } from '../ui/icons.js';
import { modal } from '../ui/dialogs.js';
import { RIGHTS } from './sources.js';

const SECTIONS = ['own_news', 'events', 'member_news', 'highlights', 'training'];
const LANGUAGES = ['fi', 'en', 'sv', 'no'];

// address: what to look for at once, as a suggestion's Lisää gives it.
// change: the source whose address is being changed, instead of adding one.
// onDone(source): the source as it is after adding or changing.
// onOpen(id): an existing source the admin wants to see instead.
export function openSourceWindow({ address = '', change = null, onDone, onOpen }) {
  let found = null;
  let busy = false;
  const body = document.createElement('div');
  body.className = 'sa';
  body.innerHTML = `
    <form class="sa-find" data-form="find">
      <label class="cf-label" for="sa-address">${esc(t('src.addLabel'))}</label>
      <div class="sa-find-row">
        <input id="sa-address" class="cf-input" name="address" maxlength="500" required autocomplete="off" spellcheck="false"
               placeholder="${esc(t('src.addPlaceholder'))}" value="${esc(address)}">
        <button type="submit" class="btn">${icon('search', 16)}<span>${esc(t('src.find'))}</span></button>
      </div>
      <p class="cf-hint">${esc(t('src.addHint'))}</p>
    </form>
    <div class="sa-result" aria-live="polite"></div>`;
  const result = body.querySelector('.sa-result');
  const input = body.querySelector('#sa-address');
  const dialog = modal({ title: change ? t('src.changeTitle', { name: change.name }) : t('src.addTitle'), body,
    className: 'md-source', actions: [] });

  function latest(items) {
    if (!items.length) return '';
    return `<p class="sa-k">${esc(t('src.found.latest'))}</p>
      <ul class="sa-latest">${items.slice(0, 5).map((i) => `<li><span>${esc(i.title)}</span>${i.published_at ? `<small>${esc(date(i.published_at))}</small>` : ''}</li>`).join('')}</ul>`;
  }

  function listings(list) {
    if (!list || !list.length) return '';
    return `<p class="sa-k">${esc(t('src.found.listings'))}</p>
      <div class="sa-try">${list.map((l) => `<button type="button" class="chat-chip" data-act="sa-try" data-url="${esc(l.url)}">${esc(l.title)}</button>`).join('')}</div>`;
  }

  function heading(f) {
    if (f.kind === 'feed') return t('src.found.feed');
    if (f.kind === 'journal') return t('src.found.journal');
    return tn('src.found.page', f.links || f.items.length, { n: number(f.links || f.items.length) });
  }

  function textNote(f) {
    if (f.kind === 'journal') return t('src.found.journalText');
    if (f.kind === 'page') return `${t('src.found.watchNote')} ${f.full_text ? t('src.found.fullText') : ''}`;
    return f.full_text ? t('src.found.fullText') : t('src.found.feedText');
  }

  function form(f) {
    if (change) {
      return `<div class="sa-acts"><button type="button" class="btn ghost" data-act="sa-cancel">${esc(t('dialog.cancel'))}</button>
        <button type="button" class="btn" data-act="sa-use">${esc(t('src.useAddress'))}</button></div>`;
    }
    const languages = f.language && !LANGUAGES.includes(f.language) ? [...LANGUAGES, f.language] : LANGUAGES;
    const filters = ['always', 'keywords'];
    return `
      <form class="sa-form" data-form="add">
        <label class="cf-label" for="sa-name">${esc(t('src.name'))}</label>
        <input id="sa-name" class="cf-input" name="name" maxlength="120" required value="${esc(f.name || '')}">
        <div class="sa-two">
          <div><label class="cf-label" for="sa-publisher">${esc(t('src.publisher'))}</label>
            <input id="sa-publisher" class="cf-input" name="publisher" maxlength="120" value="${esc(f.publisher || '')}"></div>
          <div><label class="cf-label" for="sa-language">${esc(t('src.language'))}</label>
            <select id="sa-language" class="cf-input" name="language">
              ${f.language ? '' : `<option value="" selected>${esc(t('src.languageUnknown'))}</option>`}
              ${languages.map((l) => `<option value="${esc(l)}"${f.language === l ? ' selected' : ''}>${esc(languageName(l))}</option>`).join('')}
            </select></div>
        </div>
        <fieldset class="src-filter">
          <legend>${esc(t('src.filter'))}</legend>
          ${filters.map((m) => `<label class="cf-check"><input type="radio" name="filter_mode" value="${m}"${f.filter_mode === m ? ' checked' : ''}>
            <span><strong>${esc(t(`src.filter.${m}`))}</strong> <small>${esc(t(`src.filterMeans.${m}`))}</small></span></label>`).join('')}
        </fieldset>
        <div class="sa-two">
          <div><label class="cf-label" for="sa-section">${esc(t('src.section'))}</label>
            <select id="sa-section" class="cf-input" name="section">
              <option value="">${esc(t('src.sectionNone'))}</option>
              ${SECTIONS.map((x) => `<option value="${x}"${f.section === x ? ' selected' : ''}>${esc(t(`section.${x}`))}</option>`).join('')}
            </select></div>
          <div><label class="cf-label" for="sa-pictures">${esc(t('src.pictures'))}</label>
            <select id="sa-pictures" class="cf-input" name="pictures">
              ${RIGHTS.map((r) => `<option value="${r}"${(f.picture_rights || 'check') === r ? ' selected' : ''}>${esc(t(`pics.rights.${r}`))}</option>`).join('')}
            </select></div>
        </div>
        ${f.kind === 'page' ? `<label class="cf-check sa-import"><input type="checkbox" name="import_existing">
          <span>${esc(tn('src.import', f.links || f.items.length, { n: number(f.links || f.items.length) }))}
          <small>${esc(t('src.importHint'))}</small></span></label>` : ''}
        <p class="problem sa-error" role="alert" hidden></p>
        <div class="sa-acts">
          <button type="button" class="btn ghost" data-act="sa-cancel">${esc(t('dialog.cancel'))}</button>
          <button type="submit" class="btn">${esc(t('src.addNow'))}</button>
        </div>
      </form>`;
  }

  function show(f) {
    found = f;
    if (f.kind === 'blocked') {
      result.innerHTML = `<p class="sa-note bad">${icon('error', 18)}<span>${esc(t('src.found.blocked'))}</span></p>`;
      return;
    }
    if (f.kind === 'none') {
      result.innerHTML = `<p class="sa-note warn">${icon('info', 18)}<span>${esc(t('src.found.none'))}</span></p>${listings(f.listings)}`;
      return;
    }
    const existing = f.existing && (!change || f.existing.id !== change.id)
      ? `<p class="sa-note warn">${icon('info', 18)}<span>${esc(t(f.existing.active ? 'src.found.exists' : 'src.found.existsOff', { name: f.existing.name }))}</span>
          <button type="button" class="linkish" data-act="sa-open" data-id="${f.existing.id}">${esc(t('src.found.open'))}</button></p>` : '';
    const onSite = f.on_site && f.on_site.length
      ? `<p class="cf-hint">${esc(t('src.onSite', { names: f.on_site.map((s) => s.name).join(', ') }))}</p>` : '';
    result.innerHTML = `
      <div class="sa-found">
        <p class="sa-found-head">${icon(f.kind === 'page' ? 'eye' : f.kind === 'journal' ? 'journal' : 'feed', 20)}<strong>${esc(heading(f))}</strong></p>
        <p class="sa-url"><code>${esc(f.url)}</code></p>
        ${f.via ? `<p class="cf-hint">${esc(t('src.found.via', { page: f.via }))}</p>` : ''}
        <p class="cf-hint">${esc([f.per_month ? t('src.sugg.perMonth', { n: number(f.per_month) }) : '', textNote(f)].filter(Boolean).join(' · '))}</p>
        ${latest(f.items)}
        ${f.kind === 'page' ? listings(f.listings) : ''}
      </div>
      ${existing}${onSite}
      ${existing ? '' : form(f)}`;
  }

  async function find(text) {
    if (busy || !text.trim()) return;
    busy = true;
    const button = body.querySelector('.sa-find .btn');
    button.disabled = true;
    result.innerHTML = `<p class="sa-busy" role="status"><span class="spinner" aria-hidden="true"></span>${esc(t('src.finding'))}</p>`;
    try {
      show(await api.post('/api/sources/lookup', { address: text.trim() }));
    } catch (e) {
      found = null;
      result.innerHTML = `<p class="sa-note bad">${icon('error', 18)}<span>${esc(e.message)}</span></p>`;
    } finally {
      busy = false;
      button.disabled = false;
    }
  }

  async function add(formEl) {
    if (busy || !found) return;
    busy = true;
    const submit = formEl.querySelector('[type="submit"]');
    submit.disabled = true;
    submit.textContent = t('src.adding');
    const error = formEl.querySelector('.sa-error');
    try {
      const made = await api.post('/api/sources', {
        url: found.url, type: found.type, homepage: found.homepage || null,
        name: formEl.name.value.trim(), publisher: formEl.publisher.value.trim() || null,
        language: formEl.language.value || null,
        filter_mode: (formEl.querySelector('input[name="filter_mode"]:checked') || {}).value || 'keywords',
        fetch_full_text: Boolean(found.full_text), picture_rights: formEl.pictures.value,
        section: formEl.section.value || null,
        import_existing: Boolean(formEl.import_existing && formEl.import_existing.checked),
      });
      dialog.close();
      onDone(made, 'added');
    } catch (e) {
      busy = false;
      submit.disabled = false;
      submit.textContent = t('src.addNow');
      error.textContent = e.message;
      error.hidden = false;
    }
  }

  async function use() {
    if (busy || !found || !change) return;
    busy = true;
    try {
      const changed = await api.patch(`/api/sources/${change.id}`, {
        url: found.url, type: found.type, homepage: found.homepage || null, fetch_full_text: Boolean(found.full_text),
      });
      dialog.close();
      onDone(changed, 'changed');
    } catch (e) {
      busy = false;
      result.insertAdjacentHTML('beforeend', `<p class="problem" role="alert">${esc(e.message)}</p>`);
    }
  }

  body.addEventListener('submit', (event) => {
    event.preventDefault();
    if (event.target.dataset.form === 'find') find(input.value);
    else if (event.target.dataset.form === 'add') add(event.target);
  });
  body.addEventListener('click', (event) => {
    const target = event.target.closest('[data-act]');
    if (!target) return;
    const act = target.dataset.act;
    if (act === 'sa-try') {
      input.value = target.dataset.url;
      find(target.dataset.url);
    } else if (act === 'sa-cancel') dialog.close();
    else if (act === 'sa-use') use();
    else if (act === 'sa-open') {
      dialog.close();
      onOpen(Number(target.dataset.id));
    }
  });
  if (address) find(address);
}
