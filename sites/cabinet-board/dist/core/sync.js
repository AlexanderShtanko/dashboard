/**
 * Board sync between computers through chrome.storage.sync.
 *
 * chrome.storage.local stays the primary copy; sync is a replica that the
 * extension's background service worker keeps up to date. Only that worker
 * talks to chrome.storage.sync, so several open tabs never race each other.
 *
 * Remote layout (chrome.storage.sync):
 *   meta                 {v, rev, n, len, at}   which revision is current
 *   chunk:<rev>:<i>      gzip+base64 slices of the board JSON for that revision
 *   pin                  {raw, at}               the PIN record (salted PBKDF2 hash)
 * Chunks are written under a new revision id before meta points to them, so a
 * reader never mixes slices of two different boards.
 *
 * Quotas: 100 KB total, 8 KB per item, 120 writes per minute, 1800 per hour.
 * A board is synced only while it fits in MAX_CHUNKS (so two revisions fit at
 * once during a swap); runs are throttled to one per MIN_GAP.
 */
import {KEY, validateWorkspace} from './store.js';
import {PIN_KEY} from './pin.js';

export const SYNC_STATE_KEY = 'cabinet-board:sync-state:v1';   // worker bookkeeping (chrome.storage.local)
export const SYNC_STATUS_KEY = 'cabinet-board:sync-status:v1'; // JSON string shown by the pages
export const CHUNK_SIZE = 7600;
export const MAX_CHUNKS = 6;
export const MIN_GAP = 10_000;
const INCOMPLETE_GRACE = 2 * 60_000;
const AUTH_RETRY = 30_000; // Silent Google re-sign-in retry while it fails for a passing reason.
const chunkKey = (rev, index) => `chunk:${rev}:${index}`;
const equal = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const kb = bytes => Math.ceil(bytes / 1024);

function toBase64(bytes) {
  let binary = '';
  for (let i = 0; i < bytes.length; i += 0x8000) binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(binary);
}
function fromBase64(text) {
  const binary = atob(text);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}
export async function pack(raw) {
  const stream = new Blob([raw]).stream().pipeThrough(new CompressionStream('gzip'));
  return toBase64(new Uint8Array(await new Response(stream).arrayBuffer()));
}
export async function unpack(text) {
  const stream = new Blob([fromBase64(text)]).stream().pipeThrough(new DecompressionStream('gzip'));
  return new Response(stream).text();
}

/** Assembles the board of the current remote revision. Throws while chunks are still arriving. */
async function readRemote(meta, remote) {
  let text = '';
  for (let i = 0; i < meta.n; i++) {
    const part = remote[chunkKey(meta.rev, i)];
    if (typeof part !== 'string') throw new Error('incomplete');
    text += part;
  }
  if (text.length !== meta.len) throw new Error('incomplete');
  return unpack(text);
}
const validMeta = meta => meta && meta.v === 1 && typeof meta.rev === 'string' &&
  Number.isInteger(meta.n) && meta.n > 0 && meta.n <= 64 && Number.isInteger(meta.len);

/**
 * Three-way merge of boards by widget id, field by field.
 * base is the last board both computers agreed on (or null on a first join).
 * When the same widget's content changed on both sides, the local version stays
 * and the other computer's version is added next to it as a copy, so no text is lost.
 */
export function mergeBoards(base, local, remote, makeId = () => crypto.randomUUID()) {
  const baseById = new Map((base?.nodes || []).map(node => [node.id, node]));
  const remoteById = new Map(remote.nodes.map(node => [node.id, node]));
  const localIds = new Set(local.nodes.map(node => node.id));
  const merged = [];
  const copies = [];
  const pick = (b, l, r, read) => {
    const lv = read(l), rv = read(r);
    if (equal(lv, rv)) return {value: lv};
    if (b && equal(lv, read(b))) return {value: rv};
    if (b && equal(rv, read(b))) return {value: lv};
    return {value: lv, conflict: true};
  };
  const content = node => ({version: node.version, data: node.data});
  for (const l of local.nodes) {
    const b = baseById.get(l.id), r = remoteById.get(l.id);
    if (!r) {
      // Deleted on the other computer: drop it unless it was changed here since.
      if (b && equal(l, b)) continue;
      merged.push(structuredClone(l));
      continue;
    }
    const node = structuredClone(l);
    node.title = pick(b, l, r, n => n.title).value;
    node.parentId = pick(b, l, r, n => n.parentId).value;
    node.layout = structuredClone(pick(b, l, r, n => n.layout).value);
    const color = pick(b, l, r, n => n.color ?? null).value;
    if (color) node.color = color; else delete node.color;
    const protectedFlag = pick(b, l, r, n => Boolean(n.pinProtected)).value;
    if (protectedFlag) node.pinProtected = true; else delete node.pinProtected;
    const body = pick(b, l, r, content);
    Object.assign(node, structuredClone(body.value));
    merged.push(node);
    if (body.conflict && r.type !== 'folder') {
      const copy = structuredClone(r);
      copy.id = makeId();
      copy.title = (r.title + ' — с другого устройства').slice(0, 160);
      copy.layout = {...copy.layout, x: copy.layout.x + 40, y: copy.layout.y + 40};
      copies.push(copy);
    }
  }
  for (const r of remote.nodes) {
    if (localIds.has(r.id)) continue;
    const b = baseById.get(r.id);
    // Deleted here: drop it unless the other computer changed it since.
    if (b && equal(r, b)) continue;
    merged.push(structuredClone(r));
  }
  merged.push(...copies);
  // Repair the folder tree: missing parents and cycles move the widget to the top board.
  const byId = new Map(merged.map(node => [node.id, node]));
  for (const node of merged) {
    if (node.parentId !== null && byId.get(node.parentId)?.type !== 'folder') node.parentId = null;
  }
  for (const node of merged) {
    const seen = new Set([node.id]);
    for (let parent = node.parentId; parent !== null; parent = byId.get(parent).parentId) {
      if (seen.has(parent)) { node.parentId = null; break; }
      seen.add(parent);
    }
  }
  const background = pick(base, local, remote, board => board.background ?? null).value;
  return background ? {schemaVersion: 1, nodes: merged, background} : {schemaVersion: 1, nodes: merged};
}

/**
 * Remote stores used by the engine:
 *   read()  -> null when nothing is stored yet, otherwise {rev, board, pin} (raw JSON strings or null).
 *              Throws an error with code 'incomplete' while data is still arriving, 'auth' when sign-in is needed.
 *   write({board, pin}) -> new revision id. undefined means "leave as is". Throws code 'too-big' when it cannot fit.
 */
const failure = (code, message) => Object.assign(new Error(message || code), {code});

/** chrome.storage.sync: chunked gzip, a new revision id for every board write. */
export function chromeSyncRemote(area, newRev = () => crypto.randomUUID().slice(0, 8)) {
  let last = {};
  return {
    async read() {
      last = await area.get(null);
      const meta = validMeta(last.meta) ? last.meta : null;
      const pin = typeof last.pin?.raw === 'string' ? last.pin.raw : null;
      if (!meta) return pin === null ? null : {rev: null, board: null, pin};
      try { return {rev: meta.rev, board: await readRemote(meta, last), pin}; }
      catch { throw failure('incomplete'); }
    },
    async write({board, pin}) {
      const items = {};
      let rev = validMeta(last.meta) ? last.meta.rev : null;
      if (board !== undefined) {
        const packed = await pack(board);
        const n = Math.ceil(packed.length / CHUNK_SIZE);
        if (n > MAX_CHUNKS) throw failure('too-big', `Доска слишком большая для синхронизации Chrome: ${kb(packed.length)} КБ после сжатия при лимите ${kb(CHUNK_SIZE * MAX_CHUNKS)} КБ. На этом компьютере всё сохраняется.`);
        rev = newRev();
        for (let i = 0; i < n; i++) items[chunkKey(rev, i)] = packed.slice(i * CHUNK_SIZE, (i + 1) * CHUNK_SIZE);
        items.meta = {v: 1, rev, n, len: packed.length, at: Date.now()};
      }
      if (pin !== undefined) items.pin = {raw: pin, at: Date.now()};
      await area.set(items);
      if (items.meta) {
        const stale = Object.keys(last).filter(key => key.startsWith('chunk:') && !key.startsWith(`chunk:${rev}:`));
        if (stale.length) await area.remove(stale).catch(() => {});
      }
      return rev;
    }
  };
}

/**
 * The sync engine: reconciles the local board and PIN with one remote store.
 * local follows the chrome.storage.StorageArea promise API (get(keys)/set(items)).
 * Returns {run, schedule}; run() performs one reconcile pass.
 */
export function createSync({local, remote, sync, registry, stateKey = SYNC_STATE_KEY, statusKey = SYNC_STATUS_KEY,
  minGap = MIN_GAP, now = Date.now, newRev, timers = globalThis, lock = fn => fn()}) {
  remote ??= chromeSyncRemote(sync, newRev);
  let chain = Promise.resolve();
  let timer = null, dueAt = 0, lastRun = 0;

  const setStatus = (state, message = '') =>
    local.set({[statusKey]: JSON.stringify({state, message, at: now()})});
  const parse = raw => validateWorkspace(JSON.parse(raw), registry);

  async function pass() {
    const stored = await local.get([KEY, PIN_KEY, stateKey]);
    const state = {rev: null, base: null, pin: null, incompleteSince: null, ...stored[stateKey]};
    const localRaw = typeof stored[KEY] === 'string' ? stored[KEY] : null;
    const localPin = typeof stored[PIN_KEY] === 'string' ? stored[PIN_KEY] : null;

    let found = null;
    try { found = await remote.read(); }
    catch (error) {
      if (error.code === 'auth') { await setStatus('signed-out', error.message); return {}; }
      if (error.code === 'auth-wait') { await setStatus('pending', error.message); return {retry: AUTH_RETRY}; }
      if (error.code !== 'incomplete') throw error;
      const since = state.incompleteSince ?? now();
      if (now() - since < INCOMPLETE_GRACE) {
        await local.set({[stateKey]: {...state, incompleteSince: since}});
        await setStatus('pending', 'Жду данные с другого компьютера…');
        return {retry: 15_000};
      }
      found = null; // The remote copy stayed broken: replace it with this computer's board.
    }
    const remoteRev = found?.board != null ? found.rev : null;
    const remoteRaw = found?.board ?? null;
    const remotePin = found?.pin ?? null;
    const next = {...state, incompleteSince: null};
    const localWrites = {};
    let pushRaw;

    if (localRaw !== null) {
      try { parse(localRaw); }
      catch (error) {
        await setStatus('error', 'Синхронизация остановлена: доска на этом устройстве повреждена. ' + error.message);
        return {};
      }
    }

    if (remoteRaw === null) {
      if (localRaw !== null) pushRaw = localRaw;
    } else if (remoteRev === state.rev) {
      if (localRaw !== null && localRaw !== state.base) pushRaw = localRaw;
    } else {
      let remoteBoard;
      try { remoteBoard = parse(remoteRaw); }
      catch (error) {
        await setStatus('error', 'Доску с другого устройства не удалось загрузить: ' + error.message + ' Обновите приложение на этом устройстве.');
        return {};
      }
      next.rev = remoteRev;
      next.base = remoteRaw;
      if (localRaw === null || localRaw === state.base || localRaw === remoteRaw) {
        if (localRaw !== remoteRaw) localWrites[KEY] = remoteRaw;
      } else {
        const base = state.base && state.rev ? (() => { try { return parse(state.base); } catch { return null; } })() : null;
        let mergedRaw;
        try { mergedRaw = JSON.stringify(validateWorkspace(mergeBoards(base, parse(localRaw), remoteBoard), registry)); }
        catch { mergedRaw = localRaw; } // Could not combine (for example over 500 widgets): keep this device's board.
        if (mergedRaw !== localRaw) localWrites[KEY] = mergedRaw;
        if (mergedRaw !== remoteRaw) pushRaw = mergedRaw;
      }
    }

    // PIN: the most recent change wins. It is a salted hash, never the PIN itself.
    let pushPin;
    if (localPin !== state.pin && localPin !== null) { if (remotePin !== localPin) pushPin = localPin; next.pin = localPin; }
    else if (remotePin !== null && remotePin !== state.pin) {
      if (remotePin !== localPin) localWrites[PIN_KEY] = remotePin;
      next.pin = remotePin;
    }

    if (Object.keys(localWrites).length) {
      // A page may have saved while this pass ran: start over instead of overwriting it.
      const fresh = await local.get([KEY, PIN_KEY]);
      if ((fresh[KEY] ?? null) !== localRaw || (fresh[PIN_KEY] ?? null) !== localPin) return {retry: 0};
    }

    let problem = null;
    if (pushRaw !== undefined || pushPin !== undefined) {
      try {
        const rev = await remote.write({board: pushRaw, pin: pushPin});
        next.rev = rev;
        if (pushRaw !== undefined) next.base = pushRaw;
      } catch (error) {
        if (error.code === 'too-big' && pushPin !== undefined) {
          try { next.rev = await remote.write({pin: pushPin}); } catch { /* Reported below. */ }
        }
        if (error.code !== 'too-big') {
          next.rev = state.rev; next.base = state.base; next.pin = state.pin;
          await local.set({...localWrites, [stateKey]: next});
          if (error.code === 'auth-wait') { await setStatus('pending', error.message); return {retry: AUTH_RETRY}; }
          await setStatus(error.code === 'auth' ? 'signed-out' : 'error',
            error.code === 'auth' ? error.message : 'Не удалось синхронизировать: ' + (error?.message || error) + ' Повторю позже.');
          return error.code === 'auth' ? {} : {retry: 60_000};
        }
        problem = error.message;
      }
    }
    await local.set({...localWrites, [stateKey]: next});
    if (problem) await setStatus('too-big', problem);
    else await setStatus('synced');
    return {};
  }

  function run() {
    const result = chain.then(() => lock(pass));
    chain = result.catch(() => {});
    return result;
  }

  /** Runs a pass after delay ms, at most once per minGap, coalescing repeated requests. */
  function schedule(delay = 0) {
    const at = Math.max(now() + delay, lastRun + minGap);
    if (timer && dueAt <= at) return;
    if (timer) timers.clearTimeout(timer);
    dueAt = at;
    timer = timers.setTimeout(async () => {
      timer = null;
      lastRun = now();
      try {
        const {retry} = await run();
        if (retry !== undefined) schedule(retry);
      } catch (error) {
        await setStatus('error', 'Не удалось синхронизировать: ' + (error?.message || error)).catch(() => {});
        schedule(60_000);
      }
    }, Math.max(0, at - now()));
  }

  return {run, schedule};
}
