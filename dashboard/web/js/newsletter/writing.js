// Help from the AI with the newsletter's own text: subject lines and preview
// texts to choose from, and drafts of the greeting and of why a trend
// matters. The dashboard asks n8n for them (dashboard/app/services/writing.py).
// A suggestion is something an editor chooses and can still edit. A draft
// goes into the email unchecked, outlined like an article's AI summary,
// until an editor has read it and ticked it.
// Jira: DM42-25, DM42-37, DM42-40

import { t } from '../texts.js';
import { aiUsage } from '../format.js';
import { h } from '../ui/dom.js';
import { fromText } from './richtext.js';
import { PLACEHOLDERS, trendCardHtml } from './templates.js';

export const usageLine = aiUsage;

// Subject lines and preview texts as buttons. Pressing one puts it in its
// field, through onSubject or onPreheader; nothing is saved until the
// editor saves.
export function suggestionsBox(result, { onSubject, onPreheader }) {
  const chip = (text, pick) => h('button', { type: 'button', class: 'ai-chip', title: t('ai.use'), onclick: () => pick(text) }, text);
  const usage = usageLine(result);
  return h('div', { class: 'ai-suggest' },
    h('p', { class: 'ai-suggest-label' }, t('ai.subjects')),
    h('div', { class: 'ai-chips' }, result.subjects.map((s) => chip(s, onSubject))),
    result.preheaders.length ? h('p', { class: 'ai-suggest-label' }, t('ai.preheaders')) : null,
    result.preheaders.length ? h('div', { class: 'ai-chips' }, result.preheaders.map((s) => chip(s, onPreheader))) : null,
    usage ? h('p', { class: 'cf-hint' }, usage) : null);
}

// What the AI can write in a text block: the greeting, in the greeting
// section's first text block, and a trend's box, which knows its signal.
// 'trend-old' is a box made before it did. null for any other block.
export function draftTask(block, section) {
  if (!block || block.type !== 'text' || !section) return null;
  if (section.role === 'greeting') {
    const first = section.blocks.find((b) => b.type === 'text');
    return first && first.id === block.id ? 'greeting' : null;
  }
  if (section.role === 'trend') return section.signal ? 'trend' : 'trend-old';
  return null;
}

// Whether a new draft would replace text a person wrote: anything other than
// the template's sample text, or the AI's own last draft as it was.
export function draftReplacesEdits(block) {
  if (block.ai) return block.html !== block.ai.html;
  return !block.placeholder;
}

// The lines of the greeting a draft keeps: the template's own first line,
// such as "Tervehdys täältä Suomen eOppimiskeskus ry:n toimistolta!", without
// its sample text. Nothing once a person has written their own.
export function greetingOpening(block) {
  if (block.ai) return block.ai.opening || '';
  if (!block.placeholder) return '';
  const doc = new DOMParser().parseFromString(`<body>${block.html || ''}</body>`, 'text/html');
  const samples = Object.values(PLACEHOLDERS);
  return [...doc.body.children].filter((el) => !samples.some((s) => el.textContent.includes(s)))
    .map((el) => el.outerHTML).join('');
}

// The block's new text: the greeting's opening and the draft, or the trend's
// box made again around it.
export function draftedHtml(task, block, result, opening) {
  const text = fromText(result.text);
  if (task === 'trend') return trendCardHtml(result.signal, text, /<h4[\s>]/i.test(block.html || ''));
  return `${opening || ''}${text}`;
}
