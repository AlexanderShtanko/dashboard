import test from 'node:test';
import assert from 'node:assert/strict';
import {driveRemote, DRIVE_STATE_KEY, DRIVE_STATUS_KEY} from '../dist/core/drive.js';
import {createSync} from '../dist/core/sync.js';
import {authUrl, parseAuthResponse} from '../dist/core/google-auth.js';
import {BoardStore, KEY} from '../dist/core/store.js';
import {PIN_KEY} from '../dist/core/pin.js';
import {registry} from '../dist/widgets/index.js';
import {seed} from '../dist/seed.js';

// A tiny fake of the Drive v3 endpoints the app uses, with one valid token.
function fakeDrive() {
  const files = new Map();
  let next = 0, token = 'good';
  const calls = [];
  async function fetch(url, init = {}) {
    calls.push(`${init.method || 'GET'} ${url}`);
    if (init.headers?.Authorization !== 'Bearer ' + token) return new Response('', {status: 401});
    const u = new URL(url);
    if (u.pathname === '/drive/v3/files') {
      assert.equal(u.searchParams.get('spaces'), 'appDataFolder');
      return Response.json({files: [...files].map(([id]) => ({id}))});
    }
    let match = u.pathname.match(/^\/drive\/v3\/files\/(.+)$/);
    if (match) return files.has(match[1]) ? new Response(files.get(match[1])) : new Response('', {status: 404});
    if (u.pathname === '/upload/drive/v3/files' && init.method === 'POST') {
      const boundary = init.headers['Content-Type'].split('boundary=')[1];
      const [, metaPart, bodyPart] = init.body.split('--' + boundary);
      assert.deepEqual(JSON.parse(metaPart.split('\r\n\r\n')[1]).parents, ['appDataFolder']);
      const id = 'f' + (++next);
      files.set(id, bodyPart.split('\r\n\r\n')[1].replace(/\r\n$/, ''));
      return Response.json({id});
    }
    match = u.pathname.match(/^\/upload\/drive\/v3\/files\/(.+)$/);
    if (match && init.method === 'PATCH') {
      if (!files.has(match[1])) return new Response('', {status: 404});
      files.set(match[1], init.body);
      return Response.json({id: match[1]});
    }
    return new Response('', {status: 400});
  }
  return {files, calls, fetch, expire() { token = 'renewed'; }};
}
function area() {
  const data = new Map();
  return {data, async get(keys) { return Object.fromEntries([].concat(keys).filter(k => data.has(k)).map(k => [k, structuredClone(data.get(k))])); },
    async set(items) { for (const [k, v] of Object.entries(items)) data.set(k, structuredClone(v)); }};
}
function device(drive, tokens = {current: 'good'}) {
  const local = area();
  const remote = driveRemote({fetch: drive.fetch, getToken: async ({refresh}) => refresh ? tokens.refreshed ?? null : tokens.current});
  return {local, tokens, engine: createSync({local, remote, registry, stateKey: DRIVE_STATE_KEY, statusKey: DRIVE_STATUS_KEY})};
}
const board = edit => { const s = new BoardStore(registry, seed, {getItem: () => null, setItem() {}}); edit?.(s); return JSON.stringify(s.state); };
const load = async pc => JSON.parse((await pc.local.get([KEY]))[KEY]);
const status = async pc => JSON.parse((await pc.local.get([DRIVE_STATUS_KEY]))[DRIVE_STATUS_KEY]);

test('computer to phone through one file in appDataFolder', async () => {
  const drive = fakeDrive(), pc = device(drive), phone = device(drive);
  await pc.local.set({[KEY]: board(s => s.update('note-main', {data: {body: 'From the computer'}})), [PIN_KEY]: 'pin-record'});
  await pc.engine.run();
  assert.equal(drive.files.size, 1);
  await phone.engine.run();
  assert.equal((await load(phone)).nodes.find(n => n.id === 'note-main').data.body, 'From the computer');
  assert.equal((await phone.local.get([PIN_KEY]))[PIN_KEY], 'pin-record');
  // The phone edits; the computer receives it and the file is updated in place.
  const state = await load(phone); state.nodes.find(n => n.id === 'note-main').title = 'Phone title';
  await phone.local.set({[KEY]: JSON.stringify(state)});
  await phone.engine.run(); await pc.engine.run();
  assert.equal((await load(pc)).nodes.find(n => n.id === 'note-main').title, 'Phone title');
  assert.equal(drive.files.size, 1);
  assert.equal((await status(pc)).state, 'synced');
});

test('an expired token is refreshed once; without one the status asks to sign in', async () => {
  const drive = fakeDrive(), pc = device(drive, {current: 'good', refreshed: 'renewed'});
  await pc.local.set({[KEY]: board()});
  drive.expire();
  await pc.engine.run();
  assert.equal((await status(pc)).state, 'synced');
  const phone = device(drive, {current: null});
  await phone.engine.run();
  assert.equal((await status(phone)).state, 'signed-out');
  assert.equal((await phone.local.get([KEY]))[KEY], undefined);
});

test('a large board fits on Drive (no chrome.storage.sync limit)', async () => {
  const drive = fakeDrive(), pc = device(drive), phone = device(drive);
  let noise = ''; while (noise.length < 90000) noise += Math.random().toString(36).slice(2);
  await pc.local.set({[KEY]: board(s => s.update('note-main', {data: {body: noise.slice(0, 90000)}}))});
  await pc.engine.run(); await phone.engine.run();
  assert.equal((await status(pc)).state, 'synced');
  assert.equal((await load(phone)).nodes.find(n => n.id === 'note-main').data.body.length, 90000);
});

test('a file deleted on Drive is recreated', async () => {
  const drive = fakeDrive(), pc = device(drive);
  await pc.local.set({[KEY]: board()}); await pc.engine.run();
  drive.files.clear();
  await pc.local.set({[KEY]: board(s => s.update('note-main', {title: 'Again'}))});
  await pc.engine.run();
  assert.equal(drive.files.size, 1);
});

test('sign-in URL asks only for the appDataFolder scope and parses the reply', () => {
  const url = new URL(authUrl({redirectUri: 'https://example.test/', clientId: 'id', prompt: 'none', state: 's'}));
  assert.equal(url.searchParams.get('scope'), 'https://www.googleapis.com/auth/drive.appdata');
  assert.equal(url.searchParams.get('response_type'), 'token');
  assert.deepEqual(parseAuthResponse('https://example.test/#access_token=t&expires_in=3599&state=s'), {token: 't', expiresIn: 3599, error: null, state: 's'});
});
