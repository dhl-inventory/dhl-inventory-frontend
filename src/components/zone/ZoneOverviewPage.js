/**
 * ZoneOverviewPage — 03-1 Zone Overview - All Zones
 * ─────────────────────────────────────────────────────────────
 * Layout: docs/page_layout_outline.md §8 (03-1) + §8 final lower-list decision
 *
 * 화면 구조 (layout outline §8):
 *   ┌─ Header (title + Updated) ────────────────────────────┐
 *   │ Zone 카드 그리드                                      │
 *   │  ├─ Zone name / status / below_standard / sections    │
 *   │  └─ 카드 click → 03-2 Zone Detail (?zone=X)           │
 *   ├──────────────────────────────────────────────────────┤
 *   │ Cross-Zone Attention List (Dashboard top_attention 재사용 |
 *   │   별도 endpoint 없음 — backend_zone_request.md §7)    │
 *   └──────────────────────────────────────────────────────┘
 *
 * 정책 (§8 final adjustment):
 *  - Zone 카드는 정적인 색 시그널 — border/icon/tint. alarm 스타일 X (pending §3.8)
 *  - Cross-Zone Attention List는 최대 5행 (more는 03-2 진입)
 *  - 모든 SKU 나열 X — 조치 필요 항목만
 */

import { zoneStore } from '../../store/zoneStore.js';
import { dashboardStore } from '../../store/dashboardStore.js';
import { appStore } from '../../store/appStore.js';
import { scopeStatusStore } from '../../store/scopeStatusStore.js';
import { subscribeInventoryRefetch } from '../../core/socket.js';
import { t, tf } from '../../core/i18n/index.js';

const ROOT_ID = 'zone-overview-root';

const STATUS_BADGE = {
  out_of_stock: 'bg-danger',
  critical:     'bg-danger',
  warning:      'bg-warning text-dark',
  watch:        'bg-info text-dark',
  normal:       'bg-success',
  overstock:    'bg-secondary',
};

const STATUS_TINT = {
  out_of_stock: 'zone-card-tint-danger',
  critical:     'zone-card-tint-danger',
  warning:      'zone-card-tint-warning',
  watch:        'zone-card-tint-info',
  normal:       'zone-card-tint-normal',
  overstock:    'zone-card-tint-overstock',
};

// status label은 i18n inventory.status.* 사용 (lang 변경 시 자동 번역).

export default function ZoneOverviewPage() {
  let unsubZone      = null;
  let unsubDashboard = null;
  let unsubApp       = null;
  let unsubScope     = null;
  let unsubSocket    = null;

  return {
    html: `<section id="${ROOT_ID}" class="zone-overview-page"></section>`,

    mount() {
      unsubZone = zoneStore.subscribe(rerender);
      unsubDashboard = dashboardStore.subscribe(rerender);
      unsubApp = appStore.subscribe(() => { rerender(); zoneStore.fetchOverview(); dashboardStore.fetchSummary(); });   // lang: UI + overview + capacity 재요청
      unsubScope = scopeStatusStore.subscribe(rerender);   // hidden pending alert overlay
      rerender();

      // 03-1 데이터: zone overview + dashboard capacity(top_attention_list) + scope status (hidden alerts)
      zoneStore.fetchOverview();
      if (!dashboardStore.getState().data) {
        dashboardStore.fetchSummary();
      }
      scopeStatusStore.refresh();

      // Phase 6: inventory_update 수신 시 overview + scope 카운트 refetch (debounce)
      unsubSocket = subscribeInventoryRefetch(() => {
        zoneStore.fetchOverview();
        scopeStatusStore.refresh();
      });
    },

    destroy() {
      unsubZone?.();
      unsubDashboard?.();
      unsubApp?.();
      unsubScope?.();
      unsubSocket?.();
      unsubZone = unsubDashboard = unsubApp = unsubScope = unsubSocket = null;
      zoneStore.reset();
    },
  };
}

function rerender() {
  const root = document.getElementById(ROOT_ID);
  if (!root) return;

  const overview = zoneStore.getState().overview;
  const dashboard = dashboardStore.getState();
  const attentionList = dashboard.data?.capacity?.topAttentionList ?? [];
  const subtitle = t('zoneOverview.subtitle');

  root.innerHTML = `
    <header class="zone-overview-header">
      <div>
        <h1 class="h3 fw-bold mb-1">${escapeHtml(t('zoneOverview.title'))}</h1>
        ${subtitle ? `<p class="text-muted small mb-0">${escapeHtml(subtitle)}</p>` : ''}
      </div>
      <span class="zone-overview-updated text-muted small">
        ${overview.receivedAt ? `${escapeHtml(t('header.updated'))} ${formatHM(overview.receivedAt)}` : ''}
      </span>
    </header>

    ${overview.error
      ? renderError(overview.error)
      : overview.isLoading && overview.zones.length === 0
        ? renderLoading()
        : renderZoneGrid(overview.zones, attentionList)}

    ${renderAttentionList(attentionList, dashboard.isLoading, dashboard.error)}
  `;
}

function renderLoading() {
  return `
    <div class="zone-overview-loading">
      <div class="spinner-border text-warning" role="status"></div>
      <span class="ms-2 text-muted">${escapeHtml(t('zoneOverview.loading'))}</span>
    </div>
  `;
}

function renderError(err) {
  return `
    <div class="alert alert-danger m-4" role="alert">
      <strong>${escapeHtml(t('zoneOverview.errorTitle'))}</strong>
      <div class="small mt-1">${escapeHtml(err?.message ?? t('common.error'))}</div>
    </div>
  `;
}

// ─── Zone 카드 그리드 ───────────────────────────────────
function renderZoneGrid(zones, attentionList = []) {
  if (zones.length === 0) {
    return `<div class="zone-overview-empty text-muted text-center py-5">${escapeHtml(t('zoneOverview.empty'))}</div>`;
  }
  const attentionByZone = buildAttentionByZone(attentionList);
  return `
    <div class="zone-overview-grid">
      ${zones.map((zone) => renderZoneCard(zone, attentionByZone.get(zone.zoneId))).join('')}
    </div>
  `;
}

function renderZoneCard(z, attentionItem) {
  const badge = STATUS_BADGE[z.status] ?? 'bg-secondary';
  const label = t('inventory.status.' + z.status);
  const tint  = STATUS_TINT[z.status]  ?? '';
  const detailHref = `#/zone/detail?id=${encodeURIComponent(z.zoneId)}`;
  // hidden pending alert overlay — scopeStatusStore (5.7)
  const hiddenCount = scopeStatusStore.getState().byZone[z.zoneId]?.count ?? 0;
  const overlayCls = hiddenCount > 0 ? ' has-hidden-pending' : '';
  return `
    <a href="${detailHref}" class="zone-card ${tint}${overlayCls}">
      <header class="zone-card-header">
        <h2 class="zone-card-title">${escapeHtml(z.zoneName ?? z.zoneId)}</h2>
        <span class="badge ${badge}">${escapeHtml(label)}</span>
      </header>
      <div class="zone-card-body">
        <div class="zone-card-primary ${z.status === 'normal' ? 'is-normal' : ''}">
          ${escapeHtml(getZonePrimaryLine(z))}
        </div>
        <div class="zone-card-sections">${escapeHtml(formatSectionCount(z.sectionCount ?? 0))}</div>
        <div class="zone-card-attention">${escapeHtml(getZoneAttentionLine(z, attentionItem))}</div>
      </div>
      <footer class="zone-card-footer text-muted small">
        ${escapeHtml(t('zoneOverview.viewZone'))} <span class="material-symbols-outlined">arrow_forward</span>
      </footer>
    </a>
  `;
}

function buildAttentionByZone(items) {
  const map = new Map();
  for (const item of items ?? []) {
    if (item?.zoneId && !map.has(item.zoneId)) {
      map.set(item.zoneId, item);
    }
  }
  return map;
}

function getZonePrimaryLine(zone) {
  const below = Number(zone.belowStandardSkuCount ?? 0);
  const lowSections = Number(zone.lowStockSectionCount ?? 0);
  if (below > 0) return tf('zoneOverview.card.skuBelowStandard', { n: below });
  // "low stock section(s)" 는 BK 지시로 영어 유지 (loanword '섹션' 도입 보류)
  if (lowSections > 0) return `${lowSections} low stock ${lowSections === 1 ? 'section' : 'sections'}`;
  return t('zoneOverview.card.noStockIssue');
}

function formatSectionCount(sectionCount) {
  const count = Number(sectionCount ?? 0);
  return `${count} ${count === 1 ? 'section' : 'sections'}`;
}

function getZoneAttentionLine(zone, item) {
  if (item) {
    const qty = Number(item.currentQty ?? 0).toLocaleString();
    return `${item.displayName ?? item.skuId} · ${tf('zoneOverview.card.unitsSuffix', { qty })}`;
  }
  if (zone.status === 'normal') return t('zoneOverview.card.normalCondition');
  return '';
}

// ─── Cross-Zone Attention List (Dashboard 재사용) ──────
function renderAttentionList(items, isLoading, error) {
  return `
    <section class="zone-overview-attention">
      <header class="zone-overview-attention-header">
        <h2 class="h6 fw-bold mb-0">${escapeHtml(t('zoneOverview.attention.title'))}</h2>
        <span class="text-muted small">${escapeHtml(t('zoneOverview.attention.subtitle'))}</span>
      </header>
      ${error
        ? `<div class="text-muted small">${escapeHtml(t('zoneOverview.attention.loadError'))}</div>`
        : isLoading && items.length === 0
          ? `<div class="text-muted small">${escapeHtml(t('zoneOverview.attention.loading'))}</div>`
          : renderAttentionTable(items)}
    </section>
  `;
}

// 빈 상태 공용 — Section/Zone DetailPage 와 동일 패턴(부트스트랩 유틸만, 신규 CSS 0)
function renderEmptyState(icon, i18nKey) {
  return `
    <div class="text-center text-muted py-4">
      <span class="material-symbols-outlined d-block mb-2" style="font-size:2rem;opacity:0.4;">${icon}</span>
      <div class="small">${escapeHtml(t(i18nKey))}</div>
    </div>
  `;
}

function renderAttentionTable(items) {
  if (!items || items.length === 0) {
    return renderEmptyState('task_alt', 'zoneOverview.attention.empty');
  }
  const shown = items.slice(0, 5);
  return `
    <table class="zone-overview-attention-table">
      <thead>
        <tr>
          <th>${escapeHtml(t('zoneOverview.attention.col.zone'))}</th>
          <th>${escapeHtml(t('zoneOverview.attention.col.section'))}</th>
          <th>${escapeHtml(t('zoneOverview.attention.col.sku'))}</th>
          <th>${escapeHtml(t('zoneOverview.attention.col.issue'))}</th>
          <th class="text-end">${escapeHtml(t('zoneOverview.attention.col.qty'))}</th>
          <th>${escapeHtml(t('zoneOverview.attention.col.status'))}</th>
        </tr>
      </thead>
      <tbody>
        ${shown.map(renderAttentionRow).join('')}
      </tbody>
    </table>
  `;
}

function renderAttentionRow(row) {
  const badge = STATUS_BADGE[row.stockStatus] ?? 'bg-secondary';
  const label = t('inventory.status.' + row.stockStatus);
  const skuLink = `#/inventory/sku-detail?id=${encodeURIComponent(row.skuId)}`;
  const sectionLink = row.sectionId ? `#/zone/section?zone=${encodeURIComponent(row.zoneId)}&id=${encodeURIComponent(row.sectionId)}` : null;
  return `
    <tr>
      <td>${escapeHtml(row.zoneName ?? row.zoneId)}</td>
      <td>
        ${sectionLink
          ? `<a href="${sectionLink}" class="zone-overview-link">${escapeHtml(row.sectionName ?? row.sectionId)}</a>`
          : `<span class="text-muted small">${escapeHtml(row.sectionName ?? row.sectionId ?? '—')}</span>`}
      </td>
      <td>
        <a href="${skuLink}" class="zone-overview-link">${escapeHtml(row.displayName ?? row.skuId)}</a>
      </td>
      <td>
        <span class="zone-overview-issue ${getIssueClass(row.stockStatus)}">${escapeHtml(getAttentionIssueLabel(row))}</span>
      </td>
      <td class="text-end">${(row.currentQty ?? 0).toLocaleString()}</td>
      <td><span class="badge ${badge}">${escapeHtml(label)}</span></td>
    </tr>
  `;
}

function getAttentionIssueLabel(row) {
  if (row.stockStatus === 'out_of_stock') return t('zoneOverview.attention.issue.belowStandard');
  if (row.stockStatus === 'critical') return t('zoneOverview.attention.issue.stockoutWarning');
  if (row.stockStatus === 'warning' || row.stockStatus === 'watch') return t('zoneOverview.attention.issue.approachingLow');
  return t('zoneOverview.attention.issue.reviewNeeded');
}

function getIssueClass(status) {
  if (status === 'out_of_stock' || status === 'critical') return 'is-critical';
  if (status === 'warning' || status === 'watch') return 'is-warning';
  return '';
}

// ─── helpers ────────────────────────────────────────────
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
