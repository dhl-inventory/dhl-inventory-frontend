/**
 * Sidebar — role 기반 메뉴 트리 (Phase 2.B)
 * ─────────────────────────────────────────────────────────────
 * - constants/menu.js의 MENU_BY_ROLE 데이터로 메뉴 렌더
 * - subPaths를 통해 sub-라우트도 부모 메뉴 active로 표시
 * - authStore (role 변경) + hashchange 양방향 구독해서 자동 갱신
 *
 * 와이어프레임 정합:
 *  - AURA 로고 + role 서브타이틀
 *  - Material Symbols 아이콘
 *  - 그룹 우측 chevron `▾` (시각 indicator. 토글은 Phase 2 범위 외)
 *  - 좌측 하단 user profile entry placeholder (Phase 2.D에서 채움)
 */

import { authStore } from '../../../store/authStore.js';
import { appStore } from '../../../store/appStore.js';
import { t } from '../../../core/i18n/index.js';
import { MENU_BY_ROLE } from '../../../constants/menu.js';

const SIDEBAR_ID = 'aura-sidebar';

let unsubAuth = null;

function getCurrentPath() {
  const raw = window.location.hash.replace(/^#\/?/, '') || '';
  const [pathRaw] = raw.split('?');
  return '/' + pathRaw.replace(/^\/+/, '');
}

/**
 * item active 판정 — 명시적 매핑만 사용 (자동 startsWith X)
 * → /alerts와 /alerts/settings 같은 형제 sub-route가 서로 침범하지 않음
 */
function isActive(item, currentPath) {
  if (currentPath === item.path) return true;
  if (item.subPaths?.includes(currentPath)) return true;
  return false;
}

function renderIcon(name) {
  if (!name) return '';
  return `<span class="material-symbols-outlined sidebar-icon">${name}</span>`;
}

function renderItem(item, currentPath) {
  if (item.type === 'group') {
    const childActive = item.children.some((c) => isActive(c, currentPath));
    return `
      <div class="sidebar-group ${childActive ? 'is-active-group' : ''}">
        <div class="sidebar-group-label">
          ${renderIcon(item.icon)}
          <span class="sidebar-group-text">${t(item.i18nKey)}</span>
          <span class="material-symbols-outlined sidebar-chevron">expand_more</span>
        </div>
        <div class="sidebar-group-children">
          ${item.children.map((c) => `
            <a href="#${c.path}" class="sidebar-item sidebar-subitem ${isActive(c, currentPath) ? 'active' : ''}">
              ${t(c.i18nKey)}
            </a>
          `).join('')}
        </div>
      </div>
    `;
  }
  return `
    <a href="#${item.path}" class="sidebar-item ${isActive(item, currentPath) ? 'active' : ''}">
      ${renderIcon(item.icon)}
      <span>${t(item.i18nKey)}</span>
    </a>
  `;
}

function render() {
  const sidebar = document.getElementById(SIDEBAR_ID);
  if (!sidebar) return;

  const { user } = authStore.getState();
  const role = user?.role;
  const items = (role && MENU_BY_ROLE[role]) || [];
  const currentPath = getCurrentPath();

  sidebar.innerHTML = `
    <div class="sidebar-content">
      <div class="sidebar-brand">
        <div class="sidebar-brand-logo">
          <img src="/aura-logo.png" alt="" class="sidebar-brand-logo-img"
               onerror="this.style.display='none';this.parentNode.classList.add('is-fallback')" />
          <span class="sidebar-brand-logo-fallback">A</span>
        </div>
        <div class="sidebar-brand-name">AURA</div>
      </div>

      <nav class="sidebar-nav">
        ${items.length > 0
          ? items.map((item) => renderItem(item, currentPath)).join('')
          : `<div class="sidebar-empty">No menu for this role.</div>`
        }
      </nav>

      <div class="sidebar-footer">
        <a href="#/account" class="sidebar-user-entry ${isActive({ path: '/account' }, currentPath) ? 'active' : ''}">
          <div class="sidebar-user-avatar">${(user?.name || '?').charAt(0).toUpperCase()}</div>
          <div class="sidebar-user-text">
            <div class="sidebar-user-name">${user?.name ?? 'Guest'}</div>
            <div class="sidebar-user-role">${role ? t('role.subtitle.' + role) : ''}</div>
          </div>
        </a>
      </div>
    </div>
  `;
}

let unsubApp = null;

export function mountSidebar() {
  render();
  unsubAuth?.();
  unsubApp?.();
  unsubAuth = authStore.subscribe(render);
  unsubApp  = appStore.subscribe(render);   // lang 변경 시 메뉴 라벨 새 언어로 rerender
  window.addEventListener('hashchange', render);
}

export function unmountSidebar() {
  unsubAuth?.();
  unsubApp?.();
  unsubAuth = unsubApp = null;
  window.removeEventListener('hashchange', render);
}
