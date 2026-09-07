// Apply before the page renders; storage may be unavailable in private browsing.
(() => {
  const root = document.documentElement;
  const key = 'hrmc-macos-appearance';
  const modes = ['system', 'light', 'dark'];
  const system = window.matchMedia('(prefers-color-scheme: dark)');
  let preference = 'system';
  try {
    const saved = localStorage.getItem(key);
    if (modes.includes(saved)) preference = saved;
  } catch {}

  function apply() {
    root.dataset.appearance = preference === 'system'
      ? (system.matches ? 'dark' : 'light') : preference;
    const select = document.getElementById('mac-appearance');
    if (select) select.value = preference;
  }
  apply();
  system.addEventListener('change', apply);
  window.addEventListener('storage', event => {
    if (event.key !== key && event.key !== null) return;
    preference = modes.includes(event.newValue) ? event.newValue : 'system';
    apply();
  });
  document.addEventListener('DOMContentLoaded', () => {
    const select = document.getElementById('mac-appearance');
    if (!select) return;
    apply();
    select.addEventListener('change', () => {
      preference = modes.includes(select.value) ? select.value : 'system';
      try { localStorage.setItem(key, preference); } catch {}
      apply();
    });
  });
})();
