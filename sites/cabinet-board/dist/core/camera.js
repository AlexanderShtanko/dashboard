/**
 * Remembers where the board view was left (pan and zoom), per folder, on this device.
 *
 * The position is stored relative to the board's centre, so it stays put when the
 * window has a different size next time. It lives in local storage only: it is not
 * synced, because another screen needs its own view.
 */

export const CAMERA_KEY = 'cabinet-board-camera';
const MAX_ENTRIES = 200;

const slot = parent => parent ?? 'root';
const finite = value => typeof value === 'number' && Number.isFinite(value);

function parse(raw) {
  try {
    const data = JSON.parse(raw || '{}');
    return data && typeof data === 'object' && !Array.isArray(data) ? data : {};
  } catch { return {}; }
}

export function createCameraMemory(storage, {delay = 250, timers = globalThis} = {}) {
  const read = () => { try { return parse(storage.getItem(CAMERA_KEY)); } catch { return {}; } };
  const dirty = new Map();
  let timer = null;

  function flush() {
    if (timer !== null) { timers.clearTimeout(timer); timer = null; }
    if (!dirty.size) return;
    // Merge with what other tabs saved for other folders.
    const data = read();
    for (const [key, value] of dirty) { delete data[key]; data[key] = value; }
    dirty.clear();
    const keys = Object.keys(data);
    for (const key of keys.slice(0, Math.max(0, keys.length - MAX_ENTRIES))) delete data[key];
    try { storage.setItem(CAMERA_KEY, JSON.stringify(data)); } catch { /* Not critical. */ }
  }

  return {
    /** Saved camera for a folder in screen pixels for a board of w×h, or null. */
    get(parent, w, h) {
      const saved = dirty.get(slot(parent)) ?? read()[slot(parent)];
      if (!saved || !finite(saved.x) || !finite(saved.y) || !finite(saved.z) || saved.z <= 0) return null;
      return {x: saved.x + w / 2, y: saved.y + h / 2, z: saved.z};
    },
    set(parent, camera, w, h) {
      if (!w || !h || !finite(camera.x) || !finite(camera.y) || !finite(camera.z)) return;
      const round = value => Math.round(value * 100) / 100;
      dirty.set(slot(parent), {x: round(camera.x - w / 2), y: round(camera.y - h / 2), z: Math.round(camera.z * 1000) / 1000});
      if (timer !== null) timers.clearTimeout(timer);
      timer = timers.setTimeout(flush, delay);
    },
    flush
  };
}
