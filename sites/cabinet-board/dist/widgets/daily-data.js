import {localDate, isCalendarDate} from '../core/calendar.js';

export const maxActions = 50;
export const maxActionLength = 100;

export function validateDaily(data) {
  if (!Array.isArray(data?.actions) || data.actions.length > maxActions) return false;
  const ids = new Set();
  for (const item of data.actions) {
    if (!item || typeof item.id !== 'string' || !item.id || item.id.length > 100 || ids.has(item.id) ||
        typeof item.name !== 'string' || !item.name.trim() || item.name.length > maxActionLength ||
        !Array.isArray(item.completed) || !item.completed.every(isCalendarDate) ||
        new Set(item.completed).size !== item.completed.length) return false;
    ids.add(item.id);
  }
  return true;
}

export function recentDays(now = new Date()) {
  return Array.from({length: 7}, (_, index) =>
    localDate(new Date(now.getFullYear(), now.getMonth(), now.getDate() + index - 6, 12)));
}

export function monthDays(month) {
  const first = month + '-01';
  if (!isCalendarDate(first)) return [];
  const date = new Date(first + 'T12:00:00Z');
  const days = [];
  while (date.toISOString().slice(0, 7) === month) {
    days.push(date.toISOString().slice(0, 10));
    date.setUTCDate(date.getUTCDate() + 1);
  }
  return days;
}

export function setDayDone(actions, id, day, done) {
  return actions.map(item => {
    if (item.id !== id || item.completed.includes(day) === done) return item;
    const completed = done ? [...item.completed, day] : item.completed.filter(date => date !== day);
    return {...item, completed};
  });
}
