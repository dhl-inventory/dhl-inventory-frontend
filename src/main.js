/**
 * AURA Frontend Entry Point
 * ─────────────────────────────────────────────────────────────
 * 부팅 순서 (architecture_plan §5.6):
 *   1. appStore.init()         — i18n 사전 / 테마 복원
 *   2. authStore.hydrateFromUrl / hydrateFromStorage — user / scope 복원
 *   3. renderAppShell()        — Sidebar / TopBar / view-root wrapper 마운트
 *   4. router.init()           — 해시 라우터 시작 + 첫 라우트 렌더
 *
 * Phase 2.D부터 TempNav 제거됨. 임시 dev-nav 필요 시 ?role= URL 쿼리로 role 전환.
 */

import 'bootstrap/dist/css/bootstrap.min.css';
import 'bootstrap/dist/js/bootstrap.bundle.min.js';
import './index.css';

import { router } from './core/router.js';
import { appStore } from './store/appStore.js';
import { authStore } from './store/authStore.js';
import { alertsStore } from './store/alertsStore.js';
import { scanStore } from './store/scanStore.js';
import { initSocket, disconnectSocket } from './core/socket.js';
import { mountToastContainer } from './components/common/Toast.js';
import { mountPermissionNoticeContainer } from './components/common/PermissionNotice.js';
import { setUnauthorizedHandler } from './core/http.js';
import { renderAppShell } from './components/common/Layout/AppShell.js';

/**
 * authStore의 accessScope.siteId 변화 감지 → socket lifecycle 관리.
 * - 로그인(siteId null → 있음)            → initSocket + alertsStore.startSocket + fetchSummary
 * - 로그아웃(siteId 있음 → null)          → alertsStore.stopSocket + reset + disconnectSocket
 * - siteId 변경(드문 케이스, role switch 등) → reconnect + summary refresh
 *
 * 주의: alertsStore.startSocket()은 멱등 — 여러 번 호출해도 한 번만 subscribe.
 *      core/socket.js의 bus가 핸들러를 보관하므로 initSocket보다 먼저 호출해도 안전.
 */
function wireSocketToAuth() {
  let prevSiteId = authStore.getState().accessScope?.siteId ?? null;

  // 부팅 시점에 이미 로그인 상태였으면 즉시 wire up
  if (prevSiteId) {
    alertsStore.startSocket();           // socket bus에 alert 핸들러 등록
    scanStore.wireSocket();              // socket bus에 scan_state 핸들러 등록 (멱등)
    initSocket(prevSiteId);              // 실제 socket 연결 (mock 모드면 no-op)
    alertsStore.fetchSummary();          // TopBar 종형 벨 뱃지 초기 카운트 채움
  }

  authStore.subscribe(() => {
    const nextSiteId = authStore.getState().accessScope?.siteId ?? null;
    if (nextSiteId === prevSiteId) return;

    if (prevSiteId) {
      // 로그아웃 또는 siteId 변경 — 기존 정리
      disconnectSocket();
      alertsStore.stopSocket();
      alertsStore.reset();
      scanStore.reset();                 // scan_state 구독 해제 + 상태 초기화
    }
    if (nextSiteId) {
      // 로그인 또는 다른 siteId로 전환
      alertsStore.startSocket();
      scanStore.wireSocket();
      initSocket(nextSiteId);
      alertsStore.fetchSummary();
    }
    prevSiteId = nextSiteId;
  });
}

async function boot() {
  // 1. appStore — 테마 / 언어 복원 (i18n 사전이 라우터 첫 렌더 전에 준비)
  appStore.init();

  // 2. authStore — URL 쿼리(?role=) 또는 localStorage 토큰 복원
  //    hydrateFromStorage는 /auth/me 호출(async)이라 await 필수 — 안 그러면 router가 user=null로 첫 진입
  authStore.hydrateFromUrl();
  await authStore.hydrateFromStorage();

  // 3. socket lifecycle 연결 — 이미 로그인 상태면 즉시 initSocket, 이후 login/logout 자동 추적
  wireSocketToAuth();

  // 4. AppShell 마운트 — Sidebar / TopBar / view-root wrapping
  renderAppShell();

  // 4.5. Toast 컨테이너 마운트 (Phase 6 transient notification 컨테이너)
  mountToastContainer();

  // 4.55. #2 — 권한 안내 스낵바 컨테이너 + 401 인터셉터 핸들러 배선
  //   http.js 는 authStore/router 직접 import 불가(순환) → 여기서 주입.
  mountPermissionNoticeContainer();
  setUnauthorizedHandler(() => {
    authStore.logout();
    router.navigate('/session-expired');
  });

  // 4.6. Mock 모드 dev helper — window.__socketMock으로 console 접근
  //   실 모드(VITE_USE_MOCK=false)에서는 socketMock 모듈을 import 안 함 (번들 절약)
  if (import.meta.env.VITE_USE_MOCK !== 'false') {
    import('./mocks/socketMock.js').catch((err) => {
      console.warn('[main] socketMock load failed:', err);
    });
  }

  // 5. 라우터 시작 → handleRoute() 즉시 1회 실행 → applyLayout 자동 트리거
  router.init();
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', boot);
} else {
  boot();
}
