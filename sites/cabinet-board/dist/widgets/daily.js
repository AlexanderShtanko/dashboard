import {el, action} from '../core/dom.js';
import {icon} from '../core/icons.js';
import {localDate, isCalendarDate} from '../core/calendar.js';
import {maxActions, maxActionLength, validateDaily, recentDays, monthDays, setDayDone} from './daily-data.js';

const dateFormat = new Intl.DateTimeFormat('ru', {day:'numeric', month:'long', year:'numeric', timeZone:'UTC'});
const monthFormat = new Intl.DateTimeFormat('ru', {month:'long', year:'numeric', timeZone:'UTC'});
const weekdayFormat = new Intl.DateTimeFormat('ru', {weekday:'short', timeZone:'UTC'});
const dayDate = day => new Date(day + 'T12:00:00Z');
const longDate = day => dateFormat.format(dayDate(day));
const weekday = day => weekdayFormat.format(dayDate(day));

function watchLocalDay(onChange) {
  let day = localDate();
  let timer;
  function check() {
    clearTimeout(timer);
    const now = new Date();
    const next = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1, 0, 0, 1);
    timer = setTimeout(check, next - now);
    const current = localDate(now);
    if (current === day) return;
    const previous = day;
    day = current;
    onChange(previous);
  }
  check();
  window.addEventListener('focus', check);
  document.addEventListener('visibilitychange', check);
  return () => {
    clearTimeout(timer);
    window.removeEventListener('focus', check);
    document.removeEventListener('visibilitychange', check);
  };
}

export const daily = {
  type:'daily',
  version:1,
  title:'Ежедневные действия',
  description:'Отмечай ежедневные действия и смотри историю за любой период.',
  icon:'daily',
  tone:'sage',
  size:{w:350,h:280},
  minSize:{w:250,h:185},
  createData:()=>({actions:[]}),
  validate:validateDaily,
  renderCard(ctx) {
    const element = el('div', {class:'daily-preview'});
    function render() {
      const {actions} = ctx.latest().data;
      const days = recentDays();
      const today = days.at(-1);
      const done = actions.filter(item => item.completed.includes(today)).length;
      const open = action(actions.length ? 'Отметить' : 'Добавить действие', ctx.open, 'text-button');
      element.replaceChildren(el('div', {class:'daily-card-top'},
        el('span', {class:'muted'}, actions.length ? `Сегодня ${done} из ${actions.length}` : 'Пока нет действий'),
        open));
      if (!actions.length) return;
      const grid = el('div', {class:'daily-grid', role:'group', 'aria-label':'Выполнение за последние семь дней'},
        el('div', {class:'daily-grid-row daily-grid-days', 'aria-hidden':'true'}, el('span', {}, '7 дней'),
          days.map(day => el('span', {class:day === today ? 'daily-is-today' : ''}, weekday(day)))));
      for (const item of actions) {
        const completed = new Set(item.completed);
        grid.append(el('div', {class:'daily-grid-row'},
          el('span', {class:'daily-grid-name', title:item.name}, item.name),
          days.map(day => {
            const done = completed.has(day);
            const description = `${longDate(day)} — ${done ? 'выполнено' : 'не отмечено'}`;
            return el('span', {class:'daily-square' + (done ? ' daily-square-done' : ''),
              role:'img', 'aria-label':description, title:description});
          })));
      }
      element.append(grid);
    }
    render();
    return {element, dispose:watchLocalDay(render)};
  },
  renderScreen(ctx) {
    const root = el('div', {class:'daily-screen'});
    const tracking = el('section', {class:'daily-tracking', 'aria-label':'Отметки выполнения'});
    const input = el('input', {placeholder:'Например, прогулка', maxlength:maxActionLength, required:true, 'aria-label':'Новое действие'});
    const add = el('button', {class:'button primary', type:'submit'}, 'Добавить');
    const limit = el('p', {class:'muted', hidden:true}, `В одном виджете может быть до ${maxActions} действий.`);
    const form = el('form', {class:'inline-form daily-form', onSubmit:event => {
      event.preventDefault();
      const name = input.value.trim();
      const {actions} = ctx.latest().data;
      if (!name || actions.length >= maxActions) return;
      ctx.update({actions:[...actions,{id:crypto.randomUUID(),name,completed:[]}]});
      input.value = '';
      render();
      if (!form.hidden) input.focus();
    }}, input, add);
    root.append(form, limit, tracking);
    let day = localDate();
    let allTime = false;
    let month = day.slice(0, 7);
    const history = el('section', {class:'daily-history', 'aria-label':'История за всё время'});

    function chooseDay(date) {
      if (!isCalendarDate(date) || date > localDate()) return;
      day = date;
      month = day.slice(0, 7);
      render();
    }

    function renderHistory() {
      history.hidden = !allTime;
      if (!allTime) { history.replaceChildren();return; }
      const today = localDate();
      const {actions} = ctx.latest().data;
      const allDates = actions.flatMap(item => item.completed.filter(date => date <= today));
      const totals = el('ul', {class:'daily-totals'}, actions.map(item =>
        el('li', {}, el('span', {}, item.name), el('strong', {}, String(item.completed.filter(date => date <= today).length)))));
      const monthInput = el('input', {type:'month', min:'1000-01', max:today.slice(0, 7), value:month,
        'aria-label':'Месяц истории', onChange:event=>{
          const value = event.target.value;
          if (!monthDays(value).length || value > today.slice(0, 7)) { event.target.value=month;return; }
          month=value;renderHistory();
        }});
      function changeMonth(offset) {
        const date = dayDate(month + '-01');
        date.setUTCMonth(date.getUTCMonth() + offset);
        const value = date.toISOString().slice(0, 7);
        if (value < '1000-01' || value > today.slice(0, 7)) return;
        month=value;renderHistory();
      }
      const previous = el('button', {type:'button', class:'icon-button', 'aria-label':'Предыдущий месяц',
        disabled:month === '1000-01', onClick:()=>changeMonth(-1)}, '←');
      const next = el('button', {type:'button', class:'icon-button', 'aria-label':'Следующий месяц',
        disabled:month >= today.slice(0, 7), onClick:()=>changeMonth(1)}, '→');
      const days = monthDays(month);
      const counts = new Map();
      for (const date of allDates) counts.set(date, (counts.get(date) || 0) + 1);
      const calendar = el('div', {class:'daily-calendar', role:'group',
        'aria-label':'Календарь за '+monthFormat.format(dayDate(month+'-01'))});
      for (const label of ['пн','вт','ср','чт','пт','сб','вс']) calendar.append(el('span', {class:'daily-calendar-weekday', 'aria-hidden':'true'}, label));
      for (const date of days) {
        const count = counts.get(date) || 0;
        const future = date > today;
        const button = el('button', {type:'button',
          class:'daily-calendar-day' + (count === actions.length ? ' daily-calendar-full' : count ? ' daily-calendar-partial' : ''),
          disabled:future, 'aria-label':longDate(date)+(future ? '' : ` — ${count} из ${actions.length} выполнено`),
          'aria-pressed':String(day === date), 'aria-current':date === today ? 'date' : null,
          onClick:()=>chooseDay(date)}, el('strong', {}, String(Number(date.slice(-2)))),
          el('small', {}, future ? '·' : `${count}/${actions.length}`));
        if (date.endsWith('-01')) button.style.gridColumnStart = (dayDate(date).getUTCDay() + 6) % 7 + 1;
        calendar.append(button);
      }
      const first = allDates.length ? allDates.reduce((earliest,date)=>date < earliest ? date : earliest) : null;
      history.replaceChildren(
        el('p', {class:'muted'}, first ? 'Отметки с '+longDate(first)+'. Всего выполнений: '+allDates.length+'.' : 'Пока нет отметок. Выбери день в календаре.'),
        totals,
        el('div', {class:'daily-month-controls'}, previous, monthInput, next),
        calendar);
    }

    function render(focusDay = false) {
      const {actions} = ctx.latest().data;
      form.hidden = actions.length >= maxActions;
      limit.hidden = !form.hidden;
      tracking.hidden = !actions.length;
      if (!actions.length) {
        tracking.replaceChildren();
        return;
      }
      const today = localDate();
      if (day > today) day = today;
      const days = recentDays(new Date(day + 'T12:00:00'));
      const dateInput = el('input', {type:'date', min:'1000-01-01', max:today, value:day,
        'aria-label':'Дата выполнения', onChange:event=>{
          if (!isCalendarDate(event.target.value) || event.target.value > localDate()) { event.target.value=day;return; }
          chooseDay(event.target.value);
        }});
      const dateControls = el('div', {class:'daily-date-controls'},
        el('label', {class:'field'}, el('span', {}, 'Дата выполнения'), dateInput),
        action('Сегодня', ()=>chooseDay(localDate()), 'text-button'));
      const views = el('div', {class:'view-switch daily-views', role:'group', 'aria-label':'Период истории'},
        el('button', {type:'button', 'aria-pressed':String(!allTime), onClick:()=>{allTime=false;render();}}, '7 дней'),
        el('button', {type:'button', 'aria-pressed':String(allTime), onClick:()=>{allTime=true;render();}}, 'За всё время'));
      let selectedButton;
      const week = el('div', {class:'daily-week', hidden:allTime, role:'group', 'aria-label':'Выбрать день'},
        days.map(date => {
          const button = el('button', {class:'daily-day', type:'button', 'aria-pressed':String(day === date),
            'aria-current':date === today ? 'date' : null, 'aria-label':date === today ? 'Сегодня, '+longDate(date) : longDate(date),
            onClick:()=>{day=date;month=day.slice(0,7);render(true);}},
          el('span', {}, weekday(date)), el('strong', {}, String(Number(date.slice(-2)))));
          if (day === date) selectedButton = button;
          return button;
        }));
      const summary = el('p', {class:'muted daily-summary', 'aria-live':'polite'});
      function updateSummary() {
        const {actions} = ctx.latest().data;
        const done = actions.filter(item => item.completed.includes(day)).length;
        summary.textContent = `${day === today ? 'Сегодня' : longDate(day)} · ${done} из ${actions.length} выполнено`;
      }
      const rows = el('ul', {class:'daily-list'}, actions.map(item => {
        const date = day;
        const checkbox = el('input', {type:'checkbox', checked:item.completed.includes(date), onChange:event=>{
          ctx.update({actions:setDayDone(ctx.latest().data.actions,item.id,date,event.target.checked)});
          updateSummary();
          renderHistory();
        }});
        const remove = el('button', {class:'icon-button danger', type:'button', 'aria-label':'Удалить действие: '+item.name,
          onClick:()=>{
            if (!window.confirm(`Удалить «${item.name}» вместе с отметками?`)) return;
            ctx.update({actions:ctx.latest().data.actions.filter(action=>action.id!==item.id)});
            render();
            input.focus();
          }}, icon('close'));
        return el('li', {class:'daily-item'}, el('label', {class:'task-row'}, checkbox, el('span', {}, item.name)), remove);
      }));
      updateSummary();
      renderHistory();
      tracking.replaceChildren(dateControls, views, week, summary, rows, history);
      if (focusDay) selectedButton.focus({preventScroll:true});
    }
    render();
    return {element:root, dispose:watchLocalDay(previous => {
      if (day === previous) day = localDate();
      render();
    })};
  },
};
