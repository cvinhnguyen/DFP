// A small way to build the editor's own controls without writing HTML
// strings: h('button', { class: 'x', onclick }, 'Label'). Strings become
// text, so a name or a title can never turn into markup.

export function h(tag, attrs = {}, ...children) {
  const el = document.createElement(tag);
  for (const [key, value] of Object.entries(attrs || {})) {
    if (value === undefined || value === null || value === false) continue;
    if (key.startsWith('on') && typeof value === 'function') el.addEventListener(key.slice(2), value);
    else if (key === 'class') el.className = value;
    else if (key === 'html') el.innerHTML = value;   // only ever our own icons
    else if (key === 'dataset') Object.assign(el.dataset, value);
    else if (key === 'style' && typeof value === 'object') Object.assign(el.style, value);
    else if (value === true) el.setAttribute(key, '');
    else el.setAttribute(key, String(value));
  }
  append(el, children);
  return el;
}

function append(el, children) {
  for (const child of children.flat(Infinity)) {
    if (child === null || child === undefined || child === false) continue;
    el.append(child instanceof Node ? child : document.createTextNode(String(child)));
  }
}

export function clear(el) {
  while (el.firstChild) el.firstChild.remove();
  return el;
}

// Empties an element and puts the given children in, skipping the empty
// ones (a plain append would write "null" for those).
export function fill(el, ...children) {
  clear(el);
  append(el, children);
  return el;
}

export function $(id) {
  return document.getElementById(id);
}

// A button that does not take focus from text being edited in the canvas,
// so a click on it can still act on the selected words.
export function keepFocus(el) {
  el.addEventListener('mousedown', (event) => event.preventDefault());
  return el;
}
