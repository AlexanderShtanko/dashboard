/**
 * Storage adapter for the board.
 *
 * Inside the Chrome extension data lives in chrome.storage.local; elsewhere
 * (local server, standalone preview) it falls back to localStorage.
 * Either way the app gets the same synchronous getItem/setItem interface:
 * chrome.storage values are loaded into memory once at startup and every
 * write is applied to memory immediately and sent to chrome.storage in the
 * background. Write failures are reported through onWriteError.
 */

const unavailable = {
  getItem() { return null; },
  setItem() { throw new Error('Хранилище браузера недоступно'); },
  removeItem() {}
};

function browserStorage(scope) {
  try { return scope.localStorage ?? unavailable; } catch { return unavailable; }
}

/** Synchronous facade over localStorage, with the same extra hooks as the chrome adapter. */
function localAdapter(scope) {
  const storage = browserStorage(scope);
  return {
    kind: storage === unavailable ? 'none' : 'local',
    getItem: key => storage.getItem(key),
    setItem: (key, value) => storage.setItem(key, value),
    removeItem: key => storage.removeItem(key),
    onWriteError: null,
    onExternalChange(listener) {
      scope.addEventListener?.('storage', event => {
        if (event.storageArea && event.storageArea !== storage) return;
        listener({key: event.key, oldValue: event.oldValue, newValue: event.newValue});
      });
    }
  };
}

/**
 * Opens the storage the app should use.
 * keys: the keys to load (and to migrate from localStorage on the first extension run).
 */
export async function openStorage(keys, scope = globalThis) {
  const area = scope.chrome?.storage?.local;
  if (!area?.get || !area?.set) return localAdapter(scope);

  const cache = new Map();
  const ownWrites = new Map(); // key -> values this tab wrote and has not yet seen echoed back
  const listeners = new Set();
  const stored = await area.get(keys);

  // First run of the extension with chrome.storage: copy the board from localStorage once.
  // The localStorage copy is left untouched as a backup.
  const legacy = browserStorage(scope);
  const migrate = {};
  for (const key of keys) {
    if (typeof stored[key] === 'string') { cache.set(key, stored[key]); continue; }
    let old = null;
    try { old = legacy.getItem(key); } catch { /* No legacy data. */ }
    if (typeof old === 'string') { cache.set(key, old); migrate[key] = old; }
  }
  if (Object.keys(migrate).length) await area.set(migrate);

  const adapter = {
    kind: 'chrome',
    migrated: Object.keys(migrate),
    onWriteError: null,
    getItem: key => cache.has(key) ? cache.get(key) : null,
    setItem(key, value) {
      value = String(value);
      cache.set(key, value);
      if (!ownWrites.has(key)) ownWrites.set(key, []);
      ownWrites.get(key).push(value);
      Promise.resolve().then(() => area.set({[key]: value})).catch(error => {
        adapter.onWriteError?.(error?.message || String(error));
      });
    },
    removeItem(key) {
      cache.delete(key);
      Promise.resolve().then(() => area.remove(key)).catch(error => {
        adapter.onWriteError?.(error?.message || String(error));
      });
    },
    onExternalChange(listener) { listeners.add(listener); }
  };

  scope.chrome.storage.onChanged?.addListener((changes, areaName) => {
    if (areaName !== 'local') return;
    for (const [key, change] of Object.entries(changes)) {
      if (!keys.includes(key)) continue;
      const newValue = typeof change.newValue === 'string' ? change.newValue : null;
      const pending = ownWrites.get(key);
      const index = pending ? pending.indexOf(newValue) : -1;
      if (index >= 0) {
        // Echo of our own write: drop it and everything written before it.
        pending.splice(0, index + 1);
        if (!pending.length) ownWrites.delete(key);
        continue;
      }
      const oldValue = cache.has(key) ? cache.get(key) : null;
      if (newValue === null) cache.delete(key); else cache.set(key, newValue);
      for (const listener of listeners) listener({key, oldValue, newValue});
    }
  });

  return adapter;
}
