// Light / dark theme. A plain script loaded before the stylesheet, so the page is never painted in the wrong theme.
// The choice ('light' | 'dark', or nothing for "as in the system") is kept per device in localStorage.
(() => {
  const KEY = 'cabinet-board:theme';
  const media = matchMedia('(prefers-color-scheme: dark)');
  const read = () => {
    try { const value = localStorage.getItem(KEY); return value === 'light' || value === 'dark' ? value : 'auto'; }
    catch { return 'auto'; }
  };
  const apply = () => {
    const mode = read();
    document.documentElement.dataset.theme = mode === 'auto' ? (media.matches ? 'dark' : 'light') : mode;
    window.dispatchEvent(new Event('cabinet-theme'));
  };
  window.cabinetTheme = {
    get mode() { return read(); },
    get theme() { return document.documentElement.dataset.theme; },
    set(mode) {
      try { if (mode === 'light' || mode === 'dark') localStorage.setItem(KEY, mode); else localStorage.removeItem(KEY); } catch {}
      apply();
    }
  };
  media.addEventListener('change', apply);
  window.addEventListener('storage', event => { if (event.key === KEY) apply(); });
  apply();
})();
