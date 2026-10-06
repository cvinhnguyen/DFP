// The one way an empty place looks on every page: a mark, a title, a line
// on what goes there, and the next step, as Kysy artikkeleilta and the
// empty list of newsletters had it first.
//
//   emptyState({ icon, title, text, actions, tone })
//
// actions is HTML of buttons or links, made by the caller with esc().
// tone 'is-problem' marks something that went wrong.

import { esc } from '../format.js';
import { icon } from './icons.js';

export function emptyState({ icon: name = 'info', title = '', text = '', actions = '', tone = '' } = {}) {
  return `<div class="empty${tone ? ` ${tone}` : ''}">
    <span class="empty-mark" aria-hidden="true">${icon(name, 24)}</span>
    ${title ? `<p class="empty-title">${esc(title)}</p>` : ''}
    ${text ? `<p class="empty-text">${esc(text)}</p>` : ''}
    ${actions ? `<div class="empty-acts">${actions}</div>` : ''}
  </div>`;
}
