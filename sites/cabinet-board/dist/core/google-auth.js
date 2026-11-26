/**
 * Google sign-in without a server and without third-party scripts (OAuth 2.0 token flow).
 * Extension: chrome.identity.launchWebAuthFlow, redirect https://<extension-id>.chromiumapp.org/.
 * Web / PWA: a full-page redirect back to the board's own address.
 * Only the drive.appdata scope is requested.
 */
import {GOOGLE_CLIENT_ID} from '../config.js';

export const SCOPE = 'https://www.googleapis.com/auth/drive.appdata';
const TOKEN_KEY = 'cabinet-board:google-token:v1';
const PENDING_KEY = 'cabinet-board:google-pending:v1';
const SILENT_KEY = 'cabinet-board:google-silent:v1';
const SILENT_EVERY = 10 * 60_000;
const MARGIN = 60_000;

export const isExtension = () => typeof globalThis.chrome?.identity?.launchWebAuthFlow === 'function';

export function authUrl({redirectUri, prompt, state, clientId = GOOGLE_CLIENT_ID}) {
  const params = new URLSearchParams({client_id: clientId, response_type: 'token', redirect_uri: redirectUri, scope: SCOPE});
  if (prompt) params.set('prompt', prompt);
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

export const extensionAuth = {
  async getToken({refresh = false, interactive = false} = {}) {
    const {[TOKEN_KEY]: saved} = await chrome.storage.session.get(TOKEN_KEY);
    if (!refresh && !interactive && saved?.token && saved.exp > Date.now() + MARGIN) return saved.token;
    try {
      const url = await chrome.identity.launchWebAuthFlow({
        url: authUrl({redirectUri: chrome.identity.getRedirectURL(), prompt: interactive ? 'select_account' : 'none'}),
        interactive, abortOnLoadForNonInteractive: false, timeoutMsForNonInteractive: 10_000
      });
      const result = parseAuthResponse(url);
      if (!result.token) return null;
      await chrome.storage.session.set({[TOKEN_KEY]: {token: result.token, exp: Date.now() + result.expiresIn * 1000}});
      return result.token;
    } catch { return null; }
  },
  signIn() { return this.getToken({interactive: true}); },
  async signOut() {
    const {[TOKEN_KEY]: saved} = await chrome.storage.session.get(TOKEN_KEY);
    await chrome.storage.session.remove(TOKEN_KEY);
    revoke(saved?.token);
  }
};

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
    location.assign(authUrl({redirectUri: redirectUri(), prompt: silent ? 'none' : 'select_account', state}));
    return new Promise(() => {}); // The page is navigating away.
  },
  canTrySilent() { return Date.now() - Number(localStorage.getItem(SILENT_KEY) || 0) > SILENT_EVERY; },
  signOut() {
    const saved = read(localStorage, TOKEN_KEY);
    localStorage.removeItem(TOKEN_KEY);
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
    return {signedIn: true, silent: pending.silent};
  }
};
