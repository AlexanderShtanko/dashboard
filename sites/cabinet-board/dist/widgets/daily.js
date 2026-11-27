import {el} from '../core/dom.js';
import {icon} from '../core/icons.js';
import {localDate} from '../core/calendar.js';
import {addRow,moreButton,contextMenu,openDialog,field,sortable,coarsePointer} from '../core/ui.js';
import {maxActions, maxActionLength, validateDaily, recentDays, monthDays, setDayDone, streak, weekEnding, shiftDay} from './daily-data.js';

// Habit tracker: a row per action, a square per day. Squares are tappable right on the card;
// the screen adds week navigation, streaks and the full history. Data format v1 is unchanged.

const dateFormat = new Intl.DateTimeFormat('ru', {day:'numeric', month:'long', year:'numeric', timeZone:'UTC'});
const shortFormat = new Intl.DateTimeFormat('ru', {day:'numeric', month:'short', timeZone:'UTC'});
const monthFormat = new Intl.DateTimeFormat('ru', {month:'long', year:'numeric', timeZone:'UTC'});
const weekdayFormat = new Intl.DateTimeFormat('ru', {weekday:'short', timeZone:'UTC'});
const dayDate = day => new Date(day + 'T12:00:00Z');
const longDate = day => dateFormat.format(dayDate(day));
const weekday = day => weekdayFormat.format(dayDate(day));
const capitalize = text => text.charAt(0).toLocaleUpperCase('ru') + text.slice(1);
const days = count => {
  const mod10 = count % 10, mod100 = count % 100;
  return count + ' ' + (mod10 === 1 && mod100 !== 11 ? 'день' : mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14) ? 'дня' : 'дней');
};

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

/** Shared editing logic for the card and the screen. */
function habits(ctx, render) {
  const actions = () => ctx.latest().data.actions;
  function save(next, message, undo) {
    ctx.update({...ctx.latest().data, actions:next}, {render:false, silent:true});
    render();
    if (message) ctx.feedback?.(message, undo ? {label:'Отменить', run:undo} : undefined);
  }
  function add(name) {
    if (actions().length >= maxActions) { ctx.feedback?.(`В одном виджете может быть до ${maxActions} действий.`); return false; }
    save([...actions(), {id:crypto.randomUUID(), name:name.slice(0, maxActionLength), completed:[]}]);
    return true;
  }
  function toggle(item, day) {
    const done = !actions().find(action => action.id === item.id)?.completed.includes(day);
    save(setDayDone(actions(), item.id, day, done));
  }
  function rename(item) {
    const input = el('input', {value:item.name, maxlength:maxActionLength, required:true, autocomplete:'off'});
    openDialog({title:'Переименовать действие', body:[field('Название', input)], submitLabel:'Сохранить',
      onSubmit:() => {
        const name = input.value.trim();
        if (!name) return 'Введите название.';
        save(actions().map(action => action.id === item.id ? {...action, name} : action));
      }});
    input.select();
  }
  function remove(item) {
    const list = actions(), index = list.findIndex(action => action.id === item.id);
    if (index < 0) return;
    save(list.filter(action => action.id !== item.id), `«${item.name}» удалено вместе с отметками.`, () => {
      const current = actions();
      if (current.some(action => action.id === item.id) || current.length >= maxActions) return;
      const next = current.slice();next.splice(Math.min(index, next.length), 0, list[index]);save(next);
    });
  }
  function move(from, to) {
    const list = actions();
    if (to < 0 || to >= list.length) return;
    const next = list.slice();const [item] = next.splice(from, 1);next.splice(to, 0, item);save(next);
  }
  function menu(item, index, screen) {
    const count = actions().length;
    return {title:item.name, items:[
      {label:'Переименовать', icon:'edit', run:() => rename(item)},
      (screen || coarsePointer()) && index > 0 ? {label:'Выше', icon:'arrow-up', run:() => move(index, index - 1)} : null,
      (screen || coarsePointer()) && index < count - 1 ? {label:'Ниже', icon:'arrow-down', run:() => move(index, index + 1)} : null,
      {label:'Удалить', icon:'trash', danger:true, run:() => remove(item)},
    ]};
  }
  return {actions, save, add, toggle, menu};
}

/** Rows of actions × days. Each square is a toggle button. */
function grid(api, week, {screen = false, selected = null} = {}) {
  const today = localDate();
  const table = el('div', {class:'habit-grid' + (screen ? ' habit-grid-large' : ''), role:'grid', 'aria-label':'Отметки по дням'});
  table.style.setProperty('--days', week.length);
  table.append(el('div', {class:'habit-row habit-head', role:'row'},
    el('span', {class:'habit-name', role:'columnheader'}, screen ? 'Действие' : ''),
    week.map(day => el('span', {role:'columnheader', class:'habit-day-label' + (day === today ? ' is-today' : '') + (day === selected ? ' is-selected' : ''),
      title:longDate(day)}, el('small', {}, weekday(day)), screen ? el('strong', {}, String(Number(day.slice(-2)))) : null)),
    screen ? el('span', {class:'habit-streak', role:'columnheader'}, 'Серия') : null,
    el('span', {class:'habit-more-cell', 'aria-hidden':'true'})));
  const body = el('div', {class:'habit-body', 'data-no-card-drag':true});
  api.actions().forEach((item, index) => {
    const completed = new Set(item.completed);
    const more = moreButton('Действия: ' + item.name, () => api.menu(item, index, screen));
    const row = el('div', {class:'habit-row', role:'row', 'data-index':index},
      el('span', {class:'habit-name', role:'rowheader', title:item.name}, item.name),
      week.map(day => {
        const done = completed.has(day);
        return el('button', {type:'button', role:'gridcell', 'data-no-sort':true,
          class:'habit-cell' + (done ? ' is-done' : '') + (day === today ? ' is-today' : ''),
          'aria-pressed':String(done), 'aria-label':`${item.name}, ${day === today ? 'сегодня' : longDate(day)}: ${done ? 'выполнено' : 'не отмечено'}`,
          title:`${longDate(day)} — ${done ? 'выполнено' : 'не отмечено'}`,
          onClick:() => api.toggle(item, day)}, icon('check'));
      }),
      screen ? el('span', {class:'habit-streak', title:'Дней подряд'}, streak(item.completed, today) ? days(streak(item.completed, today)) : '—') : null,
      el('span', {class:'habit-more-cell'}, more));
    contextMenu(row, more, () => api.menu(item, index, screen));
    body.append(row);
  });
  table.append(body);
  return {element:table, body};
}

function historyView(api, chooseDay) {
  const root = el('section', {class:'daily-history', 'aria-label':'История за всё время'});
  let month = localDate().slice(0, 7);
  function render() {
    const today = localDate();
    const actions = api.actions();
    const allDates = actions.flatMap(item => item.completed.filter(date => date <= today));
    const totals = el('ul', {class:'daily-totals'}, actions.map(item => {
      const count = item.completed.filter(date => date <= today).length;
      return el('li', {}, el('span', {}, item.name), el('span', {class:'muted'}, streak(item.completed, today) ? 'серия ' + days(streak(item.completed, today)) : ''), el('strong', {}, String(count)));
    }));
    const changeMonth = offset => {
      const date = dayDate(month + '-01');
      date.setUTCMonth(date.getUTCMonth() + offset);
      const value = date.toISOString().slice(0, 7);
      if (value < '1000-01' || value > today.slice(0, 7)) return;
      month = value;render();
    };
    const counts = new Map();
    for (const date of allDates) counts.set(date, (counts.get(date) || 0) + 1);
    const calendar = el('div', {class:'daily-calendar', role:'group', 'aria-label':'Календарь за ' + monthFormat.format(dayDate(month + '-01'))});
    for (const label of ['пн','вт','ср','чт','пт','сб','вс']) calendar.append(el('span', {class:'daily-calendar-weekday', 'aria-hidden':'true'}, label));
    for (const date of monthDays(month)) {
      const count = counts.get(date) || 0, future = date > today;
      const button = el('button', {type:'button',
        class:'daily-calendar-day' + (actions.length && count === actions.length ? ' daily-calendar-full' : count ? ' daily-calendar-partial' : ''),
        disabled:future, 'aria-label':longDate(date) + (future ? '' : ` — ${count} из ${actions.length} выполнено. Открыть неделю`),
        'aria-current':date === today ? 'date' : null, title:future ? '' : 'Открыть эту неделю',
        onClick:() => chooseDay(date)}, el('strong', {}, String(Number(date.slice(-2)))),
        el('small', {}, future ? '·' : `${count}/${actions.length}`));
      if (date.endsWith('-01')) button.style.gridColumnStart = (dayDate(date).getUTCDay() + 6) % 7 + 1;
      calendar.append(button);
    }
    const first = allDates.length ? allDates.reduce((earliest, date) => date < earliest ? date : earliest) : null;
    root.replaceChildren(...[
      el('p', {class:'muted'}, first ? `Отметки с ${longDate(first)} · всего выполнений: ${allDates.length}` : 'Пока нет отметок.'),
      actions.length ? totals : null,
      el('div', {class:'daily-month-controls'},
        el('button', {type:'button', class:'icon-button', 'aria-label':'Предыдущий месяц', disabled:month <= '1000-01', onClick:() => changeMonth(-1)}, icon('chevron-left')),
        el('strong', {class:'daily-month-label'}, capitalize(monthFormat.format(dayDate(month + '-01')).replace(/\s*г\.$/, ''))),
        el('button', {type:'button', class:'icon-button', 'aria-label':'Следующий месяц', disabled:month >= today.slice(0, 7), onClick:() => changeMonth(1)}, icon('chevron-right'))),
      calendar,
      el('p', {class:'muted'}, 'Нажмите на день, чтобы открыть его неделю и поправить отметки.')].filter(Boolean));
  }
  render();
  return {element:root, render};
}

export const daily = {
  type:'daily',
  version:1,
  title:'Ежедневные действия',
  description:'Привычки по дням: отмечайте прямо на карточке, серия и история — на отдельном экране.',
  icon:'daily',
  tone:'sage',
  size:{w:350,h:280},
  minSize:{w:250,h:185},
  createData:()=>({actions:[]}),
  validate:validateDaily,
  renderCard(ctx) {
    const element = el('div', {class:'daily-card'});
    const api = habits(ctx, () => render());
    const add = addRow({label:'Добавить действие', placeholder:'Например, прогулка', maxlength:maxActionLength, className:'daily-add',
      onAdd:name => {if (api.add(name)) add.show();}});
    function render() {
      const actions = api.actions();
      const week = recentDays();
      const today = week.at(-1);
      const done = actions.filter(item => item.completed.includes(today)).length;
      const keepAdd = add.isOpen() && element.contains(document.activeElement);
      element.replaceChildren(...[
        actions.length ? el('p', {class:'muted daily-today'}, `Сегодня ${done} из ${actions.length}`) : el('p', {class:'muted daily-today'}, 'Отмечайте, что сделали за день.'),
        actions.length ? grid(api, week).element : null,
        actions.length < maxActions ? add.element : null].filter(Boolean));
      if (keepAdd) add.focus();
    }
    render();
    return {element, dispose:watchLocalDay(render)};
  },
  renderScreen(ctx) {
    const root = el('div', {class:'daily-screen'});
    let end = localDate(), selected = null, tab = 'week', cleanup = null;
    const api = habits(ctx, () => render());
    const history = historyView(api, date => {
      const today = localDate();
      end = shiftDay(date, 3) > today ? today : shiftDay(date, 3);
      selected = date;tab = 'week';render();
    });
    const add = addRow({label:'Добавить действие', placeholder:'Например, прогулка', maxlength:maxActionLength, className:'daily-add',
      onAdd:name => {if (api.add(name)) add.show();}});
    function render() {
      cleanup?.();cleanup = null;
      const today = localDate();
      if (end > today) end = today;
      const actions = api.actions();
      const tabs = el('div', {class:'view-switch daily-views', role:'group', 'aria-label':'Вид'},
        el('button', {type:'button', 'aria-pressed':String(tab === 'week'), onClick:() => {tab = 'week';render();}}, 'Неделя'),
        el('button', {type:'button', 'aria-pressed':String(tab === 'history'), onClick:() => {tab = 'history';selected = null;render();}}, 'История'));
      const done = actions.filter(item => item.completed.includes(today)).length;
      const head = el('div', {class:'daily-head'}, tabs,
        actions.length ? el('p', {class:'muted', 'aria-live':'polite'}, `Сегодня ${done} из ${actions.length} выполнено`) : null);
      if (tab === 'history') {
        history.render();
        root.replaceChildren(head, history.element);
        return;
      }
      const week = weekEnding(end);
      const keepAdd = add.isOpen() && root.contains(document.activeElement);
      const nav = el('div', {class:'daily-week-nav'},
        el('button', {type:'button', class:'icon-button', 'aria-label':'Предыдущая неделя', onClick:() => {end = shiftDay(end, -7);selected = null;render();}}, icon('chevron-left')),
        el('strong', {class:'daily-range'}, `${shortFormat.format(dayDate(week[0]))} — ${shortFormat.format(dayDate(week[6]))}`),
        el('button', {type:'button', class:'icon-button', 'aria-label':'Следующая неделя', disabled:end >= today, onClick:() => {end = shiftDay(end, 7);selected = null;render();}}, icon('chevron-right')),
        end < today ? el('button', {type:'button', class:'button daily-today-button', onClick:() => {end = today;selected = null;render();}}, 'Сегодня') : null);
      const table = actions.length ? grid(api, week, {screen:true, selected}) : null;
      if (table) cleanup = sortable(table.body, {onDrop:order => api.save(order.map(i => api.actions()[i])), onCancel:render}).dispose;
      root.replaceChildren(...[head, nav,
        table ? table.element : el('p', {class:'muted daily-empty'}, 'Добавьте действие, которое хотите делать каждый день: прогулка, чтение, вода.'),
        actions.length < maxActions ? add.element : el('p', {class:'muted'}, `В одном виджете может быть до ${maxActions} действий.`),
        actions.length ? el('p', {class:'muted daily-help'}, coarsePointer() ? 'Нажмите на кружок, чтобы отметить день. Удержите строку или нажмите ⋯, чтобы изменить её или поменять порядок.' : 'Нажмите на квадрат, чтобы отметить день. Перетащите строку мышью, чтобы поменять порядок.') : null].filter(Boolean));
      if (keepAdd) add.focus();
    }
    render();
    const stopWatch = watchLocalDay(previous => {if (end === previous) end = localDate();render();});
    return {element:root, dispose:() => {stopWatch();cleanup?.();}};
  },
};
