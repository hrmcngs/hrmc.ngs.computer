const PLATFORM_ICONS = {
  x: '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-4.714-6.231-5.401 6.231H2.746l7.73-8.835L1.254 2.25H8.08l4.253 5.622zm-1.161 17.52h1.833L7.084 4.126H5.117z"/></svg>',
  instagram: '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M12 2.163c3.204 0 3.584.012 4.85.07 3.252.148 4.771 1.691 4.919 4.919.058 1.265.069 1.645.069 4.849 0 3.205-.012 3.584-.069 4.849-.149 3.225-1.664 4.771-4.919 4.919-1.266.058-1.644.07-4.85.07-3.204 0-3.584-.012-4.849-.07-3.26-.149-4.771-1.699-4.919-4.92-.058-1.265-.07-1.644-.07-4.849 0-3.204.013-3.583.07-4.849.149-3.227 1.664-4.771 4.919-4.919 1.266-.057 1.645-.069 4.849-.069zM12 0C8.741 0 8.333.014 7.053.072 2.695.272.273 2.69.073 7.052.014 8.333 0 8.741 0 12c0 3.259.014 3.668.072 4.948.2 4.358 2.618 6.78 6.98 6.98C8.333 23.986 8.741 24 12 24c3.259 0 3.668-.014 4.948-.072 4.354-.2 6.782-2.618 6.979-6.98.059-1.28.073-1.689.073-4.948 0-3.259-.014-3.667-.072-4.947-.196-4.354-2.617-6.78-6.979-6.98C15.668.014 15.259 0 12 0zm0 5.838a6.162 6.162 0 100 12.324 6.162 6.162 0 000-12.324zM12 16a4 4 0 110-8 4 4 0 010 8zm6.406-11.845a1.44 1.44 0 100 2.881 1.44 1.44 0 000-2.881z"/></svg>',
  github: '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M12 2C6.477 2 2 6.484 2 12.017c0 4.425 2.865 8.18 6.839 9.504.5.092.682-.217.682-.483 0-.237-.008-.868-.013-1.703-2.782.605-3.369-1.343-3.369-1.343-.454-1.158-1.11-1.466-1.11-1.466-.908-.62.069-.608.069-.608 1.003.07 1.531 1.032 1.531 1.032.892 1.53 2.341 1.088 2.91.832.092-.647.35-1.088.636-1.338-2.22-.253-4.555-1.113-4.555-4.951 0-1.093.39-1.988 1.029-2.688-.103-.253-.446-1.272.098-2.65 0 0 .84-.27 2.75 1.026A9.564 9.564 0 0112 6.844c.85.004 1.705.115 2.504.337 1.909-1.296 2.747-1.027 2.747-1.027.546 1.379.202 2.398.1 2.651.64.7 1.028 1.595 1.028 2.688 0 3.848-2.339 4.695-4.566 4.942.359.31.678.921.678 1.856 0 1.338-.012 2.419-.012 2.747 0 .268.18.58.688.482A10.019 10.019 0 0022 12.017C22 6.484 17.522 2 12 2z"/></svg>',
  pixiv: '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M2 2h20v20H2V2zm5.5 4v12h2v-4h2.5c2.76 0 5-1.79 5-4s-2.24-4-5-4H7.5zm2 2H12c1.66 0 3 .9 3 2s-1.34 2-3 2H9.5V8z"/></svg>',
  bluesky: '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M12 10.8c-1.087-2.114-4.046-6.053-6.798-7.995C2.566.944 1.561 1.266.902 1.565.139 1.908 0 3.08 0 3.768c0 .69.378 5.65.624 6.479.785 2.627 3.59 3.513 6.182 3.2-3.832.655-7.128 2.59-2.806 7.553 4.394 4.625 6.16-1.174 8-4.363 1.84 3.19 3.178 8.736 8 4.363 4.322-4.963 1.026-6.898-2.806-7.553 2.592.313 5.397-.573 6.182-3.2C23.622 9.418 24 4.458 24 3.768c0-.69-.139-1.861-.902-2.203-.659-.3-1.664-.62-4.3 1.24C16.046 4.748 13.087 8.687 12 10.8z"/></svg>',
  buymeacoffee: '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M20.216 6.415l-.132-.666c-.119-.598-.388-1.163-1.001-1.379-.197-.069-.42-.098-.57-.241-.152-.143-.196-.366-.231-.572-.065-.378-.125-.756-.192-1.133-.057-.325-.102-.69-.25-.987-.195-.4-.597-.634-.996-.788a5.723 5.723 0 00-.626-.194c-1-.263-2.05-.36-3.077-.416a25.834 25.834 0 00-3.7.062c-.915.083-1.88.184-2.75.5-.318.116-.646.256-.888.501-.297.302-.393.77-.177 1.146.154.267.415.456.692.58.36.162.737.284 1.123.366 1.075.238 2.189.331 3.287.37 1.218.05 2.437.01 3.65-.118.299-.033.598-.073.896-.119.352-.054.578-.513.474-.834-.124-.383-.457-.531-.834-.473-.466.074-.96.108-1.382.146-1.177.08-2.358.082-3.536.006a22.228 22.228 0 01-1.157-.107c-.086-.01-.18-.025-.258-.036-.243-.036-.484-.08-.724-.13-.111-.027-.111-.185 0-.212h.005c.277-.06.557-.108.838-.147h.002c.131-.009.263-.032.394-.048a25.076 25.076 0 013.426-.12c.674.019 1.347.062 2.014.13l.04.005c.11.01.207.023.337.033.257.02.514.04.77.07.485.058.964.152 1.413.36.416.19.752.5.953.899.108.215.167.455.197.696.038.29.067.584.109.875.013.088.039.18.06.26.133.482.516.564.882.435.367-.13.583-.474.587-.87 0-.006 0-.015.002-.023z"/><path d="M7.5 12.5v5.5a2.5 2.5 0 002.5 2.5h4a2.5 2.5 0 002.5-2.5v-5.5m-9 0h9m-9 0H6a1.5 1.5 0 010-3h12a1.5 1.5 0 010 3h-1.5"/></svg>',
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

      const infoEl = document.getElementById('profile-info');
      if (infoEl) {
        let infoHtml = '';
        if (profile.birthday) {
          const bd = new Date(profile.birthday);
          const age = Math.floor((new Date() - bd) / (365.25 * 24 * 3600 * 1000));
          const formatted = `${bd.getFullYear()}.${String(bd.getMonth()+1).padStart(2,'0')}.${String(bd.getDate()).padStart(2,'0')}`;
          infoHtml += `<p class="info-birthday">生年月日 <strong>${formatted}</strong>（${age}歳）</p>`;
        }
        if (profile.education?.length) {
          const items = profile.education.map(e =>
            `<div class="edu-item"><span class="edu-date">${e.entered}</span><span class="edu-label">${e.label} 入学</span></div>`
          ).join('');
          infoHtml += `<div class="edu-timeline">${items}</div>`;
        }
        infoEl.innerHTML = infoHtml;
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
        const tags = (w.tags ?? []).map(t => `<span class="work-tag">${t}</span>`).join('');
      return `
          <a class="work-card" href="${w.url}" target="_blank" rel="noopener"${w.color ? ` style="--work-color:${w.color}"` : ''}>
            <div class="work-icon">${icon}</div>
            <h3>${w.title}</h3>
            <p>${w.desc}</p>
            ${tags ? `<div class="work-tags">${tags}</div>` : ''}
          </a>
        `;
      }).join('');
    }

  })
  .catch(err => console.error('content.json の読み込みに失敗:', err));
