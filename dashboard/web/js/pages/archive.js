// Arkisto: the association's past newsletters from its public archive in
// Mailchimp, each compared with what the system found: which of its links
// are on sites the system follows, and which it had collected by the day the
// newsletter went out. For a newsletter made in the dashboard also which of
// its picks went out. An admin gives the archive's address here; n8n brings
// in new newsletters every Monday, and a button does it now.
// #/archive lists them, #/archive?id=3 shows one.
// Jira: DM42-47

import { api } from '../api.js';
import { t, tn } from '../texts.js';
import { date, esc, number, safeUrl, when } from '../format.js';
import { icon } from '../ui/icons.js';
import { toast } from '../ui/dialogs.js';

function stateOf(entry) {
  if (entry.picked) return 'picked';
  if (entry.item_id) return entry.in_time ? 'inTime' : 'late';
  return entry.followed ? 'missed' : 'notFollowed';
}

function entryHtml(e) {
  const url = safeUrl(e.url);
  const text = e.link_text || e.item_title || e.host || e.url;
  const state = stateOf(e);
  return `<li class="arc-entry">
    <span class="arc-state ${state}">${esc(t(`archive.state.${state}`))}</span>
    <span class="arc-link">${url ? `<a href="${esc(url)}" target="_blank" rel="noopener noreferrer">${esc(text)}</a>` : esc(text)}
      <small>${esc([e.host, e.item_source].filter(Boolean).join(' · '))}</small></span>
  </li>`;
}

// The links under the headings they stood under, in the newsletter's order.
function entriesHtml(entries) {
  const groups = [];
  for (const e of entries) {
    const heading = e.heading || '';
    if (!groups.length || groups[groups.length - 1].heading !== heading) groups.push({ heading, list: [] });
    groups[groups.length - 1].list.push(e);
  }
  return groups.map((g) => `<div class="arc-group">
      <h4>${esc(g.heading || t('archive.noHeading'))}</h4>
      <ul class="arc-entries">${g.list.map(entryHtml).join('')}</ul>
    </div>`).join('');
}

export function showArchive(root, { user }) {
  const params = new URLSearchParams(location.hash.split('?')[1] || '');
  const id = Number(params.get('id')) || null;
  const admin = user && user.role === 'admin';
  let source = null;
  let issues = null;
  let one = null;
  let problem = '';
  let busy = false;
  let gone = false;

  function sourceCard() {
    if (!source) return '';
    const last = source.read_at || source.imported_at;
    const read = last ? t('archive.read', { when: when(last), n: number(source.newsletters) }) : t('archive.never');
    const address = admin ? `
      <details class="arc-address"${source.url ? '' : ' open'}>
        <summary>${esc(t('archive.address'))}</summary>
        <form class="arc-address-form" data-form="address">
          <input class="cf-input" name="url" type="url" maxlength="500" required value="${esc(source.url || '')}"
                 placeholder="https://us11.campaign-archive.com/home/?u=…&amp;id=…" aria-label="${esc(t('archive.address'))}">
          <button type="submit" class="btn small">${esc(t('archive.addressSave'))}</button>
        </form>
        <p class="cf-hint">${esc(t('archive.addressHint'))}</p>
      </details>` : '';
    return `<section class="card arc-source">
      <p>${esc(source.url ? read : (admin ? t('archive.noAddress') : t('archive.noAddressAdmin')))}</p>
      ${admin && source.url ? `<button type="button" class="btn ghost small" data-act="import" ${busy ? 'disabled' : ''}>
        ${esc(busy ? t('archive.importing') : t('archive.importNow'))}</button>` : ''}
      ${address}
    </section>`;
  }

  function listHtml() {
    if (!issues.length) return `<p class="nl-meta">${esc(t('archive.empty'))}</p>`;
    return `<div class="card nl-list"><table class="nl-table arc-table">
      <thead><tr>
        <th scope="col">${esc(t('archive.col.sent'))}</th>
        <th scope="col">${esc(t('archive.col.subject'))}</th>
        <th scope="col" class="num">${esc(t('archive.col.links'))}</th>
        <th scope="col" class="num">${esc(t('archive.col.followed'))}</th>
        <th scope="col" class="num">${esc(t('archive.col.found'))}</th>
      </tr></thead>
      <tbody>${issues.map((i) => `<tr>
        <td class="arc-day">${esc(i.sent_on ? date(i.sent_on) : '–')}</td>
        <td><a class="nl-name" href="#/archive?id=${i.id}">${esc(i.subject)}</a>
          ${i.made_here ? `<span class="arc-here">${esc(t('archive.madeHere'))}</span>` : ''}</td>
        <td class="num">${number(i.entries)}</td>
        <td class="num">${number(i.followed)}</td>
        <td class="num">${esc(t('archive.found', { n: number(i.collected), inTime: number(i.in_time) }))}</td>
      </tr>`).join('')}</tbody></table></div>`;
  }

  function oneHtml() {
    const i = one.issue;
    const url = safeUrl(i.url);
    const here = one.made_here;
    const notSent = one.picked_not_sent || [];
    return `
      <a class="nl-back" href="#/archive">${icon('arrowLeft', 16)} ${esc(t('archive.back'))}</a>
      <div class="pagehead"><h2>${esc(i.subject)}</h2>
        <p>${esc(i.sent_on ? t('archive.sentOn', { date: date(i.sent_on) }) : '')}
          ${url ? ` · <a href="${esc(url)}" target="_blank" rel="noopener noreferrer">${esc(t('archive.open'))} ↗</a>` : ''}</p></div>
      <section class="card arc-summary">
        <p>${esc(t('archive.summary', { links: number(i.entries), followed: number(i.followed), found: number(i.collected), inTime: number(i.in_time) }))}</p>
        ${here ? `<p class="arc-here-line"><span class="arc-here">${esc(t('archive.madeHere'))}</span>
          ${esc(t('archive.madeHereLine', { name: here.name, sent: number(here.sent), picked: number(here.picked) }))}
          <a href="#/newsletter?id=${here.id}">${esc(t('archive.openIssue'))} ›</a></p>` : ''}
        ${notSent.length ? `<div class="arc-notsent"><h4>${esc(t('archive.notSent'))}</h4>
          <ul>${notSent.map((p) => `<li>${esc(p.title)} <small>${esc([p.source, p.section ? t(`section.${p.section}`) : ''].filter(Boolean).join(' · '))}</small></li>`).join('')}</ul></div>` : ''}
      </section>
      <section class="card arc-links">
        <h3>${esc(t('archive.links'))}</h3>
        ${one.entries.length ? entriesHtml(one.entries) : `<p class="nl-meta">${esc(t('archive.noLinks'))}</p>`}
      </section>
      ${one.surfaced.length ? `<details class="card arc-surfaced">
        <summary>${esc(t('archive.surfaced', { n: number(one.surfaced.length) }))}</summary>
        <p class="cf-hint">${esc(t('archive.surfacedHint'))}</p>
        <ul>${one.surfaced.map((s) => `<li><a href="#/?place=all&amp;item=${s.id}">${esc(s.title)}</a>
          <small>${esc([s.source, date(s.collected_at)].filter(Boolean).join(' · '))}</small></li>`).join('')}</ul>
      </details>` : ''}`;
  }

  function render() {
    if (gone) return;
    if (problem) {
      root.innerHTML = `<p class="problem">${esc(problem)}</p>`;
      return;
    }
    if (id) {
      root.innerHTML = one ? oneHtml() : '';
      return;
    }
    root.innerHTML = `
      <a class="nl-back" href="#/newsletters">${icon('arrowLeft', 16)} ${esc(t('archive.toList'))}</a>
      <div class="pagehead"><h2>${esc(t('archive.title'))}</h2><p>${esc(t('archive.lead'))}</p></div>
      ${sourceCard()}
      ${issues ? listHtml() : ''}`;
  }

  async function load() {
    try {
      if (id) {
        one = await api.get(`/api/archive/${id}`);
      } else {
        [source, issues] = await Promise.all([api.get('/api/archive/source'), api.get('/api/archive')]);
      }
      problem = '';
    } catch (e) {
      if (e.status === 401) return;
      problem = e.status === 404 ? t('archive.notFound') : e.message;
    }
    render();
  }

  async function importNow() {
    busy = true;
    render();
    try {
      const done = await api.post('/api/archive/import');
      source = done.source;
      issues = await api.get('/api/archive');
      toast(done.imported ? tn('archive.imported', done.imported) : t('archive.importedNone'), 'good');
    } catch (e) {
      toast(e.message, 'warn');
    }
    busy = false;
    render();
  }

  root.addEventListener('click', (event) => {
    if (event.target.closest('[data-act="import"]')) importNow();
  });

  root.addEventListener('submit', async (event) => {
    const form = event.target.closest('[data-form="address"]');
    if (!form) return;
    event.preventDefault();
    try {
      source = await api.put('/api/archive/source', { url: form.elements.url.value });
      toast(t('archive.addressSaved'), 'good');
      render();
    } catch (e) {
      toast(e.message, 'warn');
    }
  });

  load();
  return { leave() { gone = true; } };
}
