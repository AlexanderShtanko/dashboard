import {isPlace, parseForecast, parsePlaces, placeKey} from './weather-data.js';

// Weather comes from Open-Meteo (open-meteo.com): free, no key, no account.
// The only thing sent is the name typed into the search, or the coordinates of the chosen place.
const forecastUrl = 'https://api.open-meteo.com/v1/forecast';
const searchUrl = 'https://geocoding-api.open-meteo.com/v1/search';
const cacheKey = 'cabinet-board:weather:v1';
const maxPlaces = 8;
export const FRESH_FOR = 30 * 60 * 1000;
const pending = new Map();
const request = {credentials:'omit', referrerPolicy:'no-referrer'};

function readCache() {
  try { const stored = JSON.parse(localStorage.getItem(cacheKey) ?? '{}'); return stored && typeof stored === 'object' ? stored : {}; }
  catch { return {}; }
}
/** The last forecast saved on this device for a place: {forecast, savedAt, fresh} or null. */
export function cachedForecast(place) {
  const entry = readCache()[placeKey(place)];
  if (!Number.isFinite(entry?.savedAt) || !entry.forecast?.current || !Array.isArray(entry.forecast.days)) return null;
  return {forecast:entry.forecast, savedAt:entry.savedAt, fresh:Date.now() - entry.savedAt < FRESH_FOR};
}
function saveForecast(place, forecast) {
  try {
    const entries = Object.entries({...readCache(), [placeKey(place)]:{forecast, savedAt:Date.now()}});
    entries.sort(([, a], [, b]) => (b?.savedAt || 0) - (a?.savedAt || 0));
    localStorage.setItem(cacheKey, JSON.stringify(Object.fromEntries(entries.slice(0, maxPlaces))));
  } catch { /* Quota or unavailable storage: the forecast is simply not cached. */ }
}
/** Chrome can serve the new JS while still using the old manifest, which does not allow Open-Meteo yet. */
function reloadNeeded() {
  const policy = globalThis.chrome?.runtime?.getManifest?.()?.content_security_policy?.extension_pages;
  return !!policy && /connect-src/.test(policy) && !policy.includes('open-meteo.com');
}
const reloadError = () => Object.assign(new Error('Обновите расширение на chrome://extensions, чтобы погода заработала.'), {code:'EXTENSION_RELOAD_REQUIRED'});

export function fetchForecast(place, {force = false} = {}) {
  if (!isPlace(place)) return Promise.reject(new Error('Сначала выберите город.'));
  const cached = cachedForecast(place);
  if (cached?.fresh && !force) return Promise.resolve(cached.forecast);
  if (reloadNeeded()) return Promise.reject(reloadError());
  const key = placeKey(place);
  if (!pending.has(key)) {
    const url = new URL(forecastUrl);
    url.search = new URLSearchParams({latitude:place.lat.toFixed(2), longitude:place.lon.toFixed(2), timezone:'auto', forecast_days:'7',
      wind_speed_unit:'ms', current:'temperature_2m,apparent_temperature,weather_code,is_day,wind_speed_10m,relative_humidity_2m',
      daily:'weather_code,temperature_2m_max,temperature_2m_min,precipitation_probability_max'});
    pending.set(key, fetch(url, {...request, signal:AbortSignal.timeout(8000)})
      .then(response => { if (!response.ok) throw new Error('Сервис погоды сейчас недоступен.'); return response.json(); })
      .then(json => { const forecast = parseForecast(json); saveForecast(place, forecast); return forecast; })
      .finally(() => pending.delete(key)));
  }
  return pending.get(key);
}
export async function searchPlaces(query, {signal} = {}) {
  const name = String(query ?? '').trim().slice(0, 80);
  if (name.length < 2) return [];
  if (reloadNeeded()) throw reloadError();
  const url = new URL(searchUrl);
  url.search = new URLSearchParams({name, count:'6', language:'ru', format:'json'});
  const response = await fetch(url, {...request, signal:signal ?? AbortSignal.timeout(8000)});
  if (!response.ok) throw new Error('Поиск городов сейчас недоступен.');
  return parsePlaces(await response.json());
}
