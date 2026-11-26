export const PIN_KEY = 'cabinet-board:pin:v1';

const validPin = /^[0-9]{4,12}$/;
const toHex = bytes => Array.from(bytes, byte => byte.toString(16).padStart(2, '0')).join('');

async function digest(pin, salt) {
  if (!globalThis.crypto?.subtle) throw new Error('Настройка PIN доступна в расширении Chrome, через локальный сервер или по HTTPS.');
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(pin), 'PBKDF2', false, ['deriveBits']);
  const bits = await crypto.subtle.deriveBits({name: 'PBKDF2', hash: 'SHA-256', iterations: 600_000, salt}, key, 256);
  return toHex(new Uint8Array(bits));
}

async function createPinRecord(pin) {
  if (!validPin.test(pin)) throw new Error('PIN должен содержать от 4 до 12 цифр.');
  const salt = crypto.getRandomValues(new Uint8Array(16));
  return JSON.stringify({salt: toHex(salt), digest: await digest(pin, salt)});
}

async function verifyPin(pin, raw) {
  if (!validPin.test(pin)) return false;
  let record;
  try { record = JSON.parse(raw); } catch { /* Checked below. */ }
  if (!/^[0-9a-f]{32}$/.test(record?.salt) || !/^[0-9a-f]{64}$/.test(record?.digest)) {
    throw new Error('Сохранённый PIN недоступен.');
  }
  const salt = Uint8Array.from(record.salt.match(/../g), pair => parseInt(pair, 16));
  const actual = await digest(pin, salt);
  let mismatch = 0;
  for (let i = 0; i < actual.length; i++) mismatch |= actual.charCodeAt(i) ^ record.digest.charCodeAt(i);
  return mismatch === 0;
}

export function createPinDialog(storage, dialog, onCredentialChange) {
  const find = selector => dialog.querySelector(selector);
  const form = find('form');
  const current = find('#pin-current');
  const next = find('#pin-new');
  const repeat = find('#pin-repeat');
  const submit = find('button[type=submit]');
  const error = find('#pin-error');
  let request = null;
  let failed = 0;
  let retryAt = 0;

  function reset() {
    request = null;
    form.reset();
    submit.disabled = false;
    error.textContent = '';
  }

  function show(title, save, complete) {
    reset();
    let raw;
    try { raw = storage.getItem(PIN_KEY); } catch { throw new Error('Хранилище PIN недоступно.'); }
    request = {raw, save: save || raw === null, complete};
    find('h2').textContent = raw === null ? 'Задать PIN' : title;
    find('#pin-hint').textContent = request.save
      ? 'Используй от 4 до 12 цифр. PIN скрывает карточки на экране. Данные и резервные копии хранятся без шифрования.' : '';
    current.required = raw !== null;
    current.disabled = !current.required;
    current.closest('label').hidden = current.disabled;
    for (const field of [next, repeat]) {
      field.required = request.save;
      field.disabled = !request.save;
      field.closest('label').hidden = field.disabled;
    }
    submit.textContent = request.save ? 'Сохранить PIN' : 'Подтвердить';
    dialog.showModal();
    (current.disabled ? next : current).focus();
  }

  function cancel() {
    reset();
    if (dialog.open) dialog.close();
  }

  dialog.addEventListener('close', () => { if (!dialog.open) reset(); });
  form.addEventListener('submit', async event => {
    event.preventDefault();
    const active = request;
    if (!active || submit.disabled) return;
    const oldPin = current.value;
    const newPin = next.value;
    const wait = Math.ceil((retryAt - Date.now()) / 1000);
    if (active.raw !== null && wait > 0) {
      error.textContent = `Повтори попытку через ${wait} сек.`;
      return;
    }
    if (active.save && newPin !== repeat.value) {
      error.textContent = 'PIN-коды не совпадают.';
      repeat.focus();
      return;
    }
    error.textContent = '';
    submit.disabled = true;
    try {
      const verified = active.raw === null || await verifyPin(oldPin, active.raw);
      if (!dialog.open || active !== request) return;
      if (!verified) {
        failed++;
        if (failed === 5) { retryAt = Date.now() + 30_000; failed = 0; }
        error.textContent = retryAt > Date.now() ? 'Слишком много попыток. Подожди 30 секунд.' : 'Неверный PIN.';
        current.select();
        return;
      }
      const updated = active.save ? await createPinRecord(newPin) : null;
      if (!dialog.open || active !== request) return;
      if (storage.getItem(PIN_KEY) !== active.raw) throw new Error('PIN изменён в другой вкладке. Открой это окно заново.');
      failed = 0;
      retryAt = 0;
      if (updated) storage.setItem(PIN_KEY, updated);
      cancel();
      if (updated) onCredentialChange();
    } catch (failure) {
      error.textContent = failure.message;
      return;
    } finally {
      if (active === request) submit.disabled = false;
    }
    active.complete?.();
  });

  return {show, cancel};
}

export {createPinRecord, verifyPin};
