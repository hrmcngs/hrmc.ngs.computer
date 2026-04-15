(() => {
  const inode = Math.floor(Math.random() * 90000 + 10000);
  document.getElementById('lf-inode').textContent = 'inode#' + inode;

  const requested = (location.pathname + location.search) || '/unknown';
  const lines = [
    { t: 'prompt', cmd: 'fsck -y /dev/hrmc0' },
    { t: 'out',    text: 'Phase 1: Checking blocks and sizes' },
    { t: 'out',    text: 'Phase 2: Checking pathnames' },
    { t: 'warn',   text: 'UNREF FILE  I=' + inode + '  OWNER=nobody' },
    { t: 'warn',   text: '  path: ' + requested },
    { t: 'warn',   text: '  size: 0  mtime: ' + new Date().toISOString() },
    { t: 'out',    text: 'RECONNECT? yes' },
    { t: 'ok',     text: 'CLEARED' },
    { t: 'out',    text: 'moved orphan → /lost+found/inode#' + inode },
    { t: 'out',    text: '' },
    { t: 'prompt', cmd: 'ls /lost+found/' },
    { t: 'ok',     text: '404.page  empty.dream  forgotten.log  you.here' },
    { t: 'out',    text: '' },
    { t: 'prompt', cmd: 'cat /lost+found/404.page' },
    { t: 'err',    text: 'このページは存在しないか、移動または削除されました。' },
  ];

  const body = document.getElementById('lf-term-body');
  const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
  let delay = 0;
  const step = reduce ? 0 : 260;

  lines.forEach((ln) => {
    setTimeout(() => {
      const row = document.createElement('div');
      row.className = 'lf-line lf-line--' + ln.t;
      if (ln.t === 'prompt') {
        row.innerHTML = '<span class="lf-prompt">hrmc@rescue $</span><span class="lf-cmd"></span><span class="lf-cursor">▊</span>';
        body.appendChild(row);
        body.scrollTop = body.scrollHeight;
        const cmdSpan = row.querySelector('.lf-cmd');
        const cursor = row.querySelector('.lf-cursor');
        if (reduce) {
          cmdSpan.textContent = ' ' + ln.cmd;
          cursor.remove();
        } else {
          let idx = 0;
          const typed = ' ' + ln.cmd;
          const tick = setInterval(() => {
            cmdSpan.textContent = typed.slice(0, idx++);
            if (idx > typed.length) {
              clearInterval(tick);
              cursor.remove();
            }
          }, 28);
        }
      } else {
        row.textContent = ln.text;
        body.appendChild(row);
        body.scrollTop = body.scrollHeight;
      }
    }, delay);
    delay += ln.t === 'prompt' ? step * 2 : step;
  });

  document.getElementById('lf-back').addEventListener('click', () => {
    if (history.length > 1) history.back();
    else location.href = '/';
  });

  const pad = (n) => String(n).padStart(2, '0');
  const clockEl = document.getElementById('lf-clock');
  const sigEl = document.getElementById('lf-sig');
  const bytesEl = document.getElementById('lf-bytes');
  const tickClock = () => {
    const d = new Date();
    if (clockEl) clockEl.textContent = pad(d.getHours()) + ':' + pad(d.getMinutes()) + ':' + pad(d.getSeconds());
  };
  tickClock();
  setInterval(tickClock, 1000);

  const sigStates = ['NO INPUT', 'SCANNING', 'LOST', 'WEAK', 'DECODE ERR'];
  let sigIdx = 0;
  if (sigEl && !reduce) {
    setInterval(() => {
      sigIdx = (sigIdx + 1) % sigStates.length;
      sigEl.textContent = sigStates[sigIdx];
    }, 1800);
  }

  if (bytesEl && !reduce) {
    setInterval(() => {
      bytesEl.textContent = '0x' + Math.floor(Math.random() * 0xFFFF).toString(16).toUpperCase().padStart(4, '0');
    }, 400);
  }

  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') location.href = '/';
  });

  document.querySelectorAll('.lf-hist-row').forEach((row, i) => {
    const val = parseFloat(row.dataset.val) || 0;
    const max = parseFloat(row.dataset.max) || 1;
    const pct = Math.max(1.2, (val / max) * 100);
    const bar = row.querySelector('.lf-hist-bar > span');
    if (!bar) return;
    bar.style.setProperty('--lf-w', pct.toFixed(2) + '%');
    bar.style.animationDelay = (0.15 + i * 0.08) + 's';
  });

  const dateEl = document.getElementById('lf-report-date');
  if (dateEl) {
    const d = new Date();
    dateEl.textContent = d.getFullYear() + '.' + pad(d.getMonth() + 1) + '.' + pad(d.getDate());
  }

  console.error('404 — orphan inode reconnected to /lost+found/');
  console.log('%cfsck: clean, but the page is gone.', 'color:#7c6af7');
})();
