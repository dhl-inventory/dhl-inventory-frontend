/**
 * Session Expired — 인증 만료(401) 글로벌 인터셉터가 redirect 했을 때 표시.
 * ─────────────────────────────────────────────────────────────
 * 흐름: http.js 401 감지 → main.js 배선 핸들러(authStore.logout + #/session-expired)
 *   → 본 페이지. 즉시 로그인폼 튕김(X)·모달 팝업(X) — 사용자가 상황 인지 후
 *   [다시 로그인] 직접 클릭 (#2 결정 ②-1 = A4, BK 2026-05-19).
 *   blank 레이아웃 (sidebar/topbar 없음) — /403 ForbiddenPage 와 동형.
 */

import { appStore } from '../../store/appStore.js';
import { t } from '../../core/i18n/index.js';

const ROOT_ID = 'session-expired-root';

function html() {
  return `
    <section id="${ROOT_ID}" class="container py-5 text-center" style="max-width:540px;">
      <span class="material-symbols-outlined" style="font-size:3rem;color:var(--text-muted);" aria-hidden="true">schedule</span>
      <h1 class="h3 fw-bold mt-3 mb-2">${escapeHtml(t('error.sessionExpired.title'))}</h1>
      <p class="text-muted mb-4">${escapeHtml(t('error.sessionExpired.description'))}</p>
      <a href="#/login" class="btn btn-primary">${escapeHtml(t('error.sessionExpired.loginBtn'))}</a>
    </section>
  `;
}

export default function SessionExpiredPage() {
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
