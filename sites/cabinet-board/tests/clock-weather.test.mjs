import test from 'node:test';
import assert from 'node:assert/strict';
import {isClock, findZone, addZone, removeZone, timeText, differenceText, offsetMinutes, zoneLabel, MAX_ZONES} from '../dist/widgets/clock-data.js';
import {isWeather, describe, temperature, dayLabel, parseForecast, parsePlaces, placeKey} from '../dist/widgets/weather-data.js';

const moment = new Date('2026-01-15T12:00:00Z');

test('clock: cities are found by name, prefix or IANA zone', () => {
  assert.deepEqual(findZone(' токио '), {tz:'Asia/Tokyo', label:'Токио'});
  assert.equal(findZone('нью').tz, 'America/New_York');
  assert.deepEqual(findZone('Asia/Dhaka'), {tz:'Asia/Dhaka', label:'Dhaka'});
  assert.equal(findZone('Нигде'), null);assert.equal(findZone('Mars/Olympus'), null);
  assert.equal(zoneLabel('America/Los_Angeles'), 'Лос-Анджелес');
});
test('clock: zones are added once, removed, limited and validated', () => {
  let data = {seconds:false, zones:[]};
  data = addZone(data, findZone('Токио'));
  assert.throws(() => addZone(data, findZone('Токио')), /уже есть/);
  assert.equal(removeZone(data, 'Asia/Tokyo').zones.length, 0);
  const full = {seconds:true, zones:['Europe/Paris','Europe/Rome','Asia/Dubai','Asia/Seoul','UTC','Asia/Tokyo'].map(tz => ({tz, label:zoneLabel(tz)}))};
  assert.equal(full.zones.length, MAX_ZONES);assert.ok(isClock(full));
  assert.throws(() => addZone(full, findZone('Лондон')), /до 6/);
  assert.equal(isClock({seconds:false, zones:[{tz:'Nope/Nowhere', label:'x'}]}), false);
  assert.equal(isClock({zones:[]}), false);
});
test('clock: time and difference between zones', () => {
  assert.equal(timeText(moment, 'Asia/Tokyo'), '21:00');
  assert.equal(timeText(moment, 'UTC', true), '12:00:00');
  assert.equal(offsetMinutes(moment, 'Asia/Kolkata'), 330);
  assert.equal(differenceText(moment, 'Asia/Tokyo', 'Europe/Moscow'), '+6 ч');
  assert.equal(differenceText(moment, 'Asia/Kolkata', 'UTC'), '+5:30');
  assert.equal(differenceText(moment, 'America/New_York', 'Europe/Moscow'), '−8 ч');
  assert.equal(differenceText(moment, 'Europe/Minsk', 'Europe/Moscow'), 'то же время');
  assert.equal(differenceText(moment, 'Pacific/Auckland', 'UTC'), '+13 ч, завтра');
  assert.equal(differenceText(new Date('2026-01-15T02:00:00Z'), 'America/Los_Angeles', 'UTC'), '−8 ч, вчера');
});
test('weather: codes, temperatures and day names are worded', () => {
  assert.deepEqual(describe(0), {text:'Ясно', icon:'sun'});
  assert.equal(describe(0, false).icon, 'moon');
  assert.equal(describe(63).icon, 'rain');assert.equal(describe(95).text, 'Гроза');
  assert.equal(describe(1234).text, 'Нет данных');
  assert.equal(temperature(2.6), '+3°');assert.equal(temperature(-11.5), '−11°');assert.equal(temperature(-0.2), '0°');
  assert.equal(dayLabel('2026-11-27', '2026-11-27'), 'Сегодня');
  assert.equal(dayLabel('2026-11-28', '2026-11-27'), 'Завтра');
  assert.equal(dayLabel('2026-11-30', '2026-11-27'), 'пн');
});
test('weather: forecast and place answers are parsed and validated', () => {
  const forecast = parseForecast({current:{time:'2026-11-27T10:15', temperature_2m:18.4, apparent_temperature:17.1, weather_code:2, is_day:1, wind_speed_10m:3.4, relative_humidity_2m:61},
    daily:{time:['2026-11-27', '2026-11-28', 'bad'], weather_code:[2, 61, 3], temperature_2m_max:[20, 17, 15], temperature_2m_min:[12, 11, 9], precipitation_probability_max:[5, 80, null]}});
  assert.equal(forecast.today, '2026-11-27');assert.equal(forecast.days.length, 2);
  assert.deepEqual(forecast.days[1], {date:'2026-11-28', code:61, max:17, min:11, rain:80});
  assert.equal(forecast.current.isDay, true);assert.equal(forecast.current.wind, 3.4);
  assert.throws(() => parseForecast({current:{}}), /прогноз/);
  const places = parsePlaces({results:[{name:'Лимасол', admin1:'Лимасол', country:'Кипр', latitude:34.684, longitude:33.037}, {name:'', latitude:1, longitude:1}, {name:'X', latitude:999, longitude:0}]});
  assert.deepEqual(places, [{name:'Лимасол', region:'Кипр', lat:34.684, lon:33.037}]);
  assert.equal(placeKey(places[0]), '34.68,33.04');
  assert.deepEqual(parsePlaces({}), []);
  assert.ok(isWeather({place:null}));assert.ok(isWeather({place:places[0]}));
  assert.equal(isWeather({place:{name:'A', region:'', lat:'1', lon:2}}), false);
});
