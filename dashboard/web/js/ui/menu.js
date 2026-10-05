// A menu that opens from a button, the way the WAI-ARIA menu button pattern
// has it: the arrow keys, Home and End move through it, Enter or Space
// chooses, Escape closes it and puts the focus back on the button, and a
// click or Tab elsewhere closes it. Used for the user menu in the top bar.
//
//   openMenu(button, entries, { align })
//
// entries, in order:
//   { kind: 'head', title, sub }                      who the menu is for
//   { kind: 'group', label, options: [{ label, icon, checked, lang, onSelect }] }
//                                                     one of several, ticked
//   { kind: 'item', label, icon, onSelect }           an action
//   { kind: 'separator' }

import { h } from './dom.js';
import { icon } from './icons.js';

let current = null;

export function closeMenu() {
  current?.close();
}

export function openMenu(button, entries, { align = 'right' } = {}) {
  closeMenu();
  const id = `${button.id || 'menu'}-list`;
  const box = h('div', { class: 'cf-popover mb-menu', role: 'menu', id, 'aria-labelledby': button.id || null });
  const items = [];

  const choose = (onSelect) => () => {
    close();
    button.focus({ preventScroll: true });
    onSelect();
  };

  for (const entry of entries) {
    if (entry.kind === 'head') {
      box.append(h('div', { class: 'mb-head', role: 'presentation' },
        h('strong', {}, entry.title), entry.sub ? h('span', {}, entry.sub) : null));
    } else if (entry.kind === 'separator') {
      box.append(h('div', { class: 'mb-sep', role: 'separator' }));
    } else if (entry.kind === 'group') {
      const group = h('div', { role: 'group', 'aria-label': entry.label },
        h('div', { class: 'mb-group', 'aria-hidden': 'true' }, entry.label));
      for (const option of entry.options) {
        const item = h('button', {
          type: 'button', class: 'mb-item', role: 'menuitemradio', tabindex: '-1',
          'aria-checked': String(Boolean(option.checked)), lang: option.lang || null,
          html: `<span class="mb-tick" aria-hidden="true">${option.checked ? icon('tick', 16) : ''}</span>${option.icon ? icon(option.icon, 16) : ''}`,
        }, option.label);
        item.addEventListener('click', choose(option.onSelect));
        group.append(item);
        items.push(item);
      }
      box.append(group);
    } else {
      const item = h('button', {
        type: 'button', class: `mb-item${entry.danger ? ' danger' : ''}`, role: 'menuitem', tabindex: '-1',
        html: entry.icon ? `<span class="mb-tick" aria-hidden="true"></span>${icon(entry.icon, 16)}` : '',
      }, entry.label);
      item.addEventListener('click', choose(entry.onSelect));
      box.append(item);
      items.push(item);
    }
  }

  document.body.append(box);
  const place = () => {
    const r = button.getBoundingClientRect();
    const width = box.offsetWidth;
    let left = align === 'right' ? r.right - width : r.left;
    left = Math.max(8, Math.min(left, window.innerWidth - width - 8));
    box.style.left = `${left}px`;
    box.style.top = `${Math.min(r.bottom + 6, window.innerHeight - box.offsetHeight - 8)}px`;
  };
  place();

  const focusAt = (n) => items[(n + items.length) % items.length]?.focus();
  box.addEventListener('keydown', (event) => {
    const at = items.indexOf(document.activeElement);
    if (event.key === 'ArrowDown') focusAt(at + 1);
    else if (event.key === 'ArrowUp') focusAt(at - 1);
    else if (event.key === 'Home') focusAt(0);
    else if (event.key === 'End') focusAt(items.length - 1);
    else if (event.key === 'Escape') {
      close();
      button.focus({ preventScroll: true });
    } else if (event.key === 'Tab') {
      close();
      return;
    } else return;
    event.preventDefault();
  });
  const outside = (event) => {
    if (!box.contains(event.target) && !button.contains(event.target)) close();
  };
  document.addEventListener('mousedown', outside, true);
  window.addEventListener('resize', place);

  function close() {
    if (current?.box !== box) return;
    current = null;
    box.remove();
    button.setAttribute('aria-expanded', 'false');
    document.removeEventListener('mousedown', outside, true);
    window.removeEventListener('resize', place);
  }

  current = { box, close };
  button.setAttribute('aria-expanded', 'true');
  button.setAttribute('aria-controls', id);
  // The ticked choice first, or the first item.
  (items.find((i) => i.getAttribute('aria-checked') === 'true') || items[0])?.focus({ preventScroll: true });
  return { close };
}

// Opens the menu from the button by mouse or keyboard, and closes it on a
// second press.
export function menuButton(button, entries, options) {
  const toggle = () => {
    if (button.getAttribute('aria-expanded') === 'true') closeMenu();
    else openMenu(button, entries(), options);
  };
  button.setAttribute('aria-haspopup', 'menu');
  button.setAttribute('aria-expanded', 'false');
  button.addEventListener('click', toggle);
  button.addEventListener('keydown', (event) => {
    if (event.key === 'ArrowDown' && button.getAttribute('aria-expanded') !== 'true') {
      event.preventDefault();
      openMenu(button, entries(), options);
    }
  });
}
