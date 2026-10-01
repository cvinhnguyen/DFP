// What the editor is working on, in one place: the design, what is selected,
// which text is being typed into, desktop or phone, and the undo history.
// The canvas and the panels change things only through here, and redraw
// when it tells them something changed.
//
//   change   the design changed. { render } is false while someone types,
//            because the canvas already shows the typing.
//   select   a different block or section is selected
//   device   desktop or phone
//   editing  text editing started or stopped

import { findBlock, findSection } from '../newsletter/model.js';

const MAX_HISTORY = 100;
// Changes with the same key this close together are one step of undo: the
// letters of a word, the clicks of a number's arrows.
const MERGE_MS = 1500;

export function createStore(design) {
  const listeners = new Map();
  const undoStack = [];
  const redoStack = [];
  let snapshot = JSON.stringify(design);
  let mergeKey = null;
  let mergeTimer = null;

  const state = {
    design,
    selection: null,     // { kind: 'block' | 'section', id }
    editing: null,       // { blockId, field }
    device: 'desktop',
    dirty: false,
    version: 0,          // goes up with every change, for "has it changed since"
  };

  function emit(name, detail = {}) {
    (listeners.get(name) || []).forEach((fn) => fn(detail));
  }

  function selectionStillThere() {
    const s = state.selection;
    if (!s) return;
    const there = s.kind === 'block' ? findBlock(state.design, s.id) : findSection(state.design, s.id);
    if (!there) state.selection = null;
  }

  return {
    get design() { return state.design; },
    get selection() { return state.selection; },
    get editing() { return state.editing; },
    get device() { return state.device; },
    get dirty() { return state.dirty; },
    get version() { return state.version; },
    canUndo: () => undoStack.length > 0,
    canRedo: () => redoStack.length > 0,

    on(name, fn) {
      if (!listeners.has(name)) listeners.set(name, []);
      listeners.get(name).push(fn);
    },

    // fn changes the design in place. Returns whether anything changed.
    change(fn, { key = null, render = true, source = null } = {}) {
      const before = snapshot;
      fn(state.design);
      const after = JSON.stringify(state.design);
      if (after === before) return false;
      if (!(key && key === mergeKey)) {
        undoStack.push(before);
        if (undoStack.length > MAX_HISTORY) undoStack.shift();
      }
      redoStack.length = 0;
      mergeKey = key;
      clearTimeout(mergeTimer);
      mergeTimer = setTimeout(() => { mergeKey = null; }, MERGE_MS);
      snapshot = after;
      state.dirty = true;
      state.version += 1;
      selectionStillThere();
      emit('change', { render, source });
      return true;
    },

    // A whole new design: a template chosen, or a reload. Not undoable.
    replace(next) {
      state.design = next;
      snapshot = JSON.stringify(next);
      undoStack.length = 0;
      redoStack.length = 0;
      state.selection = null;
      state.editing = null;
      state.dirty = true;
      state.version += 1;
      emit('change', { render: true, source: 'replace' });
      emit('select', {});
    },

    undo() {
      if (!undoStack.length) return;
      redoStack.push(snapshot);
      snapshot = undoStack.pop();
      state.design = JSON.parse(snapshot);
      mergeKey = null;
      state.dirty = true;
      state.version += 1;
      state.editing = null;
      selectionStillThere();
      emit('change', { render: true, source: 'history' });
      emit('select', {});
    },

    redo() {
      if (!redoStack.length) return;
      undoStack.push(snapshot);
      snapshot = redoStack.pop();
      state.design = JSON.parse(snapshot);
      mergeKey = null;
      state.dirty = true;
      state.version += 1;
      state.editing = null;
      selectionStillThere();
      emit('change', { render: true, source: 'history' });
      emit('select', {});
    },

    // Ends the merging of quick changes, so the next one is its own step.
    breakMerge() {
      mergeKey = null;
    },

    select(selection) {
      const same = JSON.stringify(selection) === JSON.stringify(state.selection);
      state.selection = selection;
      if (!same) emit('select', {});
    },

    setEditing(editing) {
      state.editing = editing;
      emit('editing', {});
    },

    setDevice(device) {
      state.device = device;
      emit('device', {});
    },

    saved(version) {
      if (version === state.version) state.dirty = false;
    },
  };
}
