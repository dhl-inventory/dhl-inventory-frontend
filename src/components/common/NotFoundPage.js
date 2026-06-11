/**
 * 404 Not Found — 정의되지 않은 라우트 fallback
 */

import { appStore } from '../../store/appStore.js';
import { t } from '../../core/i18n/index.js';

const ROOT_ID = 'not-found-root';

function html() {
  return `
    <section id="${ROOT_ID}" class="container py-5 text-center">
      <h1 class="display-4 fw-bold text-secondary mb-3">404</h1>
      <h2 class="h4 mb-3">${escapeHtml(t('error.notFound.title'))}</h2>
      <p class="text-muted mb-4">${escapeHtml(t('error.notFound.body'))}</p>
      <a href="#/dashboard" class="btn btn-primary">${escapeHtml(t('error.notFound.go'))}</a>
    </section>
  `;
}

export default function NotFoundPage() {
  let unsubApp = null;
  return {
    html: html(),
    mount() {
      unsubApp = appStore.subscribe(() => {
        const root = document.getElementById(ROOT_ID);
        if (root && root.parentElement) root.outerHTML = html();
      });
    },
    destroy() {
      unsubApp?.();
      unsubApp = null;
    },
  };
}

function escapeHtml(s) {
  if (s == null) return '';
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}
