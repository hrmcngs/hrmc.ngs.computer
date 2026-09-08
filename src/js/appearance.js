// Apply before the page renders; storage may be unavailable in private browsing.
(() => {
  const root = document.documentElement;
  const key = 'hrmc-macos-appearance';
  const paletteKey = 'hrmc-macos-palette';
  const palettes = ['classic', 'ghost', 'mono', 'ocean', 'rose'];
  let palette = 'classic';
  try {
    const saved = localStorage.getItem(paletteKey);
    if (palettes.includes(saved)) palette = saved;
  } catch {}
  const modes = ['system', 'light', 'dark'];
  const system = window.matchMedia('(prefers-color-scheme: dark)');
  let preference = 'system';
  try {
    const saved = localStorage.getItem(key);
    if (modes.includes(saved)) preference = saved;
  } catch {}

  function apply() {
    root.dataset.macPalette = palette;
    const paletteSelect = document.getElementById('mac-palette');
    if (paletteSelect) paletteSelect.value = palette;
    const picker = document.getElementById('mac-palette-picker');
    if (picker) {
      picker.querySelector('.palette-current').textContent = palette[0].toUpperCase() + palette.slice(1);
      picker.querySelector('summary .palette-swatch').dataset.swatch = palette;
      picker.querySelectorAll('input').forEach(input => { input.checked = input.value === palette; });
    }
    root.dataset.appearance = preference === 'system'
      ? (system.matches ? 'dark' : 'light') : preference;
    const select = document.getElementById('mac-appearance');
    if (select) select.value = preference;
    document.querySelectorAll('[data-appearance-mode]').forEach(button => {
      button.setAttribute('aria-pressed', String(button.dataset.appearanceMode === preference));
    });
  }
  apply();
  system.addEventListener('change', apply);
  window.addEventListener('storage', event => {
    if (event.key === paletteKey || event.key === null) {
      palette = palettes.includes(event.newValue) ? event.newValue : 'classic';
    }
    if (event.key === key || event.key === null) {
      preference = modes.includes(event.newValue) ? event.newValue : 'system';
    }
    apply();
  });
  document.addEventListener('DOMContentLoaded', () => {
    const paletteSelect = document.getElementById('mac-palette');
    if (paletteSelect) {
      const picker = document.createElement('details');
      picker.id = 'mac-palette-picker';
      picker.innerHTML = `<summary aria-label="カラーテーマを選ぶ">
        <span class="palette-swatch" aria-hidden="true"></span>
        <span class="palette-current"></span><span aria-hidden="true">⌄</span>
      </summary><fieldset class="palette-panel"><legend>カラーテーマ</legend>
        <div class="palette-options">${palettes.map(name => `<label class="palette-option">
          <input type="radio" name="mac-palette-choice" value="${name}">
          <span class="palette-preview"><span class="palette-swatch" data-swatch="${name}" aria-hidden="true"></span>
          <span class="palette-name">${name[0].toUpperCase() + name.slice(1)}</span></span>
        </label>`).join('')}</div></fieldset>`;
      paletteSelect.before(picker);
      paletteSelect.hidden = true;
      picker.addEventListener('change', event => {
        if (!palettes.includes(event.target.value)) return;
        paletteSelect.value = event.target.value;
        paletteSelect.dispatchEvent(new Event('change'));
      });
      picker.addEventListener('keydown', event => {
        if (event.key === 'Escape') {
          picker.open = false;
          picker.querySelector('summary').focus();
          event.preventDefault();
        }
      });
      document.addEventListener('click', event => {
        if (!picker.contains(event.target)) picker.open = false;
      });
      document.addEventListener('focusin', event => {
        if (!picker.contains(event.target)) picker.open = false;
      });
    }
    paletteSelect?.addEventListener('change', () => {
      palette = palettes.includes(paletteSelect.value) ? paletteSelect.value : 'classic';
      try { localStorage.setItem(paletteKey, palette); } catch {}
      apply();
    });
    const select = document.getElementById('mac-appearance');
    if (!select) return;
    const modeButtons = document.createElement('div');
    modeButtons.className = 'appearance-modes';
    modeButtons.setAttribute('role', 'group');
    modeButtons.setAttribute('aria-label', '表示モード');
    const icons = {
      light: '<circle cx="12" cy="12" r="4"/><path d="M12 2v2m0 16v2M2 12h2m16 0h2M5 5l1.5 1.5m11 11L19 19M5 19l1.5-1.5m11-11L19 5"/>',
      dark: '<path d="M20.5 13.2A8.5 8.5 0 0 1 10.8 3.5 8.5 8.5 0 1 0 20.5 13.2Z"/>',
      system: '<rect x="3" y="4" width="18" height="13" rx="2"/><path d="M8 21h8m-4-4v4"/>'
    };
    const labels = { light: 'ライト（太陽）', dark: 'ダーク（月）', system: '自動（端末の設定に合わせる）' };
    modeButtons.innerHTML = ['light', 'dark', 'system'].map(mode => `<button type="button"
      data-appearance-mode="${mode}" aria-label="${labels[mode]}" title="${labels[mode]}" aria-pressed="false">
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${icons[mode]}</svg>
    </button>`).join('');
    select.before(modeButtons);
    select.hidden = true;
    modeButtons.addEventListener('click', event => {
      const button = event.target.closest('[data-appearance-mode]');
      if (!button) return;
      select.value = button.dataset.appearanceMode;
      select.dispatchEvent(new Event('change'));
    });
    apply();
    select.addEventListener('change', () => {
      preference = modes.includes(select.value) ? select.value : 'system';
      try { localStorage.setItem(key, preference); } catch {}
      apply();
    });
  });
})();
