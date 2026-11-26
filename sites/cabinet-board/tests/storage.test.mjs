import test from 'node:test';
import assert from 'node:assert/strict';
import {openStorage} from '../dist/core/storage.js';
import {BoardStore, KEY} from '../dist/core/store.js';
import {PIN_KEY} from '../dist/core/pin.js';
import {registry} from '../dist/widgets/index.js';
import {seed} from '../dist/seed.js';

const keys = [KEY, PIN_KEY];
const tick = () => new Promise(resolve => setTimeout(resolve, 0));

function legacyStorage(initial = {}) {
  const data = new Map(Object.entries(initial));
  return {getItem: key => data.has(key) ? data.get(key) : null, setItem: (key, value) => data.set(key, value), removeItem: key => data.delete(key), data};
}

// A shared chrome.storage.local backend; each call to tab() is a separate new-tab page.
function chromeBackend(initial = {}) {
  const data = new Map(Object.entries(initial));
  const tabs = [];
  let failNext = null;
  const backend = {
    data,
    fail(message) { failNext = message; },
    tab(localStorage = legacyStorage()) {
      const listeners = [];
      const scope = {
        localStorage,
        chrome: {storage: {
          local: {
            async get(wanted) { return Object.fromEntries(wanted.filter(key => data.has(key)).map(key => [key, data.get(key)])); },
            async set(items) {
              if (failNext) { const message = failNext; failNext = null; throw new Error(message); }
              const changes = {};
              for (const [key, value] of Object.entries(items)) { changes[key] = {oldValue: data.get(key), newValue: value}; data.set(key, value); }
              setTimeout(() => tabs.forEach(tab => tab.forEach(listener => listener(changes, 'local'))), 0);
            },
            async remove(key) { data.delete(key); }
          },
          onChanged: {addListener: listener => listeners.push(listener)}
        }}
      };
      tabs.push(listeners);
      return scope;
    }
  };
  return backend;
}

test('outside the extension the adapter falls back to localStorage', async () => {
  const local = legacyStorage();
  const storage = await openStorage(keys, {localStorage: local});
  assert.equal(storage.kind, 'local');
  storage.setItem(KEY, 'value');
  assert.equal(local.data.get(KEY), 'value');
});

test('first extension run copies the board and PIN from localStorage and keeps the old copy', async () => {
  const board = new BoardStore(registry, seed, legacyStorage());
  board.update('note-main', {data: {body: 'Old note'}});
  const local = legacyStorage({[KEY]: board.export(), [PIN_KEY]: '{"pin":1}'});
  const backend = chromeBackend();
  const storage = await openStorage(keys, backend.tab(local));
  assert.equal(storage.kind, 'chrome');
  assert.deepEqual(storage.migrated.sort(), [...keys].sort());
  assert.equal(backend.data.get(PIN_KEY), '{"pin":1}');
  assert.equal(local.data.get(KEY), board.export());
  const loaded = new BoardStore(registry, seed, storage);
  assert.equal(loaded.get('note-main').data.body, 'Old note');
});

test('existing chrome.storage data wins over localStorage and is not migrated again', async () => {
  const backend = chromeBackend({[KEY]: 'from-chrome'});
  const storage = await openStorage(keys, backend.tab(legacyStorage({[KEY]: 'from-local'})));
  assert.equal(storage.getItem(KEY), 'from-chrome');
  assert.deepEqual(storage.migrated, []);
});

test('board changes are saved to chrome.storage and survive reopening', async () => {
  const backend = chromeBackend();
  const store = new BoardStore(registry, seed, await openStorage(keys, backend.tab()));
  store.update('note-main', {data: {body: 'Saved in chrome'}});
  await tick();
  assert.equal(store.error, '');
  const reopened = new BoardStore(registry, seed, await openStorage(keys, backend.tab()));
  assert.equal(reopened.get('note-main').data.body, 'Saved in chrome');
});

test('own writes are not reported as changes; another tab\'s writes are, and block stale saves', async () => {
  const backend = chromeBackend();
  const first = await openStorage(keys, backend.tab());
  const second = await openStorage(keys, backend.tab());
  const seenByFirst = [], seenBySecond = [];
  first.onExternalChange(change => seenByFirst.push(change));
  second.onExternalChange(change => seenBySecond.push(change));
  const firstStore = new BoardStore(registry, seed, first);
  const secondStore = new BoardStore(registry, seed, second);
  firstStore.update('note-main', {title: 'One'});
  firstStore.update('note-main', {title: 'Two'});
  await tick(); await tick();
  assert.equal(seenByFirst.length, 0);
  assert.equal(seenBySecond.at(-1).key, KEY);
  secondStore.update('note-main', {title: 'Stale'});
  assert.match(secondStore.error, /другой вкладке/);
});

test('a failed background write is reported', async () => {
  const backend = chromeBackend();
  const storage = await openStorage(keys, backend.tab());
  const errors = [];
  storage.onWriteError = message => errors.push(message);
  backend.fail('QUOTA_BYTES quota exceeded');
  storage.setItem(KEY, 'x');
  await tick();
  assert.deepEqual(errors, ['QUOTA_BYTES quota exceeded']);
});
