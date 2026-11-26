// Extension service worker: keeps chrome.storage.sync and (when connected) Google Drive
// in step with the board saved in chrome.storage.local.
import {createSync} from './core/sync.js';
import {driveRemote, DRIVE_STATE_KEY, DRIVE_STATUS_KEY, DRIVE_SETTINGS_KEY} from './core/drive.js';
import {extensionAuth} from './core/google-auth.js';
import {GOOGLE_CLIENT_ID} from './config.js';
import {KEY} from './core/store.js';
import {PIN_KEY} from './core/pin.js';
import {registry} from './widgets/index.js';

const local = chrome.storage.local;
const chromeSync = createSync({local, sync: chrome.storage.sync, registry});
const drive = createSync({local, registry, remote: driveRemote({getToken: options => extensionAuth.getToken(options)}),
  stateKey: DRIVE_STATE_KEY, statusKey: DRIVE_STATUS_KEY, minGap: 5000});

async function driveEnabled() {
  if (!GOOGLE_CLIENT_ID) return false;
  const {[DRIVE_SETTINGS_KEY]: raw} = await local.get(DRIVE_SETTINGS_KEY);
  try { return JSON.parse(raw)?.enabled === true; } catch { return false; }
}
async function syncAll(delay) {
  chromeSync.schedule(delay);
  if (await driveEnabled()) drive.schedule(delay);
}

chrome.storage.onChanged.addListener((changes, area) => {
  if (area === 'local' && (KEY in changes || PIN_KEY in changes)) syncAll(3000);
  if (area === 'local' && DRIVE_SETTINGS_KEY in changes) driveEnabled().then(on => on && drive.schedule(0));
  if (area === 'sync') chromeSync.schedule(1000);
});
// Google Drive has no push notifications: check it every minute, and whenever a new tab opens.
chrome.alarms.create('drive-poll', {periodInMinutes: 1});
chrome.alarms.onAlarm.addListener(alarm => { if (alarm.name === 'drive-poll') driveEnabled().then(on => on && drive.schedule(0)); });
chrome.runtime.onMessage.addListener(message => { if (message === 'sync-now') syncAll(0); });
chrome.runtime.onStartup.addListener(() => syncAll(0));
chrome.runtime.onInstalled.addListener(() => syncAll(0));
syncAll(0);
