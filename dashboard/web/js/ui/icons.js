// The editor's icons, drawn here as small SVGs so nothing is loaded from
// elsewhere. Each is a 24-pixel line drawing in the current text colour.

const P = {
  blocks: '<circle cx="6" cy="6" r="1.7" class="f"/><circle cx="12" cy="6" r="1.7" class="f"/><circle cx="18" cy="6" r="1.7" class="f"/><circle cx="6" cy="12" r="1.7" class="f"/><circle cx="12" cy="12" r="1.7" class="f"/><circle cx="18" cy="12" r="1.7" class="f"/><circle cx="6" cy="18" r="1.7" class="f"/><circle cx="12" cy="18" r="1.7" class="f"/><circle cx="18" cy="18" r="1.7" class="f"/>',
  sections: '<rect x="4" y="4" width="16" height="6.5" rx="1.5"/><rect x="4" y="13.5" width="16" height="6.5" rx="1.5"/>',
  styles: '<path d="M4.5 12.5l6.8-6.8 6.5 6.5-6.8 6.8a1.6 1.6 0 0 1-2.2 0l-4.3-4.3a1.6 1.6 0 0 1 0-2.2z"/><path d="M11.3 5.7L9 3.4"/><path d="M4.8 12.5h13"/><path d="M19.5 15.5c.8 1.2 1.3 2 1.3 2.7a1.3 1.3 0 0 1-2.6 0c0-.7.5-1.5 1.3-2.7z"/>',
  check: '<circle cx="12" cy="12" r="8.5"/><path d="M8.3 12.3l2.6 2.6 4.8-5.2"/>',
  image: '<rect x="3.5" y="5" width="17" height="14" rx="2"/><circle cx="9" cy="10" r="1.6"/><path d="M4 17.5l5-5 4 4 2.5-2.5 4.5 4"/>',
  heading: '<path d="M6.5 5v14M17.5 5v14M6.5 12h11"/>',
  paragraph: '<path d="M5 7h14M5 11h14M5 15h14M5 19h8"/>',
  button: '<rect x="3.5" y="8" width="17" height="8" rx="4"/><path d="M8.5 12h7"/>',
  divider: '<path d="M4 12h16"/><path d="M4 7h16M4 17h16" opacity=".3"/>',
  spacer: '<path d="M12 5v14M8.5 8L12 4.5 15.5 8M8.5 16l3.5 3.5 3.5-3.5"/>',
  video: '<rect x="3.5" y="5.5" width="17" height="13" rx="2"/><path d="M10.5 9.3v5.4l4.5-2.7z"/>',
  social: '<circle cx="6.5" cy="12" r="2.3"/><circle cx="17.5" cy="6.5" r="2.3"/><circle cx="17.5" cy="17.5" r="2.3"/><path d="M8.6 11l6.8-3.4M8.6 13l6.8 3.4"/>',
  logo: '<path d="M12 3.5l7.5 4.3v8.4L12 20.5l-7.5-4.3V7.8z"/><path d="M9.5 15l2.5-6 2.5 6M10.4 13h3.2"/>',
  footer: '<rect x="5" y="3.5" width="14" height="17" rx="2"/><path d="M8 14.5h8M8 17.3h5"/>',
  article: '<rect x="4" y="4.5" width="16" height="15" rx="2"/><path d="M7.5 8.5h9M7.5 12h9M7.5 15.5h5.5"/>',
  desktop: '<rect x="3.5" y="4.5" width="17" height="11.5" rx="1.5"/><path d="M9 20h6M12 16v4"/>',
  mobile: '<rect x="7.5" y="3.5" width="9" height="17" rx="2"/><path d="M11 17.5h2"/>',
  tablet: '<rect x="4.5" y="3" width="15" height="18" rx="2"/><path d="M11 18h2"/>',
  undo: '<path d="M9 6.5L4.5 11 9 15.5"/><path d="M4.5 11H14a5 5 0 0 1 0 10h-2.5"/>',
  redo: '<path d="M15 6.5l4.5 4.5-4.5 4.5"/><path d="M19.5 11H10a5 5 0 0 0 0 10h2.5"/>',
  comment: '<path d="M5 5h14a1.5 1.5 0 0 1 1.5 1.5v8.5a1.5 1.5 0 0 1-1.5 1.5h-8.5L6 20v-3.5H5A1.5 1.5 0 0 1 3.5 15V6.5A1.5 1.5 0 0 1 5 5z"/>',
  bold: '<path d="M7.5 5h5.8a3.4 3.4 0 0 1 0 6.8H7.5zM7.5 11.8h6.6a3.6 3.6 0 0 1 0 7.2H7.5z"/>',
  italic: '<path d="M10.5 5h7M6.5 19h7M14.5 5l-4 14"/>',
  underline: '<path d="M7.5 5v6a4.5 4.5 0 0 0 9 0V5M5.5 20h13"/>',
  strike: '<path d="M4.5 12h15"/><path d="M16 7.5C15.4 6 13.9 5 12 5c-2.4 0-4 1.3-4 3.1 0 1.1.6 1.9 1.6 2.5M8.2 16.3c.6 1.6 2.1 2.7 4.1 2.7 2.5 0 4.2-1.3 4.2-3.2 0-.8-.3-1.4-.8-1.9"/>',
  link: '<path d="M10.2 13.8a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1"/><path d="M13.8 10.2a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1"/>',
  unlink: '<path d="M10.2 13.8a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1"/><path d="M13.8 10.2a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1"/><path d="M4 4l16 16"/>',
  alignLeft: '<path d="M4 6h16M4 10h10M4 14h16M4 18h10"/>',
  alignCenter: '<path d="M4 6h16M7 10h10M4 14h16M7 18h10"/>',
  alignRight: '<path d="M4 6h16M10 10h10M4 14h16M10 18h10"/>',
  alignJustify: '<path d="M4 6h16M4 10h16M4 14h16M4 18h16"/>',
  listUl: '<path d="M9.5 7h10.5M9.5 12h10.5M9.5 17h10.5"/><circle cx="5" cy="7" r="1.2" class="f"/><circle cx="5" cy="12" r="1.2" class="f"/><circle cx="5" cy="17" r="1.2" class="f"/>',
  listOl: '<path d="M10.5 7h9.5M10.5 12h9.5M10.5 17h9.5"/><path d="M4 5.5h1.5v4M4 9.5h3M4 14.6c.4-.6 2.9-.9 2.9.7 0 1.1-2.9 1.7-2.9 3h3"/>',
  textColor: '<path d="M7 16.5l5-12 5 12M8.8 12.5h6.4"/><path d="M4.5 20.5h15" class="bar" stroke-width="2.6"/>',
  highlight: '<path d="M14.5 4.5l5 5-7.5 7.5H7v-5z"/><path d="M4.5 20.5h15" class="bar" stroke-width="2.6"/>',
  lineHeight: '<path d="M11 6.5h9M11 12h9M11 17.5h9M5.5 5.5v13M3.5 7.5l2-2 2 2M3.5 16.5l2 2 2-2"/>',
  letterSpacing: '<path d="M7.5 13.5l4.5-9 4.5 9M9 10.5h6"/><path d="M4 18.5h16M6 16.5l-2 2 2 2M18 16.5l2 2-2 2"/>',
  more: '<circle cx="6" cy="12" r="1.6" class="f"/><circle cx="12" cy="12" r="1.6" class="f"/><circle cx="18" cy="12" r="1.6" class="f"/>',
  clearFormat: '<path d="M6 5h11M11.5 5L9 15"/><path d="M14 14l6 6M20 14l-6 6"/><path d="M5 20h6"/>',
  mergeTag: '<path d="M8 7l-4 5 4 5M16 7l4 5-4 5M13.5 5l-3 14"/>',
  move: '<path d="M12 3.5v17M3.5 12h17M9 6.5l3-3 3 3M9 17.5l3 3 3-3M6.5 9l-3 3 3 3M17.5 9l3 3-3 3"/>',
  duplicate: '<rect x="8.5" y="8.5" width="11.5" height="11.5" rx="2"/><path d="M5.5 15.5H5A1.5 1.5 0 0 1 3.5 14V5A1.5 1.5 0 0 1 5 3.5h9A1.5 1.5 0 0 1 15.5 5v.5"/>',
  trash: '<path d="M4.5 7h15M10 11v6M14 11v6M6 7l.9 12.6A1.5 1.5 0 0 0 8.4 21h7.2a1.5 1.5 0 0 0 1.5-1.4L18 7M9.5 7V4.5h5V7"/>',
  tick: '<path d="M5 12.5l4.5 4.5L19 7.5"/>',
  arrowUp: '<path d="M12 19V5.5M6 11l6-6 6 6"/>',
  arrowDown: '<path d="M12 5v13.5M6 13l6 6 6-6"/>',
  arrowLeft: '<path d="M19 12H5.5M11 6l-6 6 6 6"/>',
  arrowRight: '<path d="M5 12h13.5M13 6l6 6-6 6"/>',
  chevronDown: '<path d="M6.5 9.5l5.5 5.5 5.5-5.5"/>',
  chevronUp: '<path d="M6.5 14.5L12 9l5.5 5.5"/>',
  chevronRight: '<path d="M9.5 6.5l5.5 5.5-5.5 5.5"/>',
  close: '<path d="M6.5 6.5l11 11M17.5 6.5l-11 11"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  upload: '<path d="M12 15.5V4.5M7.5 9L12 4.5 16.5 9M4.5 15.5v3a1.5 1.5 0 0 0 1.5 1.5h12a1.5 1.5 0 0 0 1.5-1.5v-3"/>',
  search: '<circle cx="10.5" cy="10.5" r="6"/><path d="M15 15l5 5"/>',
  grip: '<circle cx="9" cy="6" r="1.4" class="f"/><circle cx="15" cy="6" r="1.4" class="f"/><circle cx="9" cy="12" r="1.4" class="f"/><circle cx="15" cy="12" r="1.4" class="f"/><circle cx="9" cy="18" r="1.4" class="f"/><circle cx="15" cy="18" r="1.4" class="f"/>',
  external: '<path d="M14 4h6v6M20 4l-9 9M18 14v4.5a1.5 1.5 0 0 1-1.5 1.5h-11A1.5 1.5 0 0 1 4 18.5v-11A1.5 1.5 0 0 1 5.5 6H10"/>',
  eye: '<path d="M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12z"/><circle cx="12" cy="12" r="3"/>',
  send: '<path d="M4 11.5L20 4l-5.5 16-3.3-6.7z"/><path d="M11.2 13.3L20 4"/>',
  warning: '<path d="M12 4l9 16H3z"/><path d="M12 10v4.5M12 17.3v.2"/>',
  error: '<circle cx="12" cy="12" r="8.5"/><path d="M12 7.5v5.5M12 16v.3"/>',
  info: '<circle cx="12" cy="12" r="8.5"/><path d="M12 11v5.5M12 7.7v.3"/>',
  template: '<rect x="3.5" y="3.5" width="17" height="17" rx="2"/><path d="M3.5 9h17M9.5 9v11.5"/>',
  save: '<path d="M5 4.5h11l3 3V18a1.5 1.5 0 0 1-1.5 1.5h-11A1.5 1.5 0 0 1 5 18z"/><path d="M8 4.5V9h7V4.5M8 19.5v-5h8v5"/>',
  folder: '<path d="M3.5 7A1.5 1.5 0 0 1 5 5.5h4.5l2 2.5H19a1.5 1.5 0 0 1 1.5 1.5V17A1.5 1.5 0 0 1 19 18.5H5A1.5 1.5 0 0 1 3.5 17z"/>',
  pencil: '<path d="M15.5 4.5l4 4L9 19H5v-4z"/><path d="M13 7l4 4"/>',
  cursor: '<path d="M6 4l12 7-5.5 1.5L10 18z"/>',
  clock: '<circle cx="12" cy="12" r="8.5"/><path d="M12 7.5V12l3 2"/>',
  refresh: '<path d="M19.2 14.6a7.5 7.5 0 1 1-1.9-7.9L20 9.3"/><path d="M20 4.8v4.5h-4.5"/>',
  // Lähteet, the calendar and planning: what kind a source is, what the AI
  // worked out, the day a newsletter goes out.
  sparkle: '<path d="M11 3.5l1.8 4.9 4.9 1.8-4.9 1.8L11 16.9l-1.8-4.9L4.3 10.2l4.9-1.8z"/><path d="M18 14.5l.8 2 2 .8-2 .8-.8 2-.8-2-2-.8 2-.8z"/>',
  feed: '<path d="M5 5a14 14 0 0 1 14 14"/><path d="M5 10.5a8.5 8.5 0 0 1 8.5 8.5"/><circle cx="6" cy="18" r="1.6" class="f"/>',
  journal: '<path d="M5.5 4.5h10a2 2 0 0 1 2 2V20H7.5a2 2 0 0 1-2-2z"/><path d="M5.5 18a2 2 0 0 1 2-2h10"/><path d="M9 8.5h5"/>',
  archive: '<rect x="3.5" y="4.5" width="17" height="4.5" rx="1"/><path d="M5 9v9.5A1.5 1.5 0 0 0 6.5 20h11a1.5 1.5 0 0 0 1.5-1.5V9"/><path d="M10 13h4"/>',
  globe: '<circle cx="12" cy="12" r="8.5"/><path d="M3.5 12h17M12 3.5c2.4 2.6 3.6 5.4 3.6 8.5s-1.2 5.9-3.6 8.5c-2.4-2.6-3.6-5.4-3.6-8.5s1.2-5.9 3.6-8.5z"/>',
  calendar: '<rect x="3.5" y="5" width="17" height="15" rx="2"/><path d="M3.5 9.5h17M8 3v4M16 3v4"/>',
  flag: '<path d="M6 21V4.5"/><path d="M6 5h11l-2.2 3.5L17 12H6"/>',
  sliders: '<path d="M4 7h9M17 7h3M4 17h3M11 17h9"/><circle cx="15" cy="7" r="2"/><circle cx="9" cy="17" r="2"/>',
  mail: '<rect x="3.5" y="5.5" width="17" height="13" rx="2"/><path d="M4.5 7l7.5 6 7.5-6"/>',
  swap: '<path d="M7 7h12M15.5 3.5L19 7l-3.5 3.5M17 17H5M8.5 13.5L5 17l3.5 3.5"/>',
  // The user menu: the look the page has, and leaving.
  sun: '<circle cx="12" cy="12" r="3.8"/><path d="M12 3v2M12 19v2M3 12h2M19 12h2M5.6 5.6l1.4 1.4M17 17l1.4 1.4M5.6 18.4L7 17M17 7l1.4-1.4"/>',
  moon: '<path d="M19.5 14.5A8 8 0 0 1 9.5 4.5a8 8 0 1 0 10 10z"/>',
  monitor: '<rect x="3.5" y="4.5" width="17" height="11.5" rx="1.5"/><path d="M9 20h6M12 16v4"/>',
  logout: '<path d="M14 4.5h3.5A1.5 1.5 0 0 1 19 6v12a1.5 1.5 0 0 1-1.5 1.5H14"/><path d="M10 8l-4 4 4 4M6 12h9"/>',
};

export function icon(name, size = 20) {
  const paths = P[name] || '';
  return `<svg class="icon icon-${name}" width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false">${paths}</svg>`;
}

// The picture of a column layout: one box per column, as wide as its share.
export function columnsIcon(shares, size = 34) {
  const total = shares.reduce((a, b) => a + b, 0);
  const gap = 2;
  const width = 30 - gap * (shares.length - 1);
  let x = 1;
  const rects = shares.map((s) => {
    const w = (width * s) / total;
    const r = `<rect x="${x.toFixed(2)}" y="4" width="${w.toFixed(2)}" height="12" rx="1.5"/>`;
    x += w + gap;
    return r;
  }).join('');
  return `<svg class="icon" width="${size}" height="${Math.round(size * 0.6)}" viewBox="0 0 32 20" fill="none" stroke="currentColor" stroke-width="1.4" aria-hidden="true" focusable="false">${rects}</svg>`;
}
