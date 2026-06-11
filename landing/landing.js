/**
 * AURA Landing — Entry
 * (대시보드 src/와 완전 분리. main.js·router·authStore·socket 미경유)
 */

import './landing.css';

/* ==============================
   1) Scroll reveal — IntersectionObserver
   ============================== */
const revealObserver = new IntersectionObserver(
  (entries) => {
    entries.forEach((entry) => {
      if (entry.isIntersecting) {
        entry.target.classList.add('is-visible');
        revealObserver.unobserve(entry.target);
      }
    });
  },
  { threshold: 0.12, rootMargin: '0px 0px -60px 0px' }
);
document.querySelectorAll('.reveal').forEach((el) => revealObserver.observe(el));

/* ==============================
   2) Anchor nav active highlight
   ============================== */
const navLinks = Array.from(document.querySelectorAll('.anchor-nav a'));
const sectionMap = navLinks
  .map((a) => {
    const id = a.getAttribute('href').slice(1);
    return { link: a, section: document.getElementById(id) };
  })
  .filter((s) => s.section);

if (sectionMap.length) {
  const sectionObserver = new IntersectionObserver(
    (entries) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) {
          sectionMap.forEach(({ link, section }) => {
            link.classList.toggle('is-active', section === entry.target);
          });
        }
      });
    },
    { threshold: 0, rootMargin: '-40% 0px -55% 0px' }
  );
  sectionMap.forEach(({ section }) => sectionObserver.observe(section));
}

/* ==============================
   3) Language toggle (KO/EN)
   ============================== */
const LANG_KEY = 'landing-lang';

function setLang(lang) {
  const body = document.body;
  body.classList.remove('lang-ko', 'lang-en');
  body.classList.add(`lang-${lang}`);
  document.documentElement.lang = lang;
  try { localStorage.setItem(LANG_KEY, lang); } catch (_) { /* ignore */ }
}

// Restore from localStorage (if user previously chose EN)
try {
  const saved = localStorage.getItem(LANG_KEY);
  if (saved === 'en' || saved === 'ko') setLang(saved);
} catch (_) { /* ignore */ }

const langToggleBtn = document.querySelector('.lang-toggle');
if (langToggleBtn) {
  langToggleBtn.addEventListener('click', () => {
    const next = document.body.classList.contains('lang-ko') ? 'en' : 'ko';
    setLang(next);
  });
}

/* ==============================
   4) Hero slideshow — 3초 자동 페이드
   ============================== */
const heroSlides = document.querySelectorAll('.hero-slideshow .hero-slide');
if (heroSlides.length > 1) {
  const SLIDE_INTERVAL_MS = 3000;
  const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  if (!prefersReducedMotion) {
    let currentSlide = 0;
    setInterval(() => {
      heroSlides[currentSlide].classList.remove('is-active');
      currentSlide = (currentSlide + 1) % heroSlides.length;
      heroSlides[currentSlide].classList.add('is-active');
    }, SLIDE_INTERVAL_MS);
  }
}

/* ==============================
   5) Tab toggle (Use Cases 등)
   향후 [data-tab-group] 컨테이너 안에서
     [data-tab="key"] 헤더와 [data-tab-panel="key"] 본문을 토글
   ============================== */
document.querySelectorAll('[data-tab-group]').forEach((group) => {
  const tabs = group.querySelectorAll('[data-tab]');
  const panels = group.querySelectorAll('[data-tab-panel]');
  tabs.forEach((tab) => {
    tab.addEventListener('click', () => {
      const target = tab.getAttribute('data-tab');
      tabs.forEach((t) => t.classList.toggle('is-active', t === tab));
      panels.forEach((p) =>
        p.classList.toggle('is-active', p.getAttribute('data-tab-panel') === target)
      );
    });
  });
});
