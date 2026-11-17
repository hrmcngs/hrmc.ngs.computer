(() => {
  console.error('404 — /lost+found/');
  const path = document.querySelector('.lf-path');
  if (path) path.textContent = location.pathname + location.search + location.hash;
})();
