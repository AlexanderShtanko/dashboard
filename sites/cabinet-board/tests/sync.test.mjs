import test from 'node:test';
import assert from 'node:assert/strict';
import {createSync, mergeBoards, pack, unpack, SYNC_STATUS_KEY, CHUNK_SIZE, MAX_CHUNKS} from '../dist/core/sync.js';
import {BoardStore, KEY} from '../dist/core/store.js';
import {PIN_KEY} from '../dist/core/pin.js';
import {registry} from '../dist/widgets/index.js';
import {seed} from '../dist/seed.js';

function area(limitPerItem = 8192, total = 102400) {
  const data = new Map();
  return {
    data,
    async get(keys) {
      const wanted = keys === null ? [...data.keys()] : keys;
      return Object.fromEntries(wanted.filter(key => data.has(key)).map(key => [key, structuredClone(data.get(key))]));
    },
    async set(items) {
      for (const [key, value] of Object.entries(items)) if (key.length + JSON.stringify(value).length > limitPerItem) throw new Error('QUOTA_BYTES_PER_ITEM quota exceeded');
      const next = new Map(data); for (const [key, value] of Object.entries(items)) next.set(key, structuredClone(value));
      const size = [...next].reduce((sum, [key, value]) => sum + key.length + JSON.stringify(value).length, 0);
      if (size > total) throw new Error('QUOTA_BYTES quota exceeded');
      for (const [key, value] of Object.entries(items)) data.set(key, structuredClone(value));
    },
    async remove(keys) { for (const key of [].concat(keys)) data.delete(key); }
  };
}
let revs = 0;
const computer = cloud => {
  const local = area(Infinity, Infinity);
  return {local, engine: createSync({local, sync: cloud, registry, newRev: () => 'r' + (++revs)})};
};
function board(edit) {
  const store = new BoardStore(registry, seed, {getItem: () => null, setItem() {}});
  edit?.(store);
  return store;
}
const save = async (pc, store) => pc.local.set({[KEY]: JSON.stringify(store.state)});
const load = async pc => JSON.parse((await pc.local.get([KEY]))[KEY]);
const status = async pc => JSON.parse((await pc.local.get([SYNC_STATUS_KEY]))[SYNC_STATUS_KEY]);
const note = (state, id = 'note-main') => state.nodes.find(node => node.id === id);

test('compressed board round-trips', async () => {
  const raw = JSON.stringify(seed);
  assert.equal(await unpack(await pack(raw)), raw);
});

test('a board saved on one computer appears on a new computer', async () => {
  const cloud = area(), a = computer(cloud), b = computer(cloud);
  await save(a, board(s => s.update('note-main', {data: {body: 'From A'}})));
  await a.engine.run();
  assert.equal((await status(a)).state, 'synced');
  for (const [key, value] of cloud.data) assert.ok(key.length + JSON.stringify(value).length <= 8192);
  await b.engine.run();
  assert.equal(note(await load(b)).data.body, 'From A');
});

test('edits to different widgets on two computers are merged', async () => {
  const cloud = area(), a = computer(cloud), b = computer(cloud);
  await save(a, board()); await a.engine.run(); await b.engine.run();
  const stateA = await load(a), stateB = await load(b);
  note(stateA).data.body = 'Edited on A';
  stateB.nodes.find(node => node.type === 'tasks').title = 'Renamed on B';
  await a.local.set({[KEY]: JSON.stringify(stateA)});
  await b.local.set({[KEY]: JSON.stringify(stateB)});
  await a.engine.run();
  await b.engine.run(); // B merges A's change into its own and pushes the result
  await a.engine.run(); // A takes the merged board
  for (const pc of [a, b]) {
    const state = await load(pc);
    assert.equal(note(state).data.body, 'Edited on A');
    assert.equal(state.nodes.find(node => node.type === 'tasks').title, 'Renamed on B');
  }
  assert.deepEqual(await load(a), await load(b));
});

test('the same note edited on both computers keeps both texts', async () => {
  const cloud = area(), a = computer(cloud), b = computer(cloud);
  await save(a, board()); await a.engine.run(); await b.engine.run();
  const stateA = await load(a), stateB = await load(b);
  note(stateA).data.body = 'Text A'; note(stateB).data.body = 'Text B';
  await a.local.set({[KEY]: JSON.stringify(stateA)}); await b.local.set({[KEY]: JSON.stringify(stateB)});
  await a.engine.run(); await b.engine.run(); await a.engine.run();
  const final = await load(a);
  const bodies = final.nodes.filter(node => node.type === 'note').map(node => node.data.body);
  assert.ok(bodies.includes('Text A') && bodies.includes('Text B'));
  assert.ok(final.nodes.some(node => node.title.endsWith('с другого устройства')));
  assert.deepEqual(final, await load(b));
});

test('deleting a widget on one computer removes it on the other', async () => {
  const cloud = area(), a = computer(cloud), b = computer(cloud);
  await save(a, board()); await a.engine.run(); await b.engine.run();
  const stateA = await load(a);
  stateA.nodes = stateA.nodes.filter(node => node.id !== 'note-main');
  await a.local.set({[KEY]: JSON.stringify(stateA)});
  await a.engine.run(); await b.engine.run();
  assert.equal(note(await load(b)), undefined);
});

test('the PIN record syncs, the latest change wins', async () => {
  const cloud = area(), a = computer(cloud), b = computer(cloud);
  await a.local.set({[PIN_KEY]: 'pin-a'}); await a.engine.run(); await b.engine.run();
  assert.equal((await b.local.get([PIN_KEY]))[PIN_KEY], 'pin-a');
  await b.local.set({[PIN_KEY]: 'pin-b'}); await b.engine.run(); await a.engine.run();
  assert.equal((await a.local.get([PIN_KEY]))[PIN_KEY], 'pin-b');
});

test('a board too large for sync stays local and reports it', async () => {
  const cloud = area(), a = computer(cloud);
  let noise = ''; for (let i = 0; noise.length < 90000; i++) noise += Math.random().toString(36).slice(2);
  await save(a, board(s => s.update('note-main', {data: {body: noise.slice(0, 90000)}})));
  await a.engine.run();
  const result = await status(a);
  assert.equal(result.state, 'too-big');
  assert.match(result.message, new RegExp(`${Math.ceil(CHUNK_SIZE * MAX_CHUNKS / 1024)} КБ`));
  assert.equal(cloud.data.size, 0);
});

test('a half-arrived remote board is not applied', async () => {
  const cloud = area(), a = computer(cloud), b = computer(cloud);
  await save(a, board(s => s.update('note-main', {data: {body: 'Complete'}}))); await a.engine.run();
  for (const key of [...cloud.data.keys()]) if (key.startsWith('chunk:')) cloud.data.delete(key);
  const result = await b.engine.run();
  assert.ok(result.retry > 0);
  assert.equal((await b.local.get([KEY]))[KEY], undefined);
  assert.equal((await status(b)).state, 'pending');
});

test('merge repairs a folder tree broken by moves on both sides', () => {
  const store = board(); const f1 = store.add('folder'), f2 = store.add('folder');
  const base = structuredClone(store.state);
  const index = id => base.nodes.findIndex(node => node.id === id);
  const local = structuredClone(base); local.nodes[index(f1)].parentId = f2;
  const remote = structuredClone(base); remote.nodes[index(f2)].parentId = f1;
  const merged = mergeBoards(base, local, remote);
  assert.doesNotThrow(() => new BoardStore(registry, merged, {getItem: () => null, setItem() {}}));
});
