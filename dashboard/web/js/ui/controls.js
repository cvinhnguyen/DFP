// The form controls the side panels are made of, looking and behaving like
// Mailchimp's: a colour with its code, a number with arrows, a row of
// choices, a switch, a folding group. Each calls back with the new value.

import { t } from '../texts.js';
import { h, keepFocus } from './dom.js';
import { icon } from './icons.js';

let uid = 0;
const nextId = (prefix) => `${prefix}-${++uid}`;

// The colours offered first: the association's own, then plain ones.
export const SWATCHES = [
  '#104f55', '#fcc0c5', '#fde9eb', '#1f2b2d', '#384446', '#6a7677', '#dde4e4', '#f3f4f4', '#ffffff',
  '#35661a', '#b9de95', '#2563a8', '#c0392b', '#d97706', '#f2c94c', '#7b4ce0', '#000000',
];

export function field(labelText, control, hint) {
  const id = control.id || nextId('f');
  if (!control.id && /^(INPUT|SELECT|TEXTAREA)$/.test(control.tagName)) control.id = id;
  return h('div', { class: 'cf-field' },
    labelText ? h('label', { class: 'cf-label', for: control.id || null }, labelText) : null,
    control,
    hint ? h('p', { class: 'cf-hint' }, hint) : null);
}

export function group(title, ...children) {
  return h('div', { class: 'cf-group' }, title ? h('h4', { class: 'cf-group-title' }, title) : null, ...children);
}

export function row(...children) {
  return h('div', { class: 'cf-row' }, ...children);
}

export function textInput(value, onChange, { placeholder = '', maxlength = 500, type = 'text', commit = 'input' } = {}) {
  const input = h('input', { class: 'cf-input', type, value: value ?? '', placeholder, maxlength });
  input.addEventListener(commit, () => onChange(input.value));
  return input;
}

export function textArea(value, onChange, { placeholder = '', rows = 3, maxlength = 2000 } = {}) {
  const area = h('textarea', { class: 'cf-input cf-area', rows, placeholder, maxlength });
  area.value = value ?? '';
  area.addEventListener('input', () => onChange(area.value));
  return area;
}

export function numberInput(value, onChange, { min = 0, max = 200, step = 1, unit = 'px' } = {}) {
  const input = h('input', { class: 'cf-input cf-number', type: 'number', value: value ?? 0, min, max, step, inputmode: 'numeric' });
  const clamp = (v) => Math.max(min, Math.min(max, Math.round(Number(v) / step) * step));
  const set = (v) => {
    const next = clamp(v);
    if (!Number.isFinite(next)) return;
    input.value = String(next);
    onChange(next);
  };
  input.addEventListener('change', () => set(input.value));
  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') set(input.value);
  });
  const up = h('button', { type: 'button', class: 'cf-step', 'aria-label': t('control.more'), html: icon('chevronUp', 14), onclick: () => set(Number(input.value) + step) });
  const down = h('button', { type: 'button', class: 'cf-step', 'aria-label': t('control.less'), html: icon('chevronDown', 14), onclick: () => set(Number(input.value) - step) });
  return h('div', { class: 'cf-numberbox' }, input, unit ? h('span', { class: 'cf-unit' }, unit) : null, h('div', { class: 'cf-steps' }, up, down));
}

export function select(options, value, onChange, { label } = {}) {
  const el = h('select', { class: 'cf-input cf-select', 'aria-label': label || null },
    options.map((o) => h('option', { value: o.value, selected: String(o.value) === String(value) }, o.label)));
  el.addEventListener('change', () => onChange(el.value));
  return el;
}

// A row of choices, one pressed: Mailchimp's Square | Round | Pill.
export function segmented(options, value, onChange, { label, compact = false } = {}) {
  const box = h('div', { class: `cf-seg${compact ? ' compact' : ''}`, role: 'radiogroup', 'aria-label': label || null });
  const render = (current) => {
    box.replaceChildren(...options.map((o) => h('button', {
      type: 'button',
      role: 'radio',
      class: 'cf-seg-item',
      'aria-checked': String(String(o.value) === String(current)),
      title: o.title || o.label,
      'aria-label': o.title || o.label,
      html: o.icon || null,
      onclick: () => {
        render(o.value);
        onChange(o.value);
      },
    }, o.icon ? null : o.label)));
  };
  render(value);
  return box;
}

export function toggle(checked, onChange, labelText) {
  const id = nextId('tg');
  const input = h('input', { type: 'checkbox', id, class: 'cf-toggle-input', checked: !!checked, role: 'switch' });
  input.addEventListener('change', () => onChange(input.checked));
  return h('label', { class: 'cf-toggle', for: id }, input, h('span', { class: 'cf-toggle-track', 'aria-hidden': 'true' }), h('span', { class: 'cf-toggle-label' }, labelText));
}

export function checkbox(checked, onChange, labelText) {
  const id = nextId('cb');
  const input = h('input', { type: 'checkbox', id, checked: !!checked });
  input.addEventListener('change', () => onChange(input.checked));
  return h('label', { class: 'cf-check', for: id }, input, h('span', {}, labelText));
}

export function slider(value, onChange, { min = 0, max = 100, step = 1, unit = '%' } = {}) {
  const out = h('span', { class: 'cf-slider-value' }, `${value}${unit}`);
  const input = h('input', { type: 'range', class: 'cf-slider', min, max, step, value });
  input.addEventListener('input', () => {
    out.textContent = `${input.value}${unit}`;
    onChange(Number(input.value));
  });
  return h('div', { class: 'cf-sliderbox' }, input, out);
}

// ---------- colours ----------

let openPopover = null;

export function closePopover() {
  if (openPopover) {
    openPopover.remove();
    openPopover = null;
  }
}

document.addEventListener('mousedown', (e) => {
  if (openPopover && !openPopover.contains(e.target) && !e.target.closest('[data-popover-anchor]')) closePopover();
});
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape' && openPopover) closePopover();
});

export function popover(anchor, content, { align = 'left', className = '' } = {}) {
  closePopover();
  const box = h('div', { class: `cf-popover ${className}`, role: 'dialog' }, content);
  document.body.append(box);
  const r = anchor.getBoundingClientRect();
  const width = box.offsetWidth;
  let left = align === 'right' ? r.right - width : r.left;
  left = Math.max(8, Math.min(left, window.innerWidth - width - 8));
  let top = r.bottom + 6;
  if (top + box.offsetHeight > window.innerHeight - 8) top = Math.max(8, r.top - box.offsetHeight - 6);
  box.style.left = `${left}px`;
  box.style.top = `${top}px`;
  openPopover = box;
  return box;
}

// The swatches, a code field and the system picker. allowNone offers "no
// colour", which hands the choice back to the email's own styles.
export function colourPicker(value, onPick, { allowNone = false, noneLabel } = {}) {
  const hex = h('input', { class: 'cf-input cf-hex', value: value || '', placeholder: '#000000', maxlength: 7, 'aria-label': t('control.colourCode') });
  const native = h('input', { type: 'color', class: 'cf-native', value: /^#[0-9a-f]{6}$/i.test(value || '') ? value : '#000000', 'aria-label': t('control.pickColour') });
  const pick = (v) => {
    hex.value = v || '';
    onPick(v);
  };
  hex.addEventListener('change', () => {
    const v = hex.value.trim().toLowerCase();
    if (/^#[0-9a-f]{6}$/.test(v)) pick(v);
    else if (/^#[0-9a-f]{3}$/.test(v)) pick(`#${v[1]}${v[1]}${v[2]}${v[2]}${v[3]}${v[3]}`);
  });
  native.addEventListener('input', () => pick(native.value));
  return h('div', { class: 'cf-colours' },
    h('div', { class: 'cf-swatches' }, SWATCHES.map((c) => keepFocus(h('button', {
      type: 'button', class: 'cf-swatch', title: c, 'aria-label': c, style: { background: c }, onclick: () => pick(c),
    })))),
    h('div', { class: 'cf-row' }, hex, native),
    allowNone ? keepFocus(h('button', { type: 'button', class: 'cf-linkish', onclick: () => pick('') }, noneLabel || t('control.noColour'))) : null);
}

// A colour field as Mailchimp shows it: a round swatch and the code.
export function colourInput(value, onChange, { allowNone = false, noneLabel } = {}) {
  const swatch = h('span', { class: `cf-dot${value ? '' : ' none'}`, style: { background: value || 'transparent' } });
  const text = h('span', { class: 'cf-colour-text' }, value || noneLabel || t('control.noColour'));
  const button = h('button', { type: 'button', class: 'cf-input cf-colour', 'data-popover-anchor': '' }, swatch, text);
  const set = (v) => {
    swatch.style.background = v || 'transparent';
    swatch.classList.toggle('none', !v);
    text.textContent = v || noneLabel || t('control.noColour');
    onChange(v);
  };
  button.addEventListener('click', () => {
    popover(button, colourPicker(value, (v) => {
      value = v;
      set(v);
    }, { allowNone, noneLabel }));
  });
  return button;
}

// ---------- folding groups ----------

export function accordion(title, build, { open = false, onToggle } = {}) {
  const body = h('div', { class: 'cf-acc-body', hidden: !open });
  let built = false;
  const head = h('button', { type: 'button', class: 'cf-acc-head', 'aria-expanded': String(open) },
    h('span', {}, title), h('span', { class: 'cf-acc-chevron', html: icon('chevronDown', 16) }));
  const fill = () => {
    if (!built) {
      body.append(build());
      built = true;
    }
  };
  if (open) fill();
  head.addEventListener('click', () => {
    const now = head.getAttribute('aria-expanded') !== 'true';
    head.setAttribute('aria-expanded', String(now));
    if (now) fill();
    body.hidden = !now;
    if (onToggle) onToggle(now);
  });
  return h('div', { class: 'cf-acc' }, head, body);
}

// ---------- spacing ----------

// Four sides, or one value for all of them, like Mailchimp's padding.
export function sides(values, onChange, { label, max = 120 } = {}) {
  const same = values.top === values.right && values.right === values.bottom && values.bottom === values.left;
  const box = h('div', { class: 'cf-sides' });
  let linked = same;
  const render = () => {
    const parts = [];
    if (linked) {
      parts.push(field(label || t('control.allSides'), numberInput(values.top, (v) => {
        values = { top: v, right: v, bottom: v, left: v };
        onChange(values);
      }, { max })));
    } else {
      const one = (name) => field(t(`control.${name}`), numberInput(values[name], (v) => {
        values = { ...values, [name]: v };
        onChange(values);
      }, { max }));
      parts.push(row(one('top'), one('bottom')), row(one('left'), one('right')));
    }
    parts.push(checkbox(linked, (v) => {
      linked = v;
      if (v) {
        values = { top: values.top, right: values.top, bottom: values.top, left: values.top };
        onChange(values);
      }
      render();
    }, t('control.sameAllSides')));
    box.replaceChildren(...parts);
  };
  render();
  return box;
}

// ---------- links ----------

const KINDS = ['web', 'email', 'phone'];

export function linkKind(url) {
  const v = String(url || '');
  if (v.startsWith('mailto:')) return 'email';
  if (v.startsWith('tel:')) return 'phone';
  return 'web';
}

export function linkValue(url) {
  return String(url || '').replace(/^mailto:/, '').replace(/^tel:/, '');
}

// What the editor typed, as a link: an address without https:// gets it,
// an email address gets mailto:, a phone number tel:.
export function linkFrom(kind, value) {
  const v = String(value || '').trim();
  if (!v) return '';
  if (/^\*\|[A-Z0-9_:]+\|\*$/.test(v)) return v;
  if (kind === 'email') return `mailto:${v.replace(/^mailto:/i, '')}`;
  if (kind === 'phone') return `tel:${v.replace(/^tel:/i, '').replace(/[^\d+]/g, '')}`;
  if (/^(https?:\/\/|#)/i.test(v)) return v;
  return `https://${v.replace(/^\/+/, '')}`;
}

export function linkEditor(link, onChange, { allowBlank = true } = {}) {
  let kind = linkKind(link && link.url);
  const value = textInput(linkValue(link && link.url), () => emit(), { placeholder: t(`link.placeholder.${kind}`), commit: 'change' });
  const blank = allowBlank ? toggle(link ? link.blank !== false : true, () => emit(), t('link.newTab')) : null;
  const kindSelect = select(KINDS.map((k) => ({ value: k, label: t(`link.kind.${k}`) })), kind, (k) => {
    kind = k;
    value.placeholder = t(`link.placeholder.${k}`);
    emit();
  }, { label: t('link.kind') });
  function emit() {
    onChange({ url: linkFrom(kind, value.value), blank: blank ? blank.querySelector('input').checked : true });
  }
  return h('div', { class: 'cf-link' }, field(t('link.to'), kindSelect), value, blank);
}
