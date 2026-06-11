/**
 * ValidityListPage — 04 Validity Tracking
 * ─────────────────────────────────────────────────────────────
 * Layout: docs/page_layout_outline.md §9 + docs/wireframes/04_validity_tracking.png
 *
 * 화면 구조 (wireframe + layout outline §9 정합):
 *   ┌─ Header (title + 부제 + Updated) ─────────────────────┐
 *   │ KPI chips 4: Expired / Critical / Warning / FEFO Vio. │
 *   ├──────────────────────────────────────────────────────┤
 *   │ Toolbar: Search / Status filter / Sort (Expiry asc)   │
 *   ├──────────────────────────────────────────────────────┤
 *   │ Table: Expiry · D-day / Product / Batch / Qty /       │
 *   │        Location / Status                              │
 *   ├──────────────────────────────────────────────────────┤
 *   │ Pagination footer                                     │
 *   └──────────────────────────────────────────────────────┘
 *
 * 정책:
 *  - Row 단위: SKU + Batch/Lot + Expiry Date — 같은 SKU도 batch 다르면 다른 row.
 *  - 기본 정렬 expiry_date asc (만료 임박 우선).
 *  - Row click → ValidityDetailModal (view-only).
 *  - chip 카운트는 site-wide (filter/pagination 무관).
 *  - Status 필터: All / expired / critical / warning / normal / fefo_violation.
 *  - 와이어프레임 우측 하단 + FAB은 backend 합의 후 도입 (현재 미구현).
 */

import { validityStore } from '../../store/validityStore.js';
import { appStore } from '../../store/appStore.js';
import { scopeStore } from '../../store/scopeStore.js';
import { subscribeInventoryRefetch } from '../../core/socket.js';
import { t, tf } from '../../core/i18n/index.js';
import {
  mountValidityDetailModal,
  unmountValidityDetailModal,
  openValidityDetailModal,
} from './ValidityDetailModal.js';

const ROOT_ID    = 'validity-list-root';
const PAGE_LIMIT = 7;

// Filter / Sort 옵션 — 실 BE /expiry/batches 정합
//   status: BE Literal 5종(all 은 미전송). fefo_violation 옵션은 BE 미지원이라 제거.
//   sort: BE = expiry_asc | expiry_desc 만. sort_by 는 expiry_date 1개 + order 토글로 방향.
const STATUS_FILTER_VALUES = ['all', 'expired', 'critical', 'warning', 'normal'];
const SORT_OPTION_VALUES   = ['expiry_date'];

const STATUS_BADGE = {
  expired:  'bg-danger',
  critical: 'bg-danger',
  warning:  'bg-warning text-dark',
  normal:   'bg-success',
};
// status label은 i18n validity.status.* 사용 (lang 변경 시 자동 번역).

// URL `#/validity?sku_id=…` 진입 시 그 SKU 로 자동 필터 (알림 → 만료 batch drill 용)
function readSkuIdFromHash() {
  const qs = window.location.hash.split('?')[1];
  return qs ? new URLSearchParams(qs).get('sku_id') : null;
}

export default function ValidityListPage() {
  let search   = '';
  let status   = 'all';
  let sortBy   = 'expiry_date';
  let order    = 'asc';
  let page     = 1;
  let pinnedSkuId = readSkuIdFromHash();   // 알림 drill 진입 시 sku_id, 일반 진입은 null
  let debounceTimer = null;

  let unsubStore    = null;
  let unsubApp      = null;
  let unsubSocket   = null;
  let unsubScope    = null;
  let clickHandler  = null;
  let inputHandler  = null;
  let changeHandler = null;

  function buildQuery() {
    const q = { page, limit: PAGE_LIMIT };
    // 실 BE 정합: sort=expiry_asc|expiry_desc (sort_by/order 분리 미지원)
    q.sort = order === 'desc' ? 'expiry_desc' : 'expiry_asc';
    // status: 단일 Literal (BE), 'all' 은 미전송. search 는 BE 미지원 → render 의 client-side 필터.
    if (status !== 'all') q.status = status;
    // 알림 drill 진입 시 SKU 핀 필터 (BE /expiry/batches 의 sku_id param)
    if (pinnedSkuId) q.sku_id = pinnedSkuId;
    // scope filter
    const scopeZone = scopeStore.getState().zoneId;
    if (scopeZone) q.zone_id = scopeZone;
    return q;
  }

  function refetch() {
    validityStore.fetchList(buildQuery());
  }

  // 마운트 / scope 변경 시 — batches + risk-items 병렬 1회. 그 외(필터/정렬/페이지)는 refetch()만.
  function refetchInitial() {
    const zoneId = scopeStore.getState().zoneId;
    validityStore.fetchList(buildQuery());
    validityStore.fetchRiskSummary(zoneId);
  }

  function rerender() {
    render(validityStore.getState(), { search, status, sortBy, order });
  }

  return {
    html: `<section id="${ROOT_ID}" class="validity-list-page"></section>`,

    mount() {
      mountValidityDetailModal();
      unsubStore = validityStore.subscribe(rerender);
      unsubApp   = appStore.subscribe(() => { rerender(); refetch(); });   // lang: UI + 데이터 재요청 (risk-items 카운트는 lang 무관)
      rerender();

      const root = document.getElementById(ROOT_ID);

      clickHandler = (e) => {
        const pageBtn = e.target.closest('[data-action="page"]');
        if (pageBtn) {
          const next = Number(pageBtn.dataset.page);
          if (Number.isFinite(next) && next !== page) {
            page = next;
            refetch();
          }
          return;
        }

        const orderBtn = e.target.closest('[data-action="toggle-order"]');
        if (orderBtn) {
          order = order === 'asc' ? 'desc' : 'asc';
          page = 1;
          refetch();
          return;
        }

        const row = e.target.closest('[data-action="open-batch"]');
        if (row) {
          const id = row.dataset.id;
          if (id) openValidityDetailModal(id);
          return;
        }

        // KPI chip 클릭 → status filter 빠른 적용
        const chipBtn = e.target.closest('[data-action="chip"]');
        if (chipBtn) {
          status = chipBtn.dataset.chip;
          page = 1;
          refetch();
          return;
        }
      };
      root?.addEventListener('click', clickHandler);

      inputHandler = (e) => {
        const target = e.target.closest('[data-action="search"]');
        if (!target) return;
        search = target.value;
        if (debounceTimer) clearTimeout(debounceTimer);
        debounceTimer = setTimeout(() => {
          page = 1;
          refetch();
        }, 200);
      };
      root?.addEventListener('input', inputHandler);

      changeHandler = (e) => {
        const statusSel = e.target.closest('[data-action="status"]');
        if (statusSel) { status = statusSel.value; page = 1; refetch(); return; }
        const sortSel = e.target.closest('[data-action="sort"]');
        if (sortSel) { sortBy = sortSel.value; page = 1; refetch(); return; }
      };
      root?.addEventListener('change', changeHandler);

      // Phase 6: inventory_update 수신 시 현재 query로 refetch (debounce)
      unsubSocket = subscribeInventoryRefetch(() => refetch());
      // scope 변경 시 page=1 reset + 마운트와 동일하게 batches+risk 둘 다 갱신
      unsubScope = scopeStore.subscribe(() => { page = 1; refetchInitial(); });

      refetchInitial();
    },

    destroy() {
      if (debounceTimer) clearTimeout(debounceTimer);
      debounceTimer = null;
      unsubStore?.();
      unsubApp?.();
      unsubSocket?.();
      unsubScope?.();
      unsubStore = unsubApp = unsubSocket = unsubScope = null;
      const root = document.getElementById(ROOT_ID);
      if (root && clickHandler)  root.removeEventListener('click',  clickHandler);
      if (root && inputHandler)  root.removeEventListener('input',  inputHandler);
      if (root && changeHandler) root.removeEventListener('change', changeHandler);
      clickHandler = inputHandler = changeHandler = null;
      unmountValidityDetailModal();
      validityStore.reset();
    },
  };
}

// ─── render ──────────────────────────────────────────────
function render(state, ctx) {
  const root = document.getElementById(ROOT_ID);
  if (!root) return;

  const { list, risk } = state;
  const { isLoading, error, receivedAt } = list;

  // 검색은 실 BE 미지원 → 가져온 페이지 내 client-side 필터(AlertList 와 동일 선례)
  const query = ctx.search.trim().toLowerCase();
  const filteredItems = query
    ? (list.items ?? []).filter((b) =>
        (b.skuId      || '').toLowerCase().includes(query) ||
        (b.skuName    || b.displayName || '').toLowerCase().includes(query) ||
        (b.batchId    || '').toLowerCase().includes(query))
    : (list.items ?? []);
  const filteredList = { ...list, items: filteredItems };

  root.innerHTML = `
    <header class="validity-list-header">
      <div>
        <h1 class="h3 fw-bold mb-1">${escapeHtml(t('validity.title'))}</h1>
        <p class="text-muted small mb-0">${escapeHtml(t('validity.subtitle'))}</p>
      </div>
      <span class="validity-list-updated text-muted small">
        ${receivedAt ? `${escapeHtml(t('header.updated'))} ${formatHM(receivedAt)}` : ''}
      </span>
    </header>

    ${renderChips(risk, ctx)}
    ${renderToolbar(ctx)}

    <div class="validity-list-main">
      ${error
        ? renderError(error)
        : isLoading && filteredList.items.length === 0
          ? renderLoading()
          : renderTable(filteredList)}
      ${filteredList.items.length > 0 ? renderPagination(filteredList) : ''}
    </div>
  `;
}

function renderLoading() {
  return `
    <div class="validity-list-loading">
      <div class="spinner-border text-warning" role="status"></div>
      <span class="ms-2 text-muted">${escapeHtml(t('validity.loading'))}</span>
    </div>
  `;
}

function renderError(err) {
  return `
    <div class="alert alert-danger m-4" role="alert">
      <strong>${escapeHtml(t('validity.errorTitle'))}</strong>
      <div class="small mt-1">${escapeHtml(err?.message ?? t('common.error'))}</div>
    </div>
  `;
}

function renderChips(risk, ctx) {
  const s = risk?.summary ?? { expiredCount: 0, criticalCount: 0, warningCount: 0 };
  const chip = (key, count, tone, icon) => `
    <button type="button"
            class="validity-chip validity-chip-${tone} ${ctx.status === key ? 'is-active' : ''}"
            data-action="chip" data-chip="${key}">
      <span class="material-symbols-outlined validity-chip-icon">${icon}</span>
      <div>
        <div class="validity-chip-label">${escapeHtml(t('validity.chip.' + key))}</div>
        <div class="validity-chip-count">${count}</div>
      </div>
    </button>
  `;
  // 칩 3종 — fefo_violation 칩은 BE 에 행별 fefo 데이터 없음(`/expiry/batches` 미반환) → 제거
  return `
    <div class="validity-list-chips">
      ${chip('expired',  s.expiredCount,  'danger',  'block')}
      ${chip('critical', s.criticalCount, 'danger',  'error')}
      ${chip('warning',  s.warningCount,  'warning', 'warning')}
    </div>
  `;
}

function renderToolbar(ctx) {
  const orderIcon  = ctx.order === 'asc' ? 'arrow_upward' : 'arrow_downward';
  const orderLabel = ctx.order === 'asc' ? t('common.ascending') : t('common.descending');
  return `
    <div class="validity-list-toolbar">
      <div class="validity-list-search">
        <span class="material-symbols-outlined">search</span>
        <input type="search" data-action="search" class="form-control"
               placeholder="${escapeHtml(t('validity.toolbar.searchPlaceholder'))}"
               value="${escapeHtml(ctx.search)}" aria-label="${escapeHtml(t('validity.toolbar.searchAria'))}" />
      </div>

      <select data-action="status" class="form-select" aria-label="${escapeHtml(t('validity.toolbar.statusAria'))}">
        ${STATUS_FILTER_VALUES.map((value) => `
          <option value="${value}" ${value === ctx.status ? 'selected' : ''}>${escapeHtml(t('validity.statusFilter.' + value))}</option>
        `).join('')}
      </select>

      <div class="validity-list-sort-group">
        <label class="validity-list-sort-label" for="validity-sort-by">${escapeHtml(t('common.sortBy'))}</label>
        <select id="validity-sort-by" data-action="sort" class="form-select">
          ${SORT_OPTION_VALUES.map((value) => `
            <option value="${value}" ${value === ctx.sortBy ? 'selected' : ''}>${escapeHtml(t('validity.sort.' + value))}</option>
          `).join('')}
        </select>
        <button type="button" class="validity-list-sort-order"
                data-action="toggle-order"
                aria-label="${escapeHtml(tf('common.toggleSortOrder', { order: orderLabel }))}"
                title="${escapeHtml(orderLabel)}">
          <span class="material-symbols-outlined">${orderIcon}</span>
        </button>
      </div>
    </div>
  `;
}

function renderTable(list) {
  const items = list.items ?? [];
  if (items.length === 0) {
    return `<div class="validity-list-empty text-muted text-center py-5">${escapeHtml(t('validity.empty'))}</div>`;
  }
  return `
    <table class="validity-list-table">
      <thead>
        <tr>
          <th class="validity-col-expiry">${escapeHtml(t('validity.col.expiry'))}</th>
          <th class="validity-col-product">${escapeHtml(t('validity.col.product'))}</th>
          <th class="validity-col-batch">${escapeHtml(t('validity.col.batch'))}</th>
          <th class="validity-col-qty">${escapeHtml(t('validity.col.qty'))}</th>
          <th class="validity-col-location">${escapeHtml(t('validity.col.location'))}</th>
          <th class="validity-col-status">${escapeHtml(t('validity.col.status'))}</th>
        </tr>
      </thead>
      <tbody>
        ${items.map(renderRow).join('')}
      </tbody>
    </table>
  `;
}

function renderRow(b) {
  const badge = STATUS_BADGE[b.status] ?? 'bg-secondary';
  const label = t('validity.status.' + b.status);
  const dDay = b.daysRemaining > 0
    ? `D-${b.daysRemaining}`
    : b.daysRemaining === 0 ? t('validity.dDay.today') : `D+${Math.abs(b.daysRemaining)}`;
  const dDayCls = b.daysRemaining <= 7 ? 'validity-d-day-critical' : '';

  return `
    <tr class="validity-list-row${b.status === 'expired' ? ' validity-row-hold' : ''}"
        data-action="open-batch"
        data-id="${escapeHtml(b.batchId)}">
      <td>
        <div class="validity-cell-expiry">${escapeHtml(b.expiryDate ?? '—')}</div>
        <div class="validity-cell-d-day ${dDayCls}">${escapeHtml(dDay)}</div>
      </td>
      <td>
        <div class="fw-semibold">${escapeHtml(b.skuName ?? b.displayName ?? '')}</div>
        <div class="text-muted small">${escapeHtml(b.skuId ?? '')}</div>
      </td>
      <td><code>${escapeHtml(b.batchId ?? '')}</code></td>
      <td>${(b.qty ?? 0).toLocaleString()} ${escapeHtml(t('validity.row.units'))}</td>
      <td class="text-muted small">${escapeHtml(b.sectionId != null ? `Sec ${b.sectionId}` : '—')}</td>
      <td>
        <span class="badge ${badge}">${escapeHtml(label)}</span>
        ${b.status === 'expired' ? `<span class="badge validity-hold-badge ms-1">${escapeHtml(t('validity.badge.hold'))}</span>` : ''}
      </td>
    </tr>
  `;
}

function renderPagination(list) {
  const total  = list.totalCount ?? 0;
  const params = list.params ?? {};
  const page   = Number(params.page)  || 1;
  const limit  = Number(params.limit) || PAGE_LIMIT;
  const start  = total === 0 ? 0 : (page - 1) * limit + 1;
  const end    = Math.min(total, page * limit);
  const pages  = Math.max(1, Math.ceil(total / limit));

  return `
    <div class="validity-list-pagination">
      <div class="text-muted small">${escapeHtml(tf('validity.pagination.showing', { start, end, total }))}</div>
      <nav aria-label="${escapeHtml(t('validity.pagination.aria'))}">
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

function formatHM(ms) {
  if (!ms) return '—';
  const d = new Date(ms);
  return `${pad2(d.getHours())}:${pad2(d.getMinutes())}`;
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
