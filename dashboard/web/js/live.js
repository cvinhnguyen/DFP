// Live pages: the dashboard tells the open pages what has changed, as it
// changes, so nobody needs to reload to see new articles, a summary or tags
// arriving, another editor's decision or save, or the Drive folder being
// read (services/live.py, db/init/35-live.sql).
//
// Only the kind of change and the ids travel, never a title or a text: a
// page that hears {k: 'items', ids: [6073]} asks the API again for what it
// shows, under the same login rules as always.
//
// One stream per browser. The tab that holds the lock keeps it and passes
// what it hears to the other tabs, so many open tabs never use up the six
// connections a browser keeps to one address. When that tab closes, another
// takes over. Where a browser lacks the lock or the channel, each tab keeps
// its own stream.
//
//   startLive()            once logged in
//   stopLive()             on logging out
//   onLive(kind, fn)       fn({k, ids}) for each change of that kind; '*' for
//                          every kind. Returns a function that stops it.
//   isLive()               whether changes are arriving; the pages' own
//                          timers keep things fresh while they are not

const NAME = 'dfp-live';
const handlers = new Map();
let started = false;
let live = false;
let channel = null;
let source = null;
let release = null;
let retryTimer = null;

function deliver(change) {
  for (const key of [change.k, '*']) {
    (handlers.get(key) || []).forEach((fn) => {
      try {
        fn(change);
      } catch (e) {
        console.error(e);
      }
    });
  }
}

function setLive(on) {
  live = on;
}

// What the stream says, to this tab and the others.
function pass(message) {
  if (message.status !== undefined) setLive(message.status);
  else message.changes.forEach(deliver);
  channel?.postMessage(message);
}

function connect(retries = 0) {
  source = new EventSource('/api/live');
  source.addEventListener('hello', () => {
    retries = 0;
    pass({ status: true });
  });
  source.onmessage = (event) => {
    let changes;
    try {
      changes = JSON.parse(event.data);
    } catch {
      return;
    }
    if (Array.isArray(changes)) pass({ changes });
  };
  // The login ended: the stream stays shut until someone logs in again.
  source.addEventListener('bye', () => {
    source.close();
    source = null;
    pass({ status: false });
  });
  source.onerror = () => {
    pass({ status: false });
    // A broken connection the browser retries by itself. One the dashboard
    // refused, such as while it restarts, is tried again here, less and
    // less often.
    if (source && source.readyState === EventSource.CLOSED) {
      source = null;
      retryTimer = setTimeout(() => {
        if (started) connect(retries + 1);
      }, Math.min(60000, 3000 * 2 ** retries));
    }
  };
}

// This tab keeps the stream until it closes or stops.
function lead() {
  return new Promise((resolve) => {
    release = resolve;
    if (started) connect();
    else resolve();
  });
}

export function startLive() {
  if (started) return;
  started = true;
  if ('BroadcastChannel' in window) {
    channel = new BroadcastChannel(NAME);
    channel.onmessage = (event) => {
      const message = event.data || {};
      if (message.ask) {
        // A tab just opened: tell it whether changes are arriving.
        if (source) channel.postMessage({ status: live });
        return;
      }
      if (message.status !== undefined) setLive(message.status);
      else if (Array.isArray(message.changes)) message.changes.forEach(deliver);
    };
  }
  if (channel && navigator.locks) {
    navigator.locks.request(NAME, lead);
    channel.postMessage({ ask: true });
  } else {
    connect();
  }
}

export function stopLive() {
  if (!started) return;
  started = false;
  clearTimeout(retryTimer);
  source?.close();
  source = null;
  release?.();
  release = null;
  channel?.close();
  channel = null;
  setLive(false);
}

export function onLive(kind, fn) {
  if (!handlers.has(kind)) handlers.set(kind, new Set());
  handlers.get(kind).add(fn);
  return () => handlers.get(kind)?.delete(fn);
}

export function isLive() {
  return live;
}

// Whether a change concerns any of these ids: a change without ids may
// concern anything.
export function touches(change, ids) {
  if (!change.ids) return true;
  const wanted = new Set([...ids].map(Number));
  return change.ids.some((id) => wanted.has(Number(id)));
}
