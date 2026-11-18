// Apply before the page renders; storage may be unavailable in private browsing.
(() => {
  const root = document.documentElement;
  const key = 'hrmc-macos-appearance';
  const paletteKey = 'hrmc-macos-palette';
  const defaultPalette = 'mono';
  const palettes = ['mono'];
  const paletteLabel = () => 'Mono';
  const seasonLabels = { spring: '春', summer: '夏', autumn: '秋', winter: '冬' };
  const params = new URLSearchParams(location.search);
  const linkedPalette = palettes.includes(params.get('palette')) ? params.get('palette') : null;
  const linkedSeason = Object.hasOwn(seasonLabels, params.get('season')) ? params.get('season') : null;
  let palette = defaultPalette;
  const modes = ['system', 'light', 'dark'];
  const linkedAppearance = modes.includes(params.get('appearance')) ? params.get('appearance') : null;
  const system = window.matchMedia('(prefers-color-scheme: dark)');
  let preference = 'system';
  try {
    const saved = localStorage.getItem(key);
    if (modes.includes(saved)) preference = saved;
  } catch {}
  if (linkedPalette) palette = linkedPalette;
  if (linkedAppearance) preference = linkedAppearance;

  function updateLinkedChoice(name, value) {
    if (!params.has(name)) return;
    const url = new URL(location.href);
    url.searchParams.set(name, value);
    try { history.replaceState(history.state, '', url); } catch {}
  }

  function getShareURL() {
    const url = new URL(window.theme?.getShareURL() ?? location.href);
    url.searchParams.set('palette', palette);
    // Capture the rendered mode/season so recipients see the same appearance.
    url.searchParams.set('appearance', root.dataset.appearance);
    if (palette === 'seasonal') url.searchParams.set('season', root.dataset.season);
    else url.searchParams.delete('season');
    return url.toString();
  }
  window.appearance = { getShareURL };

  function apply() {
    // Match the existing hero weather's local-calendar seasons.
    const month = new Date().getMonth() + 1;
    const season = linkedSeason || (month >= 3 && month <= 5 ? 'spring'
      : month >= 6 && month <= 8 ? 'summer'
      : month >= 9 && month <= 11 ? 'autumn' : 'winter');
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
      const previousMode = appearancePicker.dataset.selectedMode;
      appearancePicker.dataset.selectedMode = preference;
      const selected = appearancePicker.querySelector(`[data-appearance-mode="${preference}"]`);
      appearancePicker.querySelector('.appearance-current').innerHTML =
        selected.innerHTML.replaceAll('appearance-', 'appearance-current-');
      appearancePicker.querySelector('summary').setAttribute('aria-label', `表示モード: ${selected.title}`);
      if (previousMode && previousMode !== preference) {
        appearancePicker.classList.remove('is-switching');
        void appearancePicker.offsetWidth;
        appearancePicker.classList.add('is-switching');
        window.setTimeout(() => appearancePicker.classList.remove('is-switching'), 460);
      }
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
    if (!linkedPalette && (event.key === paletteKey || event.key === null)) {
      palette = palettes.includes(event.newValue) ? event.newValue : defaultPalette;
    }
    if (!linkedAppearance && (event.key === key || event.key === null)) {
      preference = modes.includes(event.newValue) ? event.newValue : 'system';
    }
    apply();
  });
  document.addEventListener('DOMContentLoaded', () => {
    const paletteSelect = document.getElementById('mac-palette');
    if (paletteSelect) {
      const picker = document.createElement('details');
      picker.id = 'mac-palette-picker';
      picker.innerHTML = `<summary aria-label="テーマを選ぶ">
        <span class="palette-swatch" aria-hidden="true"></span>
        <span class="palette-current"></span><span aria-hidden="true">⌄</span>
      </summary><fieldset class="palette-panel"><legend>Theme</legend>
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
      palette = palettes.includes(paletteSelect.value) ? paletteSelect.value : defaultPalette;
      updateLinkedChoice('palette', palette);
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
      ${icons[mode]}<span class="appearance-mode-label">${mode[0].toUpperCase() + mode.slice(1)}</span>
    </button>`).join('');
    const appearancePicker = document.createElement('details');
    appearancePicker.id = 'mac-appearance-picker';
    appearancePicker.innerHTML = `<summary>
      <svg class="projector-illustration" viewBox="0 0 180 150" aria-hidden="true">
        <g class="projector-reel-svg projector-reel-svg-top">
          <circle class="projector-metal" cx="116" cy="35" r="29"/>
          <circle class="projector-hole" cx="116" cy="20" r="7"/><circle class="projector-hole" cx="131" cy="35" r="7"/>
          <circle class="projector-hole" cx="116" cy="50" r="7"/><circle class="projector-hole" cx="101" cy="35" r="7"/>
          <circle class="projector-hub" cx="116" cy="35" r="4"/>
        </g>
        <g class="projector-reel-svg projector-reel-svg-side">
          <circle class="projector-metal" cx="145" cy="83" r="24"/>
          <circle class="projector-hole" cx="145" cy="71" r="6"/><circle class="projector-hole" cx="157" cy="83" r="6"/>
          <circle class="projector-hole" cx="145" cy="95" r="6"/><circle class="projector-hole" cx="133" cy="83" r="6"/>
          <circle class="projector-hub" cx="145" cy="83" r="3.5"/>
        </g>
        <path class="projector-handle-svg" d="M67 59V48q0-6 6-6h18q6 0 6 6v11"/>
        <rect class="projector-body-svg" x="54" y="56" width="79" height="55" rx="5"/>
        <path class="projector-seam-svg" d="M67 57v53M72 87h25M72 93h31"/>
        <circle class="projector-dial-svg" cx="78" cy="72" r="5"/><circle class="projector-dial-svg" cx="94" cy="72" r="4"/>
        <path class="projector-lens-svg" d="M54 69H31v25h23M31 72H19v19h12"/>
        <ellipse class="projector-glass-svg" cx="18" cy="81.5" rx="5" ry="11"/>
        <path class="projector-mount-svg" d="M83 111v8h20v-8M87 119l-15 28M98 119l16 28M93 119v28"/>
      </svg>
      <span class="projector-projection" aria-hidden="true"><span class="projector-image-noise"></span></span>
      <span class="projector-beam-noise" aria-hidden="true"></span>
      <span class="appearance-current" aria-hidden="true"></span><span aria-hidden="true">⌄</span>
    </summary>`;
    appearancePicker.append(modeButtons);
    select.before(appearancePicker);
    select.hidden = true;
    const updateProjectorReelSpeed = () => {
      requestAnimationFrame(() => {
        appearancePicker.querySelectorAll('.projector-reel-svg').forEach(reel => {
          reel.getAnimations().forEach(animation => {
            if (animation.animationName === 'projector-idle-reel') {
              animation.updatePlaybackRate(appearancePicker.open ? 10 : 1);
            }
          });
        });
      });
    };
    appearancePicker.addEventListener('toggle', updateProjectorReelSpeed);
    modeButtons.addEventListener('click', event => {
      const button = event.target.closest('[data-appearance-mode]');
      if (!button) return;
      select.value = button.dataset.appearanceMode;
      select.dispatchEvent(new Event('change'));
      appearancePicker.open = false;
      updateProjectorReelSpeed();
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
      updateLinkedChoice('appearance', preference);
      try { localStorage.setItem(key, preference); } catch {}
      apply();
    });
  });
})();
