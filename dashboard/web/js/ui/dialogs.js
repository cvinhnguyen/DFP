// Windows over the editor: a question, a name to type, a short note that
// fades. Each traps the keyboard while open and gives the focus back after.

import { t } from '../texts.js';
import { h, fill } from './dom.js';
import { icon } from './icons.js';

export function modal({ title, body, actions = [], wide = false, className = '', onClose, closable = true }) {
  const before = document.activeElement;
  const box = h('div', { class: `md-box${wide ? ' wide' : ''} ${className}`, role: 'dialog', 'aria-modal': 'true', 'aria-label': title });
  const overlay = h('div', { class: 'md-overlay' }, box);
  const close = (result) => {
    overlay.remove();
    document.removeEventListener('keydown', onKey, true);
    if (before && before.focus) before.focus({ preventScroll: true });
    if (onClose) onClose(result);
  };
  function onKey(e) {
    if (e.key === 'Escape' && closable) {
      e.stopPropagation();
      close(null);
    }
    if (e.key === 'Tab') {
      const focusable = [...box.querySelectorAll('button, [href], input, select, textarea, iframe, [tabindex]:not([tabindex="-1"])')].filter((el) => !el.disabled && el.offsetParent !== null);
      if (!focusable.length) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    }
  }
  fill(box,
    h('div', { class: 'md-head' },
      h('h2', { class: 'md-title' }, title),
      closable ? h('button', { type: 'button', class: 'md-close', 'aria-label': t('dialog.close'), title: t('dialog.close'), html: icon('close', 20), onclick: () => close(null) }) : null),
    h('div', { class: 'md-body' }, body),
    actions.length ? h('div', { class: 'md-actions' }, actions.map((a) => h('button', {
      type: 'button',
      class: `btn${a.primary ? '' : ' ghost'}${a.danger ? ' danger' : ''}`,
      onclick: () => (a.onClick ? a.onClick(close) : close(a.value)),
    }, a.label))) : null,
  );
  overlay.addEventListener('mousedown', (e) => {
    if (e.target === overlay && closable) close(null);
  });
  document.addEventListener('keydown', onKey, true);
  document.body.append(overlay);
  const firstInput = box.querySelector('input, textarea, select');
  const primary = box.querySelector('.md-actions .btn:not(.ghost)');
  (firstInput || primary || box.querySelector('.md-close') || box).focus();
  return { close, box };
}

export function confirmDialog(text, { okLabel, cancelLabel, danger = false, title } = {}) {
  return new Promise((resolve) => {
    modal({
      title: title || t('dialog.confirm'),
      body: h('p', {}, text),
      actions: [
        { label: cancelLabel || t('dialog.cancel'), value: false },
        { label: okLabel || t('dialog.ok'), value: true, primary: true, danger },
      ],
      onClose: (v) => resolve(!!v),
    });
  });
}

export function promptDialog(title, value = '', { label, hint, okLabel, maxlength = 120 } = {}) {
  return new Promise((resolve) => {
    const input = h('input', { class: 'cf-input', value, maxlength, 'aria-label': label || title });
    let done = false;
    const finish = (close, v) => {
      done = true;
      close(v);
    };
    const dialog = modal({
      title,
      body: h('div', {}, label ? h('label', { class: 'cf-label' }, label) : null, input, hint ? h('p', { class: 'cf-hint' }, hint) : null),
      actions: [
        { label: t('dialog.cancel'), value: null },
        { label: okLabel || t('dialog.save'), primary: true, onClick: (close) => finish(close, input.value.trim() || null) },
      ],
      onClose: (v) => resolve(done ? v : (v || null)),
    });
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        finish(dialog.close, input.value.trim() || null);
      }
    });
    input.select();
  });
}

let toastBox = null;

export function toast(message, kind = 'good') {
  if (!toastBox) {
    toastBox = h('div', { class: 'toasts', role: 'status', 'aria-live': 'polite' });
    document.body.append(toastBox);
  }
  const note = h('div', { class: `toast ${kind}` }, message);
  toastBox.append(note);
  setTimeout(() => note.classList.add('out'), 3800);
  setTimeout(() => note.remove(), 4300);
}
