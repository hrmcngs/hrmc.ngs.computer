// Intersection Observer でスクロールアニメーション
const targets = document.querySelectorAll(
  '.section-title, .about-grid, .links-group, .works-grid, .omake-section, .katana-grid'
);

const observer = new IntersectionObserver(
  (entries) => {
    entries.forEach((entry) => {
      if (entry.isIntersecting) {
        entry.target.classList.add('in-view');
      }
    });
  },
  { threshold: 0.1 }
);

targets.forEach((el) => observer.observe(el));

// 重いツールはTerminalに近づいてから準備し、実体はコマンド実行時に読む。
const terminalSection = document.getElementById('terminal');
if (terminalSection) {
  let terminalLoaded = false;
  const loadTerminal = () => {
    if (terminalLoaded) return;
    terminalLoaded = true;
    const script = document.createElement('script');
    script.src = '/src/js/terminal.js?v=2026-09-05-2';
    script.onerror = () => { terminalLoaded = false; script.remove(); };
    document.head.append(script);
  };
  const terminalObserver = new IntersectionObserver(entries => {
    if (entries.some(entry => entry.isIntersecting)) loadTerminal();
  }, { rootMargin: '400px' });
  terminalObserver.observe(terminalSection);
  terminalSection.addEventListener('focusin', loadTerminal);
  terminalSection.addEventListener('pointerdown', loadTerminal, { passive: true });
}

// ニキシー管の光や点滅は、カードが見えている間だけ動かす。
const worksGrid = document.getElementById('works-grid');
if (worksGrid) {
  const cardObserver = new IntersectionObserver(entries => {
    entries.forEach(entry => entry.target.classList.toggle('card-visible', entry.isIntersecting));
  });
  const observedCards = new WeakSet();
  const observeCards = () => worksGrid.querySelectorAll('.work-card').forEach(card => {
    if (observedCards.has(card)) return;
    observedCards.add(card);
    cardObserver.observe(card);
  });
  new MutationObserver(observeCards).observe(worksGrid, { childList: true });
  observeCards();
}
const syncPageVisibility = () => document.documentElement.classList.toggle('page-hidden', document.hidden);
document.addEventListener('visibilitychange', syncPageVisibility);
syncPageVisibility();
