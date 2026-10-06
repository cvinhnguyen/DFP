// The screens the editor and the preview show the email on: a computer, and
// real phones and tablets at their own screen sizes in CSS pixels, which is
// what the email's phone rules (max-width 480px, render.js) see. Each is
// drawn the way its maker draws it: the Dynamic Island of a new iPhone, the
// notch of an iPhone 16e, the home button of an iPhone SE, the camera hole of
// a Pixel or a Galaxy S, the teardrop of a Galaxy A, the even frame of a
// tablet, the fold of a Galaxy Z Fold, with a status bar on top.
//
// The sizes, checked in October 2026 against webmobilefirst.com, yesviz.com
// and 1440px.com, and for the iPhone 18 Pro against Apple's own figures
// (the same screens as the iPhone 17 Pro): models on sale then, and older
// ones still common. One entry for each screen size: the other models of
// the same size are named beside it (also), as the width is what changes
// the email. A model the sources disagree on is left out.
//
// The frame is drawn around the email's iframe, which is never moved: moving
// an iframe loads it again, and the canvas's iframe is the email being edited.

import { t } from '../texts.js';
import { h } from '../ui/dom.js';

export const DEVICES = [
  { id: 'desktop', kind: 'desktop' },
  { id: 'iphone-se', kind: 'phone', maker: 'Apple', name: 'iPhone SE', width: 375, height: 667, look: 'home' },
  { id: 'iphone-16e', kind: 'phone', maker: 'Apple', name: 'iPhone 16e', also: '14, 13', width: 390, height: 844, look: 'notch' },
  { id: 'iphone-16', kind: 'phone', maker: 'Apple', name: 'iPhone 16', also: '15, 15 Pro, 14 Pro', width: 393, height: 852, look: 'island' },
  { id: 'iphone-17', kind: 'phone', maker: 'Apple', name: 'iPhone 17', also: '16 Pro, 17 Pro, 18 Pro', width: 402, height: 874, look: 'island' },
  { id: 'iphone-air', kind: 'phone', maker: 'Apple', name: 'iPhone Air', width: 420, height: 912, look: 'island' },
  { id: 'iphone-16-plus', kind: 'phone', maker: 'Apple', name: 'iPhone 16 Plus', also: '15 Plus, 15 Pro Max, 14 Pro Max', width: 430, height: 932, look: 'island' },
  { id: 'iphone-18-pro-max', kind: 'phone', maker: 'Apple', name: 'iPhone 18 Pro Max', also: '16 Pro Max, 17 Pro Max', width: 440, height: 956, look: 'island' },
  { id: 'galaxy-s26', kind: 'phone', maker: 'Samsung', name: 'Galaxy S26', also: 'S25, S24', width: 360, height: 780, look: 'punch' },
  { id: 'galaxy-a17', kind: 'phone', maker: 'Samsung', name: 'Galaxy A17', width: 412, height: 892, look: 'drop' },
  { id: 'pixel-10', kind: 'phone', maker: 'Google', name: 'Pixel 10', width: 412, height: 924, look: 'punch' },
  { id: 'ipad-mini', kind: 'tablet', maker: 'Apple', name: 'iPad mini', width: 744, height: 1133, look: 'tablet' },
  { id: 'ipad', kind: 'tablet', maker: 'Apple', name: 'iPad', also: 'iPad Air 11″', width: 820, height: 1180, look: 'tablet' },
  { id: 'ipad-pro-11', kind: 'tablet', maker: 'Apple', name: 'iPad Pro 11″', width: 834, height: 1210, look: 'tablet' },
  { id: 'ipad-pro-13', kind: 'tablet', maker: 'Apple', name: 'iPad Pro 13″', width: 1032, height: 1376, look: 'tablet' },
  { id: 'galaxy-tab-s11', kind: 'tablet', maker: 'Samsung', name: 'Galaxy Tab S11', width: 800, height: 1280, look: 'tablet' },
  { id: 'galaxy-tab-s11-ultra', kind: 'tablet', maker: 'Samsung', name: 'Galaxy Tab S11 Ultra', width: 924, height: 1480, look: 'tablet' },
  { id: 'galaxy-z-fold7', kind: 'tablet', maker: 'Samsung', name: 'Galaxy Z Fold7, open', width: 984, height: 1092, look: 'fold' },
];

export const KINDS = ['desktop', 'tablet', 'phone'];
const DEFAULT = { phone: 'iphone-17', tablet: 'ipad' };
const KEY = 'dfp.editor.device';

export const device = (id) => DEVICES.find((d) => d.id === id) || DEVICES[0];
export const ofKind = (kind) => DEVICES.filter((d) => d.kind === kind);

// The one last shown, and the model last chosen of each kind, kept in this
// browser.
function remembered() {
  try {
    return { ...DEFAULT, current: 'desktop', ...JSON.parse(localStorage.getItem(KEY) || '{}') };
  } catch {
    return { ...DEFAULT, current: 'desktop' };
  }
}

export function lastDevice() {
  return device(remembered().current).id;
}

export function modelFor(kind) {
  if (kind === 'desktop') return 'desktop';
  const id = remembered()[kind];
  return device(id).kind === kind ? id : DEFAULT[kind];
}

export function remember(id) {
  const d = device(id);
  const now = remembered();
  now.current = d.id;
  if (d.kind !== 'desktop') now[d.kind] = d.id;
  try {
    localStorage.setItem(KEY, JSON.stringify(now));
  } catch {
    // Without storage the choice lasts until the page is left.
  }
}

// The status bar's icons: signal, wifi and the battery.
const ICONS = '<svg viewBox="0 0 68 14" width="68" height="14" aria-hidden="true" focusable="false">'
  + '<rect x="0" y="9" width="3" height="4" rx="1"/><rect x="5" y="6.5" width="3" height="6.5" rx="1"/>'
  + '<rect x="10" y="4" width="3" height="9" rx="1"/><rect x="15" y="1.5" width="3" height="11.5" rx="1"/>'
  + '<path d="M30.5 4.2a9.6 9.6 0 0 1 12.9 0l-1.6 1.7a7.3 7.3 0 0 0-9.7 0zM33.3 7.2a5.4 5.4 0 0 1 7.2 0l-1.7 1.7a3 3 0 0 0-3.8 0zM36.9 12.3l-1.9-2a2.6 2.6 0 0 1 3.8 0z"/>'
  + '<rect x="46.5" y="2" width="18" height="10" rx="3" fill="none" stroke="currentColor" stroke-width="1.2" opacity=".45"/>'
  + '<rect x="48.3" y="3.8" width="14.4" height="6.4" rx="1.6"/><path d="M66 5.5v3a1.6 1.6 0 0 0 0-3z" opacity=".45"/></svg>';

// The frame's parts around the screen: the screen holds the status bar and
// the iframe, which the caller puts in its place.
export function deviceShell(className = '') {
  const status = h('div', { class: 'dv-status', 'aria-hidden': 'true' },
    h('span', { class: 'dv-time' }, '9.41'), h('span', { class: 'dv-cam' }), h('span', { class: 'dv-icons', html: ICONS }));
  const screen = h('div', { class: 'dv-screen' }, status);
  const shell = h('div', { class: `dv ${className}`.trim(), dataset: { kind: 'desktop' } }, screen,
    h('span', { class: 'dv-home', 'aria-hidden': 'true' }));
  return { shell, screen };
}

// Puts a frame on the device: its size, its look and its name for screen
// readers. The page it is in sets data-device to the kind as well.
export function showDevice(shell, id) {
  const d = device(id);
  shell.dataset.kind = d.kind;
  shell.dataset.look = d.look || '';
  shell.style.setProperty('--dv-w', d.width ? `${d.width}px` : '100%');
  shell.style.setProperty('--dv-h', d.height ? `${d.height}px` : '100%');
  shell.setAttribute('aria-label', d.kind === 'desktop' ? t('editor.desktop') : `${d.name}, ${d.width} × ${d.height}`);
  return d;
}

// The email laid out again for the new width. Chrome keeps an email's
// tables at the width they had when only the frame around them changes,
// although the phone rules already apply, until something else moves them.
export function layOutAgain(frame) {
  const doc = frame && frame.contentDocument;
  if (!doc || !doc.body) return;
  const win = frame.contentWindow;
  const y = win.scrollY;
  doc.body.style.display = 'none';
  void doc.body.offsetHeight;
  doc.body.style.display = '';
  win.scrollTo(0, y);
}

// The menu's entries for the models of one kind, by maker, the chosen one
// ticked.
export function modelEntries(kind, current, onPick) {
  const makers = [...new Set(ofKind(kind).map((d) => d.maker))];
  return makers.map((maker) => ({
    kind: 'group', label: maker, options: ofKind(kind).filter((d) => d.maker === maker).map((d) => ({
      label: `${d.name}${d.also ? ` (${t('editor.alsoModels', { models: d.also })})` : ''} · ${d.width} × ${d.height}`,
      checked: d.id === current, onSelect: () => onPick(d.id),
    })),
  }));
}
