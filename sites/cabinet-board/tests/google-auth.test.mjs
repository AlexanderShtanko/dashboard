import test from 'node:test';
import assert from 'node:assert/strict';
import {createExtensionAuth, authUrl} from '../dist/core/google-auth.js';
import {driveRemote, DRIVE_STATUS_KEY, DRIVE_STATE_KEY} from '../dist/core/drive.js';
import {createSync} from '../dist/core/sync.js';
import {registry} from '../dist/widgets/index.js';

const TOKEN_KEY = 'cabinet-board:google-token:v1';
const HINT_KEY = 'cabinet-board:google-hint:v1';

// chrome.storage.local survives an extension update; chrome.storage.session does not.
function fakeChrome(answer) {
  const data = new Map();
  const local = {
    data,
    async get(keys) { return Object.fromEntries([].concat(keys).filter(k => data.has(k)).map(k => [k, structuredClone(data.get(k))])); },
    async set(items) { for (const [k, v] of Object.entries(items)) data.set(k, structuredClone(v)); },
    async remove(keys) { for (const k of [].concat(keys)) data.delete(k); }
  };
  const flows = [];
  return {flows, local, chrome: {
    storage: {local, session: {async remove() {}}},
    identity: {
      getRedirectURL: () => 'https://ext.chromiumapp.org/',
      async launchWebAuthFlow(options) { flows.push(options); return answer(options); }
    }
  }};
}
const emailFetch = async () => Response.json({user: {emailAddress: 'me@example.com'}});
const ok = token => () => `https://ext.chromiumapp.org/#access_token=${token}&expires_in=3600`;

test('the token survives an extension update', async () => {
  const fake = fakeChrome(ok('t1'));
  const before = createExtensionAuth({chrome: fake.chrome, fetch: emailFetch});
  assert.equal(await before.signIn(), 't1');
  // A new service worker after the update: same chrome.storage.local, fresh module state.
  const after = createExtensionAuth({chrome: fake.chrome, fetch: emailFetch});
  assert.equal(await after.getToken(), 't1');
  assert.equal(fake.flows.length, 1, 'no new sign-in window');
});

test('silent re-sign-in asks Google for the same account', async () => {
  let now = 0;
  const fake = fakeChrome(ok('t2'));
  const auth = createExtensionAuth({chrome: fake.chrome, fetch: emailFetch, now: () => now});
  await auth.signIn();
  assert.equal(fake.local.data.get(HINT_KEY), 'me@example.com');
  now += 2 * 3600_000; // The token has expired.
  assert.equal(await auth.getToken(), 't2');
  const url = new URL(fake.flows[1].url);
  assert.equal(url.searchParams.get('prompt'), 'none');
  assert.equal(url.searchParams.get('login_hint'), 'me@example.com');
  assert.equal(fake.flows[1].interactive, false);
  assert.ok(fake.flows[1].timeoutMsForNonInteractive >= 30_000);
});

test('a passing failure is retried instead of asking to sign in', async () => {
  let fail = true;
  const fake = fakeChrome(() => { if (fail) throw new Error('timeout'); return ok('t3')(); });
  const auth = createExtensionAuth({chrome: fake.chrome, fetch: emailFetch});
  await assert.rejects(auth.getToken(), {code: 'auth-wait'});
  fail = false;
  assert.equal(await auth.getToken(), 't3');
});

test('after repeated failures the board does ask to sign in', async () => {
  const fake = fakeChrome(() => { throw new Error('timeout'); });
  const auth = createExtensionAuth({chrome: fake.chrome, fetch: emailFetch});
  for (let i = 0; i < 4; i++) await assert.rejects(auth.getToken(), {code: 'auth-wait'});
  assert.equal(await auth.getToken(), null);
});

test('when Google says sign-in is needed, it is not asked again for a while', async () => {
  let now = 0;
  const fake = fakeChrome(() => 'https://ext.chromiumapp.org/#error=interaction_required');
  const auth = createExtensionAuth({chrome: fake.chrome, fetch: emailFetch, now: () => now});
  assert.equal(await auth.getToken(), null);
  assert.equal(await auth.getToken(), null);
  assert.equal(fake.flows.length, 1);
  now += 11 * 60_000;
  await auth.getToken();
  assert.equal(fake.flows.length, 2);
});

test('parallel requests share one silent sign-in', async () => {
  const fake = fakeChrome(ok('t4'));
  const auth = createExtensionAuth({chrome: fake.chrome, fetch: emailFetch});
  const tokens = await Promise.all([auth.getToken(), auth.getToken({refresh: true})]);
  assert.deepEqual(tokens, ['t4', 't4']);
  assert.equal(fake.flows.length, 1);
});

test('sign out forgets the token and the account', async () => {
  const fake = fakeChrome(ok('t5'));
  const auth = createExtensionAuth({chrome: fake.chrome, fetch: emailFetch});
  await auth.signIn();
  await auth.signOut();
  assert.equal(fake.local.data.has(TOKEN_KEY), false);
  assert.equal(fake.local.data.has(HINT_KEY), false);
});

test('authUrl adds login_hint only when known', () => {
  assert.equal(new URL(authUrl({redirectUri: 'https://x/', clientId: 'c'})).searchParams.has('login_hint'), false);
  assert.equal(new URL(authUrl({redirectUri: 'https://x/', clientId: 'c', loginHint: 'a@b.c'})).searchParams.get('login_hint'), 'a@b.c');
});

test('sync shows "restoring" and retries while re-sign-in is pending', async () => {
  const data = new Map();
  const local = {async get(keys) { return Object.fromEntries([].concat(keys).filter(k => data.has(k)).map(k => [k, data.get(k)])); },
    async set(items) { for (const [k, v] of Object.entries(items)) data.set(k, v); }};
  const remote = driveRemote({fetch: async () => new Response('', {status: 500}),
    getToken: async () => { throw Object.assign(new Error('Восстанавливаю вход в Google…'), {code: 'auth-wait'}); }});
  const engine = createSync({local, remote, registry, stateKey: DRIVE_STATE_KEY, statusKey: DRIVE_STATUS_KEY});
  const result = await engine.run();
  assert.equal(result.retry, 30_000);
  assert.equal(JSON.parse(data.get(DRIVE_STATUS_KEY)).state, 'pending');
});
