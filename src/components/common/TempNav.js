/**
 * TempNav — Phase 1 검증 도구
 * ─────────────────────────────────────────────────────────────
 * 22 라우트로 빠르게 이동할 수 있는 임시 nav. Phase 2 Sidebar 도입 시 제거.
 *
 * - <nav id="temp-nav">를 <body> 직속으로 렌더 (#view-root 바깥)
 * - role 토글 링크 4 + 22 라우트 링크
 * - authStore 변동 시 자동 리렌더 (현재 role highlight 갱신)
 *
 * 사용: main.js의 boot()에서 renderTempNav() 1회 호출.
 * 제거: Phase 2 진입 시 destroyTempNav() 호출.
 */

import { routes } from '../../constants/routes.js';
import { ROLE_VALUES } from '../../constants/roles.js';
import { authStore } from '../../store/authStore.js';

const TEMP_NAV_ID = 'temp-nav';

function buildRoleLink(role, currentHash) {
  const hash = currentHash || '#/login';
  return `?role=${role}${hash}`;
}

function renderRoleSwitcher(currentRole) {
  const hash = window.location.hash;
  const roleLinks = ROLE_VALUES.map((r) => {
    const url = buildRoleLink(r, hash);
    const active = r === currentRole ? ' style="font-weight:700;text-decoration:underline;"' : '';
    return `<a href="${url}"${active}>${r}</a>`;
  }).join('');

  const noRoleUrl = `${window.location.pathname}${hash || '#/login'}`;
  return `
    <span style="font-weight:700;color:var(--text-secondary);">role:</span>
    ${roleLinks}
    <a href="${noRoleUrl}" style="opacity:0.5;">(no role)</a>
    <span style="opacity:0.4;">|</span>
    <span style="font-weight:700;color:var(--text-secondary);">routes:</span>
  `;
}

function renderRouteLinks() {
  return Object.keys(routes)
    .filter((path) => path !== '/404')   // /404는 fallback이라 직접 접근 불필요
    .map((path) => `<a href="#${path}">${path}</a>`)
    .join('');
}

let unsubscribe = null;

export function renderTempNav() {
  let nav = document.getElementById(TEMP_NAV_ID);
  if (!nav) {
    nav = document.createElement('nav');
    nav.id = TEMP_NAV_ID;
    // AppShell이 view-root를 shell 내부로 옮겼으므로 body 최상단에 prepend.
    // shell 위 / sidebar / topbar 위에 가로로 박힘.
    document.body.prepend(nav);
  }

  const update = () => {
    const { user } = authStore.getState();
    nav.innerHTML = renderRoleSwitcher(user?.role) + renderRouteLinks();
  };

  update();
  unsubscribe?.();
  unsubscribe = authStore.subscribe(update);

  // hash 변경 시에도 role 토글 링크의 hash 부분이 갱신되도록
  window.addEventListener('hashchange', update);
}

export function destroyTempNav() {
  unsubscribe?.();
  unsubscribe = null;
  document.getElementById(TEMP_NAV_ID)?.remove();
}
