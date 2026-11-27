// Pure helpers for the clock widget: time zones, labels and formatting. No DOM here.
// Data format v1: {seconds:boolean, zones:[{tz,label}]}. The big clock is always the device's own time.
export const MAX_ZONES = 6;

/** Cities offered when adding a clock. Any other valid IANA zone ("Asia/Almaty") is accepted too. */
export const CITIES = [
  ['Europe/Kaliningrad','Калининград'],['Europe/Moscow','Москва'],['Europe/Samara','Самара'],['Asia/Yekaterinburg','Екатеринбург'],
  ['Asia/Omsk','Омск'],['Asia/Novosibirsk','Новосибирск'],['Asia/Krasnoyarsk','Красноярск'],['Asia/Irkutsk','Иркутск'],
  ['Asia/Yakutsk','Якутск'],['Asia/Vladivostok','Владивосток'],['Asia/Kamchatka','Петропавловск-Камчатский'],
  ['Europe/Minsk','Минск'],['Europe/Kyiv','Киев'],['Asia/Almaty','Алматы'],['Asia/Tashkent','Ташкент'],['Asia/Tbilisi','Тбилиси'],
  ['Asia/Yerevan','Ереван'],['Asia/Baku','Баку'],['Europe/Istanbul','Стамбул'],['Asia/Nicosia','Никосия'],['Europe/Athens','Афины'],
  ['Europe/Helsinki','Хельсинки'],['Europe/Warsaw','Варшава'],['Europe/Berlin','Берлин'],['Europe/Prague','Прага'],['Europe/Vienna','Вена'],
  ['Europe/Rome','Рим'],['Europe/Paris','Париж'],['Europe/Amsterdam','Амстердам'],['Europe/Madrid','Мадрид'],['Europe/Belgrade','Белград'],
  ['Europe/Lisbon','Лиссабон'],['Europe/London','Лондон'],['Asia/Jerusalem','Тель-Авив'],['Asia/Dubai','Дубай'],['Asia/Kolkata','Дели'],
  ['Asia/Bangkok','Бангкок'],['Asia/Singapore','Сингапур'],['Asia/Hong_Kong','Гонконг'],['Asia/Shanghai','Пекин'],['Asia/Seoul','Сеул'],
  ['Asia/Tokyo','Токио'],['Australia/Sydney','Сидней'],['Pacific/Auckland','Окленд'],['America/Sao_Paulo','Сан-Паулу'],
  ['America/Argentina/Buenos_Aires','Буэнос-Айрес'],['America/New_York','Нью-Йорк'],['America/Toronto','Торонто'],['America/Chicago','Чикаго'],
  ['America/Mexico_City','Мехико'],['America/Denver','Денвер'],['America/Los_Angeles','Лос-Анджелес'],['America/Vancouver','Ванкувер'],
  ['Pacific/Honolulu','Гонолулу'],['UTC','UTC'],
];

export function isTimeZone(tz) {
  if (typeof tz !== 'string' || !tz || tz.length > 64) return false;
  try { new Intl.DateTimeFormat('en', {timeZone:tz}); return true; } catch { return false; }
}
export const isZone = zone => !!zone && typeof zone === 'object' && isTimeZone(zone.tz) && typeof zone.label === 'string' && zone.label.length >= 1 && zone.label.length <= 40;
export const isClock = data => !!data && typeof data.seconds === 'boolean' && Array.isArray(data.zones) && data.zones.length <= MAX_ZONES && data.zones.every(isZone);

const clean = text => String(text ?? '').trim().toLowerCase().replaceAll('ё', 'е');
/** Label of a zone: the city from the list, otherwise the last part of the IANA name. */
export function zoneLabel(tz) {
  return CITIES.find(([zone]) => zone === tz)?.[1] ?? tz.split('/').pop().replaceAll('_', ' ');
}
/** Turns what the owner typed ("Токио", "токи", "Asia/Tokyo") into {tz,label}, or null. */
export function findZone(query) {
  const text = clean(query);
  if (!text) return null;
  const city = CITIES.find(([, label]) => clean(label) === text) ?? CITIES.find(([, label]) => clean(label).startsWith(text))
    ?? CITIES.find(([tz]) => clean(tz) === text);
  if (city) return {tz:city[0], label:city[1]};
  const typed = String(query).trim();
  return typed.includes('/') && isTimeZone(typed) ? {tz:typed, label:zoneLabel(typed)} : null;
}
export function addZone(data, zone) {
  if (!isZone(zone)) throw new Error('Не нашли такой город. Выберите его из списка.');
  if (data.zones.some(item => item.tz === zone.tz)) throw new Error('Этот город уже есть на карточке.');
  if (data.zones.length >= MAX_ZONES) throw new Error(`На карточке помещается до ${MAX_ZONES} городов.`);
  return {...data, zones:[...data.zones, {tz:zone.tz, label:zone.label}]};
}
export const removeZone = (data, tz) => ({...data, zones:data.zones.filter(zone => zone.tz !== tz)});

function parts(date, tz) {
  const format = new Intl.DateTimeFormat('en-GB', {timeZone:tz, hourCycle:'h23', year:'numeric', month:'2-digit', day:'2-digit', hour:'2-digit', minute:'2-digit', second:'2-digit'});
  return Object.fromEntries(format.formatToParts(date).filter(part => part.type !== 'literal').map(part => [part.type, Number(part.value)]));
}
/** Wall-clock time in a zone ("09:05" or "09:05:07"). Without tz: the device's own time. */
export function timeText(date, tz, seconds = false) {
  const p = parts(date, tz);
  const two = value => String(value).padStart(2, '0');
  return two(p.hour) + ':' + two(p.minute) + (seconds ? ':' + two(p.second) : '');
}
export function dateText(date, tz) {
  const text = new Intl.DateTimeFormat('ru-RU', {timeZone:tz, weekday:'long', day:'numeric', month:'long'}).format(date);
  return text.charAt(0).toUpperCase() + text.slice(1);
}
/** Minutes a zone is ahead of UTC at this moment. */
export function offsetMinutes(date, tz) {
  const p = parts(date, tz);
  return Math.round((Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second) - Math.floor(date.getTime() / 1000) * 1000) / 60000);
}
/** How a zone differs from the device's time: "+2 ч", "−5:30", "то же время", with "завтра"/"вчера" when the date differs. */
export function differenceText(date, tz, localTz) {
  const diff = offsetMinutes(date, tz) - offsetMinutes(date, localTz);
  const a = parts(date, tz), b = parts(date, localTz);
  const days = Math.round((Date.UTC(a.year, a.month - 1, a.day) - Date.UTC(b.year, b.month - 1, b.day)) / 86400000);
  const day = days > 0 ? 'завтра' : days < 0 ? 'вчера' : '';
  if (!diff) return 'то же время';
  const abs = Math.abs(diff), hours = Math.floor(abs / 60), minutes = abs % 60;
  const amount = (diff > 0 ? '+' : '−') + (minutes ? `${hours}:${String(minutes).padStart(2, '0')}` : `${hours} ч`);
  return day ? `${amount}, ${day}` : amount;
}
