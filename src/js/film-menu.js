'use strict';

for (const menu of document.querySelectorAll('.film-menu')) {
  const summary = menu.querySelector('summary');
  const panel = menu.querySelector('.film-panel');
  let closing = false;

  async function rewind() {
    if (!menu.open || closing) return;
    closing = true;
    if (menu.contains(document.activeElement)) summary.focus();
    menu.classList.add('is-rewinding');
    await Promise.allSettled(panel.getAnimations().map(animation => animation.finished));
    menu.open = false;
    menu.classList.remove('is-rewinding');
    closing = false;
  }

  summary.addEventListener('click', event => {
    if (!menu.open) return;
    event.preventDefault();
    rewind();
  });
  document.addEventListener('keydown', event => {
    if (event.key === 'Escape' && menu.open) {
      event.preventDefault();
      rewind();
    }
  });
  document.addEventListener('click', event => {
    if (!menu.contains(event.target)) rewind();
  });
}
