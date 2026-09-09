// Apply before the page renders; storage may be unavailable in private browsing.
(() => {
  const root = document.documentElement;
  const key = 'hrmc-macos-appearance';
  const paletteKey = 'hrmc-macos-palette';
  const seasonalDefaultKey = 'hrmc-seasonal-default-v1';
  const palettes = ['seasonal', 'classic', 'ghost', 'mono', 'ocean', 'rose', 'engraving'];
  const paletteLabel = name => ({ seasonal: '季節（自動）', engraving: '線画' })[name] || name[0].toUpperCase() + name.slice(1);
  const seasonLabels = { spring: '春', summer: '夏', autumn: '秋', winter: '冬' };
  let palette = 'seasonal';
  try {
    // Adopt the seasonal default once, including browsers with an older choice.
    // Subsequent explicit selections still persist normally.
    if (localStorage.getItem(seasonalDefaultKey) !== '1') {
      localStorage.setItem(paletteKey, 'seasonal');
      localStorage.setItem(seasonalDefaultKey, '1');
    }
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
    // Match the existing hero weather's local-calendar seasons.
    const month = new Date().getMonth() + 1;
    const season = month >= 3 && month <= 5 ? 'spring'
      : month >= 6 && month <= 8 ? 'summer'
      : month >= 9 && month <= 11 ? 'autumn' : 'winter';
    root.dataset.season = season;
    root.dataset.macPalette = palette;
    const paletteSelect = document.getElementById('mac-palette');
    if (paletteSelect) paletteSelect.value = palette;
    const picker = document.getElementById('mac-palette-picker');
    if (picker) {
      picker.querySelector('.palette-current').textContent = palette === 'seasonal'
        ? `季節・${seasonLabels[season]}` : paletteLabel(palette);
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
    const appearancePicker = document.getElementById('mac-appearance-picker');
    if (appearancePicker) {
      appearancePicker.dataset.selectedMode = preference;
      const selected = appearancePicker.querySelector(`[data-appearance-mode="${preference}"]`);
      appearancePicker.querySelector('.appearance-current').innerHTML =
        selected.innerHTML.replaceAll('appearance-', 'appearance-current-');
      appearancePicker.querySelector('summary').setAttribute('aria-label', `表示モード: ${selected.title}`);
    }
  }
  apply();
  system.addEventListener('change', apply);
  // Refresh after returning to a tab that was left open across a season change.
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') apply();
  });
  window.addEventListener('pageshow', apply);
  window.addEventListener('storage', event => {
    if (event.key === paletteKey || event.key === null) {
      palette = palettes.includes(event.newValue) ? event.newValue : 'seasonal';
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
          <span class="palette-name">${paletteLabel(name)}</span></span>
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
      palette = palettes.includes(paletteSelect.value) ? paletteSelect.value : 'seasonal';
      try { localStorage.setItem(paletteKey, palette); } catch {}
      apply();
    });
    const select = document.getElementById('mac-appearance');
    if (!select) return;
    const modeButtons = document.createElement('div');
    modeButtons.className = 'appearance-modes';
    modeButtons.setAttribute('role', 'group');
    modeButtons.setAttribute('aria-label', '表示モード');
    // Luminance masks preserve the engraved detail and inherit the theme color.
    function celestialIcon(mode) {
      const asset = mode === 'dark' ? 'moon-engraved-crescent.png' : 'sun-engraved-disc.png';
      const maskId = `appearance-${mode}-surface`;
      return `<svg class="appearance-celestial" width="26" height="26" viewBox="0 0 100 100" aria-hidden="true">
        <defs>
          <mask id="${maskId}" maskUnits="userSpaceOnUse" x="0" y="0" width="100" height="100" style="mask-type: luminance">
            <image href="/image/${asset}" width="100" height="100"/>
          </mask>
        </defs>
        <rect width="100" height="100" fill="currentColor" mask="url(#${maskId})"/>
      </svg>`;
    }
    const icons = {
      light: celestialIcon('light'),
      dark: celestialIcon('dark'),
      system: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="3" y="4" width="18" height="13" rx="2"/><path d="M8 21h8m-4-4v4"/></svg>'
    };
    const labels = { light: 'ライト（太陽）', dark: 'ダーク（月）', system: '自動（端末の設定に合わせる）' };
    modeButtons.innerHTML = ['light', 'dark', 'system'].map(mode => `<button type="button"
      data-appearance-mode="${mode}" aria-label="${labels[mode]}" title="${labels[mode]}" aria-pressed="false">
      ${icons[mode]}
    </button>`).join('');
    const appearancePicker = document.createElement('details');
    appearancePicker.id = 'mac-appearance-picker';
    appearancePicker.innerHTML = `<summary><span class="appearance-current" aria-hidden="true"></span><span aria-hidden="true">⌄</span></summary>`;
    appearancePicker.append(modeButtons);
    select.before(appearancePicker);
    select.hidden = true;
    modeButtons.addEventListener('click', event => {
      const button = event.target.closest('[data-appearance-mode]');
      if (!button) return;
      select.value = button.dataset.appearanceMode;
      select.dispatchEvent(new Event('change'));
      appearancePicker.open = false;
      appearancePicker.querySelector('summary').focus();
    });
    appearancePicker.addEventListener('keydown', event => {
      if (event.key === 'Escape') {
        appearancePicker.open = false;
        appearancePicker.querySelector('summary').focus();
        event.preventDefault();
      }
    });
    document.addEventListener('click', event => {
      if (!appearancePicker.contains(event.target)) appearancePicker.open = false;
    });
    document.addEventListener('focusin', event => {
      if (!appearancePicker.contains(event.target)) appearancePicker.open = false;
    });
    apply();
    select.addEventListener('change', () => {
      preference = modes.includes(select.value) ? select.value : 'system';
      try { localStorage.setItem(key, preference); } catch {}
      apply();
    });
  });
})();
