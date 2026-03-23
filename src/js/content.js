const PLATFORM_ICONS = {
  x: '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-4.714-6.231-5.401 6.231H2.746l7.73-8.835L1.254 2.25H8.08l4.253 5.622zm-1.161 17.52h1.833L7.084 4.126H5.117z"/></svg>',
  instagram: '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M12 2.163c3.204 0 3.584.012 4.85.07 3.252.148 4.771 1.691 4.919 4.919.058 1.265.069 1.645.069 4.849 0 3.205-.012 3.584-.069 4.849-.149 3.225-1.664 4.771-4.919 4.919-1.266.058-1.644.07-4.85.07-3.204 0-3.584-.012-4.849-.07-3.26-.149-4.771-1.699-4.919-4.92-.058-1.265-.07-1.644-.07-4.849 0-3.204.013-3.583.07-4.849.149-3.227 1.664-4.771 4.919-4.919 1.266-.057 1.645-.069 4.849-.069zM12 0C8.741 0 8.333.014 7.053.072 2.695.272.273 2.69.073 7.052.014 8.333 0 8.741 0 12c0 3.259.014 3.668.072 4.948.2 4.358 2.618 6.78 6.98 6.98C8.333 23.986 8.741 24 12 24c3.259 0 3.668-.014 4.948-.072 4.354-.2 6.782-2.618 6.979-6.98.059-1.28.073-1.689.073-4.948 0-3.259-.014-3.667-.072-4.947-.196-4.354-2.617-6.78-6.979-6.98C15.668.014 15.259 0 12 0zm0 5.838a6.162 6.162 0 100 12.324 6.162 6.162 0 000-12.324zM12 16a4 4 0 110-8 4 4 0 010 8zm6.406-11.845a1.44 1.44 0 100 2.881 1.44 1.44 0 000-2.881z"/></svg>',
  github: '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M12 2C6.477 2 2 6.484 2 12.017c0 4.425 2.865 8.18 6.839 9.504.5.092.682-.217.682-.483 0-.237-.008-.868-.013-1.703-2.782.605-3.369-1.343-3.369-1.343-.454-1.158-1.11-1.466-1.11-1.466-.908-.62.069-.608.069-.608 1.003.07 1.531 1.032 1.531 1.032.892 1.53 2.341 1.088 2.91.832.092-.647.35-1.088.636-1.338-2.22-.253-4.555-1.113-4.555-4.951 0-1.093.39-1.988 1.029-2.688-.103-.253-.446-1.272.098-2.65 0 0 .84-.27 2.75 1.026A9.564 9.564 0 0112 6.844c.85.004 1.705.115 2.504.337 1.909-1.296 2.747-1.027 2.747-1.027.546 1.379.202 2.398.1 2.651.64.7 1.028 1.595 1.028 2.688 0 3.848-2.339 4.695-4.566 4.942.359.31.678.921.678 1.856 0 1.338-.012 2.419-.012 2.747 0 .268.18.58.688.482A10.019 10.019 0 0022 12.017C22 6.484 17.522 2 12 2z"/></svg>',
};

function setText(id, text) {
  const el = document.getElementById(id);
  if (el) el.textContent = text;
}

fetch('/content.json')
  .then(r => r.json())
  .then(data => {
    const { hero, footer, terminal, links, about, profile, works } = data;

    // ---- Hero ----
    if (hero) {
      setText('hero-tag', hero.tag);
      setText('hero-title', hero.title);
      setText('hero-sub', hero.sub);
    }

    // ---- Links ----
    if (links) {
      setText('links-group-name', links.groupName);
      const linksEl = document.getElementById('links-row');
      if (linksEl) {
        linksEl.innerHTML = links.items.map(l => `
          <a class="link-card" href="${l.url}" target="_blank" rel="noopener" data-platform="${l.platform}"${l.color ? ` style="--link-color:${l.color}"` : ''}>
            <span class="link-icon">${PLATFORM_ICONS[l.platform] ?? ''}</span>
            <span class="link-info">
              <span class="link-platform">${l.label}</span>
              <span class="link-handle">${l.handle}</span>
            </span>
            <span class="link-arrow">↗</span>
          </a>
        `).join('');
      }
    }

    // ---- Terminal ----
    if (terminal) {
      setText('term-title', terminal.title);
      setText('term-prompt', terminal.prompt);
    }

    // ---- Footer ----
    if (footer) {
      setText('footer-logo', footer.logo);
      setText('footer-copy', footer.copy);
    }

    // ---- About (index page snippet) ----
    const aboutEl = document.getElementById('about-text');
    if (aboutEl && about) {
      const bios = about.bio.map(t => `<p>${t}</p>`).join('');
      const chips = about.chips.map(c => `<span class="chip">${c}</span>`).join('');
      aboutEl.innerHTML = `
        <p>はじめまして、<strong>${about.name}</strong> です。</p>
        ${bios}
        <div class="tags">${chips}</div>
      `;
    }

    // ---- Profile (about page) ----
    if (profile) {
      setText('profile-label', profile.label);
      setText('profile-name', profile.name);
      setText('profile-handle', profile.handle);

      const bioEl = document.getElementById('profile-bio');
      if (bioEl) bioEl.innerHTML = profile.bio.join('<br>');

      const chipsEl = document.getElementById('profile-chips');
      if (chipsEl) {
        chipsEl.innerHTML = profile.chips.map(c => `<span class="chip">${c}</span>`).join('');
      }

      setText('code-file-name', profile.codeFile);

      const codeEl = document.getElementById('code-block');
      if (codeEl) {
        codeEl.textContent = profile.codeBlock;
        if (typeof hljs !== 'undefined') hljs.highlightElement(codeEl);
      }
    }

    // ---- Works ----
    const worksEl = document.getElementById('works-grid');
    if (worksEl && works) {
      worksEl.innerHTML = works.map(w => {
        const icon = w.icon.startsWith('http')
          ? `<img src="${w.icon}" alt="${w.title}">`
          : w.icon;
        return `
          <a class="work-card" href="${w.url}" target="_blank" rel="noopener"${w.color ? ` style="--work-color:${w.color}"` : ''}>
            <div class="work-icon">${icon}</div>
            <h3>${w.title}</h3>
            <p>${w.desc}</p>
          </a>
        `;
      }).join('');
    }

  })
  .catch(err => console.error('content.json の読み込みに失敗:', err));
