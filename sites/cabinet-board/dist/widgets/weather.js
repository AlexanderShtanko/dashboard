import {el} from '../core/dom.js';
import {icon} from '../core/icons.js';
import {isWeather, describe, temperature, dayLabel, placeKey} from './weather-data.js';
import {cachedForecast, fetchForecast, searchPlaces, FRESH_FOR} from './weather-api.js';

// Weather for one chosen city: now and the days ahead. The city is saved with the board,
// the forecast is fetched from Open-Meteo and kept only in this device's cache.

const failure = problem => problem?.code === 'EXTENSION_RELOAD_REQUIRED' ? problem.message
  : problem?.name === 'TimeoutError' || problem instanceof TypeError ? 'Нет связи с сервисом погоды.' : problem?.message || 'Не удалось загрузить погоду.';

function dayItem(day, today) {
  const look = describe(day.code);
  return el('li', {class:'weather-day', title:look.text},
    el('span', {class:'weather-day-name'}, dayLabel(day.date, today)),
    el('span', {class:'weather-day-icon', role:'img', 'aria-label':look.text}, icon(look.icon)),
    el('span', {class:'weather-day-rain muted'}, day.rain !== null && day.rain >= 20 ? Math.round(day.rain) + '%' : ''),
    el('span', {class:'weather-day-max'}, temperature(day.max)),
    el('span', {class:'weather-day-min muted'}, temperature(day.min)));
}
function nowBlock(place, forecast) {
  const look = describe(forecast.current.code, forecast.current.isDay);
  return el('div', {class:'weather-now'},
    el('span', {class:'weather-icon', role:'img', 'aria-label':look.text}, icon(look.icon)),
    el('span', {class:'weather-temp'}, temperature(forecast.current.temp)),
    el('div', {class:'weather-summary'}, el('strong', {class:'weather-place'}, place.name), el('span', {class:'weather-text muted'}, look.text)));
}
/** Loads the forecast for the card or the screen and keeps it fresh while they are visible. */
function loader(ctx, paint) {
  let disposed = false, loading = false;
  async function load(force = false) {
    const place = ctx.latest().data.place;
    if (!place || loading) return;
    const cached = cachedForecast(place);
    paint({place, forecast:cached?.forecast ?? null, loading:!cached?.fresh || force});
    if (cached?.fresh && !force) return;
    loading = true;
    try {
      const forecast = await fetchForecast(place, {force});
      const chosen = ctx.latest().data.place;
      if (!disposed && chosen && placeKey(chosen) === placeKey(place)) paint({place, forecast});
    } catch (problem) {
      if (!disposed) paint({place, forecast:cached?.forecast ?? null, error:failure(problem)});
    } finally { loading = false; }
  }
  const interval = setInterval(() => { if (document.visibilityState === 'visible') load(); }, FRESH_FOR / 3);
  const visible = () => { if (document.visibilityState === 'visible') load(); };
  document.addEventListener('visibilitychange', visible);
  return {load, dispose() { disposed = true;clearInterval(interval);document.removeEventListener('visibilitychange', visible); }};
}

export const weather = {
  type:'weather', version:1, title:'Погода',
  description:'Погода в вашем городе: сейчас и на ближайшие дни.',
  icon:'partly', size:{w:290,h:250},
  createData:() => ({place:null}),
  validate:isWeather,
  renderCard(ctx) {
    const element = el('div', {class:'weather-card'});
    if (!ctx.node.data.place) {
      element.append(el('button', {type:'button', class:'weather-empty', onClick:ctx.open}, icon('pin'), el('span', {}, 'Выбрать город')));
      return {element};
    }
    const data = loader(ctx, ({place, forecast, error}) => {
      if (!forecast) {
        element.replaceChildren(el('strong', {class:'weather-place'}, place.name),
          el('p', {class:'muted weather-note', role:'status'}, error || 'Загружаем погоду…'),
          error ? el('button', {type:'button', class:'text-button', onClick:() => data.load(true)}, 'Повторить') : null);
        return;
      }
      const feels = forecast.current.feels === null ? '' : 'Ощущается как ' + temperature(forecast.current.feels);
      element.replaceChildren(nowBlock(place, forecast),
        el('p', {class:'muted weather-note', role:'status'}, error ? 'Не обновилось: ' + error : feels),
        el('ul', {class:'weather-days'}, forecast.days.slice(1, 5).map(day => dayItem(day, forecast.today))));
    });
    data.load();
    return {element, dispose:data.dispose};
  },
  renderScreen(ctx) {
    const body = el('div', {class:'weather-body'});
    const results = el('ul', {class:'weather-results'});
    const status = el('p', {class:'muted weather-search-status', role:'status'});
    const input = el('input', {type:'search', maxlength:80, placeholder:'Найти город', 'aria-label':'Найти город', autocomplete:'off', enterkeyhint:'search'});
    let searching = null;
    const data = loader(ctx, ({place, forecast, loading, error}) => {
      if (!forecast) {
        body.replaceChildren(el('h2', {class:'weather-place'}, place.name), el('p', {class:'muted', role:'status'}, error || 'Загружаем погоду…'),
          error ? el('button', {type:'button', class:'button', onClick:() => data.load(true)}, 'Повторить') : null);
        return;
      }
      const now = forecast.current;
      const facts = [now.feels === null ? null : ['Ощущается', temperature(now.feels)],
        now.wind === null ? null : ['Ветер', Math.round(now.wind) + ' м/с'],
        now.humidity === null ? null : ['Влажность', Math.round(now.humidity) + '%']].filter(Boolean);
      body.replaceChildren(nowBlock(place, forecast),
        place.region ? el('p', {class:'muted weather-region'}, place.region) : null,
        el('dl', {class:'weather-facts'}, facts.map(([name, value]) => el('div', {}, el('dt', {class:'muted'}, name), el('dd', {}, value)))),
        el('h2', {}, 'На неделю'),
        el('ul', {class:'weather-days weather-days-list'}, forecast.days.map(day => dayItem(day, forecast.today))),
        el('p', {class:'muted weather-note', role:'status'}, error ? 'Не обновилось: ' + error : loading ? 'Обновляем…' : ''),
        el('button', {type:'button', class:'text-button', onClick:() => data.load(true)}, 'Обновить'));
    });
    function choose(place) {
      ctx.update({...ctx.latest().data, place}, {render:false});
      input.value = '';results.replaceChildren();status.textContent = '';
      data.load();
    }
    async function search() {
      searching?.abort();
      const query = input.value.trim();
      results.replaceChildren();
      if (query.length < 2) { status.textContent = query ? 'Введите хотя бы две буквы.' : '';return; }
      const controller = searching = new AbortController();
      status.textContent = 'Ищем…';
      try {
        const places = await searchPlaces(query, {signal:controller.signal});
        if (controller.signal.aborted) return;
        status.textContent = places.length ? '' : 'Ничего не нашли. Попробуйте написать название иначе.';
        results.replaceChildren(...places.map(place => el('li', {}, el('button', {type:'button', class:'weather-result', onClick:() => choose(place)},
          icon('pin'), el('span', {}, el('strong', {}, place.name), place.region ? el('small', {class:'muted'}, place.region) : null)))));
      } catch (problem) {
        if (!controller.signal.aborted) status.textContent = failure(problem);
      }
    }
    let debounce;
    input.addEventListener('input', () => { clearTimeout(debounce);debounce = setTimeout(search, 350); });
    const form = el('form', {class:'weather-search', role:'search', onSubmit:event => { event.preventDefault();clearTimeout(debounce);search(); }},
      icon('search'), input);
    if (!ctx.node.data.place) body.append(el('p', {class:'muted'}, 'Найдите свой город, и на карточке появится погода.'));
    const root = el('div', {class:'weather-layout'}, form, status, results, body,
      el('p', {class:'muted weather-credit'}, 'Данные о погоде: ', el('a', {href:'https://open-meteo.com/', target:'_blank', rel:'noopener noreferrer'}, 'Open-Meteo')));
    data.load();
    return {element:root, dispose:() => { clearTimeout(debounce);searching?.abort();data.dispose(); }};
  },
};
