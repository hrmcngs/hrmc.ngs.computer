fetch('/content.json')
  .then(r => r.json())
  .then(({ about, works }) => {

    // ---- About ----
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

    // ---- Works ----
    const worksEl = document.getElementById('works-grid');
    if (worksEl && works) {
      worksEl.innerHTML = works.map(w => {
        const icon = w.icon.startsWith('http')
          ? `<img src="${w.icon}" alt="${w.title}">`
          : w.icon;
        return `
          <a class="work-card" href="${w.url}" target="_blank" rel="noopener">
            <div class="work-icon">${icon}</div>
            <h3>${w.title}</h3>
            <p>${w.desc}</p>
          </a>
        `;
      }).join('');
    }

  })
  .catch(err => console.error('content.json の読み込みに失敗:', err));
