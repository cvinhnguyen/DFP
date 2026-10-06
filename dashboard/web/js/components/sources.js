// How the sources look on Asetukset → Lähteet: a row in the list, the
// chosen source with what it has brought, its checks and its settings, and
// the sites worth adding. It only turns data into HTML; the page decides
// what a click does.
// Jira: DM42-29, DM42-80

import { t, tn } from '../texts.js';
import { esc, safeUrl, when, date, number, languageName, daysUntil } from '../format.js';
import { icon } from '../ui/icons.js';
import { emptyState } from '../ui/empty.js';

export const KIND_ICONS = { rss: 'feed', crossref: 'journal', dspace: 'archive', webpage: 'globe', watch: 'eye', drive: 'folder', manual: 'send' };
// What needs an admin's look: a check that failed, a source gone quiet, and
// one switched on that nothing reads.
export const ATTENTION = ['failed', 'quiet', 'unread'];
const ORDER = ['failed', 'quiet', 'unread', 'checking', 'waiting', 'ok', 'off'];
const SECTIONS = ['own_news', 'events', 'member_news', 'highlights', 'training'];
export const RIGHTS = ['own', 'open', 'check', 'none'];
const LANGUAGES = ['fi', 'en', 'sv', 'no'];
const FILTERS = ['always', 'keywords', 'on_request'];

export function hostOf(url) {
  try {
    return new URL(url).hostname.replace(/^www\./, '');
  } catch {
    return '';
  }
}

// The ones needing a look first, then those being checked or not checked
// yet, the working ones, and the ones switched off; by name inside each.
export function sortSources(list) {
  return [...list].sort((a, b) => ORDER.indexOf(a.health) - ORDER.indexOf(b.health)
    || a.name.localeCompare(b.name, 'fi'));
}

// Twelve weeks of new articles as bars, the newest on the right.
export function weekBars(weeks, { width = 60, height = 18, label = '' } = {}) {
  const max = Math.max(1, ...weeks);
  const gap = 2;
  const w = (width - gap * (weeks.length - 1)) / weeks.length;
  const bars = weeks.map((n, i) => {
    const h = n ? Math.max(3, Math.round((n / max) * height)) : 2;
    return `<rect x="${(i * (w + gap)).toFixed(1)}" y="${height - h}" width="${w.toFixed(1)}" height="${h}" rx="1"${n ? '' : ' class="zero"'}/>`;
  }).join('');
  const named = label ? `role="img" aria-label="${esc(label)}"` : 'aria-hidden="true"';
  return `<svg class="weeks" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" ${named} focusable="false">${bars}</svg>`;
}

export function sourceRow(s, selected) {
  const host = hostOf(s.homepage || s.url);
  const fresh = s.active && !['drive', 'manual'].includes(s.type);
  return `
    <button type="button" class="src-row${s.active ? '' : ' off'}" data-source="${s.id}" aria-current="${selected}">
      <span class="src-kind" aria-hidden="true">${icon(KIND_ICONS[s.type] || 'globe', 18)}</span>
      <span class="src-main">
        <span class="src-name">${esc(s.name)}</span>
        <span class="src-sub">${esc([t(`src.kind.${s.type}`), host].filter(Boolean).join(' · '))}</span>
      </span>
      <span class="src-side">
        <span class="health ${s.health}">${esc(t(`src.health.${s.health}`))}</span>
        ${fresh ? `<span class="src-new">${weekBars(s.weeks)}<span>${esc(tn('src.new30', s.new_30, { n: number(s.new_30) }))}</span></span>` : ''}
      </span>
    </button>`;
}

// ---------- one source ----------

function why(s, nextCheck) {
  const ran = s.last_run_at;
  if (s.type === 'drive') return t('src.why.drive');
  if (s.type === 'manual') return t('src.why.manual');
  if (s.health === 'off') return s.notes || t('src.why.off');
  if (s.health === 'unread') return t('src.why.unread');
  if (s.health === 'checking') return t('src.why.checking');
  if (s.health === 'waiting') return nextCheck ? t('src.why.waiting', { when: when(nextCheck) }) : t('src.why.waitingNoTime');
  if (s.health === 'failed') {
    // A feed that is gone answers 404 or cannot be connected to at all;
    // anything else is usually the site or the network for a moment.
    const moved = /404|not possible to connect|ENOTFOUND|not found/i.test(s.last_error || '');
    const error = /[.!?]$/.test(s.last_error.trim()) ? s.last_error.trim() : `${s.last_error.trim()}.`;
    return `${t('src.why.failed', { when: when(ran), error })} ${t(moved ? 'src.why.failedMoved' : 'src.why.failedOnce')}`;
  }
  if (s.health === 'quiet') {
    return s.last_item_at ? t('src.why.quiet', { days: number(-daysUntil(s.last_item_at)) }) : t('src.why.quietNever');
  }
  return ran ? t('src.why.ok', { when: when(ran), found: number(s.last_found ?? 0), new: number(s.last_new ?? 0) }) : '';
}

function stateOf(article) {
  if (article.decision === 'picked') return t('cal.legend.picked');
  if (article.decision === 'later') return t('row.later');
  if (article.decision === 'dismissed') return t('row.dismissed');
  if (article.status === 'filtered_out') return t('row.skipped');
  if (article.status === 'new' || article.status === 'queued') return t('row.waiting');
  return '';
}

function settingsForm(s) {
  const can = s.can;
  const language = s.language && !LANGUAGES.includes(s.language) ? [...LANGUAGES, s.language] : LANGUAGES;
  const filter = can.filter ? `
      <fieldset class="src-filter">
        <legend>${esc(t('src.filter'))}</legend>
        ${FILTERS.filter((f) => f !== 'on_request' || s.filter_mode === 'on_request' || s.type === 'dspace').map((f) => `
          <label class="cf-check"><input type="radio" name="filter_mode" value="${f}"${s.filter_mode === f ? ' checked' : ''}>
            <span><strong>${esc(t(`src.filter.${f}`))}</strong> <small>${esc(t(`src.filterMeans.${f}`))}</small></span></label>`).join('')}
      </fieldset>`
    : `<p class="cf-hint">${esc(t('src.filter'))}: ${esc(t(`src.filter.${s.filter_mode}`))}. ${esc(t('src.filterFixed'))}</p>`;
  const section = can.section ? `
      <label class="cf-label" for="src-section">${esc(t('src.section'))}</label>
      <select id="src-section" class="cf-input" name="section">
        <option value="">${esc(t('src.sectionNone'))}</option>
        ${SECTIONS.map((x) => `<option value="${x}"${s.suggested_section === x ? ' selected' : ''}>${esc(t(`section.${x}`))}</option>`).join('')}
      </select>
      <p class="cf-hint">${esc(t('src.sectionHint'))}</p>` : '';
  return `
    <form class="src-form" data-form="source">
      <h3>${esc(t('src.settings'))}</h3>
      <label class="cf-label" for="src-name">${esc(t('src.name'))}</label>
      <input id="src-name" class="cf-input" name="name" maxlength="120" required value="${esc(s.name)}">
      <label class="cf-label" for="src-publisher">${esc(t('src.publisher'))}</label>
      <input id="src-publisher" class="cf-input" name="publisher" maxlength="120" value="${esc(s.publisher || '')}">
      <p class="cf-hint">${esc(t('src.publisherHint'))}</p>
      <label class="cf-label" for="src-language">${esc(t('src.language'))}</label>
      <select id="src-language" class="cf-input short" name="language">
        ${s.language ? '' : `<option value="" selected>${esc(t('src.languageUnknown'))}</option>`}
        ${language.map((l) => `<option value="${esc(l)}"${s.language === l ? ' selected' : ''}>${esc(languageName(l))}</option>`).join('')}
      </select>
      ${filter}
      ${section}
      <label class="cf-label" for="src-pictures">${esc(t('src.pictures'))}</label>
      <select id="src-pictures" class="cf-input" name="pictures">
        ${RIGHTS.map((r) => `<option value="${r}"${s.picture_rights === r ? ' selected' : ''}>${esc(t(`pics.rights.${r}`))}</option>`).join('')}
      </select>
      <p class="cf-hint" id="src-pictures-means">${esc(t(`pics.means.${s.picture_rights}`))}</p>
      <label class="cf-label" for="src-notes">${esc(t('src.notes'))}</label>
      <textarea id="src-notes" class="cf-input cf-area" name="notes" maxlength="1000" rows="2" placeholder="${esc(t('src.notesHint'))}">${esc(s.notes || '')}</textarea>
      <div class="nl-form-actions"><button type="submit" class="btn">${esc(t('src.save'))}</button></div>
    </form>`;
}

export function sourceDetail(s, { busy = null, nextCheck = null } = {}) {
  const address = safeUrl(s.url);
  const site = safeUrl(s.homepage);
  const special = ['drive', 'manual'].includes(s.type);
  const latest = s.latest.length
    ? `<ul class="src-latest">${s.latest.map((a) => `
        <li><a href="#/?place=source:${s.id}&amp;item=${a.id}">${esc(a.title)}</a>
          <small>${esc([date(a.created_at), stateOf(a)].filter(Boolean).join(' · '))}</small></li>`).join('')}</ul>
       <a class="src-all" href="#/?place=source:${s.id}">${esc(t('src.allArticles'))} ›</a>`
    : `<p class="cf-hint">${esc(t('src.latestNone'))}</p>`;
  const runs = s.runs.length
    ? `<ul class="src-runs">${s.runs.slice(0, 6).map((r) => `
        <li${r.error ? ' class="failed"' : ''}><span class="src-when">${esc(when(r.started_at))}</span>
          <span>${r.finished_at ? esc(t('src.run', { found: number(r.items_found ?? 0), new: number(r.items_new ?? 0) })) : esc(t('src.runRunning'))}</span>
          ${r.error ? `<span class="src-err">${esc(r.error)}</span>` : ''}</li>`).join('')}</ul>`
    : `<p class="cf-hint">${esc(t('src.runsNone'))}</p>`;
  const deleting = s.can.delete
    ? `<button type="button" class="btn ghost small danger" data-act="src-delete">${icon('trash', 16)}<span>${esc(t('src.delete'))}</span></button>`
    : (special ? '' : `<p class="cf-hint">${esc(tn('src.cannotDelete', s.total, { n: number(s.total) }))}</p>`);
  const who = [
    s.added_by ? t('src.addedBy', { name: s.added_by, when: date(s.created_at) }) : '',
    s.changed_by && s.changed_at ? t('src.changedBy', { name: s.changed_by, when: when(s.changed_at) }) : '',
  ].filter(Boolean).join(' ');
  return `
    <div class="src-head">
      <span class="src-kind big" aria-hidden="true">${icon(KIND_ICONS[s.type] || 'globe', 22)}</span>
      <div class="src-title">
        <h2 id="src-title" tabindex="-1">${esc(s.name)}</h2>
        <p class="src-sub">${esc(t(`src.kind.${s.type}`))}${address ? ` · <a href="${esc(address)}" target="_blank" rel="noopener noreferrer">${esc(s.url.replace(/^https?:\/\//, ''))} ↗</a>` : ''}
          ${site && site !== address ? ` · <a href="${esc(site)}" target="_blank" rel="noopener noreferrer">${esc(t('src.homepage'))} ↗</a>` : ''}</p>
      </div>
      <div class="src-head-acts">
        ${s.can.check ? `<button type="button" class="btn ghost small" data-act="src-check"${busy === 'check' || s.running ? ' disabled' : ''}>${icon('refresh', 16)}<span>${esc(t(s.running ? 'src.health.checking' : 'src.check'))}</span></button>` : ''}
        ${s.can.switch ? `<label class="cf-toggle src-switch"><input type="checkbox" class="cf-toggle-input" data-act="src-switch"${s.active ? ' checked' : ''}${busy === 'switch' ? ' disabled' : ''}
            aria-label="${esc(t('src.switchLabel', { name: s.name }))}"><span class="cf-toggle-track" aria-hidden="true"></span><span>${esc(t('src.switch'))}</span></label>` : ''}
      </div>
    </div>
    <p class="src-why ${s.health}"><span class="health ${s.health}">${esc(t(`src.health.${s.health}`))}</span> ${esc(why(s, nextCheck))}</p>
    ${special ? `<p class="cf-hint">${esc(t(`src.special.${s.type}`))}${s.type === 'drive' ? ` <a href="#/settings">${esc(t('src.openDrive'))}</a>` : ''}</p>` : ''}
    ${s.on_site.length ? `<p class="cf-hint">${esc(t('src.onSite', { names: s.on_site.map((x) => x.name).join(', ') }))}</p>` : ''}
    <div class="src-numbers">
      <div><strong>${number(s.new_30)}</strong><span>${esc(t('src.counts.new'))}</span></div>
      <div><strong>${number(s.picked)}</strong><span>${esc(t('src.counts.picked'))}</span></div>
      <div><strong>${number(s.total)}</strong><span>${esc(t('src.counts.total'))}</span></div>
      <div class="src-chart">${weekBars(s.weeks, { width: 168, height: 40, label: `${t('src.weeks')}: ${s.weeks.join(', ')}` })}</div>
    </div>
    <div class="src-columns">
      <section class="src-part"><h3>${esc(t('src.latest'))}</h3>${latest}</section>
      <section class="src-part"><h3>${esc(t('src.runs'))}</h3>${runs}</section>
    </div>
    ${settingsForm(s)}
    <div class="src-foot">
      ${s.can.edit_address ? `<button type="button" class="btn ghost small" data-act="src-address">${icon('swap', 16)}<span>${esc(t('src.changeAddress'))}</span></button>` : ''}
      ${deleting}
      ${who ? `<p class="cf-hint src-who">${esc(who)}</p>` : ''}
    </div>`;
}

export function noSource() {
  return emptyState({ icon: 'feed', title: t('src.pick'), text: t('src.pickHint') });
}

// ---------- the sites worth adding ----------

function suggestionWhy(x) {
  const parts = [];
  if (x.links) parts.push(tn('src.sugg.links', x.newsletters, { links: number(x.links), n: number(x.newsletters) }));
  if (x.member) parts.push(t('src.sugg.member', { name: x.member }));
  return parts.join(' · ');
}

function suggestionState(x) {
  if (!x.result) return `<span class="sg-state r-unknown">${esc(t('src.sugg.result.unknown'))}</span>`;
  const month = x.result === 'feed' && x.per_month ? ` · ${t('src.sugg.perMonth', { n: number(x.per_month) })}` : '';
  return `<span class="sg-state r-${x.result}">${esc(t(`src.sugg.result.${x.result}`) + month)}</span>`;
}

function suggestionRow(x) {
  const address = x.website || `https://${x.host}/`;
  const acts = x.dismissed
    ? `<button type="button" class="btn ghost small" data-act="sugg-restore" data-host="${esc(x.host)}" aria-label="${esc(t('src.sugg.restoreLabel', { host: x.host }))}">${esc(t('src.sugg.restore'))}</button>`
    : `${x.result !== 'blocked' ? `<button type="button" class="btn small" data-act="sugg-add" data-address="${esc(address)}" aria-label="${esc(t('src.sugg.addLabel', { host: x.host }))}">${icon('plus', 16)}<span>${esc(t('src.sugg.add'))}</span></button>` : ''}
       <button type="button" class="btn ghost small" data-act="sugg-dismiss" data-host="${esc(x.host)}" aria-label="${esc(t('src.sugg.dismissLabel', { host: x.host }))}">${esc(t('src.sugg.dismiss'))}</button>`;
  return `
    <li class="sg-row">
      <div class="sg-main"><span class="sg-host">${esc(x.host)}</span><span class="sg-why">${esc(suggestionWhy(x))}</span></div>
      ${suggestionState(x)}
      <div class="sg-acts">${acts}</div>
    </li>`;
}

export const SUGGESTIONS_SHOWN = 3;

export function suggestionsCard(data, { all = false, hidden = false } = {}) {
  const open = data.suggestions.filter((x) => !x.dismissed);
  const away = data.suggestions.filter((x) => x.dismissed);
  const shown = all ? open : open.slice(0, SUGGESTIONS_SHOWN);
  return `
    <div class="sg-head">
      <div><h2>${icon('sparkle', 18)}<span>${esc(t('src.sugg.title'))}</span><span class="sg-n">${number(open.length)}</span></h2>
        <p class="cf-hint">${esc(t('src.sugg.lead'))}</p></div>
      <button type="button" class="btn ghost small" data-act="sugg-look"${data.looking ? ' disabled' : ''}>${icon('refresh', 16)}<span>${esc(t('src.sugg.lookAgain'))}</span></button>
    </div>
    ${data.looking ? `<p class="sg-looking" role="status"><span class="spinner" aria-hidden="true"></span>${esc(t('src.sugg.looking'))}</p>` : ''}
    ${open.length ? `<ul class="sg-list">${shown.map(suggestionRow).join('')}</ul>` : `<p class="cf-hint">${esc(t('src.sugg.none'))}</p>`}
    <div class="sg-more">
      ${open.length > SUGGESTIONS_SHOWN ? `<button type="button" class="linkish" data-act="sugg-all" aria-expanded="${all}">${esc(all ? t('src.sugg.less') : t('src.sugg.more', { n: number(open.length) }))}</button>` : ''}
      ${away.length ? `<button type="button" class="linkish" data-act="sugg-hidden" aria-expanded="${hidden}">${esc(t('src.sugg.hidden', { n: number(away.length) }))}</button>` : ''}
    </div>
    ${hidden && away.length ? `<ul class="sg-list hidden">${away.map(suggestionRow).join('')}</ul>` : ''}`;
}

// ---------- the card on Asetukset ----------

function names(list) {
  const shown = list.slice(0, 3).map((s) => s.name).join(', ');
  return list.length > 3 ? t('src.card.andMore', { names: shown, n: number(list.length - 3) }) : shown;
}

export function sourcesSummary(data) {
  const on = data.sources.filter((s) => s.active);
  const lines = [];
  for (const kind of ['failed', 'quiet', 'unread']) {
    const found = on.filter((s) => s.health === kind);
    if (found.length) lines.push(`<li class="${kind === 'failed' ? 'bad' : 'warn'}">${icon(kind === 'failed' ? 'error' : 'warning', 16)}<span>${esc(tn(`src.card.${kind}`, found.length, { n: number(found.length), names: names(found) }))}</span></li>`);
  }
  if (!lines.length) lines.push(`<li class="ok">${icon('check', 16)}<span>${esc(t('src.card.ok'))}</span></li>`);
  return `
    <section class="card set-card src-card">
      <div class="set-head"><h2>${esc(t('src.title'))}</h2>
        <a class="btn ghost small" href="#/sources">${esc(t('src.card.open'))} ›</a></div>
      <p class="keep-lead">${esc(t('src.card.lead'))}</p>
      <p class="src-card-counts">${esc(t('src.card.counts', { on: number(on.length), off: number(data.sources.length - on.length) }))}</p>
      <ul class="src-card-lines">${lines.join('')}</ul>
    </section>`;
}

