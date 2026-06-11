/**
 * AppShell — 공통 레이아웃 (Phase 2)
 * ─────────────────────────────────────────────────────────────
 * page_layout_outline §2 공통 Shell 구조:
 *
 *   [aura-shell]
 *     ├─ <aside id="aura-sidebar">    ← Phase 2.B에서 채움
 *     └─ [aura-main]
 *          ├─ <header id="aura-topbar">  ← Phase 2.C에서 채움
 *          └─ <main id="view-root">     ← router가 페이지 inject
 *
 * applyLayout(layout):
 *   - 'app'   → sidebar + topbar 표시
 *   - 'blank' → sidebar/topbar 숨김 + view-root 가운데 정렬
 *               (login / 403 / 404 같은 인증 전 / 시스템 페이지)
 *
 * Phase 2.A 시점에는 sidebar/topbar 내용은 placeholder 텍스트만.
 * Phase 2.B/2.C에서 실제 컴포넌트로 교체.
 */

import { mountSidebar } from './Sidebar.js';
import { mountTopBar } from './TopBar.js';

const SHELL_ID = 'aura-app-shell';

/**
 * 부팅 시 1회 호출. body의 view-root 위치를 셸 구조 안으로 이동 + Sidebar 마운트.
 * (TopBar는 Phase 2.C에서 mountTopBar() 호출 추가 예정)
 */
export function renderAppShell() {
  if (document.getElementById(SHELL_ID)) return;   // 중복 마운트 방지

  const existingViewRoot = document.getElementById('view-root');
  if (!existingViewRoot) {
    console.error('[AppShell] #view-root not found in index.html');
    return;
  }

  // 셸 골격 생성 — sidebar / topbar 자리만. 내용은 각 컴포넌트가 mount.
  const shell = document.createElement('div');
  shell.id = SHELL_ID;
  shell.className = 'aura-shell';
  shell.innerHTML = `
    <aside id="aura-sidebar" class="aura-sidebar"></aside>
    <div class="aura-main">
      <header id="aura-topbar" class="aura-topbar"></header>
      <main id="view-root-wrapper" class="aura-content"></main>
    </div>
  `;

  // view-root를 셸 안의 main 영역으로 이동 (id 유지 → router가 그대로 사용)
  document.body.insertBefore(shell, existingViewRoot);
  shell.querySelector('#view-root-wrapper').appendChild(existingViewRoot);

  // Sidebar / TopBar 마운트 — 각 컴포넌트가 store / hashchange 자동 구독
  mountSidebar();
  mountTopBar();
}

/**
 * 라우트 진입 시 호출 (router.handleRoute).
 *  - 'app'   → 정상 셸
 *  - 'blank' → sidebar/topbar 숨김 (login / 403 / 404)
 */
export function applyLayout(layout) {
  const shell = document.getElementById(SHELL_ID);
  if (!shell) return;
  if (layout === 'blank') {
    shell.classList.add('layout-blank');
  } else {
    shell.classList.remove('layout-blank');
  }
}
