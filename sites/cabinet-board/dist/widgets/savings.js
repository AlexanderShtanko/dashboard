import {el} from '../core/dom.js';
import {icon} from '../core/icons.js';
import {openDialog, moreButton, contextMenu} from '../core/ui.js';
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


function totalMessage(data, result) {
  if (result.missing.length) return `Укажите курс для ${result.missing.join(', ')} в «Валюта и курсы».`;
  if (!data.accounts.length) return 'Добавьте первый счёт.';
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

const shortDate = new Intl.DateTimeFormat('ru-RU', {day:'numeric', month:'short', timeZone:'UTC'});
const showShort = day => shortDate.format(new Date(`${day}T00:00:00Z`));
const amountText = value => String(value).replace('.', ',');

/** Screen actions. Every dialog follows the same pattern as Chrome's «Добавить ярлык». */
function savingsActions(ctx, render, getDay) {
  const data = () => ctx.latest().data;
  function save(patch, message, undo) {
    ctx.update({...data(), ...patch}, {render:false, silent:true});
    render();
    if (message) ctx.feedback?.(message, undo ? {label:'Отменить', run:undo} : undefined);
  }
  const patchAccount = (id, fields) => data().accounts.map(item => item.id === id ? {...item, ...fields} : item);
  const account = id => data().accounts.find(item => item.id === id);

  function editAccount(existing = null) {
    const current = data();
    const listId = 'savings-currencies-dialog';
    const name = el('input', {value:existing?.name ?? '', placeholder:'Например, Резерв', maxlength:80, autocomplete:'off'});
    const currency = el('input', {value:existing?.currency ?? current.totalCurrency, maxlength:3, list:listId, placeholder:'EUR', autocapitalize:'characters', spellcheck:'false'});
    const color = el('input', {type:'color', value:existing?.color ?? defaultColors[current.accounts.length % defaultColors.length]});
    if (existing?.balances.length) currency.readOnly = true;
    openDialog({
      title:existing ? 'Изменить счёт' : 'Новый счёт',
      body:[el('datalist', {id:listId}, commonCurrencies.map(code => el('option', {value:code}))),
        field('Название', name),
        el('div', {class:'savings-dialog-row'}, field('Валюта', currency), field('Цвет', color)),
        existing?.balances.length ? el('p', {class:'muted'}, 'Валюту нельзя поменять, пока у счёта есть записи.') : null],
      submitLabel:existing ? 'Сохранить' : 'Добавить',
      remove:existing ? {label:'Удалить счёт', run:() => removeAccount(existing.id)} : null,
      onSubmit:() => {
        const code = currency.value.trim().toUpperCase();
        if (!name.value.trim()) return 'Введите название счёта.';
        if (!isCurrency(code)) return 'Укажите трёхбуквенный код валюты, например EUR.';
        const fields = {name:name.value.trim(), currency:code, color:color.value};
        if (existing) {save({accounts:patchAccount(existing.id, fields)}, 'Счёт изменён.');return;}
        if (data().accounts.length >= maxAccounts) return `Можно завести до ${maxAccounts} счетов.`;
        const id = crypto.randomUUID();
        save({accounts:[...data().accounts, {...fields, id, balances:[]}]}, 'Счёт добавлен.');
        record(id);
      },
    });
  }

  function removeAccount(id) {
    const list = data().accounts, index = list.findIndex(item => item.id === id);
    if (index < 0) return;
    const removed = list[index];
    save({accounts:list.filter(item => item.id !== id)}, `Счёт «${removed.name}» удалён вместе с записями.`, () => {
      const current = data().accounts;
      if (current.some(item => item.id === id) || current.length >= maxAccounts) return;
      const next = current.slice();next.splice(Math.min(index, next.length), 0, removed);save({accounts:next});
    });
  }

  function record(id, preset = {}) {
    const target = account(id);
    if (!target) return;
    const today = localDate();
    const day = preset.date ?? (getDay() > today ? today : getDay());
    const latest = balanceOn(target, '9999-12-31');
    const date = el('input', {type:'date', value:day, required:true});
    const amount = el('input', {inputmode:'decimal', maxlength:30, placeholder:latest ? amountText(latest.amount) : '0', value:preset.amount === undefined ? '' : amountText(preset.amount), autocomplete:'off'});
    const note = el('p', {class:'muted savings-replace'});
    const check = () => {
      const existing = account(id)?.balances.find(entry => entry.date === date.value);
      note.textContent = existing && preset.date !== date.value ? `За ${showDate(date.value)} уже записано ${money(existing.amount, target.currency)}. Запись будет заменена.` : '';
    };
    date.addEventListener('input', check);check();
    openDialog({
      title:preset.date ? 'Изменить запись' : 'Записать остаток',
      className:'savings-record-dialog',
      body:[el('p', {class:'savings-dialog-account'}, el('span', {class:'savings-dot', style:`--account-color:${target.color}`}), target.name, el('span', {class:'muted'}, ' · ' + target.currency)),
        el('div', {class:'savings-dialog-row'}, field('Дата', date), field('Сумма, ' + target.currency, amount)), note],
      submitLabel:'Сохранить',
      focus:amount,
      onSubmit:() => {
        const value = parseDecimal(amount.value);
        if (!isBalanceDate(date.value)) return 'Укажите дату.';
        if (!isBalanceAmount(value)) return 'Введите сумму, например 1200 или 1200,50.';
        const current = account(id);
        if (!current) return;
        let balances = current.balances.filter(entry => entry.date !== date.value && entry.date !== preset.date);
        if (balances.length >= maxBalances) return `Достигнут лимит записей: ${maxBalances}.`;
        balances = [...balances, {date:date.value, amount:value}];
        save({accounts:patchAccount(id, {balances})}, preset.date ? 'Запись изменена.' : 'Остаток записан.');
      },
    });
  }

  function history(id) {
    const target = account(id);
    if (!target) return;
    const list = el('ul', {class:'savings-history'});
    const paint = () => {
      const current = account(id);
      if (!current) {view.close();return;}
      const rows = [...current.balances].sort((a, b) => b.date.localeCompare(a.date));
      list.replaceChildren(...(rows.length ? rows.map(entry => el('li', {},
        el('time', {datetime:entry.date}, showDate(entry.date)),
        el('span', {}, money(entry.amount, current.currency)),
        el('span', {class:'savings-history-actions'},
          el('button', {type:'button', class:'icon-button', 'aria-label':'Изменить запись за ' + showDate(entry.date), title:'Изменить',
            onClick:() => {view.close();record(id, entry);}}, icon('edit')),
          el('button', {type:'button', class:'icon-button danger', 'aria-label':'Удалить запись за ' + showDate(entry.date), title:'Удалить',
            onClick:() => {
              save({accounts:patchAccount(id, {balances:account(id).balances.filter(item => item.date !== entry.date)})},
                `Запись за ${showDate(entry.date)} удалена.`, () => {
                  const now = account(id);
                  if (!now || now.balances.some(item => item.date === entry.date) || now.balances.length >= maxBalances) return;
                  save({accounts:patchAccount(id, {balances:[...now.balances, entry]})});
                  paint();
                });
              paint();
            }}, icon('trash'))))) : [el('li', {class:'muted savings-history-empty'}, 'Записей пока нет.')]));
    };
    const view = openDialog({title:'История · ' + target.name, body:[list,
      el('button', {type:'button', class:'add-row-button', onClick:() => {view.close();record(id);}}, el('span', {class:'add-row-icon', 'aria-hidden':'true'}, icon('plus')), 'Записать остаток')],
      submitLabel:null, className:'savings-history-dialog'});
    paint();
  }

  function rates() {
    const current = data();
    const listId = 'savings-currencies-rates';
    const currency = el('input', {value:current.totalCurrency, maxlength:3, list:listId, placeholder:'EUR', autocapitalize:'characters', spellcheck:'false'});
    const codes = [...new Set(current.accounts.map(item => item.currency))].sort().filter(code => code !== current.totalCurrency);
    const inputs = codes.map(code => ({code, input:el('input', {inputmode:'decimal', maxlength:28, value:current.rates[code] === undefined ? '' : amountText(current.rates[code]), placeholder:'авто'})}));
    openDialog({
      title:'Валюта и курсы',
      body:[el('datalist', {id:listId}, commonCurrencies.map(code => el('option', {value:code}))),
        field('Валюта итога', currency),
        inputs.length ? el('div', {class:'savings-rate-fields'}, inputs.map(({code, input}) => field(`1 ${code} в ${current.totalCurrency}`, input))) : null,
        el('p', {class:'muted'}, inputs.length ? 'Курсы загружаются с Frankfurter автоматически. Свой курс нужен, только если для валюты нет курса на нужную дату.' : 'Курсы понадобятся, когда появятся счета в других валютах.')],
      submitLabel:'Сохранить',
      onSubmit:() => {
        const totalCurrency = currency.value.trim().toUpperCase();
        if (!isCurrency(totalCurrency)) return 'Укажите трёхбуквенный код валюты.';
        const next = {...data().rates};
        for (const {code, input} of inputs) {
          if (!input.value.trim()) {delete next[code];continue;}
          const rate = parseDecimal(input.value);
          if (!isRate(rate)) return `Укажите положительный курс для ${code}.`;
          next[code] = rate;
        }
        save({totalCurrency, rates:rebaseRates(next, data().totalCurrency, totalCurrency)}, 'Настройки валюты сохранены.');
      },
    });
  }

  function menu(item) {
    return {title:item.name, items:[
      {label:'Записать остаток', icon:'plus', run:() => record(item.id)},
      {label:'История', icon:'history', disabled:!item.balances.length, run:() => history(item.id)},
      {label:'Изменить', icon:'edit', run:() => editAccount(item)},
      {label:'Удалить', icon:'trash', danger:true, run:() => removeAccount(item.id)},
    ]};
  }
  return {editAccount, record, history, rates, menu};
}

export const savings = {
  type:'savings', version:1, title:'Накопления', icon:'savings', tone:'sage', size:{w:320,h:220},
  minSize:{w:240,h:185},
  description:'Остатки по счетам на разные даты и общий итог в выбранной валюте.',
  createData:()=>({totalCurrency:'EUR', accounts:[], rates:{}}),
  validate:validateSavings,
  renderCard({node,open}) {
    const data = node.data, today = localDate();
    const amount = el('strong', {class:'savings-total'});
    const message = el('span', {class:'muted savings-rate-message'});
    const source = el('span', {class:'muted savings-rate-message savings-rate-source'});
    const accounts = data.accounts.slice(0, 3).map(item => {
      const balance = balanceOn(item, today);
      return el('span', {class:'savings-mini'}, el('span', {class:'savings-dot', style:`--account-color:${item.color}`}),
        el('span', {class:'savings-mini-name'}, item.name), el('span', {class:'savings-mini-amount'}, balance ? money(balance.amount, item.currency) : '—'));
    });
    const element = el('button', {class:'savings-preview', onClick:open, 'aria-label':'Открыть накопления: '+node.title},
      el('span', {class:'muted'}, 'Итого · '+data.totalCurrency), amount, message,
      accounts.length ? el('span', {class:'savings-mini-list'}, accounts, data.accounts.length > 3 ? el('span', {class:'muted savings-mini-more'}, `и ещё ${data.accounts.length - 3}`) : null) : null,
      source);
    const dispose = showTotal(data, today, amount, message, source);
    return {element, dispose};
  },
  renderScreen(ctx) {
    const root = el('div', {class:'savings-screen'});
    let day = localDate(), stopRates;
    const api = savingsActions(ctx, () => render(), () => day);
    function render() {
      stopRates?.();
      const data = ctx.latest().data, today = localDate();
      const amount = el('p', {class:'savings-total', 'aria-live':'polite'});
      const message = el('p', {class:'muted savings-rate-message', role:'status'});
      const source = el('p', {class:'muted savings-rate-message savings-rate-source'});
      const refresh = el('button', {type:'button', class:'text-button'}, 'Обновить курсы');
      const asOf = el('input', {type:'date', value:day, 'aria-label':'Итог на дату', onChange:event => {
        if (!isBalanceDate(event.target.value)) {event.target.value = day;return;}
        day = event.target.value;render();root.querySelector('.savings-asof input')?.focus({preventScroll:true});
      }});
      const summary = el('section', {class:'savings-summary', 'aria-label':'Общий итог'},
        el('div', {}, el('h2', {}, `Итого · ${data.totalCurrency}`), amount, message, source, refresh),
        el('div', {class:'savings-summary-side'},
          data.accounts.length ? el('label', {class:'field savings-asof'}, el('span', {}, 'На дату'), asOf) : null,
          day !== today ? el('button', {type:'button', class:'text-button', onClick:() => {day = today;render();}}, 'Сегодня') : null,
          el('button', {type:'button', class:'button', onClick:api.rates}, icon('sliders'), 'Валюта и курсы')));
      stopRates = showTotal(data, day, amount, message, source, refresh);
      const list = el('ul', {class:'savings-list', 'aria-label':'Счета'}, data.accounts.map(item => {
        const balance = balanceOn(item, day);
        const more = moreButton('Действия со счётом: ' + item.name, () => api.menu(item));
        const row = el('li', {class:'savings-row'},
          el('span', {class:'savings-dot', style:`--account-color:${item.color}`, 'aria-hidden':'true'}),
          el('button', {type:'button', class:'savings-row-main', title:'История записей', onClick:() => item.balances.length ? api.history(item.id) : api.record(item.id)},
            el('strong', {}, item.name),
            el('small', {class:'muted'}, item.currency + ' · ' + (balance ? (balance.date === day ? (day === today ? 'запись сегодня' : 'запись на эту дату') : 'запись от ' + showShort(balance.date)) : 'нет записей'))),
          el('span', {class:'savings-row-amount'}, balance ? money(balance.amount, item.currency) : '—'),
          el('button', {type:'button', class:'button savings-row-record', onClick:() => api.record(item.id), 'aria-label':'Записать остаток: ' + item.name}, icon('plus'), el('span', {}, 'Записать')),
          more);
        contextMenu(row, more, () => api.menu(item));
        return row;
      }));
      root.replaceChildren(summary,
        data.accounts.length ? list : el('p', {class:'muted savings-empty'}, 'Заведите счета — например, «Резерв» или «Валютный» — и записывайте остатки. Итог посчитается сам, даже в разных валютах.'),
        data.accounts.length < maxAccounts ? el('button', {type:'button', class:'add-row-button savings-add', onClick:() => api.editAccount()},
          el('span', {class:'add-row-icon', 'aria-hidden':'true'}, icon('plus')), 'Добавить счёт') : el('p', {class:'muted'}, `Можно завести до ${maxAccounts} счетов.`));
    }
    render();
    return {element:root, dispose:() => stopRates?.()};
  },
};
