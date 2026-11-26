import {el, action} from '../core/dom.js';
import {maxAccounts, maxBalances, localDate, isCurrency, isBalanceDate, isBalanceAmount, isRate, parseDecimal, validateSavings, balanceOn, savingsTotal, rebaseRates, neededRateCodes} from './savings-data.js';
import {rateSnapshot, fetchRates} from './savings-rates.js';

const commonCurrencies = ['EUR', 'USD', 'RUB', 'GBP', 'CHF', 'JPY', 'CNY', 'CAD', 'AUD', 'AED', 'TRY', 'PLN', 'UAH', 'KZT', 'GEL'];
const defaultColors = ['#52754e', '#577997', '#ad7848', '#895e71', '#697098'];
const dateFormat = new Intl.DateTimeFormat('ru-RU', {day:'numeric', month:'short', year:'numeric', timeZone:'UTC'});
const showDate = day => dateFormat.format(new Date(`${day}T00:00:00Z`));
const money = (amount, currency) => new Intl.NumberFormat('ru-RU', {
  style:'currency', currency, currencyDisplay:'code', minimumFractionDigits:0,
}).format(amount);

function field(label, input) {
  return el('label', {class:'field'}, el('span', {}, label), input);
}

function currencyInput(value, id) {
  return el('input', {value, maxlength:3, pattern:'[A-Za-z]{3}', list:id, required:true, placeholder:'EUR', autocapitalize:'characters', spellcheck:'false'});
}

function submit(label) {
  return el('button', {class:'button primary', type:'submit'}, label);
}

function disclosure(label, ...content) {
  return el('details', {class:'savings-disclosure'}, el('summary', {}, label), ...content);
}

function totalMessage(data, result) {
  if (result.missing.length) return `Укажи курс для ${result.missing.join(', ')}.`;
  if (!data.accounts.length) return 'Добавь первый счёт.';
  if (!result.recorded) return 'Нет остатков на эту дату.';
  const ignored = data.accounts.length - result.recorded;
  return ignored ? `Счетов без записей на эту дату: ${ignored}.` : '';
}

function showTotal(data, day, amount, message, source, refresh) {
  let active = true;
  const today = localDate();
  const rateDay = day > today ? today : day;
  const codes = neededRateCodes(data, day);
  const cached = codes.length ? rateSnapshot(data.totalCurrency, rateDay) : {rates:{},fresh:true};
  let rates = cached.rates;

  function paint(state = '') {
    const result = savingsTotal(data, day, rates);
    amount.textContent = result.amount === null ? '—' : money(result.amount, data.totalCurrency);
    message.textContent = result.missing.length && state === 'loading'
      ? 'Загружаем курсы…' : totalMessage(data, result);
    const online = codes.filter(code => rates[code]);
    const manual = codes.filter(code => !rates[code] && isRate(data.rates[code]));
    const dates = [...new Set(online.map(code => rates[code].date))].sort();
    const dateLabel = dates.length === 1 ? showDate(dates[0])
      : dates.length > 1 ? `${showDate(dates[0])} — ${showDate(dates.at(-1))}` : '';
    const labels = [];
    if (online.length) labels.push(`${state === 'failed' || state === 'reload' ? 'Сохранённые курсы Frankfurter' : 'Frankfurter'} · ${dateLabel}`);
    if (manual.length) labels.push(`Ручной курс · ${manual.join(', ')}`);
    if (state === 'failed' && !online.length) labels.push('Не удалось загрузить курсы.');
    if (state === 'reload') labels.push('Перезагрузи «Кабинет» на странице chrome://extensions/ и открой новую вкладку.');
    source.textContent = labels.join(' · ');
    if (refresh) refresh.disabled = state === 'loading';
  }

  function load(force = false) {
    paint('loading');
    fetchRates(data.totalCurrency, rateDay, {force}).then(result => {
      if (!active) return;
      rates = result;
      paint();
    }, error => {if (active) paint(error?.code === 'EXTENSION_RELOAD_REQUIRED' ? 'reload' : 'failed');});
  }

  if (refresh) {
    refresh.hidden = !codes.length;
    refresh.onclick = () => load(true);
  }
  if (!cached.fresh) load();
  else paint();
  return () => {active = false;};
}

function accountForm(data, account, listId, save) {
  const name = el('input', {value:account?.name ?? '', placeholder:'Например, Резерв', maxlength:80, required:true});
  const currency = currencyInput(account?.currency ?? data.totalCurrency, listId);
  const color = el('input', {type:'color', value:account?.color ?? defaultColors[data.accounts.length % defaultColors.length]});
  if (account?.balances.length) currency.readOnly = true;
  const error = el('p', {class:'savings-error', role:'alert'});
  return el('form', {class:'savings-form savings-account-form', onSubmit:event=>{
    event.preventDefault();
    const code = currency.value.trim().toUpperCase();
    if (!name.value.trim() || !isCurrency(code)) {
      error.textContent = 'Введи название и трёхбуквенный код валюты.';
      return;
    }
    save({name:name.value.trim(), currency:code, color:color.value});
  }}, field('Название', name), field('Валюта', currency), field('Цвет карточки', color), submit(account ? 'Сохранить' : 'Добавить'), error);
}

function rateSettings(data, listId, save, keepOpen) {
  const currency = currencyInput(data.totalCurrency, listId);
  const codes = [...new Set(data.accounts.map(account=>account.currency))].sort();
  const rateFields = codes.filter(code=>code !== data.totalCurrency).map(code=>({
    code,
    input:el('input', {inputmode:'decimal', maxlength:28, value:data.rates[code] === undefined ? '' : String(data.rates[code]).replace('.', ','), placeholder:'Курс'}),
  }));
  const error = el('p', {class:'savings-error', role:'alert'});
  const form = el('form', {class:'savings-rates', onSubmit:event=>{
    event.preventDefault();
    const totalCurrency = currency.value.trim().toUpperCase();
    if (!isCurrency(totalCurrency)) {error.textContent = 'Укажи трёхбуквенный код валюты.';return;}
    const rates = {...data.rates};
    for (const {code,input} of rateFields) {
      if (!input.value.trim()) {delete rates[code];continue;}
      const rate = parseDecimal(input.value);
      if (!isRate(rate)) {error.textContent = `Укажи положительный курс для ${code}.`;return;}
      rates[code] = rate;
    }
    save({totalCurrency, rates:rebaseRates(rates, data.totalCurrency, totalCurrency)});
  }}, el('div', {class:'savings-form'}, field('Валюта итога', currency), submit('Сохранить')),
  rateFields.length ? el('div', {class:'savings-rate-fields'}, rateFields.map(({code,input})=>field(`1 ${code} в ${data.totalCurrency}`, input))) : null,
  rateFields.length ? el('p', {class:'muted'}, 'Ручные курсы используются, когда для валюты нет курса Frankfurter на нужную дату.') : null, error);
  const settings = disclosure('Валюта и курсы', form);
  settings.open = keepOpen;
  return settings;
}

function accountCard(account, day, dateToday, change, confirm, showHistory) {
  const balance = balanceOn(account, day);
  const card = el('article', {class:'savings-account', 'aria-label':account.name});
  card.style.setProperty('--account-color', account.color);
  const date = el('input', {type:'date', value:day, required:true, 'aria-label':'Дата остатка: '+account.name});
  const amount = el('input', {inputmode:'decimal', required:true, maxlength:30, placeholder:'Остаток', 'aria-label':'Остаток: '+account.name});
  const error = el('p', {class:'savings-error', role:'alert'});
  const form = el('form', {class:'savings-form savings-balance-form', onSubmit:event=>{
    event.preventDefault();
    const value = parseDecimal(amount.value);
    if (!isBalanceDate(date.value) || !isBalanceAmount(value)) {error.textContent = 'Проверь дату и сумму остатка.';return;}
    const exists = account.balances.some(entry=>entry.date === date.value);
    if (!exists && account.balances.length >= maxBalances) {error.textContent = `Достигнут лимит записей: ${maxBalances}.`;return;}
    const balances = [...account.balances.filter(entry=>entry.date !== date.value), {date:date.value, amount:value}];
    if (exists) confirm('Заменить остаток за '+showDate(date.value)+'?', 'За одну дату хранится один остаток.', 'Заменить', ()=>change({balances}, true));
    else change({balances}, true);
  }}, date, amount, submit('Записать'), error);

  card.append(el('header', {class:'savings-account-header'}, el('h3', {}, account.name), el('span', {class:'muted'}, account.currency)),
    el('strong', {class:'savings-balance'}, balance ? money(balance.amount, account.currency) : '—'),
    el('p', {class:'muted'}, balance ? `Запись от ${showDate(balance.date)}` : day === dateToday ? 'Остаток не записан' : 'Нет записи на эту дату'), form);

  if (account.balances.length) {
    const rows = [...account.balances].sort((a,b)=>b.date.localeCompare(a.date)).map(entry=>{
      const edit = action('Изменить', ()=>{
        date.value = entry.date;amount.value = String(entry.amount).replace('.', ',');amount.focus();
      }, 'text-button');
      edit.setAttribute('aria-label', `Изменить остаток за ${showDate(entry.date)}`);
      const remove = action('Удалить', ()=>confirm('Удалить остаток за '+showDate(entry.date)+'?', 'Остальные записи сохранятся.', 'Удалить', ()=>change({balances:account.balances.filter(item=>item.date !== entry.date)}, true)), 'text-button');
      remove.setAttribute('aria-label', `Удалить остаток за ${showDate(entry.date)}`);
      return el('li', {}, el('time', {datetime:entry.date}, showDate(entry.date)),
        el('span', {}, money(entry.amount, account.currency)), el('div', {class:'savings-history-actions'}, edit, remove));
    });
    const history = disclosure(`История · ${account.balances.length}`, el('ul', {class:'savings-history'}, rows));
    history.open = showHistory;
    card.append(history);
  }
  return card;
}

export const savings = {
  type:'savings', version:1, title:'Накопления', icon:'savings', tone:'sage', size:{w:320,h:220},
  minSize:{w:240,h:185},
  description:'Остатки по счетам на разные даты и общий итог в выбранной валюте.',
  createData:()=>({totalCurrency:'EUR', accounts:[], rates:{}}),
  validate:validateSavings,
  renderCard({node,open}) {
    const data = node.data;
    const amount = el('strong', {class:'savings-total'});
    const message = el('span', {class:'muted savings-rate-message'});
    const source = el('span', {class:'muted savings-rate-message savings-rate-source'});
    const element = el('button', {class:'savings-preview', onClick:open, 'aria-label':'Открыть накопления: '+node.title},
      el('span', {class:'muted'}, 'Итого · '+data.totalCurrency), amount, message, source);
    const dispose = showTotal(data, localDate(), amount, message, source);
    return {element, dispose};
  },
  renderScreen(ctx) {
    const root = el('div', {class:'savings-screen'});
    const today = localDate();
    const listId = 'savings-currencies';
    let day = today, openHistory = null, keepSettings = false, stopRates;
    function confirm(title, copy, label, operation) {
      const dialog = el('dialog', {class:'modal small', 'aria-label':title},
        el('h2', {}, title), el('p', {class:'modal-footnote'}, copy),
        el('div', {class:'modal-actions'}, action('Отмена', ()=>dialog.close()), action(label, ()=>{dialog.close();operation();}, 'button primary')));
      dialog.addEventListener('close', ()=>dialog.remove(), {once:true});
      root.append(dialog);dialog.showModal();
    }
    function save(patch) {
      ctx.update({...ctx.latest().data,...patch});render();
    }
    function render() {
      stopRates?.();
      const data = ctx.latest().data;
      const amount = el('p', {class:'savings-total', 'aria-live':'polite'});
      const message = el('p', {class:'muted savings-rate-message', role:'status'});
      const source = el('p', {class:'muted savings-rate-message savings-rate-source'});
      const refresh = el('button', {type:'button', class:'text-button'}, 'Обновить курсы');
      const asOf = el('input', {type:'date',value:day,onChange:event=>{
        if (!isBalanceDate(event.target.value)) {event.target.value = day;return;}
        day = event.target.value;render();root.querySelector('.savings-summary input')?.focus({preventScroll:true});
      }});
      const summary = el('section', {class:'savings-summary', 'aria-label':'Общий итог'},
        el('div', {}, el('h2', {}, `Итого · ${data.totalCurrency}`),
          amount, message, source, refresh),
        data.accounts.length ? field('На дату', asOf) : null);
      stopRates = showTotal(data, day, amount, message, source, refresh);
      root.replaceChildren(el('datalist', {id:listId}, commonCurrencies.map(code=>el('option', {value:code}))), summary,
        rateSettings(data,listId,patch=>{keepSettings = true;save(patch);root.querySelector('.savings-disclosure summary')?.focus({preventScroll:true});},keepSettings));
      keepSettings = false;
      if (data.accounts.length < maxAccounts) {
        const add = disclosure('Добавить счёт', accountForm(data,null,listId,fields=>{
          save({accounts:[...ctx.latest().data.accounts,{...fields,id:crypto.randomUUID(),balances:[]}]});
          root.querySelector('.savings-accounts article:last-child input')?.focus({preventScroll:true});
        }));
        if (!data.accounts.length) add.open = true;
        root.append(add);
      }
      const cards = el('div', {class:'savings-accounts'});
      for (const account of data.accounts) {
        const change = (fields, history=false)=>{
          openHistory = history ? account.id : null;
          save({accounts:ctx.latest().data.accounts.map(item=>item.id === account.id ? {...item,...fields} : item)});
        };
        const card = accountCard(account,day,today,change,confirm,openHistory === account.id);
        const remove = action('Удалить счёт', ()=>confirm(`Удалить счёт «${account.name}»?`, 'Записи этого счёта будут удалены вместе с ним.', 'Удалить', ()=>{
          save({accounts:ctx.latest().data.accounts.filter(item=>item.id !== account.id)});
        }), 'text-button savings-remove');
        card.append(disclosure('Настройки счёта',accountForm(data,account,listId,change),remove));
        cards.append(card);
      }
      root.append(cards);
    }
    render();return {element:root, dispose:()=>stopRates?.()};
  },
};
