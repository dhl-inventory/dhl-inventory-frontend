/**
 * Router — 해시 라우터 + RBAC 가드
 * ─────────────────────────────────────────────────────────────
 * 자세한 설계: docs/architecture/architecture_plan.md §5.5
 *
 * - 동적 import로 라우트별 코드 분할 (정적 import 금지)
 * - requiresRoles로 RBAC, requiresScope는 plug-in 자리 (MVP 미검사)
 * - currentView 변수에 직전 컴포넌트 보관 → destroy() 호출 보장
 *   (메모리 누수 / 좀비 store 구독 방지)
 *
 * index.html에 <div id="view-root"></div>가 반드시 있어야 함.
 *
 * routes / authStore는 Phase 1.C 산출물 — import 경로만 박혀 있고 1.C 후 활성.
 */

import { routes } from '../constants/routes.js';
import { authStore } from '../store/authStore.js';
import { applyLayout } from '../components/common/Layout/AppShell.js';

const ROOT_ID = 'view-root';
let currentView = null;   // 직전 페이지 컴포넌트 인스턴스 { html, mount?, destroy? }

function parseHash() {
  const raw = window.location.hash.replace(/^#\/?/, '') || 'login';
  const [pathRaw, queryString] = raw.split('?');
  const path = '/' + pathRaw.replace(/^\/+/, '');
  const params = Object.fromEntries(new URLSearchParams(queryString));
  return { path, params };
}

function canAccess(route, user) {
  if (route.requiresAuth === false) return { ok: true };
  if (!user) return { ok: false, redirect: '/login' };

  // super_admin 은 모든 라우트 자동 통과 — RBAC superuser 패턴.
  // 운영/시연 환경에서 dev/admin 계정이 별도 권한 설정 없이 전체 화면 접근.
  // 2026-05-25 사용자 결정 (개별 라우트 requiresRoles 보다 우선).
  if (user.role === 'super_admin') return { ok: true };

  const allowed = route.requiresRoles ?? [];
  if (!allowed.includes('*') && !allowed.includes(user.role)) {
    return { ok: false, redirect: '/403' };
  }

  // requiresScope: MVP는 검사 안 함. 자리만 둠 (plug-in).
  // Post-MVP에서 핸들러를 채우면 라우터 엔진은 그대로 두고 검사 로직만 추가.

  return { ok: true };
}

async function handleRoute() {
  const { path, params } = parseHash();
  const route = routes[path] ?? routes['/404'];
  const { user, accessScope } = authStore.getState();

  const access = canAccess(route, user);
  if (!access.ok) {
    window.location.hash = '#' + access.redirect;
    return;
  }

  // ★ 핵심: 새 화면을 그리기 전에 직전 컴포넌트의 destroy()를 반드시 호출
  //   (store 구독 해제, Chart.js 인스턴스 destroy, 이벤트 리스너 정리)
  currentView?.destroy?.();
  currentView = null;

  // 동적 import로 페이지 컴포넌트 lazy load
  let mod;
  try {
    mod = await route.component();
  } catch (err) {
    console.error('[router] Failed to load component:', err);
    return;
  }

  const root = document.getElementById(ROOT_ID);
  if (!root) {
    console.error(`[router] Root element #${ROOT_ID} not found in DOM. Check index.html.`);
    return;
  }

  // 레이아웃 분기 — 'blank'면 sidebar/topbar 숨김 (login / 403 / 404)
  applyLayout(route.layout);

  // 컴포넌트 인스턴스 생성 → DOM에 html 삽입 → mount() 호출
  const view = mod.default({ params, user, accessScope });   // { html, mount?, destroy? }
  root.innerHTML = view.html;
  view.mount?.();
  currentView = view;
}

export const router = {
  init() {
    // path 가 / 가 아닌 상태로 진입한 경우 (e.g. nginx SPA fallback 으로 /inventory/skus 가
    // path 에 박힌 채 hash 만 사용) URL 외관 정리. hash 라우팅 동작 자체는 무관.
    // /api/ 는 dev proxy 등 BE 경로 가능성 있어 예외.
    if (window.location.pathname !== '/' && !window.location.pathname.startsWith('/api/')) {
      const hashPart = window.location.hash || '#/dashboard';
      window.history.replaceState(null, '', '/' + hashPart);
    }
    window.addEventListener('hashchange', handleRoute);
    window.addEventListener('popstate', handleRoute);
    handleRoute();
  },
  navigate(path) {
    window.location.hash = '#' + path;
  },
};
