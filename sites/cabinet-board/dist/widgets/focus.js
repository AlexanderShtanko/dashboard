import {el} from '../core/dom.js';
import {icon} from '../core/icons.js';
import {focusState,startFocus,pauseFocus,resetFocus,addMinutes,setLength,clock,PRESETS} from './focus-data.js';

// A focus timer you can run straight from the card. The end of a session is shown on the card
// and announced with a soft chime in the visible tab. Data format v1: {task,minutes,remaining,endsAt}.
// Finishing writes nothing: a past endsAt already means "done", so many open tabs never race.

function chime() {
  if (document.visibilityState !== 'visible') return;
  try {
    const audio = new (globalThis.AudioContext || globalThis.webkitAudioContext)();
    const notes = [[660, 0], [880, .18], [990, .36]];
    for (const [frequency, at] of notes) {
      const osc = audio.createOscillator(), gain = audio.createGain();
      osc.type = 'sine';osc.frequency.value = frequency;
      gain.gain.setValueAtTime(0.0001, audio.currentTime + at);
      gain.gain.exponentialRampToValueAtTime(0.18, audio.currentTime + at + .02);
      gain.gain.exponentialRampToValueAtTime(0.0001, audio.currentTime + at + .9);
      osc.connect(gain).connect(audio.destination);
      osc.start(audio.currentTime + at);osc.stop(audio.currentTime + at + 1);
    }
    setTimeout(() => audio.close(), 2000);
  } catch {}
}

function controls(ctx, paint, {large = false} = {}) {
  const save = data => {ctx.update(data, {render:false, silent:true});paint();};
  const main = el('button', {type:'button', class:'focus-main' + (large ? ' button primary' : ''), 'data-no-card-drag':true,
    onClick:() => {
      const data = ctx.latest().data, state = focusState(data);
      save(state.running ? pauseFocus(data) : startFocus(data));
    }});
  const reset = el('button', {type:'button', class:'focus-reset' + (large ? ' button' : ''), 'data-no-card-drag':true,
    onClick:() => save(resetFocus(ctx.latest().data))});
  const plus = el('button', {type:'button', class:'focus-plus' + (large ? ' button' : ''), 'data-no-card-drag':true,
    onClick:() => save(addMinutes(ctx.latest().data, 5))}, '+5 мин');
  function update(state) {
    const label = state.running ? 'Пауза' : state.finished ? 'Ещё раз' : state.started ? 'Продолжить' : 'Начать';
    if (main.dataset.label !== label) {
      main.dataset.label = label;
      main.replaceChildren(icon(state.running ? 'pause' : state.finished ? 'reset' : 'play'), large ? label : '');
      main.setAttribute('aria-label', label + (state.running ? ' таймер' : ' фокус-сессию'));
      main.title = label;
    }
    const resettable = state.started || state.finished;
    reset.hidden = !resettable;
    reset.replaceChildren(icon('reset'), large ? 'Сбросить' : '');
    reset.setAttribute('aria-label', 'Сбросить таймер');reset.title = 'Сбросить';
    plus.hidden = !state.running && !(large && state.started);
  }
  return {main, reset, plus, update};
}

export const focus = {
  type:'focus', version:1, title:'Время для главного',
  description:'Таймер для одной задачи: запускается прямо с карточки, сигналит в конце.',
  icon:'focus', tone:'sage', size:{w:290,h:240},
  createData:() => ({task:'', minutes:25, remaining:1500, endsAt:null}),
  validate:d => typeof d.task === 'string' && d.task.length <= 500 && Number.isFinite(d.minutes) && d.minutes >= 1 && d.minutes <= 180 && Number.isFinite(d.remaining) && d.remaining >= 0 && d.remaining <= 10800 && (d.endsAt === null || Number.isFinite(d.endsAt)),
  renderCard(ctx) {
    const time = el('span', {class:'timer-preview', role:'timer'});
    const task = el('button', {type:'button', class:'focus-task', onClick:ctx.open});
    const bar = el('span', {class:'focus-bar', 'aria-hidden':'true'}, el('span', {}));
    const status = el('span', {class:'focus-status muted', role:'status'});
    let previous = null;
    const buttons = controls(ctx, paint);
    const element = el('div', {class:'focus-card'}, time, task,
      el('div', {class:'focus-card-actions'}, buttons.main, buttons.reset, buttons.plus, status), bar);
    function paint() {
      const data = ctx.latest().data, state = focusState(data);
      const text = clock(state.seconds);
      if (time.textContent !== text) time.textContent = text;
      task.textContent = data.task || 'Выбрать одно дело';
      task.classList.toggle('is-empty', !data.task);
      bar.firstChild.style.width = (state.progress * 100).toFixed(2) + '%';
      element.classList.toggle('is-running', state.running);
      element.classList.toggle('is-finished', state.finished);
      const message = state.finished ? 'Время вышло' : state.running ? '' : state.started ? 'На паузе' : `${data.minutes} мин`;
      if (status.textContent !== message) status.textContent = message;
      buttons.update(state);
      if (previous?.running && state.finished) chime();
      previous = state;
    }
    paint();
    const interval = setInterval(paint, 500);
    return {element, dispose:() => clearInterval(interval)};
  },
  renderScreen(ctx) {
    const root = el('div', {class:'focus-layout'});
    const task = el('input', {class:'focus-task-input', value:ctx.node.data.task, placeholder:'На чём сосредоточиться?', maxlength:500, 'aria-label':'Задача для фокуса'});
    let debounce;
    const saveTask = () => {
      clearTimeout(debounce);
      if (task.value !== ctx.latest().data.task) ctx.update({...ctx.latest().data, task:task.value}, {render:false, silent:true});
    };
    task.addEventListener('input', () => {clearTimeout(debounce);debounce = setTimeout(saveTask, 400);});
    task.addEventListener('blur', saveTask);
    task.addEventListener('keydown', event => {if (event.key === 'Enter') {saveTask();task.blur();}});

    const ring = el('div', {class:'focus-ring'});
    ring.innerHTML = '<svg viewBox="0 0 120 120" aria-hidden="true"><circle class="focus-ring-track" cx="60" cy="60" r="54"/><circle class="focus-ring-value" cx="60" cy="60" r="54" pathLength="100"/></svg>';
    const timer = el('div', {class:'focus-clock', role:'timer', 'aria-label':'Оставшееся время'});
    const status = el('p', {class:'focus-finished muted', role:'status'});
    ring.append(el('div', {class:'focus-ring-inner'}, timer, status));

    const custom = el('input', {type:'number', min:1, max:180, class:'focus-custom', 'aria-label':'Своя длительность, минут'});
    const presets = el('div', {class:'focus-presets', role:'group', 'aria-label':'Длительность'});
    const applyLength = minutes => {ctx.update(setLength(ctx.latest().data, minutes), {render:false, silent:true});paint();};
    custom.addEventListener('change', () => {
      const minutes = Math.round(Number(custom.value));
      if (minutes >= 1 && minutes <= 180) applyLength(minutes);else custom.value = ctx.latest().data.minutes;
    });
    const buttons = controls(ctx, paint, {large:true});
    root.append(task, ring,
      el('div', {class:'focus-actions'}, buttons.main, buttons.plus, buttons.reset),
      presets);
    let previous = null, presetKey = '';
    function paint() {
      const data = ctx.latest().data, state = focusState(data);
      const text = clock(state.seconds);
      if (timer.textContent !== text) timer.textContent = text;
      ring.style.setProperty('--progress', (state.progress * 100).toFixed(2));
      ring.classList.toggle('is-running', state.running);
      ring.classList.toggle('is-finished', state.finished);
      const message = state.finished ? 'Сессия завершена' : state.running ? 'Идёт фокус' : state.started ? 'На паузе' : `${data.minutes} мин`;
      if (status.textContent !== message) status.textContent = message;
      buttons.update(state);
      const key = data.minutes + ':' + (state.running || state.started);
      if (key !== presetKey) {
        presetKey = key;
        const locked = state.running || state.started;
        presets.replaceChildren(el('span', {class:'muted'}, locked ? 'Длительность меняется после сброса' : 'Длительность'),
          ...PRESETS.map(minutes => el('button', {type:'button', class:'focus-chip', disabled:locked, 'aria-pressed':String(data.minutes === minutes),
            onClick:() => applyLength(minutes)}, minutes + ' мин')),
          el('label', {class:'focus-chip focus-chip-custom' + (PRESETS.includes(data.minutes) ? '' : ' is-active')}, custom, 'мин'));
        custom.disabled = locked;
        if (document.activeElement !== custom) custom.value = PRESETS.includes(data.minutes) ? '' : data.minutes;
        custom.placeholder = 'своё';
      }
      if (previous?.running && state.finished) chime();
      previous = state;
    }
    paint();
    const interval = setInterval(paint, 250);
    return {element:root, dispose:() => {clearInterval(interval);saveTask();}};
  },
};
