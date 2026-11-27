// Pure helpers for the weather widget: reading Open-Meteo answers and wording them. No DOM, no network.
// Data format v1: {place:null | {name,region,lat,lon}}. The forecast itself is never saved with the board.

export const isPlace = place => !!place && typeof place === 'object' &&
  typeof place.name === 'string' && place.name.length >= 1 && place.name.length <= 80 &&
  typeof place.region === 'string' && place.region.length <= 120 &&
  Number.isFinite(place.lat) && Math.abs(place.lat) <= 90 && Number.isFinite(place.lon) && Math.abs(place.lon) <= 180;
export const isWeather = data => !!data && (data.place === null || isPlace(data.place));

// WMO weather codes, as Open-Meteo returns them.
const CODES = [
  [[0], 'Ясно', 'sun'], [[1], 'Малооблачно', 'partly'], [[2], 'Переменная облачность', 'partly'], [[3], 'Пасмурно', 'cloud'],
  [[45, 48], 'Туман', 'fog'], [[51, 53, 55], 'Морось', 'drizzle'], [[56, 57], 'Ледяная морось', 'drizzle'],
  [[61], 'Небольшой дождь', 'rain'], [[63], 'Дождь', 'rain'], [[65], 'Сильный дождь', 'rain'], [[66, 67], 'Ледяной дождь', 'rain'],
  [[71], 'Небольшой снег', 'snow'], [[73], 'Снег', 'snow'], [[75], 'Сильный снег', 'snow'], [[77], 'Снежная крупа', 'snow'],
  [[80, 81], 'Ливень', 'rain'], [[82], 'Сильный ливень', 'rain'], [[85, 86], 'Снегопад', 'snow'],
  [[95], 'Гроза', 'thunder'], [[96, 99], 'Гроза с градом', 'thunder'],
];
/** Words and an icon name for a weather code. Clear nights get a moon. */
export function describe(code, isDay = true) {
  const found = CODES.find(([codes]) => codes.includes(code));
  if (!found) return {text:'Нет данных', icon:'cloud'};
  return {text:found[1], icon:found[2] === 'sun' && !isDay ? 'moon' : found[2]};
}
/** "+3°", "−12°", "0°". */
export function temperature(value) {
  const rounded = Math.round(value);
  return (rounded > 0 ? '+' : rounded < 0 ? '−' : '') + Math.abs(rounded) + '°';
}
const WEEKDAYS = ['вс', 'пн', 'вт', 'ср', 'чт', 'пт', 'сб'];
/** "Сегодня", "Завтра", then short weekdays. Dates are YYYY-MM-DD in the place's own time zone. */
export function dayLabel(date, today) {
  const diff = Math.round((Date.parse(date + 'T00:00:00Z') - Date.parse(today + 'T00:00:00Z')) / 86400000);
  return diff === 0 ? 'Сегодня' : diff === 1 ? 'Завтра' : WEEKDAYS[new Date(date + 'T00:00:00Z').getUTCDay()];
}

const isDate = value => typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value);
const num = value => (Number.isFinite(value) ? value : null);
/** Open-Meteo forecast answer → {today, current:{temp,feels,code,isDay,wind,humidity}, days:[{date,code,max,min,rain}]}. */
export function parseForecast(json) {
  const current = json?.current, daily = json?.daily;
  if (!current || !Number.isFinite(current.temperature_2m) || !Number.isFinite(current.weather_code) || !Array.isArray(daily?.time)) {
    throw new Error('Не удалось прочитать прогноз.');
  }
  const days = daily.time.map((date, index) => ({date, code:daily.weather_code?.[index], max:daily.temperature_2m_max?.[index],
    min:daily.temperature_2m_min?.[index], rain:num(daily.precipitation_probability_max?.[index])}))
    .filter(day => isDate(day.date) && Number.isFinite(day.code) && Number.isFinite(day.max) && Number.isFinite(day.min)).slice(0, 7);
  const today = typeof current.time === 'string' && isDate(current.time.slice(0, 10)) ? current.time.slice(0, 10) : days[0]?.date ?? null;
  return {today, days,
    current:{temp:current.temperature_2m, feels:num(current.apparent_temperature), code:current.weather_code, isDay:current.is_day !== 0,
      wind:num(current.wind_speed_10m), humidity:num(current.relative_humidity_2m)}};
}
/** Open-Meteo geocoding answer → [{name,region,lat,lon}]. */
export function parsePlaces(json) {
  if (!Array.isArray(json?.results)) return [];
  return json.results.map(row => ({name:String(row?.name ?? '').slice(0, 80),
    region:[row?.admin1, row?.country].filter(part => typeof part === 'string' && part && part !== row.name).join(', ').slice(0, 120),
    lat:row?.latitude, lon:row?.longitude})).filter(isPlace).slice(0, 6);
}
/** Coordinates rounded to ~1 km: enough for a forecast, and the cache key. */
export const placeKey = place => place.lat.toFixed(2) + ',' + place.lon.toFixed(2);
