(() => {
  const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;

  document.querySelectorAll('.lf-hist-row').forEach((row, i) => {
    const val = parseFloat(row.dataset.val) || 0;
    const max = parseFloat(row.dataset.max) || 1;
    const pct = Math.max(1.5, (val / max) * 100);
    const bar = row.querySelector('.lf-hist-bar > span');
    if (!bar) return;
    bar.style.setProperty('--lf-w', pct.toFixed(2) + '%');
    if (!reduce) bar.style.animationDelay = (0.2 + i * 0.1) + 's';
  });

  console.error('404 — /lost+found/');
})();
