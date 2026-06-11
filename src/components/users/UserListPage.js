/**
 * UserListPage — 10 User Management (list + detail panel + Add User Modal)
 * ─────────────────────────────────────────────────────────────
 * Wireframe: docs/wireframes/10-1_user_list_default.png · 10-1_user_list_with_reset_request.png
 * Layout: docs/page_layout_outline.md §15
 *
 * 화면 구조:
 *   ┌─ header (title + Add User 버튼) ──────────────────────┐
 *   │  KPI 4 cards (Active / Disabled / Ops / Field)        │
 *   ├──────────────────────────────────────────────────────┤
 *   │  Toolbar (Search / Role filter / Status filter)       │
 *   ├──────────────────────────────────────────────────────┤
 *   │  ┌─ List ─────────────────┬─ Detail panel ─────────┐ │
 *   │  │ User / Role / Status   │ Selected user info     │ │
 *   │  │ row click → select     │ ┌ Pending reset strip ┐│ │
 *   │  │                        │ │ (옵션 C lazy load)  ││ │
 *   │  │                        │ └─────────────────────┘│ │
 *   │  │                        │ Account / Scope         │ │
 *   │  │                        │ Edit / Edit Zone / Disable│
 *   │  └────────────────────────┴────────────────────────┘ │
 *   └──────────────────────────────────────────────────────┘
 *
 * Phase 1 동작 (이번 구현):
 *  - list fetch + 필터 (search / role / status)
 *  - row 클릭 → permissions + reset requests 병렬 lazy load
 *  - Reset 버튼 → mockResetPassword + 임시 비번 alert (Phase 2에서 modal로 교체)
 *  - Add User Modal 통합 (create + 성공 시 list 새로고침 + 새 user 선택)
 *
 * Phase 2 (별도):
 *  - Edit Zone Access modal
 *  - Reset Password 결과 modal (temp password 표시)
 *  - Disable confirmation
 */

import { usersStore } from '../../store/usersStore.js';
import { appStore } from '../../store/appStore.js';
import { t, tf } from '../../core/i18n/index.js';
import {
  createUser as createUserApi,
  resetUserPassword,
  updateUser,
  grantUserPermissions,
  revokeUserPermission,
} from '../../api/usersApi.js';
import {
  mountAddUserModal,
  unmountAddUserModal,
  openAddUserModal,
} from './AddUserModal.js';
import {
  mountTempPasswordModal,
  unmountTempPasswordModal,
  openTempPasswordModal,
} from './TempPasswordModal.js';
import {
  mountEditZoneAccessModal,
  unmountEditZoneAccessModal,
  openEditZoneAccessModal,
} from './EditZoneAccessModal.js';
import {
  mountEditUserModal,
  unmountEditUserModal,
  openEditUserModal,
} from './EditUserModal.js';
import {
  mountDisableConfirmModal,
  unmountDisableConfirmModal,
  openDisableConfirmModal,
} from './DisableConfirmModal.js';

const ROOT_ID = 'user-list-root';

const ROLE_FILTER_VALUES   = ['all', 'field_manager', 'ops_manager', 'super_admin', 'ai_monitor'];
const STATUS_FILTER_VALUES = ['all', 'active', 'disabled'];

// Client-side 페이지네이션 — 캡쳐 시 한 페이지에 떨어지게 함 (백엔드 page 미사용).
const PAGE_LIMIT = 7;

// 라벨은 i18n users.roleFilter.* / users.statusFilter.* 사용 — lang 변경 자동 번역.

export default function UserListPage() {
  let unsubStore    = null;
  let unsubApp      = null;
  let clickHandler  = null;
  let inputHandler  = null;
  let changeHandler = null;
  let debounceTimer = null;
  let page = 1;   // 클라이언트 페이지 인덱스 — 필터 변경 시 1로 리셋

  function rerender() {
    render(usersStore.getState(), { page });
  }

  return {
    html: `<section id="${ROOT_ID}" class="user-mgmt-page"></section>`,

    mount() {
      unsubStore = usersStore.subscribe(rerender);
      unsubApp   = appStore.subscribe(rerender);   // lang 변경 자동 리렌더
      rerender();

      // Add User Modal — body에 1회 mount
      mountAddUserModal({
        onSubmit:  (payload) => createUserApi(payload),
        onCreated: async (newUserId) => {
          await usersStore.fetchList();
          if (newUserId) await usersStore.selectUser(newUserId);
        },
      });

      // Temp Password Modal (Reset 결과 표시용)
      mountTempPasswordModal();

      // Edit Zone Access Modal — 차이(added/removed) 계산 후 API 호출은 외부에서
      mountEditZoneAccessModal({
        onSubmit: async ({ userId, added, removed }) => {
          if (added.length > 0) {
            await grantUserPermissions(userId, added);
          }
          for (const zoneId of removed) {
            await revokeUserPermission(userId, zoneId);
          }
          await usersStore.refreshSelected();
        },
      });

      // Edit User Modal — email 변경. backend §3.4 UpdateUserRequest는 email/is_active만 허용
      mountEditUserModal({
        onSubmit: async ({ userId, email }) => {
          await updateUser(userId, { email });
          await usersStore.fetchList();
          await usersStore.refreshSelected();
        },
      });

      // Disable / Enable Confirmation Modal
      mountDisableConfirmModal({
        onConfirm: async ({ userId, action }) => {
          await updateUser(userId, { is_active: action === 'enable' });
          await usersStore.fetchList();
          await usersStore.refreshSelected();
        },
      });

      const root = document.getElementById(ROOT_ID);

      // ── delegated click ────────────────────────────────
      clickHandler = async (e) => {
        // Pagination
        const pageBtn = e.target.closest('[data-action="page"]');
        if (pageBtn) {
          const next = Number(pageBtn.dataset.page);
          if (Number.isFinite(next) && next >= 1 && next !== page) {
            page = next;
            rerender();
          }
          return;
        }

        // Add User
        const addBtn = e.target.closest('[data-action="add-user"]');
        if (addBtn) { openAddUserModal(); return; }

        // Detail panel close
        const detailCloseBtn = e.target.closest('[data-action="detail-close"]');
        if (detailCloseBtn) { usersStore.clearSelected(); return; }

        // row select
        const row = e.target.closest('[data-action="select-user"]');
        if (row) {
          const userId = row.dataset.userId;
          if (userId) await usersStore.selectUser(userId);
          return;
        }

        // Reset Password (detail panel 또는 reset strip)
        const resetBtn = e.target.closest('[data-action="reset-password"]');
        if (resetBtn) {
          const st = usersStore.getState();
          const userId = st.selected.userId;
          if (!userId) return;
          const pending = (st.selected.resetRequests?.items ?? [])
            .find((r) => r.status === 'pending');
          try {
            const res = await resetUserPassword(userId);
            openTempPasswordModal({
              username:          res?.data?.username,
              temporaryPassword: res?.data?.temporaryPassword,
            });
            // §2.38 ②A: 임시비번 발급 후 자동 완료 마킹 (실패 시 알림 — 큐 잔존, 재시도 가능)
            if (pending?.requestId) {
              try {
                await usersStore.completeResetRequest(pending.requestId);
              } catch (markErr) {
                window.alert(tf('users.resetMarkFailed', { message: markErr?.message ?? t('common.error') }));
              }
            }
            await usersStore.refreshSelected();
          } catch (err) {
            window.alert(tf('users.resetFailed', { message: err?.message ?? t('common.error') }));
          }
          return;
        }

        // Disable / Enable — 정식 modal로 confirmation
        const disableBtn = e.target.closest('[data-action="toggle-active"]');
        if (disableBtn) {
          const userId = usersStore.getState().selected.userId;
          const user = userOf(userId);
          if (!user) return;
          openDisableConfirmModal({
            user:   { userId: user.userId, username: user.username },
            action: user.isActive ? 'disable' : 'enable',
          });
          return;
        }

        // Edit Zone Access
        const editZoneBtn = e.target.closest('[data-action="edit-zone-access"]');
        if (editZoneBtn) {
          const state = usersStore.getState();
          const userId = state.selected.userId;
          const user = userOf(userId);
          if (!user) return;
          // super_admin / ai_monitor는 zone permission 모델 자체가 없음 — backend §4.5
          if (user.role === 'super_admin' || user.role === 'ai_monitor') {
            const roleLabel = user.role === 'super_admin' ? 'Super Admin' : 'AI Monitor';
            window.alert(tf('users.zoneAccess.notAvailable', { role: roleLabel }));
            return;
          }
          const currentZoneIds = (state.selected.permissions?.zonePermissions ?? [])
            .map((z) => z.zoneId);
          openEditZoneAccessModal({
            user: { userId: user.userId, username: user.username, role: user.role },
            currentZoneIds,
          });
          return;
        }

        // Edit User
        const editUserBtn = e.target.closest('[data-action="edit-user"]');
        if (editUserBtn) {
          const user = userOf(usersStore.getState().selected.userId);
          if (!user) return;
          openEditUserModal({
            user: {
              userId:   user.userId,
              username: user.username,
              email:    user.email,
              role:     user.role,
            },
          });
          return;
        }
      };
      root?.addEventListener('click', clickHandler);

      // ── delegated input — search (200ms debounce) ──────
      inputHandler = (e) => {
        const target = e.target.closest('[data-action="filter-search"]');
        if (!target) return;
        if (debounceTimer) clearTimeout(debounceTimer);
        debounceTimer = setTimeout(() => {
          page = 1;
          usersStore.fetchList({ search: target.value });
        }, 200);
      };
      root?.addEventListener('input', inputHandler);

      // ── delegated change — role / status select ────────
      changeHandler = (e) => {
        const roleSel = e.target.closest('[data-action="filter-role"]');
        if (roleSel) { page = 1; usersStore.fetchList({ role: roleSel.value }); return; }
        const statusSel = e.target.closest('[data-action="filter-status"]');
        if (statusSel) { page = 1; usersStore.fetchList({ status: statusSel.value }); return; }
      };
      root?.addEventListener('change', changeHandler);

      // 초기 fetch
      usersStore.fetchList();
      usersStore.fetchResetQueue();   // §2.38 전역 비번 재설정 큐
    },

    destroy() {
      if (debounceTimer) clearTimeout(debounceTimer);
      debounceTimer = null;
      unsubStore?.();
      unsubApp?.();
      unsubStore = unsubApp = null;
      const root = document.getElementById(ROOT_ID);
      if (root && clickHandler)  root.removeEventListener('click',  clickHandler);
      if (root && inputHandler)  root.removeEventListener('input',  inputHandler);
      if (root && changeHandler) root.removeEventListener('change', changeHandler);
      clickHandler = inputHandler = changeHandler = null;
      unmountAddUserModal();
      unmountTempPasswordModal();
      unmountEditZoneAccessModal();
      unmountEditUserModal();
      unmountDisableConfirmModal();
      usersStore.reset();
    },
  };
}

function userOf(userId) {
  if (!userId) return null;
  return usersStore.getState().list.items.find((u) => u.userId === userId) ?? null;
}

// ─── render ──────────────────────────────────────────────
function render(state, ctx = { page: 1 }) {
  const root = document.getElementById(ROOT_ID);
  if (!root) return;

  const { list, selected, filters } = state;

  // 페이지 슬라이싱 — 백엔드는 전체 반환, FE에서만 자른다.
  const total = list.items.length;
  const totalPages = Math.max(1, Math.ceil(total / PAGE_LIMIT));
  const safePage = Math.min(Math.max(1, ctx.page), totalPages);
  const startIdx = (safePage - 1) * PAGE_LIMIT;
  const visibleItems = list.items.slice(startIdx, startIdx + PAGE_LIMIT);

  root.innerHTML = `
    <header class="user-mgmt-header">
      <div>
        <h1 class="h3 fw-bold mb-1">${escapeHtml(t('users.title'))}</h1>
        <p class="text-muted small mb-0">${escapeHtml(t('users.subtitle'))}</p>
      </div>
      <button type="button" class="btn btn-warning user-mgmt-add-btn" data-action="add-user">
        <span class="material-symbols-outlined">person_add</span>
        ${escapeHtml(t('users.addBtn'))}
      </button>
    </header>

    <div class="user-mgmt-body">
      <div class="user-mgmt-left">
        ${renderKpiRow(list.items)}
        ${renderToolbar(filters)}
        <div class="user-mgmt-list">
          ${list.error ? `
            <div class="alert alert-danger m-3">${escapeHtml(list.error?.message ?? t('users.errorTitle'))}</div>
          ` : list.isLoading && list.items.length === 0 ? `
            <div class="user-mgmt-loading">
              <div class="spinner-border text-warning" role="status"></div>
              <span class="ms-2 text-muted">${escapeHtml(t('users.loading'))}</span>
            </div>
          ` : `
            ${renderUserTable(visibleItems, selected.userId, state.resetQueue?.items ?? [])}
            ${total > PAGE_LIMIT ? renderPagination(safePage, totalPages, total, startIdx) : ''}
          `}
        </div>
      </div>

      <aside class="user-mgmt-detail">
        <div class="user-mgmt-detail-header">
          <span class="user-mgmt-detail-header-title">${escapeHtml(t('users.detail.heading'))}</span>
          ${selected.userId ? `
            <button type="button" class="btn-close" data-action="detail-close" aria-label="${escapeHtml(t('users.detail.close'))}"></button>
          ` : ''}
        </div>
        ${renderDetailPanel(selected, list.items)}
      </aside>
    </div>
  `;
}

// ─── KPI cards ───────────────────────────────────────────
function renderKpiRow(items) {
  const active   = items.filter((u) => u.isActive).length;
  const disabled = items.filter((u) => !u.isActive).length;
  const ops      = items.filter((u) => u.role === 'ops_manager').length;
  const field    = items.filter((u) => u.role === 'field_manager').length;
  return `
    <div class="user-mgmt-kpi-row">
      ${kpiCard(t('users.kpi.active'),        active)}
      ${kpiCard(t('users.kpi.disabled'),      disabled)}
      ${kpiCard(t('users.kpi.opsManagers'),   ops)}
      ${kpiCard(t('users.kpi.fieldManagers'), field)}
    </div>
  `;
}

function kpiCard(label, value) {
  return `
    <div class="user-mgmt-kpi-card">
      <div class="user-mgmt-kpi-label">${escapeHtml(label)}</div>
      <div class="user-mgmt-kpi-value">${value.toLocaleString()}</div>
    </div>
  `;
}

// ─── Toolbar ────────────────────────────────────────────
function renderToolbar(filters) {
  return `
    <div class="user-mgmt-toolbar">
      <div class="user-mgmt-search">
        <span class="material-symbols-outlined">search</span>
        <input type="search" data-action="filter-search" class="form-control"
               placeholder="${escapeHtml(t('users.toolbar.searchPlaceholder'))}" value="${escapeHtml(filters.search)}"
               aria-label="${escapeHtml(t('users.toolbar.searchAria'))}" />
      </div>
      <select data-action="filter-role" class="form-select user-mgmt-filter" aria-label="${escapeHtml(t('users.toolbar.roleAria'))}">
        ${ROLE_FILTER_VALUES.map((value) => `
          <option value="${value}" ${value === filters.role ? 'selected' : ''}>${escapeHtml(t('users.roleFilter.' + value))}</option>
        `).join('')}
      </select>
      <select data-action="filter-status" class="form-select user-mgmt-filter" aria-label="${escapeHtml(t('users.toolbar.statusAria'))}">
        ${STATUS_FILTER_VALUES.map((value) => `
          <option value="${value}" ${value === filters.status ? 'selected' : ''}>${escapeHtml(t('users.statusFilter.' + value))}</option>
        `).join('')}
      </select>
    </div>
  `;
}

// ─── User table ─────────────────────────────────────────
function renderUserTable(items, selectedUserId, resetItems) {
  if (items.length === 0) {
    return `<div class="user-mgmt-empty text-muted text-center py-5">${escapeHtml(t('users.empty'))}</div>`;
  }
  const pendingByUser = {};
  (resetItems ?? []).forEach((r) => {
    if (r.status === 'pending' && r.userId) {
      pendingByUser[r.userId] = (pendingByUser[r.userId] ?? 0) + 1;
    }
  });
  return `
    <table class="user-mgmt-table">
      <thead>
        <tr>
          <th>${escapeHtml(t('users.col.user'))}</th>
          <th>${escapeHtml(t('users.col.role'))}</th>
          <th>${escapeHtml(t('users.col.status'))}</th>
        </tr>
      </thead>
      <tbody>
        ${items.map((u) => userRow(u, u.userId === selectedUserId, pendingByUser[u.userId] ?? 0)).join('')}
      </tbody>
    </table>
  `;
}

function userRow(u, isSelected, pendingResets) {
  const initials = (u.username ?? '?').slice(0, 2).toUpperCase();
  const statusCls = u.isActive ? 'is-active' : 'is-disabled';
  const statusLabel = u.isActive ? t('users.row.active') : t('users.row.disabled');
  const roleLabel   = t('users.roleFilter.' + u.role) || u.role;
  const resetDot = pendingResets > 0
    ? `<span class="user-mgmt-reset-dot" title="${escapeHtml(t('users.row.pendingReset'))}" style="margin-left:7px;font-size:0.5em;color:var(--text-muted);vertical-align:middle;">●</span>`
    : '';
  return `
    <tr class="user-mgmt-row ${isSelected ? 'is-selected' : ''}"
        data-action="select-user" data-user-id="${escapeHtml(u.userId)}">
      <td>
        <div class="user-mgmt-row-user">
          <span class="user-mgmt-avatar">${escapeHtml(initials)}</span>
          <div>
            <div class="user-mgmt-row-name">${escapeHtml(u.username)}${resetDot}</div>
            <div class="user-mgmt-row-id">${escapeHtml(shortId(u.userId))}</div>
          </div>
        </div>
      </td>
      <td>${escapeHtml(roleLabel)}</td>
      <td><span class="user-mgmt-status ${statusCls}">● ${escapeHtml(statusLabel)}</span></td>
    </tr>
  `;
}

function shortId(userId) {
  if (!userId) return '';
  return userId.replace(/^user-/, '').toUpperCase().slice(0, 8);
}

// ─── Pagination ─────────────────────────────────────────
// 클라이언트 사이드 — 백엔드 page 미사용. AlertList 의 buildPageNumbers 패턴 동일.
function renderPagination(page, pages, total, startIdx) {
  const start = total === 0 ? 0 : startIdx + 1;
  const end   = Math.min(total, startIdx + PAGE_LIMIT);
  return `
    <div class="user-mgmt-pagination">
      <div class="user-mgmt-pagination-info text-muted small">
        ${escapeHtml(tf('users.pagination.showing', { start, end, total }))}
      </div>
      <nav aria-label="${escapeHtml(t('users.pagination.aria'))}">
        <ul class="pagination pagination-sm mb-0">
          <li class="page-item ${page === 1 ? 'disabled' : ''}">
            <button type="button" class="page-link" data-action="page" data-page="${page - 1}" ${page === 1 ? 'disabled' : ''}>‹</button>
          </li>
          ${buildPageNumbers(page, pages).map((p) => p === '…' ? `
            <li class="page-item disabled"><span class="page-link">…</span></li>
          ` : `
            <li class="page-item ${p === page ? 'active' : ''}">
              <button type="button" class="page-link" data-action="page" data-page="${p}">${p}</button>
            </li>
          `).join('')}
          <li class="page-item ${page >= pages ? 'disabled' : ''}">
            <button type="button" class="page-link" data-action="page" data-page="${page + 1}" ${page >= pages ? 'disabled' : ''}>›</button>
          </li>
        </ul>
      </nav>
    </div>
  `;
}

function buildPageNumbers(current, total) {
  if (total <= 7) return Array.from({ length: total }, (_, i) => i + 1);
  const pages = new Set([1, total, current, current - 1, current + 1]);
  const sorted = [...pages].filter((p) => p >= 1 && p <= total).sort((a, b) => a - b);
  const out = [];
  for (let i = 0; i < sorted.length; i += 1) {
    out.push(sorted[i]);
    if (i < sorted.length - 1 && sorted[i + 1] - sorted[i] > 1) out.push('…');
  }
  return out;
}

// ─── Detail panel ───────────────────────────────────────
function renderDetailPanel(selected, listItems) {
  if (!selected.userId) {
    return `
      <div class="user-mgmt-detail-empty">
        <span class="material-symbols-outlined">person_search</span>
        <p class="text-muted small mb-0 mt-2">${escapeHtml(t('users.detail.empty'))}</p>
      </div>
    `;
  }

  const user = listItems.find((u) => u.userId === selected.userId);
  if (!user) {
    return `<div class="user-mgmt-detail-empty text-muted">${escapeHtml(t('users.detail.notFound'))}</div>`;
  }

  const hasReset = (selected.resetRequests?.items ?? [])
    .some((r) => r.status === 'pending');
  const roleLabel = t('users.roleFilter.' + user.role) || user.role;
  const statusLabel = user.isActive ? t('users.row.active') : t('users.row.disabled');

  return `
    ${hasReset ? renderResetStrip(selected.resetRequests?.items) : ''}

    <div class="user-mgmt-detail-head">
      <div class="user-mgmt-avatar-lg">${escapeHtml((user.username ?? '?').slice(0, 2).toUpperCase())}</div>
      <h3 class="user-mgmt-detail-name">${escapeHtml(user.username)}</h3>
      <div class="user-mgmt-detail-role">${escapeHtml(roleLabel)}</div>
      <span class="user-mgmt-status ${user.isActive ? 'is-active' : 'is-disabled'}">● ${escapeHtml(statusLabel)}</span>
    </div>

    <section class="user-mgmt-detail-section">
      <h4 class="user-mgmt-detail-section-title">${escapeHtml(t('users.detail.account.title'))}</h4>
      <dl class="user-mgmt-detail-grid">
        <dt>${escapeHtml(t('users.detail.account.username'))}</dt>   <dd>${escapeHtml(user.username)}</dd>
        <dt>${escapeHtml(t('users.detail.account.email'))}</dt>      <dd>${escapeHtml(user.email)}</dd>
        <dt>${escapeHtml(t('users.detail.account.lastLogin'))}</dt>  <dd>${formatDateTime(user.lastLoginAt)}</dd>
        <dt>${escapeHtml(t('users.detail.account.createdAt'))}</dt>  <dd>${formatDate(user.createdAt)}</dd>
      </dl>
    </section>

    <section class="user-mgmt-detail-section">
      <h4 class="user-mgmt-detail-section-title">${escapeHtml(t('users.detail.scope.title'))}</h4>
      ${renderScope(selected)}
    </section>

    <div class="user-mgmt-detail-actions">
      <button type="button" class="btn btn-dark w-100" data-action="edit-user">
        <span class="material-symbols-outlined">edit</span> ${escapeHtml(t('users.detail.actions.edit'))}
      </button>
      <button type="button" class="btn btn-outline-secondary w-100" data-action="edit-zone-access">
        <span class="material-symbols-outlined">vpn_key</span> ${escapeHtml(t('users.detail.actions.editZone'))}
      </button>
      <button type="button" class="btn btn-outline-danger w-100" data-action="toggle-active">
        <span class="material-symbols-outlined">${user.isActive ? 'block' : 'check_circle'}</span>
        ${escapeHtml(user.isActive ? t('users.detail.actions.disable') : t('users.detail.actions.enable'))}
      </button>
    </div>
  `;
}

function renderResetStrip(items) {
  const pending = (items ?? []).find((r) => r.status === 'pending');
  const reqAt = pending?.requestedAt ? formatDateTime(pending.requestedAt) : '';
  return `
    <div class="user-mgmt-reset-strip">
      <span class="material-symbols-outlined">lock_reset</span>
      <span class="flex-grow-1">
        <span style="display:block;">${escapeHtml(t('users.detail.resetRequested'))}</span>
        ${reqAt ? `<span style="display:block;font-size:0.85em;color:var(--text-secondary);">${escapeHtml(reqAt)}</span>` : ''}
      </span>
      <button type="button" class="btn btn-sm btn-warning" data-action="reset-password">${escapeHtml(t('users.detail.resetBtn'))}</button>
    </div>
  `;
}

function renderScope(selected) {
  if (selected.isLoading) {
    return `<div class="text-muted small">${escapeHtml(t('users.detail.scope.loading'))}</div>`;
  }
  if (selected.error) {
    return `<div class="text-danger small">${escapeHtml(t('users.detail.scope.error'))}</div>`;
  }
  const perm = selected.permissions;
  const zones = perm?.zonePermissions ?? [];
  return `
    <dl class="user-mgmt-detail-grid">
      <dt>${escapeHtml(t('users.detail.scope.primarySite'))}</dt>
      <dd>${escapeHtml(t('users.detail.scope.primarySiteValue'))}</dd>
    </dl>
    <div class="user-mgmt-zone-list mt-2">
      <div class="user-mgmt-zone-label">${escapeHtml(t('users.detail.scope.zonePermissions'))}</div>
      ${zones.length === 0 ? `
        <div class="text-muted small">${escapeHtml(t('users.detail.scope.noPermissions'))}</div>
      ` : `
        <div class="user-mgmt-zone-chips">
          ${zones.map((z) => `<span class="user-mgmt-zone-chip">${escapeHtml(z.zoneName)}</span>`).join('')}
        </div>
      `}
    </div>
  `;
}

// ─── helpers ─────────────────────────────────────────────
function formatDateTime(s) {
  if (!s) return '—';
  const d = new Date(s);
  if (Number.isNaN(d.getTime())) return '—';
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())} ${pad2(d.getHours())}:${pad2(d.getMinutes())}`;
}

function formatDate(s) {
  if (!s) return '—';
  const d = new Date(s);
  if (Number.isNaN(d.getTime())) return '—';
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
}

function pad2(n) { return n < 10 ? `0${n}` : `${n}`; }

function escapeHtml(s) {
  if (s == null) return '';
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}
