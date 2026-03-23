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
