/**
 * Google Drive sync, page side.
 * Extension: the background service worker does the syncing; the page only signs in and shows status.
 * Web / PWA: there is no background worker for data, so the engine runs in the page.
 */
import {createSync} from './sync.js';
import {driveRemote, DRIVE_STATE_KEY, DRIVE_STATUS_KEY, DRIVE_SETTINGS_KEY} from './drive.js';
import {extensionAuth, webAuth, isExtension} from './google-auth.js';
import {GOOGLE_CLIENT_ID} from '../config.js';
import {registry} from '../widgets/index.js';

export const CLOUD_KEYS = [DRIVE_STATUS_KEY, DRIVE_SETTINGS_KEY, DRIVE_STATE_KEY];

export function setupCloud({storage, store, onLocalChange}) {
  const extension = isExtension();
  const available = !!GOOGLE_CLIENT_ID && (extension || /^https?:$/.test(location.protocol));
  const readJson = key => { try { return JSON.parse(storage.getItem(key) || 'null'); } catch { return null; } };
  const enabled = () => available && readJson(DRIVE_SETTINGS_KEY)?.enabled === true;
  const setEnabled = value => storage.setItem(DRIVE_SETTINGS_KEY, JSON.stringify({enabled: value}));
  const setStatus = (state, message = '') => { storage.setItem(DRIVE_STATUS_KEY, JSON.stringify({state, message, at: Date.now()})); onLocalChange(DRIVE_STATUS_KEY); };

  let engine = null;
  if (available && !extension) {
    const local = {
      async get(keys) {
        const out = {};
        for (const key of keys) {
          const value = storage.getItem(key);
          if (value !== null) out[key] = key === DRIVE_STATE_KEY ? JSON.parse(value) : value;
        }
        return out;
      },
      async set(items) {
        for (const [key, value] of Object.entries(items)) storage.setItem(key, typeof value === 'string' ? value : JSON.stringify(value));
        for (const key of Object.keys(items)) onLocalChange(key);
      }
    };
    engine = createSync({local, registry, remote: driveRemote({getToken: () => webAuth.getToken()}),
      stateKey: DRIVE_STATE_KEY, statusKey: DRIVE_STATUS_KEY, minGap: 5000,
      lock: pass => globalThis.navigator?.locks ? navigator.locks.request('cabinet-drive-sync', pass) : pass()});
  }

  function kick(delay = 0) {
    if (extension) { chrome.runtime.sendMessage?.('sync-now')?.catch?.(() => {}); return; }
    if (engine && enabled()) engine.schedule(delay);
  }
  if (engine) {
    store.subscribe(() => kick(3000));
    document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') kick(0); });
    setInterval(() => { if (document.visibilityState === 'visible') kick(0); }, 60_000);
  }

  return {
    available, enabled, kick,
    status: () => enabled() ? readJson(DRIVE_STATUS_KEY) : null,
    /** Runs before the app renders. May leave the page to refresh the Google session; then it never resolves. */
    async start() {
      if (!available || extension) { kick(0); return null; }
      const back = webAuth.completeRedirect();
      if (back?.error) {
        if (back.silent) setStatus('signed-out', 'Сессия Google истекла. Нажмите «Войти в Google» в меню.');
        else { setEnabled(false); setStatus('off'); return 'Вход в Google не выполнен.'; }
      }
      if (back?.signedIn && !back.silent) { setStatus('pending', 'Синхронизирую с Google Диском…'); kick(0); return 'Google Диск подключён.'; }
      if (enabled() && !webAuth.hasToken() && !back && webAuth.canTrySilent()) await webAuth.signIn({silent: true});
      kick(0);
      return null;
    },
    async connect() {
      if (!available) throw new Error('Google Диск не настроен в этой сборке.');
      if (extension) {
        if (!await extensionAuth.signIn()) throw new Error('Вход в Google не выполнен.');
        setStatus('pending', 'Синхронизирую с Google Диском…');
        setEnabled(true);
        kick(0);
        return;
      }
      setEnabled(true);
      await webAuth.signIn();
    },
    async disconnect() {
      setEnabled(false);
      setStatus('off');
      if (extension) await extensionAuth.signOut(); else webAuth.signOut();
    }
  };
}
