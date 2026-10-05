// The column on the left of the articles page: the editors' own lists,
// asking the articles a question, the topics with how many new articles each
// has, the latest weak signals, the sources, the views by what the AI did,
// and which newsletter the picks go into. It only turns data into HTML; the
// page decides what a click does.
// Jira: DM42-80, DM42-31, DM42-40

import { t, tn } from '../texts.js';
import { date, esc, number } from '../format.js';

// Eight topic colours, --topic-1 to --topic-8 in articles.css, given by the
// topic's place in the list so a topic keeps its colour.
export function colourOf(position) {
  return ((Math.max(1, position) - 1) % 8) + 1;
}

function entry(place, current, label, count, { muted = false, extra = '' } = {}) {
  const n = count === null || count === undefined ? '' : `<span class="side-n${muted && !count ? ' zero' : ''}">${number(count)}</span>`;
  return `<button type="button" class="side-item${extra}" data-place="${esc(place)}"
            aria-current="${place === current ? 'true' : 'false'}">${label}${n}</button>`;
}

function topicRow(topic, current) {
  const label = `<span class="dot c${colourOf(topic.position)}" aria-hidden="true"></span><span class="side-name" title="${esc(topic.name)}">${esc(topic.name)}</span>`;
  const button = topic.followed
    ? `<button type="button" class="side-x" data-act="unfollow" data-topic="${topic.id}"
         aria-label="${esc(t('side.unfollow', { topic: topic.name }))}" title="${esc(t('side.unfollow', { topic: topic.name }))}">×</button>`
    : `<button type="button" class="side-follow" data-act="follow" data-topic="${topic.id}"
         aria-label="${esc(t('side.followLabel', { topic: topic.name }))}">${esc(t('side.follow'))}</button>`;
  return `<div class="side-row">${entry(`topic:${topic.id}`, current, label, topic.new, { muted: true, extra: topic.followed ? '' : ' off' })}${button}</div>`;
}

function targetCard(drafts, target) {
  const chosen = drafts.find((d) => d.id === target);
  const name = chosen
    ? (drafts.length > 1
      ? `<select class="side-target" id="pick-target" aria-label="${esc(t('target.label'))}">
           ${drafts.map((d) => `<option value="${d.id}"${d.id === target ? ' selected' : ''}>${esc(d.name)}</option>`).join('')}
         </select>`
      : `<p class="side-card-name">${esc(chosen.name)}</p>`)
    : `<p class="side-card-name">${esc(t('target.new'))}</p><p class="side-card-n">${esc(t('target.newHint'))}</p>`;
  return `
    <div class="side-card">
      <p class="side-card-k">${esc(t('target.label'))}</p>
      ${name}
      ${chosen ? `<p class="side-card-n">${esc(tn('target.picked', chosen.picked))}</p>
        <a class="side-card-open" href="#/newsletter?id=${chosen.id}">${esc(t('target.open'))} ›</a>` : ''}
    </div>`;
}

// The signals of the latest run, each with how many articles it came from.
// A topic that came up in several articles is what an editor looks for; the
// ones from a single article wait folded away, unless there is nothing else.
function signalsGroup(signals, latest, current) {
  const shown = signals.filter((s) => s.detected_on === latest);
  const several = shown.filter((s) => s.articles > 1);
  const main = several.length ? several : shown.slice(0, 5);
  const rest = shown.filter((s) => !main.includes(s));
  const row = (s) => entry(`signal:${s.id}`, current,
    `<span class="side-name" title="${esc(s.reason)}">${esc(s.topic)}</span>`, s.articles, { muted: true });
  const restOpen = rest.some((s) => `signal:${s.id}` === current);
  return `
    <div class="side-group">
      <h2 class="side-h">${esc(t('side.signals'))}</h2>
      <p class="side-hint">${esc(latest ? t('side.signalsHint', { date: date(latest) }) : t('side.signalsNone'))}</p>
      ${main.map(row).join('')}
      ${rest.length ? `<details class="side-sub"${restOpen ? ' open' : ''}>
          <summary class="side-item quiet">${esc(t('side.signalsSingle', { n: number(rest.length) }))}</summary>
          ${rest.map(row).join('')}
        </details>` : ''}
      <button type="button" class="side-item quiet" data-act="find-signals"><span class="side-name">${esc(t('side.findSignals'))}</span></button>
    </div>`;
}

// The association's own Drive folder, near the top: what came from it, and
// how much of that the editor has not opened. Only while it has articles.
function driveGroup(sources, c, current) {
  const drive = sources.find((s) => s.type === 'drive');
  if (!drive || !c.drive) return '';
  const fresh = c.drive_new ? `<span class="side-unseen">${esc(t('side.driveNew', { n: number(c.drive_new) }))}</span>` : '';
  return `
    <div class="side-group">
      ${entry(`source:${drive.id}`, current, `<span class="side-name">${esc(t('side.drive'))}</span>${fresh}`, c.drive, { extra: ' drive' })}
    </div>`;
}

// current: the place shown, such as inbox or topic:3.
export function sideHtml({ current, counts, topics, untopiced, sources, drafts, target, signals = [], signalsLatest = null }) {
  const c = counts || {};
  const followed = topics.filter((x) => x.followed);
  const other = topics.filter((x) => !x.followed);
  const views = ['used', 'waiting', 'skipped', 'attention', 'all'];
  const viewOpen = views.includes(current);
  const sourceOpen = current.startsWith('source:');
  return `
    <button type="button" class="side-close btn ghost small" data-act="side">${esc(t('side.close'))}</button>
    <div class="side-group">
      ${entry('inbox', current, `<span class="side-name">${esc(t('place.inbox'))}</span>${c.unseen
        ? `<span class="side-unseen">${esc(t('side.unseen', { n: number(c.unseen) }))}</span>` : ''}`, c.inbox, { extra: ' big' })}
      ${entry('picked', current, `<span class="side-name">${esc(t('view.picked'))}</span>`, c.picked, { muted: true })}
      ${entry('later', current, `<span class="side-name">${esc(t('view.later'))}</span>`, c.later, { muted: true })}
      ${entry('dismissed', current, `<span class="side-name">${esc(t('view.dismissed'))}</span>`, c.dismissed, { muted: true })}
    </div>
    ${driveGroup(sources, c, current)}
    <div class="side-group">
      ${entry('ask', current, `<span class="side-name">${esc(t('side.ask'))}</span>`, null, { extra: ' ask' })}
      <p class="side-hint">${esc(t('side.askHint'))}</p>
    </div>
    <div class="side-group">
      <h2 class="side-h">${esc(t('side.followed'))}</h2>
      <p class="side-hint">${esc(t('side.followedHint'))}</p>
      ${followed.map((x) => topicRow(x, current)).join('')}
    </div>
    <div class="side-group">
      <h2 class="side-h">${esc(t('side.other'))}</h2>
      ${other.map((x) => topicRow(x, current)).join('')}
      <div class="side-row">${entry('none', current, `<span class="dot" aria-hidden="true"></span><span class="side-name">${esc(t('side.none'))}</span>`,
        untopiced ? untopiced.new : null, { muted: true, extra: ' off' })}</div>
      ${entry('topics', current, `<span class="side-name">${esc(t('side.editTopics'))} ›</span>`, null, { extra: ' quiet' })}
    </div>
    ${signalsGroup(signals, signalsLatest, current)}
    <details class="side-group side-more"${sourceOpen ? ' open' : ''}>
      <summary class="side-h">${esc(t('side.sources'))}</summary>
      ${sources.map((s) => entry(`source:${s.id}`, current, `<span class="side-name" title="${esc(s.name)}">${esc(s.name)}</span>`, s.items, { muted: true })).join('')}
    </details>
    <details class="side-group side-more"${viewOpen ? ' open' : ''}>
      <summary class="side-h">${esc(t('side.more'))}</summary>
      ${views.map((v) => entry(v, current, `<span class="side-name">${esc(t(`view.${v}`))}</span>`, c[v], { muted: true })).join('')}
    </details>
    ${targetCard(drafts, target)}`;
}
