/**
 * AccountProfilePage — 09 Account Profile (wireframe 정합 — `account profile.png`)
 * ─────────────────────────────────────────────────────────────
 * Layout: docs/page_layout_outline.md §14 + docs/wireframes/account profile.png
 * 데이터: authStore.getState() — `/auth/me`로 hydrated 상태 사용.
 *
 * 화면 구조 (wireframe 정합):
 *   ┌─ Breadcrumb: Account > Profile ───────────────────────┐
 *   │ Page title: "Account Profile"                         │
 *   ├──────────────────────────────────────────────────────┤
 *   │ Header Summary (avatar 빨강 + name/email + role badge) │
 *   ├──────────────────────────────────────────────────────┤
 *   │ Account Information (Name / Email / Role 3필드)        │
 *   ├──────────────────────────────────────────────────────┤
 *   │ Access Scope (단일 경로 표기 + 핀 아이콘 + 안내문)      │
 *   ├──────────────────────────────────────────────────────┤
 *   │ Security: PASSWORD 라벨 + 마스킹 + Change Password btn │
 *   └──────────────────────────────────────────────────────┘
 *
 * 정책:
 *  - Sign out은 TopBar 우측 아이콘으로 분리 (wireframe 정합). 이 페이지에는 없음.
 *  - Role / Access Scope는 본인이 수정 불가. 권한 변경은 10 User Management.
 *  - Change Password → PasswordChangeModal (PATCH /auth/password, 합의 완료).
 *
 * Wireframe vs 실제 schema 차이:
 *  - wireframe Access Scope: `DHL / Singapore / Warehouse 1 / Zone A` (단일 경로)
 *  - 실제 authStore.accessScope: { siteId, customerIds[], regionIds[], warehouseIds[], zoneIds[] }
 *  - MVP는 첫 값을 골라 경로 형태로 합성 (다중 scope면 첫 항목만 노출).
 *    더 정확한 라벨이 필요해지면 scopeMock의 nameOf*** 헬퍼 활용.
 */

import { authStore } from '../../store/authStore.js';
import { appStore } from '../../store/appStore.js';
import { t, tf } from '../../core/i18n/index.js';
import {
  nameOfCustomer,
  nameOfRegion,
  nameOfWarehouse,
  nameOfZone,
} from '../../mocks/scopeMock.js';
import {
  mountPasswordChangeModal,
  unmountPasswordChangeModal,
  openPasswordChangeModal,
} from './PasswordChangeModal.js';

const ROOT_ID = 'account-profile-root';

// 라벨은 i18n account.role.* 사용 — lang 변경 자동 번역.

export default function AccountProfilePage() {
  let unsubAuth   = null;
  let unsubApp    = null;
  let clickHandler = null;

  function rerender() {
    render(authStore.getState());
  }

  return {
    html: `<section id="${ROOT_ID}" class="account-profile-page"></section>`,

    mount() {
      mountPasswordChangeModal();
      unsubAuth = authStore.subscribe(rerender);
      unsubApp  = appStore.subscribe(rerender);   // lang 변경 자동 리렌더
      rerender();

      const root = document.getElementById(ROOT_ID);
      clickHandler = (e) => {
        const changeBtn = e.target.closest('[data-action="change-password"]');
        if (changeBtn) {
          openPasswordChangeModal();
          return;
        }
      };
      root?.addEventListener('click', clickHandler);
    },

    destroy() {
      unsubAuth?.();
      unsubApp?.();
      unsubAuth = unsubApp = null;
      const root = document.getElementById(ROOT_ID);
      if (root && clickHandler) root.removeEventListener('click', clickHandler);
      clickHandler = null;
      unmountPasswordChangeModal();
    },
  };
}

// ─── render ──────────────────────────────────────────────
function render(state) {
  const root = document.getElementById(ROOT_ID);
  if (!root) return;

  const user  = state.user ?? {};
  const scope = state.accessScope ?? {};
  const roleLabel = user.role ? t('account.role.' + user.role) : '—';
  const initial   = (user.name ?? '?').charAt(0).toUpperCase();

  root.innerHTML = `
    <nav class="account-profile-breadcrumb" aria-label="breadcrumb">
      <span class="text-muted">${escapeHtml(t('account.breadcrumb.account'))}</span>
      <span class="material-symbols-outlined">chevron_right</span>
      <span class="fw-semibold">${escapeHtml(t('account.breadcrumb.profile'))}</span>
    </nav>

    <h1 class="account-profile-title">${escapeHtml(t('account.title'))}</h1>

    <header class="account-profile-header">
      <div class="account-profile-avatar">${escapeHtml(initial)}</div>
      <div class="account-profile-header-text">
        <div class="account-profile-name">${escapeHtml(user.name ?? t('account.guest'))}</div>
        <div class="account-profile-email text-muted">${escapeHtml(user.email ?? '—')}</div>
      </div>
      <span class="account-profile-role-pill">
        <span class="account-profile-role-dot"></span>
        ${escapeHtml(roleLabel)}
      </span>
    </header>

    <section class="account-profile-section">
      <h2 class="account-profile-section-title">${escapeHtml(t('account.info.title'))}</h2>
      <div class="account-profile-info-grid">
        ${renderInfoField(t('account.info.name'),  user.name)}
        ${renderInfoField(t('account.info.email'), user.email)}
        ${renderInfoField(t('account.info.role'),  roleLabel)}
      </div>
    </section>

    <section class="account-profile-section">
      <h2 class="account-profile-section-title">${escapeHtml(t('account.scope.title'))}</h2>
      <div class="account-profile-scope-card">
        <span class="material-symbols-outlined account-profile-scope-icon">location_on</span>
        <div class="account-profile-scope-path">${escapeHtml(formatScopePath(scope))}</div>
      </div>
      <p class="account-profile-scope-note text-muted small">
        <span class="material-symbols-outlined">info</span>
        ${escapeHtml(t('account.scope.note'))}
      </p>
    </section>

    <section class="account-profile-section">
      <h2 class="account-profile-section-title">${escapeHtml(t('account.security.title'))}</h2>
      <div class="account-profile-password-row">
        <div>
          <div class="account-profile-password-label">${escapeHtml(t('account.security.passwordLabel'))}</div>
          <div class="account-profile-password-mask">••••••••</div>
        </div>
        <button type="button" class="btn btn-danger" data-action="change-password">
          <span class="material-symbols-outlined me-1">key</span>
          ${escapeHtml(t('account.security.change'))}
        </button>
      </div>
    </section>
  `;
}

function renderInfoField(label, value) {
  return `
    <div class="account-profile-info-field">
      <div class="account-profile-info-label">${escapeHtml(label.toUpperCase())}</div>
      <div class="account-profile-info-value">${value == null || value === '' ? '<span class="text-muted">—</span>' : escapeHtml(String(value))}</div>
    </div>
  `;
}

// scope를 wireframe 형태 단일 경로 ("DHL / Singapore / Warehouse 1 / Zone A")로 합성
function formatScopePath(scope) {
  const parts = [];
  const pickFirst = (ids, nameFn) => {
    if (Array.isArray(ids) && ids.length > 0) {
      return nameFn(ids[0]) ?? ids[0];
    }
    return null;
  };

  const customer  = pickFirst(scope.customerIds,  nameOfCustomer);
  const region    = pickFirst(scope.regionIds,    nameOfRegion);
  const warehouse = pickFirst(scope.warehouseIds, nameOfWarehouse);
  const zone      = pickFirst(scope.zoneIds,      nameOfZone);

  if (customer)  parts.push(customer);
  if (region)    parts.push(region);
  if (warehouse) parts.push(warehouse);
  if (zone)      parts.push(zone);

  if (parts.length === 0) {
    return scope.siteId ? tf('account.scope.sitePrefix', { siteId: scope.siteId }) : t('account.scope.none');
  }
  return parts.join(' / ');
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
