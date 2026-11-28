/**
 * Google sign-in without a server and without third-party scripts (OAuth 2.0 token flow).
 * Extension: chrome.identity.launchWebAuthFlow, redirect https://<extension-id>.chromiumapp.org/.
 * Web / PWA: a full-page redirect back to the board's own address.
 * Only the drive.appdata scope is requested.
 */
import {GOOGLE_CLIENT_ID} from '../config.js';

export const SCOPE = 'https://www.googleapis.com/auth/drive.appdata';
const TOKEN_KEY = 'cabinet-board:google-token:v1';
const HINT_KEY = 'cabinet-board:google-hint:v1';
const AUTH_STATE_KEY = 'cabinet-board:google-auth-state:v1';
const PENDING_KEY = 'cabinet-board:google-pending:v1';
const SILENT_KEY = 'cabinet-board:google-silent:v1';
const SILENT_EVERY = 10 * 60_000;
const MARGIN = 60_000;
// Silent re-sign-in in the extension: how long one try may take, how many failed tries
// (timeouts, no network) are retried before the board asks to sign in, and how long to wait
// after Google itself answered that the user has to sign in again.
const SILENT_TIMEOUT = 30_000;
const MAX_TRANSIENT = 5;
const DENIED_PAUSE = 10 * 60_000;

export const isExtension = () => typeof globalThis.chrome?.identity?.launchWebAuthFlow === 'function';
/** Thrown while a silent re-sign-in failed for a passing reason and will be retried. */
export const authWait = () => Object.assign(new Error('Восстанавливаю вход в Google…'), {code: 'auth-wait'});

export function authUrl({redirectUri, prompt, state, loginHint, clientId = GOOGLE_CLIENT_ID}) {
  const params = new URLSearchParams({client_id: clientId, response_type: 'token', redirect_uri: redirectUri, scope: SCOPE});
  if (prompt) params.set('prompt', prompt);
  if (loginHint) params.set('login_hint', loginHint);
  if (state) params.set('state', state);
  return 'https://accounts.google.com/o/oauth2/v2/auth?' + params;
}
export function parseAuthResponse(url) {
  const params = new URLSearchParams(new URL(url).hash.slice(1));
  return {token: params.get('access_token'), expiresIn: Number(params.get('expires_in')) || 3600, error: params.get('error'), state: params.get('state')};
}
function revoke(token) {
  if (token) fetch('https://oauth2.googleapis.com/revoke?token=' + encodeURIComponent(token), {method: 'POST'}).catch(() => {});
}
/** The signed-in account's address, used as login_hint so the silent sign-in picks the same account. */
export async function fetchEmail(token, fetchImpl = (...args) => globalThis.fetch(...args)) {
  try {
    const response = await fetchImpl('https://www.googleapis.com/drive/v3/about?fields=user(emailAddress)', {headers: {Authorization: 'Bearer ' + token}});
    return response.ok ? (await response.json())?.user?.emailAddress || null : null;
  } catch { return null; }
}

/**
 * Extension sign-in. The token, the account hint and the retry state live in chrome.storage.local,
 * so an extension update or a browser restart does not lose the sign-in.
 */
export function createExtensionAuth({chrome, fetch: fetchImpl, now = Date.now} = {}) {
  const api = () => chrome || globalThis.chrome;
  const local = () => api().storage.local;
  let silent = null;

  function flow({interactive, hint}) {
    return api().identity.launchWebAuthFlow({
      url: authUrl({redirectUri: api().identity.getRedirectURL(), prompt: interactive ? 'select_account' : 'none', loginHint: hint || undefined}),
      interactive, abortOnLoadForNonInteractive: false, timeoutMsForNonInteractive: SILENT_TIMEOUT
    }).then(parseAuthResponse);
  }

  async function renew({interactive}) {
    const {[HINT_KEY]: hint, [AUTH_STATE_KEY]: state = {}} = await local().get([HINT_KEY, AUTH_STATE_KEY]);
    if (!interactive && typeof state.deniedAt === 'number' && now() - state.deniedAt < DENIED_PAUSE) return null;
    let result;
    try { result = await flow({interactive, hint}); }
    catch {
      if (interactive) return null; // The user closed the sign-in window.
      const transient = (state.transient || 0) + 1;
      await local().set({[AUTH_STATE_KEY]: {transient}});
      if (transient < MAX_TRANSIENT) throw authWait();
      return null;
    }
    if (!result.token) {
      if (!interactive) await local().set({[AUTH_STATE_KEY]: {deniedAt: now()}});
      return null;
    }
    const email = interactive || !hint ? await fetchEmail(result.token, fetchImpl) : hint;
    await local().set({[TOKEN_KEY]: {token: result.token, exp: now() + result.expiresIn * 1000}, [AUTH_STATE_KEY]: {},
      ...(email ? {[HINT_KEY]: email} : {})});
    return result.token;
  }

  return {
    /** Resolves to a token, or null when the user has to sign in. Throws authWait() while a retry is due. */
    async getToken({refresh = false, interactive = false} = {}) {
      if (!refresh && !interactive) {
        const {[TOKEN_KEY]: saved} = await local().get(TOKEN_KEY);
        if (saved?.token && saved.exp > now() + MARGIN) return saved.token;
      }
      if (interactive) return renew({interactive});
      silent ??= renew({interactive: false}).finally(() => { silent = null; });
      return silent;
    },
    signIn() { return this.getToken({interactive: true}); },
    async signOut() {
      const {[TOKEN_KEY]: saved} = await local().get(TOKEN_KEY);
      await local().remove([TOKEN_KEY, HINT_KEY, AUTH_STATE_KEY]);
      await api().storage.session?.remove(TOKEN_KEY)?.catch?.(() => {}); // Left by versions before 0.12.3.
      revoke(saved?.token);
    }
  };
}
export const extensionAuth = createExtensionAuth();

const read = (store, key) => { try { return JSON.parse(store.getItem(key) || 'null'); } catch { return null; } };
const redirectUri = () => location.origin + location.pathname.replace(/index\.html$/, '');

export const webAuth = {
  getToken() {
    const saved = read(localStorage, TOKEN_KEY);
    return saved?.token && saved.exp > Date.now() + MARGIN ? saved.token : null;
  },
  hasToken() { return this.getToken() !== null; },
  /** Leaves the page for Google and comes back. silent: no screen if the user is still signed in. */
  signIn({silent = false} = {}) {
    const state = crypto.randomUUID();
    sessionStorage.setItem(PENDING_KEY, JSON.stringify({state, hash: location.hash, silent}));
    if (silent) localStorage.setItem(SILENT_KEY, String(Date.now()));
    location.assign(authUrl({redirectUri: redirectUri(), prompt: silent ? 'none' : 'select_account', state, loginHint: localStorage.getItem(HINT_KEY) || undefined}));
    return new Promise(() => {}); // The page is navigating away.
  },
  canTrySilent() { return Date.now() - Number(localStorage.getItem(SILENT_KEY) || 0) > SILENT_EVERY; },
  signOut() {
    const saved = read(localStorage, TOKEN_KEY);
    localStorage.removeItem(TOKEN_KEY);
    localStorage.removeItem(HINT_KEY);
    revoke(saved?.token);
  },
  /** Call before the app reads location.hash. Returns null when this load is not a return from Google. */
  completeRedirect() {
    if (!/(^|[#&])(access_token|error)=/.test(location.hash)) return null;
    const result = parseAuthResponse(location.href);
    const pending = read(sessionStorage, PENDING_KEY);
    sessionStorage.removeItem(PENDING_KEY);
    history.replaceState(null, '', location.pathname + location.search + (pending?.hash || '#/board'));
    if (!pending || pending.state !== result.state) return {error: 'state_mismatch', silent: false};
    if (!result.token) return {error: result.error || 'unknown', silent: pending.silent};
    localStorage.setItem(TOKEN_KEY, JSON.stringify({token: result.token, exp: Date.now() + result.expiresIn * 1000}));
    if (!pending.silent || !localStorage.getItem(HINT_KEY))
      fetchEmail(result.token).then(email => { if (email) localStorage.setItem(HINT_KEY, email); });
    return {signedIn: true, silent: pending.silent};
  }
};
