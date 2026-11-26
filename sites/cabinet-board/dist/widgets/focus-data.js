// Pure timer logic for the focus widget (tests/focus.test.mjs). Data format v1: {task,minutes,remaining,endsAt}.
export const PRESETS = [5, 15, 25, 45, 60];
export const MAX_SECONDS = 10800;

/** running: counting down; finished: reached zero; started: running or paused part-way. progress: elapsed share 0…1. */
export function focusState(data, now = Date.now()) {
  const total = data.minutes * 60;
  const finished = data.endsAt !== null ? data.endsAt <= now : data.remaining === 0;
  const running = data.endsAt !== null && !finished;
  const seconds = running ? Math.max(0, Math.ceil((data.endsAt - now) / 1000)) : finished ? 0 : data.remaining;
  const started = running || (!finished && seconds !== total);
  const span = Math.max(total, seconds, 1);
  return {running, finished, started, seconds, progress: finished ? 1 : Math.min(1, Math.max(0, 1 - seconds / span))};
}

export function startFocus(data, now = Date.now()) {
  const state = focusState(data, now);
  if (state.running) return data;
  const seconds = state.finished || !state.seconds ? data.minutes * 60 : state.seconds;
  return {...data, remaining: seconds, endsAt: now + seconds * 1000};
}

export function pauseFocus(data, now = Date.now()) {
  const state = focusState(data, now);
  if (!state.running) return data;
  return {...data, remaining: state.seconds, endsAt: null};
}

export const resetFocus = data => ({...data, remaining: data.minutes * 60, endsAt: null});

export function addMinutes(data, minutes, now = Date.now()) {
  const state = focusState(data, now), extra = minutes * 60;
  if (state.finished) return {...data, remaining: extra, endsAt: now + extra * 1000};
  const seconds = Math.min(MAX_SECONDS, state.seconds + extra);
  if (state.running) return {...data, remaining: Math.min(MAX_SECONDS, Math.max(data.remaining, seconds)), endsAt: now + seconds * 1000};
  return {...data, remaining: seconds};
}

export function setLength(data, minutes) {
  const value = Math.round(minutes);
  if (!(value >= 1 && value <= 180)) return data;
  return {...data, minutes: value, remaining: value * 60, endsAt: null};
}

export function clock(seconds) {
  const h = Math.floor(seconds / 3600), m = Math.floor(seconds % 3600 / 60), s = seconds % 60;
  const pad = value => String(value).padStart(2, '0');
  return h ? `${h}:${pad(m)}:${pad(s)}` : `${pad(m)}:${pad(s)}`;
}
