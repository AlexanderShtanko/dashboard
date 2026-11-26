/**
 * Google Drive as a sync remote for core/sync.js.
 * The board and PIN record live in one JSON file in the app's hidden appDataFolder
 * (scope drive.appdata): the app cannot see any other file on the user's Drive.
 */
export const DRIVE_STATE_KEY = 'cabinet-board:drive-state:v1';
export const DRIVE_STATUS_KEY = 'cabinet-board:drive-status:v1';
export const DRIVE_SETTINGS_KEY = 'cabinet-board:drive:v1';
const API = 'https://www.googleapis.com/drive/v3';
const UPLOAD = 'https://www.googleapis.com/upload/drive/v3';
const FILE_NAME = 'cabinet-board.json';
const failure = (code, message) => Object.assign(new Error(message || code), {code});
export const signedOut = () => failure('auth', 'Войдите в Google, чтобы синхронизировать через Google Диск.');

/** getToken({refresh}) resolves to an access token, or null when the user has to sign in again. */
export function driveRemote({getToken, fetch = globalThis.fetch.bind(globalThis), newRev = () => crypto.randomUUID().slice(0, 8), now = Date.now}) {
  let fileId = null;
  let last = null;

  async function call(url, init = {}) {
    for (const refresh of [false, true]) {
      const token = await getToken({refresh});
      if (!token) throw signedOut();
      const response = await fetch(url, {...init, headers: {...init.headers, Authorization: 'Bearer ' + token}});
      if (response.status === 401) continue;
      if (response.status === 404) throw failure('missing');
      if (!response.ok) throw new Error(`Google Диск ответил ошибкой ${response.status}.`);
      return response;
    }
    throw signedOut();
  }

  async function find() {
    if (fileId) return fileId;
    const query = new URLSearchParams({spaces: 'appDataFolder', q: `name='${FILE_NAME}' and trashed=false`,
      fields: 'files(id,modifiedTime)', orderBy: 'modifiedTime desc', pageSize: '10'});
    const {files = []} = await (await call(`${API}/files?${query}`)).json();
    fileId = files[0]?.id ?? null;
    return fileId;
  }

  return {
    async read() {
      for (let attempt = 0; attempt < 2; attempt++) {
        const id = await find();
        if (!id) { last = null; return null; }
        try {
          const content = await (await call(`${API}/files/${id}?alt=media`)).json();
          if (content?.v !== 1 || typeof content.rev !== 'string') throw new Error('Файл синхронизации на Google Диске повреждён.');
          last = content;
          return {rev: content.rev, board: typeof content.board === 'string' ? content.board : null, pin: typeof content.pin === 'string' ? content.pin : null};
        } catch (error) {
          if (error.code !== 'missing') throw error;
          fileId = null; // Deleted on Drive: look it up again.
        }
      }
      last = null;
      return null;
    },
    async write({board, pin}) {
      const content = {v: 1, rev: newRev(), at: now(),
        board: board !== undefined ? board : last?.board ?? null,
        pin: pin !== undefined ? pin : last?.pin ?? null};
      const body = JSON.stringify(content);
      if (fileId) {
        try {
          await call(`${UPLOAD}/files/${fileId}?uploadType=media`, {method: 'PATCH', headers: {'Content-Type': 'application/json'}, body});
          last = content;
          return content.rev;
        } catch (error) {
          if (error.code !== 'missing') throw error;
          fileId = null;
        }
      }
      const boundary = 'cabinet' + newRev();
      const metadata = JSON.stringify({name: FILE_NAME, parents: ['appDataFolder'], mimeType: 'application/json'});
      const multipart = `--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${metadata}\r\n` +
        `--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${body}\r\n--${boundary}--`;
      const created = await (await call(`${UPLOAD}/files?uploadType=multipart&fields=id`, {method: 'POST',
        headers: {'Content-Type': `multipart/related; boundary=${boundary}`}, body: multipart})).json();
      fileId = created.id;
      last = content;
      return content.rev;
    }
  };
}
