/**
 * SkuListPage — 02-1 SKU List
 * ─────────────────────────────────────────────────────────────
 * Mount 시 skuListStore.fetchList(query) → GET /inventory/stock → 표 + 페이지네이션 렌더.
 *
 * UI ↔ API 매핑 단일 진실: docs/architecture/ui_api_mapping.md §02 (작성 예정)
 * Layout 정합: docs/page_layout_outline.md §02-1
 *
 * 정책 (layout outline §02-1):
 *  - Toolbar: Search / Status filter / Sort 만. Zone 필터는 두지 않음 (TopBar scope가 담당).
 *  - 기본 정렬: capacity_rate asc — 위험도 높은 SKU 상단.
 *  - Row 전체 click은 비활성. `SKU ID` / `Product Name` 두 칼럼만 SKU Detail 링크.
 *  - Checkbox는 overstock 행에서 비활성. 선택 시 Request Refill 버튼 활성화.
 *  - Request Refill / 신규 입고 액션: MVP는 버튼 위치만. Modal/Form은 후속 작업.
 *  - Pagination: page size 10 고정.
 *
 * 상태 (컴포넌트 로컬):
 *  - search / status / sortBy / order / page / selectedIds — toolbar + pagination + 선택 상태
 *  - debounce: search input 200ms
 *
 * Store: skuListStore (data { items, totalCount, page, limit }, isLoading, error, receivedAt)
 */

import { skuListStore } from '../../store/skuListStore.js';
import { appStore } from '../../store/appStore.js';
import { scopeStore } from '../../store/scopeStore.js';
import { subscribeInventoryRefetch } from '../../core/socket.js';
import { t, tf } from '../../core/i18n/index.js';
import { createRefillRequest, registerInbound } from '../../api/inventoryApi.js';
import {
  stockStatusBadgeClass,
  stockStatusRank,
} from '../../utils/statusDisplay.js';
import {
  mountRefillModal,
  unmountRefillModal,
  openRefillModal,
} from './RefillRequestModal.js';
import {
  mountNewInboundModal,
  unmountNewInboundModal,
  openNewInboundModal,
} from './NewInboundModal.js';

const ROOT_ID    = 'sku-list-root';
const PAGE_LIMIT = 10;

// 6-tier status (metric_definitions §5) — toolbar dropdown 옵션.
//   'all'은 필터 미적용. 나머지는 stock_status enum 1:1.
//   라벨은 i18n skuList.statusFilter.* 키 사용.
const STATUS_OPTION_VALUES = ['all', 'out_of_stock', 'critical', 'warning', 'watch', 'normal', 'overstock'];

// Sort 옵션 — layout outline §02-1 (MVP 3종). 방향은 별도 토글 버튼.
const SORT_OPTION_VALUES = ['capacity_rate', 'display_name', 'current_qty'];

export default function SkuListPage() {
  // ── 로컬 UI 상태 ────────────────────────────────────────
  let search       = '';
  let status       = 'all';
  let sortBy       = 'capacity_rate';
  let order        = 'asc';
  let page         = 1;
  let selectedIds  = new Set();
  let debounceTimer = null;

  let unsubStore    = null;
  let unsubApp      = null;
  let unsubSocket   = null;
  let unsubScope    = null;
  let clickHandler  = null;
  let inputHandler  = null;
  let changeHandler = null;

  function buildQuery() {
    const q = { page, limit: PAGE_LIMIT, sort_by: sortBy, order };
    if (search.trim())        q.search = search.trim();
    if (status && status !== 'all') q.status = status;
    // scope filter (TopBar zone dropdown 선택 시 자동 적용)
    const scopeZone = scopeStore.getState().zoneId;
    if (scopeZone) q.zone_id = scopeZone;
    return q;
  }

  function refetch() {
    skuListStore.fetchList(buildQuery());
  }

  function rerender() {
    render(skuListStore.getState(), {
      search, status, sortBy, order, page, selectedIds,
    });
  }

  return {
    html: `<section id="${ROOT_ID}" class="sku-list-page"></section>`,

    mount() {
      unsubStore = skuListStore.subscribe(rerender);
      unsubApp   = appStore.subscribe(() => { rerender(); refetch(); });  // lang: UI + BE 데이터 새 Accept-Language 재요청
      // Phase 6: inventory_update 수신 시 현재 query로 refetch (debounce)
      unsubSocket = subscribeInventoryRefetch(() => refetch());
      // scope (TopBar zone) 변경 시 자동 page=1 reset + refetch
      unsubScope = scopeStore.subscribe(() => { page = 1; selectedIds = new Set(); refetch(); });
      rerender();

      // Refill modal — body에 1회 mount. submit 시 createRefillRequest 호출 후 결과를 modal에 전달
      mountRefillModal({
        onSubmit: async (payload) => {
          const result = await createRefillRequest(payload);
          // 제출 성공 시 선택 초기화 (다음 작업 흐름)
          selectedIds = new Set();
          rerender();
          return result;
        },
      });

      // New Inbound modal — body에 1회 mount. 성공 시 SKU List refetch
      mountNewInboundModal({
        onSubmit: async (payload) => {
          const result = await registerInbound(payload);
          selectedIds = new Set();
          refetch();
          return result;
        },
      });

      const root = document.getElementById(ROOT_ID);

      // ── delegated click — page nav / checkbox / actions ──
      clickHandler = (e) => {
        // pagination
        const pageBtn = e.target.closest('[data-action="page"]');
        if (pageBtn) {
          const next = Number(pageBtn.dataset.page);
          if (Number.isFinite(next) && next !== page) {
            page = next;
            selectedIds = new Set();   // 페이지 이동 시 선택 초기화 — 다른 페이지 SKU와 혼동 방지
            refetch();
          }
          return;
        }

        // 정렬 방향 토글 (asc ↔ desc)
        const orderBtn = e.target.closest('[data-action="toggle-order"]');
        if (orderBtn) {
          order = order === 'asc' ? 'desc' : 'asc';
          page = 1;
          selectedIds = new Set();
          refetch();
          return;
        }

        // 선택 전체 토글 (헤더 checkbox)
        const selAll = e.target.closest('[data-action="select-all"]');
        if (selAll) {
          const items = skuListStore.getState().data?.items ?? [];
          const eligible = items.filter((r) => r.stockStatus !== 'overstock');
          const allSelected = eligible.length > 0 && eligible.every((r) => selectedIds.has(r.skuId));
          if (allSelected) {
            eligible.forEach((r) => selectedIds.delete(r.skuId));
          } else {
            eligible.forEach((r) => selectedIds.add(r.skuId));
          }
          rerender();
          return;
        }

        // 행 단위 선택
        const rowBox = e.target.closest('[data-action="select-row"]');
        if (rowBox) {
          const id = rowBox.dataset.id;
          if (selectedIds.has(id)) selectedIds.delete(id);
          else selectedIds.add(id);
          rerender();
          return;
        }

        // Request Refill — 02-3 modal 진입 (다중 선택)
        const refillBtn = e.target.closest('[data-action="refill"]');
        if (refillBtn) {
          if (selectedIds.size === 0) return;
          const items = (skuListStore.getState().data?.items ?? [])
            .filter((r) => selectedIds.has(r.skuId))
            .map((r) => ({
              skuId:         r.skuId,
              displayName:   r.displayName,
              currentQty:    r.currentQty,
              standardQty:   r.standardQty,
              uom:           r.uom,
              locationLabel: `${r.zoneName} / ${r.sectionName}`,
            }));
          openRefillModal(items);
          return;
        }

        // 신규 입고 — 02-4 New Inbound Modal 진입 (단일 SKU 입력)
        //   1행 선택 시 SKU/Zone/Section prefill, 그 외에는 빈 form.
        //   skuOptions는 현재 페이지의 stock row를 그대로 사용 (Zone/Section 옵션 derive 포함).
        const inboundBtn = e.target.closest('[data-action="new-inbound"]');
        if (inboundBtn) {
          const items = skuListStore.getState().data?.items ?? [];
          const skuOptions = items.map((r) => ({
            skuId:       r.skuId,
            displayName: r.displayName,
            zoneId:      r.zoneId,
            zoneName:    r.zoneName,
            sectionId:   r.sectionId,
            sectionName: r.sectionName,
            currentQty:  r.currentQty,
            standardQty: r.standardQty,
            uom:         r.uom,
          }));
          const prefillId = selectedIds.size === 1 ? [...selectedIds][0] : null;
          openNewInboundModal({
            skuOptions,
            prefill: prefillId ? { skuId: prefillId } : null,
          });
          return;
        }
      };
      root?.addEventListener('click', clickHandler);

      // ── delegated input — search (debounce 200ms) ─────────
      inputHandler = (e) => {
        const target = e.target.closest('[data-action="search"]');
        if (!target) return;
        search = target.value;
        if (debounceTimer) clearTimeout(debounceTimer);
        debounceTimer = setTimeout(() => {
          page = 1;
          selectedIds = new Set();
          refetch();
        }, 200);
      };
      root?.addEventListener('input', inputHandler);

      // ── delegated change — status / sort select ──────────
      changeHandler = (e) => {
        const statusSel = e.target.closest('[data-action="status"]');
        if (statusSel) {
          status = statusSel.value;
          page = 1;
          selectedIds = new Set();
          refetch();
          return;
        }
        const sortSel = e.target.closest('[data-action="sort"]');
        if (sortSel) {
          sortBy = sortSel.value;
          page = 1;
          selectedIds = new Set();
          refetch();
          return;
        }
      };
      root?.addEventListener('change', changeHandler);

      // 초기 fetch
      refetch();
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
      unmountRefillModal();
      unmountNewInboundModal();
      skuListStore.reset();
    },
  };
}

// ─── render ──────────────────────────────────────────────
function render(state, ctx) {
  const root = document.getElementById(ROOT_ID);
  if (!root) return;

  const { isLoading, error, data, receivedAt } = state;

  root.innerHTML = `
    <header class="sku-list-header">
      <h1 class="h3 fw-bold mb-0">${escapeHtml(t('skuList.title'))}</h1>
      <span class="sku-list-updated text-muted small">
        ${receivedAt ? `${escapeHtml(t('header.updated'))} ${formatHM(receivedAt)}` : ''}
      </span>
    </header>

    ${renderToolbar(ctx)}

    <div class="sku-list-body">
      ${error            ? renderError(error)
        : isLoading && !data ? renderLoading()
        : renderTable(data, ctx)}
    </div>

    ${data ? renderPagination(data) : ''}
  `;
}

function renderLoading() {
  return `
    <div class="sku-list-loading">
      <div class="spinner-border text-warning" role="status"></div>
      <span class="ms-2 text-muted">${escapeHtml(t('skuList.loading'))}</span>
    </div>
  `;
}

function renderError(err) {
  return `
    <div class="alert alert-danger m-4" role="alert">
      <strong>${escapeHtml(t('skuList.errorTitle'))}</strong>
      <div class="small mt-1">${escapeHtml(err?.message ?? t('common.error'))}</div>
    </div>
  `;
}

// ─── Toolbar (search / status / sort + actions) ─────────
function renderToolbar(ctx) {
  const hasSelection = ctx.selectedIds.size > 0;
  const orderIcon = ctx.order === 'asc' ? 'arrow_upward' : 'arrow_downward';
  const orderLabel = ctx.order === 'asc' ? t('common.ascending') : t('common.descending');
  return `
    <div class="sku-list-toolbar">
      <div class="sku-list-toolbar-filters">
        <div class="sku-list-search">
          <span class="material-symbols-outlined">search</span>
          <input
            type="search"
            data-action="search"
            class="form-control"
            placeholder="${escapeHtml(t('skuList.toolbar.searchPlaceholder'))}"
            value="${escapeHtml(ctx.search)}"
            aria-label="${escapeHtml(t('skuList.toolbar.searchAria'))}"
          />
        </div>

        <select data-action="status" class="form-select sku-list-status" aria-label="${escapeHtml(t('skuList.toolbar.statusAria'))}">
          ${STATUS_OPTION_VALUES.map((value) => `
            <option value="${value}" ${value === ctx.status ? 'selected' : ''}>${escapeHtml(t('skuList.statusFilter.' + value))}</option>
          `).join('')}
        </select>

        <div class="sku-list-sort-group" role="group" aria-label="${escapeHtml(t('skuList.toolbar.sortAria'))}">
          <label class="sku-list-sort-label" for="sku-list-sort-by">${escapeHtml(t('common.sortBy'))}</label>
          <select id="sku-list-sort-by" data-action="sort" class="form-select sku-list-sort" aria-label="${escapeHtml(t('common.sortBy'))}">
            ${SORT_OPTION_VALUES.map((value) => `
              <option value="${value}" ${value === ctx.sortBy ? 'selected' : ''}>${escapeHtml(t('skuList.sort.' + value))}</option>
            `).join('')}
          </select>
          <button
            type="button"
            class="sku-list-sort-order"
            data-action="toggle-order"
            aria-label="${escapeHtml(tf('common.toggleSortOrder', { order: orderLabel }))}"
            title="${escapeHtml(orderLabel)}"
          >
            <span class="material-symbols-outlined">${orderIcon}</span>
          </button>
        </div>
      </div>

      <div class="sku-list-toolbar-actions">
        <button type="button" class="btn btn-outline-secondary" data-action="new-inbound">
          <span class="material-symbols-outlined">add</span>
          ${escapeHtml(t('skuList.toolbar.newInbound'))}
        </button>
        <button type="button" class="btn btn-warning" data-action="refill" ${hasSelection ? '' : 'disabled'}>
          ${escapeHtml(t('skuList.toolbar.refill'))}${hasSelection ? ` (${ctx.selectedIds.size})` : ''}
        </button>
      </div>
    </div>
  `;
}

// ─── Table ──────────────────────────────────────────────
function renderTable(data, ctx) {
  const items = data?.items ?? [];

  if (items.length === 0) {
    return `
      <div class="sku-list-empty text-muted text-center py-5">
        ${escapeHtml(t('skuList.empty'))}
      </div>
    `;
  }

  const eligible = items.filter((r) => r.stockStatus !== 'overstock');
  const allSelected = eligible.length > 0 && eligible.every((r) => ctx.selectedIds.has(r.skuId));

  return `
    <table class="sku-list-table">
      <thead>
        <tr>
          <th class="sku-list-col-check">
            <input
              type="checkbox"
              data-action="select-all"
              ${allSelected ? 'checked' : ''}
              ${eligible.length === 0 ? 'disabled' : ''}
              aria-label="${escapeHtml(t('skuList.toolbar.selectAll'))}"
            />
          </th>
          <th>${escapeHtml(t('skuList.col.skuId'))}</th>
          <th>${escapeHtml(t('skuList.col.productName'))}</th>
          <th class="text-end">${escapeHtml(t('skuList.col.qty'))}</th>
          <th class="text-end">${escapeHtml(t('skuList.col.capacity'))}</th>
          <th>${escapeHtml(t('skuList.col.location'))}</th>
          <th>${escapeHtml(t('skuList.col.status'))}</th>
        </tr>
      </thead>
      <tbody>
        ${items.map((row) => renderRow(row, ctx.selectedIds)).join('')}
      </tbody>
    </table>
  `;
}

function renderRow(row, selectedIds) {
  const isOverstock = row.stockStatus === 'overstock';
  const isChecked   = selectedIds.has(row.skuId);
  const detailHref  = `#/inventory/sku-detail?id=${encodeURIComponent(row.skuId)}`;
  const capacityPct = Math.round((row.capacityRate ?? 0) * 100);
  const badgeClass  = stockStatusBadgeClass(row.stockStatus);
  // status label은 i18n inventory.status.* 사용 (한국어 토글 시 자동 번역)
  const statusLabel = t('inventory.status.' + row.stockStatus);
  // 정렬과 무관하게 위험도가 높은 행은 살짝 강조해두면 가독성 ↑ (rank 0~1)
  const rowDangerCls = stockStatusRank(row.stockStatus) <= 1 ? ' sku-list-row-danger' : '';

  return `
    <tr class="sku-list-row${rowDangerCls}">
      <td class="sku-list-col-check">
        <input
          type="checkbox"
          data-action="select-row"
          data-id="${escapeHtml(row.skuId)}"
          ${isChecked ? 'checked' : ''}
          ${isOverstock ? 'disabled' : ''}
          aria-label="${escapeHtml(row.skuId)}"
        />
      </td>
      <td><a href="${detailHref}" class="sku-list-link">${escapeHtml(row.skuId)}</a></td>
      <td><a href="${detailHref}" class="sku-list-link fw-semibold">${escapeHtml(row.displayName)}</a></td>
      <td class="text-end">${(row.currentQty ?? 0).toLocaleString()}${row.standardQty ? ` / ${row.standardQty.toLocaleString()}` : ''}</td>
      <td class="text-end">${capacityPct}%</td>
      <td class="text-muted small">${escapeHtml(row.zoneName)} / ${escapeHtml(row.sectionName)}</td>
      <td><span class="badge ${badgeClass}">${escapeHtml(statusLabel)}</span></td>
    </tr>
  `;
}

// ─── Pagination ─────────────────────────────────────────
function renderPagination(data) {
  const total  = data.totalCount ?? 0;
  const page   = data.page  ?? 1;
  const limit  = data.limit ?? PAGE_LIMIT;
  const start  = total === 0 ? 0 : (page - 1) * limit + 1;
  const end    = Math.min(total, page * limit);
  const pages  = Math.max(1, Math.ceil(total / limit));

  return `
    <div class="sku-list-pagination">
      <div class="sku-list-pagination-info text-muted small">
        ${escapeHtml(tf('skuList.pagination.showing', { start, end, total }))}
      </div>
      <nav aria-label="${escapeHtml(t('skuList.pagination.aria'))}">
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

// 페이지 번호 윈도우 — 현재 ± 1 + 처음/끝 + 생략 부호 ('…')
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

// ─── helpers ────────────────────────────────────────────
function formatHM(ms) {
  if (!ms) return '—';
  const d = new Date(ms);
  return `${pad2(d.getHours())}:${pad2(d.getMinutes())}`;
}

function pad2(n) {
  return n < 10 ? `0${n}` : `${n}`;
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
