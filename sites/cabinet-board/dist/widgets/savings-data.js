import {localDate, isCalendarDate} from '../core/calendar.js';

export const maxAccounts = 30;
export const maxBalances = 1000;

const isObject = value => value !== null && typeof value === 'object' && !Array.isArray(value);
export const isCurrency = value => typeof value === 'string' && /^[A-Z]{3}$/.test(value);
const isColor = value => typeof value === 'string' && /^#[0-9a-f]{6}$/i.test(value);

export {localDate};
export const isBalanceDate = isCalendarDate;

export const isBalanceAmount = value => Number.isFinite(value) && Math.abs(value) <= 1e12;
export const isRate = value => Number.isFinite(value) && value > 0 && value <= 1e12;

export function parseDecimal(value) {
  const normalized = value.trim().replace(/[ \u00a0\u202f]/g, '').replace(',', '.');
  return /^-?(?:\d+(?:\.\d+)?|\.\d+)(?:e[+-]?\d+)?$/i.test(normalized) ? Number(normalized) : NaN;
}

export function validateSavings(data) {
  if (!isObject(data) || !isCurrency(data.totalCurrency) || !isObject(data.rates) ||
      !Array.isArray(data.accounts) || data.accounts.length > maxAccounts) return false;
  if (!Object.entries(data.rates).every(([code, rate]) => isCurrency(code) && code !== data.totalCurrency && isRate(rate))) return false;

  const ids = new Set();
  for (const account of data.accounts) {
    if (!isObject(account) || typeof account.id !== 'string' || !account.id || account.id.length > 100 || ids.has(account.id) ||
        typeof account.name !== 'string' || !account.name.trim() || account.name.length > 80 || !isCurrency(account.currency) ||
        !isColor(account.color) || !Array.isArray(account.balances) || account.balances.length > maxBalances) return false;
    ids.add(account.id);
    const dates = new Set();
    for (const entry of account.balances) {
      if (!isObject(entry) || !isBalanceDate(entry.date) || !isBalanceAmount(entry.amount) || dates.has(entry.date)) return false;
      dates.add(entry.date);
    }
  }
  return true;
}

export function balanceOn(account, day) {
  let balance = null;
  for (const entry of account.balances) {
    if (entry.date <= day && (!balance || entry.date > balance.date)) balance = entry;
  }
  return balance;
}

export function savingsTotal(data, day, onlineRates = {}) {
  const missing = new Set();
  let total = 0, recorded = 0;
  for (const account of data.accounts) {
    const balance = balanceOn(account, day);
    if (!balance) continue;
    recorded++;
    if (balance.amount === 0) continue;
    const online = onlineRates[account.currency]?.rate;
    const rate = account.currency === data.totalCurrency ? 1 : isRate(online) ? online : data.rates[account.currency];
    if (isRate(rate)) total += balance.amount * rate;
    else missing.add(account.currency);
  }
  return {amount: missing.size || !recorded ? null : total, recorded, missing: [...missing].sort()};
}

export function neededRateCodes(data, day) {
  return [...new Set(data.accounts.filter(account => account.currency !== data.totalCurrency &&
    (balanceOn(account,day)?.amount || 0) !== 0).map(account => account.currency))];
}

export function rebaseRates(rates, from, to) {
  if (from === to) return {...rates};
  if (!isRate(rates[to])) return {};
  const converted = {};
  for (const [code, rate] of Object.entries({...rates, [from]: 1})) {
    const rebased = Number((rate / rates[to]).toPrecision(12));
    if (code !== to && isRate(rebased)) converted[code] = rebased;
  }
  return converted;
}

