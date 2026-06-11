/**
 * AlertListPage — 05 Alert List
 * ─────────────────────────────────────────────────────────────
 * Layout: docs/page_layout_outline.md §10
 * 정책 정합: ADR-019 (status 4단계 / severity 3단계 / target denormalize / title·message 자유)
 *           + pending_design_decisions §3.6 (Alert List sort / filter / row interaction)
 *
 * 화면 구조:
 *   ┌─ header (title + 부제 + Updated) ─────────────────────┐
 *   │ Summary chips (Pending / In Process / Critical)       │
 *   ├──────────────────────────────────────────────────────┤
 *   │ Toolbar (Search / Type / Status / Severity / Sort)    │
 *   ├──────────────────────────────────────────────────────┤
 *   │ Alert table (5 cols: Type / Description / Status /    │
 *   │              Severity / Created)                      │
 *   ├──────────────────────────────────────────────────────┤
 *   │ Pagination footer                                     │
 *   └──────────────────────────────────────────────────────┘
 *
 * 정책:
 *   - Type 컬럼: 4종 카테고리 + 아이콘 (Stock Shortage / Validity Risk /
 *     Device Issue / Abnormal Access). raw alert_type은 modal 안에서만 노출.
 *     매핑 단일 진실: alertConstants.js
 *   - Description: title bold + message 1줄 (line-clamp:1).
 *     SKU·수치는 message 안에 자연어로 들어가 있으므로 list에서 우선순위 결정 가능.
 *     Location 등 target dict 전체는 modal로 이동.
 *   - Row click → AlertDetailModal open. inline 액션 없음. 상태 전이는 modal에서.
 *   - Cancelled row: 취소선 + 흐리게.
 *   - Chip 카운트는 mock/backend 응답의 site-wide count (filter 무관).
 *   - Status 필터 기본값 'active' (pending + in_process). 'all' 토글 시 전체.
 */

import { alertsStore } from '../../store/alertsStore.js';
import { appStore } from '../../store/appStore.js';
import { scopeStore } from '../../store/scopeStore.js';
import { t, tf } from '../../core/i18n/index.js';
import { alertDisplay } from './alertDisplay.js';
import {
  ALERT_TYPE_CATEGORY,
  CATEGORY_META,
  STATUS_META,
  SEVERITY_META,
} from './alertConstants.js';
import {
  mountAlertDetailModal,
  unmountAlertDetailModal,
  openAlertDetailModal,
} from './AlertDetailModal.js';

const ROOT_ID    = 'alert-list-root';
const PAGE_LIMIT = 7;

// Filter 옵션 — 라벨은 i18n 키로 동적 로드
//   - Status chip 4종: all / pending / in_process / completed (cancelled는 chip 미노출, all에서만 보임)
//   - Type / Severity: toolbar dropdown 유지. Status는 chip이 담당하므로 dropdown 제거
const STATUS_CHIP_VALUES     = ['all', 'pending', 'in_process', 'completed'];
const TYPE_FILTER_VALUES     = ['all', 'stock_shortage', 'validity_risk', 'device_issue', 'abnormal_access'];
const SEVERITY_FILTER_VALUES = ['all', 'critical', 'warning', 'info'];
// Sort: status 제거 (chip이 책임), severity / created_at만 유지
const SORT_OPTION_VALUES     = ['severity', 'created_at'];

// severity 우선순위 (페이지당 client-side 재정렬용)
const SEVERITY_RANK = { critical: 3, warning: 2, info: 1 };

export default function AlertListPage() {
  let search    = '';
  let type      = 'all';
  let status    = 'all';      // default: 전체 보기 (BK 결정)
  let severity  = 'all';
  let sortBy    = 'severity'; // default: severity 우선 (페이지당 critical 위로)
  let order     = 'desc';
  let page      = 1;
  // 진입 필터 — 02-2 SKU Detail → #/alerts?sku_id= / 03-3 Section Detail Related Alerts → #/alerts?sectionId=&zoneId=
  //   mount 1회 파싱 (단발 진입). backend find_alerts 가 sku_id/section_id/zone_id 직접 지원 (alerts_repo.py:25-27).
  let skuId     = null;
  let sectionId = null;
  let zoneId    = null;
  let debounceTimer = null;

  let unsubStore    = null;
  let unsubApp      = null;
  let unsubScope    = null;
  let clickHandler  = null;
  let inputHandler  = null;
  let changeHandler = null;

  function buildQuery() {
    const q = { page, limit: PAGE_LIMIT, sort_by: sortBy, order };
    if (search.trim()) q.search = search.trim();

    // Type 카테고리는 backend 로 보내지 않음 — BE alert_type 은 granular 단일정확 매칭이라
    //   카테고리(다중 type)를 표현 불가. 화면 직전 client-side 로 거름(sortItemsForView 선례와 동일).
    if (severity !== 'all') q.severity = severity;
    // status: backend는 단일 Literal만 받음 (콤마 묶음 미지원).
    //   'all'은 status 생략 — backend 전체 반환 (cancelled 포함).
    //   그 외(pending/in_process/completed)는 단일값 전달.
    if (status !== 'all') q.status = status;
    // scope filter
    const scopeZone = scopeStore.getState().zoneId;
    if (scopeZone) q.zone_id = scopeZone;
    // 진입 필터 (backend find_alerts 직접 지원). URL zone 은 scope 보다 우선(명시 진입).
    if (zoneId) q.zone_id = zoneId;
    if (sectionId) q.section_id = sectionId;
    if (skuId) q.sku_id = skuId;
    return q;
  }

  function refetch() {
    alertsStore.fetchList(buildQuery());
  }

  function rerender() {
    render(alertsStore.getState(), { search, type, status, severity, sortBy, order });
  }

  return {
    html: `<section id="${ROOT_ID}" class="alert-list-page"></section>`,

    mount() {
      // #/alerts?sku_id=X 진입 시 해당 SKU로 필터 (SkuDetail "View alerts on this SKU")
      const qs = window.location.hash.split('?')[1];
      const qp = new URLSearchParams(qs || '');
      skuId     = qp.get('sku_id') || null;
      sectionId = qp.get('sectionId') || qp.get('section_id') || null;
      zoneId    = qp.get('zoneId') || qp.get('zone_id') || null;

      mountAlertDetailModal();
      unsubStore = alertsStore.subscribe(rerender);
      unsubApp   = appStore.subscribe(() => { rerender(); refetch(); });   // lang: UI + BE 데이터 재요청
      // scope (TopBar zone) 변경 시 page=1 reset + refetch
      unsubScope = scopeStore.subscribe(() => { page = 1; refetch(); });
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

        const row = e.target.closest('[data-action="open-alert"]');
        if (row) {
          const id = row.dataset.id;
          if (id) openAlertDetailModal(id);
          return;
        }

        // status chip → 단일 선택 토글 (all / pending / in_process / completed)
        const chipBtn = e.target.closest('[data-action="chip"]');
        if (chipBtn) {
          const next = chipBtn.dataset.chip;
          if (STATUS_CHIP_VALUES.includes(next)) {
            status = next;
            page = 1;
            refetch();
          }
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
        const typeSel = e.target.closest('[data-action="type"]');
        if (typeSel) { type = typeSel.value; page = 1; refetch(); return; }
        const sevSel = e.target.closest('[data-action="severity"]');
        if (sevSel) { severity = sevSel.value; page = 1; refetch(); return; }
        const sortSel = e.target.closest('[data-action="sort"]');
        if (sortSel) { sortBy = sortSel.value; page = 1; refetch(); return; }
      };
      root?.addEventListener('change', changeHandler);

      refetch();
    },

    destroy() {
      if (debounceTimer) clearTimeout(debounceTimer);
      debounceTimer = null;
      unsubStore?.();
      unsubApp?.();
      unsubScope?.();
      unsubStore = unsubApp = unsubScope = null;
      const root = document.getElementById(ROOT_ID);
      if (root && clickHandler)  root.removeEventListener('click',  clickHandler);
      if (root && inputHandler)  root.removeEventListener('input',  inputHandler);
      if (root && changeHandler) root.removeEventListener('change', changeHandler);
      clickHandler = inputHandler = changeHandler = null;
      unmountAlertDetailModal();
      alertsStore.reset();
    },
  };
}

// ─── render ──────────────────────────────────────────────
function render(state, ctx) {
  const root = document.getElementById(ROOT_ID);
  if (!root) return;

  const { list } = state;
  const { isLoading, error, receivedAt } = list;

  // 페이지당 client-side 정렬 (BK 결정 — 그 페이지 안에서만 정렬, backend sort_by 미지원).
  //   sortBy=severity: SEVERITY_RANK desc → created_at desc
  //   sortBy=created_at: created_at order만 적용 (backend가 이미 desc로 반환)
  //   페이지 가로지르는 정렬 정합성은 보장 X — "자주 본다" 전제로 page 1 안에 모임.
  // Type 카테고리 필터 — client-side (buildQuery 가 alert_type 미전송, BE 단일정확 우회)
  const byCategory = ctx.type === 'all'
    ? (list.items ?? [])
    : (list.items ?? []).filter((a) => (ALERT_TYPE_CATEGORY[a.alertType] ?? null) === ctx.type);
  const sortedItems = sortItemsForView(byCategory, ctx);
  const filteredList = { ...list, items: sortedItems };

  root.innerHTML = `
    <header class="alert-list-header">
      <div>
        <h1 class="h3 fw-bold mb-1">${escapeHtml(t('alertList.title'))}</h1>
        <p class="text-muted small mb-0">
          ${escapeHtml(t('alertList.subtitle'))}
        </p>
      </div>
      <span class="alert-list-updated text-muted small">
        ${receivedAt ? `${escapeHtml(t('header.updated'))} ${formatHM(receivedAt)}` : ''}
      </span>
    </header>

    ${renderChips(list, ctx)}
    ${renderToolbar(ctx)}

    <div class="alert-list-main">
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
    <div class="alert-list-loading">
      <div class="spinner-border text-warning" role="status"></div>
      <span class="ms-2 text-muted">${escapeHtml(t('alertList.loading'))}</span>
    </div>
  `;
}

// 페이지당 정렬 helper
//   sortBy='severity': severity desc → created_at desc 보조
//   sortBy='created_at': order에 따라 asc/desc
//   페이지 가로지르는 정합성은 backend created_at desc 기준이라 보장 X.
function sortItemsForView(items, ctx) {
  if (!Array.isArray(items) || items.length === 0) return items;
  const arr = [...items];
  const dir = ctx.order === 'asc' ? 1 : -1;
  if (ctx.sortBy === 'severity') {
    arr.sort((a, b) => {
      // desc(default)면 critical 위, asc면 info 위 — `(rankA - rankB) * dir` 형태
      const sevDiff = ((SEVERITY_RANK[a.severity] ?? 0) - (SEVERITY_RANK[b.severity] ?? 0)) * dir;
      if (sevDiff !== 0) return sevDiff;
      // 같은 severity → created_at은 항상 최신순(desc) 보조 정렬
      return new Date(b.createdAt ?? 0) - new Date(a.createdAt ?? 0);
    });
  } else if (ctx.sortBy === 'created_at') {
    arr.sort((a, b) => {
      return (new Date(a.createdAt ?? 0) - new Date(b.createdAt ?? 0)) * dir;
    });
  }
  return arr;
}

function renderError(err) {
  return `
    <div class="alert alert-danger m-4" role="alert">
      <strong>${escapeHtml(t('alertList.errorTitle'))}</strong>
      <div class="small mt-1">${escapeHtml(err?.message ?? t('common.error'))}</div>
    </div>
  `;
}

// ─── Status chips (4종: All / Pending / In-Process / Completed) ──────
// 단일 선택 토글. Cancelled는 All에서만 보임 (chip 미노출).
// Critical chip 제거 — Toast popup + 종형 벨 + AlertCenter 드롭다운 3중 보완.
function renderChips(list, ctx) {
  // chip별 카운트: backend 응답에 있는 것만 노출 (pending / in_process는 항상,
  //   completed / all은 backend가 별도 카운트 안 주므로 0 또는 미노출)
  const totalCount = list.totalCount;
  const countFor = (chipValue) => {
    if (chipValue === 'all')        return totalCount;
    if (chipValue === 'pending')    return list.pendingCount;
    if (chipValue === 'in_process') return list.inProcessCount;
    if (chipValue === 'completed')  return list.completedCount;   // backend 미제공 — undefined
    return undefined;
  };
  // chip별 스타일 (성격에 맞춰)
  const styleFor = (chipValue) => {
    if (chipValue === 'pending')    return 'alert-chip-warning';
    if (chipValue === 'in_process') return 'alert-chip-info';
    if (chipValue === 'completed')  return 'alert-chip-success';
    return 'alert-chip-neutral';
  };

  return `
    <div class="alert-list-chips">
      ${STATUS_CHIP_VALUES.map((value) => {
        const count = countFor(value);
        return `
          <button type="button"
                  class="alert-chip ${styleFor(value)} ${ctx.status === value ? 'is-active' : ''}"
                  data-action="chip" data-chip="${value}">
            <span class="alert-chip-label">${escapeHtml(t('alertList.chip.' + value))}</span>
            ${count != null ? `<span class="alert-chip-count">${count}</span>` : ''}
          </button>
        `;
      }).join('')}
    </div>
  `;
}

// ─── Toolbar ────────────────────────────────────────────
function renderToolbar(ctx) {
  const orderIcon  = ctx.order === 'asc' ? 'arrow_upward' : 'arrow_downward';
  const orderLabel = ctx.order === 'asc' ? t('common.ascending') : t('common.descending');
  return `
    <div class="alert-list-toolbar">
      <div class="alert-list-search">
        <span class="material-symbols-outlined">search</span>
        <input
          type="search"
          data-action="search"
          class="form-control"
          placeholder="${escapeHtml(t('alertList.toolbar.searchPlaceholder'))}"
          value="${escapeHtml(ctx.search)}"
          aria-label="${escapeHtml(t('alertList.toolbar.searchAria'))}"
        />
      </div>

      <select data-action="type" class="form-select" aria-label="${escapeHtml(t('alertList.toolbar.typeAria'))}">
        ${TYPE_FILTER_VALUES.map((value) => `
          <option value="${value}" ${value === ctx.type ? 'selected' : ''}>${escapeHtml(t('alertList.typeFilter.' + value))}</option>
        `).join('')}
      </select>

      <select data-action="severity" class="form-select" aria-label="${escapeHtml(t('alertList.toolbar.severityAria'))}">
        ${SEVERITY_FILTER_VALUES.map((value) => `
          <option value="${value}" ${value === ctx.severity ? 'selected' : ''}>${escapeHtml(t('alertList.severityFilter.' + value))}</option>
        `).join('')}
      </select>

      <div class="alert-list-sort-group" role="group" aria-label="${escapeHtml(t('alertList.toolbar.sortAria'))}">
        <label class="alert-list-sort-label" for="alert-list-sort-by">${escapeHtml(t('common.sortBy'))}</label>
        <select id="alert-list-sort-by" data-action="sort" class="form-select" aria-label="${escapeHtml(t('common.sortBy'))}">
          ${SORT_OPTION_VALUES.map((value) => `
            <option value="${value}" ${value === ctx.sortBy ? 'selected' : ''}>${escapeHtml(t('alertList.sortFilter.' + value))}</option>
          `).join('')}
        </select>
        <button
          type="button"
          class="alert-list-sort-order"
          data-action="toggle-order"
          aria-label="${escapeHtml(tf('common.toggleSortOrder', { order: orderLabel }))}"
          title="${escapeHtml(orderLabel)}"
        >
          <span class="material-symbols-outlined">${orderIcon}</span>
        </button>
      </div>
    </div>
  `;
}

// ─── Table ──────────────────────────────────────────────
function renderTable(list) {
  const items = list.items ?? [];

  if (items.length === 0) {
    return `
      <div class="alert-list-empty text-muted text-center py-5">
        ${escapeHtml(t('alertList.empty'))}
      </div>
    `;
  }

  return `
    <table class="alert-list-table">
      <thead>
        <tr>
          <th class="alert-list-col-type">${escapeHtml(t('alertList.col.type'))}</th>
          <th>${escapeHtml(t('alertList.col.description'))}</th>
          <th class="alert-list-col-status">${escapeHtml(t('alertList.col.status'))}</th>
          <th class="alert-list-col-severity">${escapeHtml(t('alertList.col.severity'))}</th>
          <th class="alert-list-col-created">${escapeHtml(t('alertList.col.created'))}</th>
        </tr>
      </thead>
      <tbody>
        ${items.map(renderRow).join('')}
      </tbody>
    </table>
  `;
}

function renderRow(a) {
  const categoryId = ALERT_TYPE_CATEGORY[a.alertType] ?? 'stock_shortage';
  const cat = CATEGORY_META[categoryId];
  const st  = STATUS_META[a.status]    ?? STATUS_META.pending;
  const sev = SEVERITY_META[a.severity] ?? SEVERITY_META.info;
  const isCancelled = a.status === 'cancelled';
  // 라벨은 i18n 키 사용 (한국어 토글 시 자동 번역). badge class는 그대로 유지.
  const categoryLabel = t('alertList.category.' + categoryId);
  const statusLabel   = t('alert.status.' + (STATUS_META[a.status] ? a.status : 'pending'));
  const severityLabel = t('alert.severity.' + (SEVERITY_META[a.severity] ? a.severity : 'info'));
  const disp = alertDisplay(a);

  return `
    <tr class="alert-list-row ${isCancelled ? 'is-cancelled' : ''}"
        data-action="open-alert"
        data-id="${escapeHtml(a.alertId)}">
      <td class="alert-list-col-type">
        <span class="alert-list-type-cell">
          <span class="material-symbols-outlined alert-list-type-icon alert-list-type-icon-${categoryId}">${cat.icon}</span>
          <span>${escapeHtml(categoryLabel)}</span>
        </span>
      </td>
      <td class="alert-list-desc">
        <div class="alert-list-desc-title fw-semibold">${escapeHtml(disp.title)}</div>
        <div class="alert-list-desc-msg text-muted small">${escapeHtml(disp.message)}</div>
      </td>
      <td><span class="badge ${st.badge}">${escapeHtml(statusLabel)}</span></td>
      <td><span class="badge ${sev.badge}">${escapeHtml(severityLabel)}</span></td>
      <td class="text-muted small">${escapeHtml(formatRelative(a.createdAt))}</td>
    </tr>
  `;
}

// ─── Pagination ─────────────────────────────────────────
function renderPagination(list) {
  const total  = list.totalCount ?? 0;
  const params = list.params ?? {};
  const page   = Number(params.page)  || 1;
  const limit  = Number(params.limit) || PAGE_LIMIT;
  const start  = total === 0 ? 0 : (page - 1) * limit + 1;
  const end    = Math.min(total, page * limit);
  const pages  = Math.max(1, Math.ceil(total / limit));

  return `
    <div class="alert-list-pagination">
      <div class="alert-list-pagination-info text-muted small">
        ${escapeHtml(tf('alertList.pagination.showing', { start, end, total }))}
      </div>
      <nav aria-label="${escapeHtml(t('alertList.pagination.aria'))}">
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

// ─── helpers ────────────────────────────────────────────
function formatHM(ms) {
  if (!ms) return '—';
  const d = new Date(ms);
  return `${pad2(d.getHours())}:${pad2(d.getMinutes())}`;
}

function formatRelative(iso) {
  if (!iso) return '—';
  const diff = Date.now() - new Date(iso).getTime();
  const min = Math.floor(diff / 60000);
  if (min < 1)  return t('alertList.relative.justNow');
  if (min < 60) return tf('alertList.relative.minutes', { n: min });
  const hr = Math.floor(min / 60);
  if (hr < 24)  return tf('alertList.relative.hours', { n: hr });
  const day = Math.floor(hr / 24);
  return tf('alertList.relative.days', { n: day });
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
