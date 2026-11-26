import {isBalanceDate, isCurrency, isRate, localDate} from './savings-data.js';

const endpoint = 'https://api.frankfurter.dev/v2/rates';
const cacheKey = 'cabinet-board:frankfurter:v1';
const maxSnapshots = 32;
const hour = 60 * 60 * 1000;
const pending = new Map();
let snapshots = new Map();

export function parseRateRows(rows, base, day) {
  if (!Array.isArray(rows)) throw new Error('Не удалось прочитать курсы валют.');
  const latest = new Map();
  for (const row of rows) {
    if (row?.base !== base || row.quote === base || !isCurrency(row.quote) ||
        !isBalanceDate(row.date) || row.date > day || !isRate(row.rate) || !isRate(1 / row.rate)) continue;
    if (!latest.has(row.quote) || latest.get(row.quote).date < row.date) latest.set(row.quote, row);
  }
  // The API returns units of quote per unit of base. The board needs the inverse.
  return Object.fromEntries([...latest].map(([code, row]) => [code, {rate:1 / row.rate, date:row.date}]));
}

function cachedSnapshot(base, day) {
  const key = `${base}/${day}`;
  if (snapshots.has(key)) return snapshots.get(key);
  try {
    const stored = JSON.parse(localStorage.getItem(cacheKey) ?? '{}')[key];
    if (!Number.isFinite(stored?.savedAt) || !stored.rates || typeof stored.rates !== 'object') return null;
    const rates = Object.fromEntries(Object.entries(stored.rates).filter(([code, entry]) =>
      isCurrency(code) && code !== base && isRate(entry?.rate) && isBalanceDate(entry.date) && entry.date <= day));
    return {rates, savedAt:stored.savedAt};
  } catch { return null; }
}

function saveSnapshot(key, snapshot) {
  snapshots.delete(key);
  snapshots.set(key, snapshot);
  if (snapshots.size > maxSnapshots) snapshots.delete(snapshots.keys().next().value);
  try {
    const stored = JSON.parse(localStorage.getItem(cacheKey) ?? '{}');
    const entries = Object.entries({...stored,...Object.fromEntries(snapshots)});
    entries.sort(([,a],[,b]) => (b?.savedAt || 0) - (a?.savedAt || 0));
    localStorage.setItem(cacheKey, JSON.stringify(Object.fromEntries(entries.slice(0,maxSnapshots))));
  } catch { /* Quota or unavailable storage: keep the in-memory copy. */ }
}

export function rateSnapshot(base, day) {
  const cached = cachedSnapshot(base, day);
  const maxAge = (day < localDate() ? 48 : 6) * hour;
  return {rates:cached?.rates ?? {}, fresh:!!cached && Date.now() - cached.savedAt < maxAge};
}

export function fetchRates(base, day, {force=false}={}) {
  if (!isCurrency(base) || !isBalanceDate(day)) return Promise.reject(new Error('Некорректная валюта или дата.'));
  const cached = rateSnapshot(base, day);
  if (cached.fresh && !force) return Promise.resolve(cached.rates);
  // Chrome can serve the changed JS from disk while still using the old manifest.
  const policy = globalThis.chrome?.runtime?.getManifest?.()?.content_security_policy?.extension_pages;
  if (policy?.split(';').some(directive => /^connect-src\s+'none'$/i.test(directive.trim()))) {
    return Promise.reject(Object.assign(new Error('Chrome ещё использует старые настройки расширения.'), {code:'EXTENSION_RELOAD_REQUIRED'}));
  }
  const key = `${base}/${day}`;
  if (!pending.has(key)) {
    const url = new URL(endpoint);
    url.search = new URLSearchParams({base,date:day});
    const request = fetch(url, {credentials:'omit',referrerPolicy:'no-referrer',signal:AbortSignal.timeout(8000)})
      .then(response => {
        if (!response.ok) throw new Error('Источник курсов недоступен для этой валюты или даты.');
        return response.json();
      }).then(rows => {
        const rates = parseRateRows(rows, base, day);
        if (!Object.keys(rates).length) throw new Error('На эту дату нет курсов.');
        saveSnapshot(key, {rates,savedAt:Date.now()});
        return rates;
      }).finally(() => pending.delete(key));
    pending.set(key,request);
  }
  return pending.get(key);
}
