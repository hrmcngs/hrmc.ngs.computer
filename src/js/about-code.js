(() => {
  const button = document.querySelector('.code-copy');
  const code = document.getElementById('code-block');
  if (!button || !code) return;

  button.addEventListener('click', async () => {
    try {
      await navigator.clipboard.writeText(code.textContent);
      button.textContent = 'Copied';
      button.setAttribute('aria-label', 'コピーしました');
    } catch {
      button.textContent = 'Failed';
    }

    window.setTimeout(() => {
      button.textContent = 'Copy';
      button.setAttribute('aria-label', 'JavaScriptをコピー');
    }, 1600);
  });
})();
