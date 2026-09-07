// Only run the menu clock while the desktop theme is visible.
(() => {
  const clock = document.getElementById('mac-clock');
  if (!clock) return;
  let timer;
  const formatter = new Intl.DateTimeFormat('ja-JP', { hour: '2-digit', minute: '2-digit', hour12: false });
  function sync() {
    clearInterval(timer);
    if (document.hidden || document.documentElement.dataset.siteTheme !== 'macos') return;
    const tick = () => {
      const now = new Date();
      clock.dateTime = now.toISOString();
      clock.textContent = formatter.format(now);
      clock.title = now.toLocaleDateString('ja-JP', { dateStyle: 'full' });
    };
    tick();
    timer = setInterval(tick, 30000);
  }
  new MutationObserver(sync).observe(document.documentElement, { attributes: true, attributeFilter: ['data-site-theme'] });
  document.addEventListener('visibilitychange', sync);
  sync();
})();
