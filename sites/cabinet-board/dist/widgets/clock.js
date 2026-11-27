import {el} from '../core/dom.js';
import {icon} from '../core/icons.js';
import {CITIES, MAX_ZONES, isClock, findZone, addZone, removeZone, zoneLabel, timeText, dateText, differenceText} from './clock-data.js';

// A clock: the device's time and date, plus the time in other cities.
// Everything is computed in the browser (Intl), nothing is requested from the network.
const localZone = () => Intl.DateTimeFormat().resolvedOptions().timeZone;

/** The big time, the date and the rows of other cities; `tick()` refreshes the text in place. */
function face(ctx, {screen = false} = {}) {
  const time = el('div', {class:'clock-time', role:'timer', 'aria-label':'Текущее время'});
  const date = el('div', {class:'clock-date muted'});
  const zones = el('ul', {class:'clock-zones'});
  let key = null, rows = [];
  function tick() {
    const data = ctx.latest().data, now = new Date(), local = localZone();
    const text = timeText(now, local, data.seconds);
    if (time.textContent !== text) time.textContent = text;
    time.classList.toggle('has-seconds', data.seconds);
    const day = dateText(now, local) + (screen ? ' · ' + zoneLabel(local) : '');
    if (date.textContent !== day) date.textContent = day;
    const nextKey = data.zones.map(zone => zone.tz + '|' + zone.label).join(';');
    if (nextKey !== key) {
      key = nextKey;
      rows = data.zones.map(zone => {
        const value = el('span', {class:'clock-zone-time'}), diff = el('span', {class:'clock-zone-diff muted'});
        const remove = screen ? el('button', {type:'button', class:'icon-button', 'aria-label':'Убрать город: ' + zone.label, title:'Убрать',
          onClick:() => ctx.update(removeZone(ctx.latest().data, zone.tz), {render:false})}, icon('close')) : null;
        return {zone, value, diff, element:el('li', {class:'clock-zone'}, el('span', {class:'clock-zone-name'}, zone.label), diff, value, remove)};
      });
      zones.replaceChildren(...rows.map(row => row.element));
      zones.hidden = !rows.length;
    }
    for (const row of rows) {
      const value = timeText(now, row.zone.tz), diff = differenceText(now, row.zone.tz, local);
      if (row.value.textContent !== value) row.value.textContent = value;
      if (row.diff.textContent !== diff) row.diff.textContent = diff;
    }
  }
  tick();
  return {time, date, zones, tick};
}

export const clock = {
  type:'clock', version:1, title:'Время',
  description:'Часы и дата, а рядом — время в других городах.',
  icon:'clock', size:{w:290,h:210},
  createData:() => ({seconds:false, zones:[]}),
  validate:isClock,
  renderCard(ctx) {
    const parts = face(ctx);
    const element = el('div', {class:'clock-card card-scroll'}, parts.time, parts.date, parts.zones);
    const interval = setInterval(parts.tick, 1000);
    return {element, dispose:() => clearInterval(interval)};
  },
  renderScreen(ctx) {
    const parts = face(ctx, {screen:true});
    const error = el('p', {class:'form-error', role:'alert', hidden:true});
    const listId = 'clock-cities-' + ctx.node.id;
    const input = el('input', {type:'text', list:listId, maxlength:64, placeholder:'Город, например Токио', 'aria-label':'Город или часовой пояс', autocomplete:'off'});
    const options = el('datalist', {id:listId}, CITIES.map(([, label]) => el('option', {value:label})));
    const add = el('button', {type:'submit', class:'button'}, icon('plus'), 'Добавить');
    const hint = el('p', {class:'muted clock-hint'});
    const seconds = el('input', {type:'checkbox', class:'task-check', checked:ctx.node.data.seconds,
      onChange:() => {ctx.update({...ctx.latest().data, seconds:seconds.checked}, {render:false});parts.tick();}});
    function paint() {
      const count = ctx.latest().data.zones.length;
      input.disabled = add.disabled = count >= MAX_ZONES;
      hint.textContent = count >= MAX_ZONES ? `На карточке помещается до ${MAX_ZONES} городов.` : count ? '' : 'Добавьте города, чтобы видеть, который там час.';
      hint.hidden = !hint.textContent;
      parts.tick();
    }
    const form = el('form', {class:'clock-add', onSubmit:event => {
      event.preventDefault();error.hidden = true;
      try {
        const zone = findZone(input.value);
        if (!zone) throw new Error('Не нашли такой город. Выберите его из списка.');
        ctx.update(addZone(ctx.latest().data, zone), {render:false});
        input.value = '';paint();
      } catch (problem) { error.textContent = problem.message;error.hidden = false; }
    }}, input, options, add);
    parts.zones.addEventListener('click', () => setTimeout(paint));
    const root = el('div', {class:'clock-layout'},
      el('div', {class:'clock-face'}, parts.time, parts.date),
      el('section', {class:'clock-section'}, el('h2', {}, 'Другие города'), parts.zones, hint, form, error),
      el('label', {class:'clock-option'}, seconds, el('span', {}, 'Показывать секунды')));
    paint();
    const interval = setInterval(parts.tick, 250);
    return {element:root, dispose:() => clearInterval(interval)};
  },
};
