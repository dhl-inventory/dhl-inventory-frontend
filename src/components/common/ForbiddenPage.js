/**
 * 403 Forbidden — RBAC 가드가 reject한 라우트로 redirect되었을 때 표시
 */

import { appStore } from '../../store/appStore.js';
import { t } from '../../core/i18n/index.js';

const ROOT_ID = 'forbidden-root';

function html(user) {
  const roleLine = user
    ? `${escapeHtml(t('error.forbidden.currentRole'))} <code>${escapeHtml(user.role ?? '')}</code>`
    : escapeHtml(t('error.forbidden.pleaseLogin'));
  return `
    <section id="${ROOT_ID}" class="container py-5 text-center" style="max-width:540px;">
      <span class="material-symbols-outlined" style="font-size:3rem;color:var(--text-muted);" aria-hidden="true">lock</span>
      <h1 class="h3 fw-bold mt-3 mb-2">${escapeHtml(t('error.forbidden.title'))}</h1>
      <p class="text-muted mb-1">${escapeHtml(t('error.forbidden.description'))}</p>
      <p class="text-muted small mb-4">${roleLine}</p>
      <div class="mb-4">
        <a href="#/dashboard" class="btn btn-primary">${escapeHtml(t('error.forbidden.go'))}</a>
        <a href="#/login" class="btn btn-link">${escapeHtml(t('error.forbidden.loginAs'))}</a>
      </div>
      <p class="text-muted small mb-0" style="opacity:.55;">${escapeHtml(t('error.forbidden.code'))}: 403</p>
    </section>
  `;
}

export default function ForbiddenPage({ user } = {}) {
  let unsubApp = null;
  return {
    html: html(user),
    mount() {
      unsubApp = appStore.subscribe(() => {
        const root = document.getElementById(ROOT_ID);
        if (root && root.parentElement) root.outerHTML = html(user);
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
