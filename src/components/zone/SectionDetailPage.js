/**
 * SectionDetailPage - 03-3 Section Detail
 *
 * Wireframe baseline: docs/wireframes/03-3_section_detail.png.
 * Static section events can be rendered now; Phase 6 only adds real-time refresh.
 */

import { zoneStore } from '../../store/zoneStore.js';
import { appStore } from '../../store/appStore.js';
import { subscribeInventoryRefetch } from '../../core/socket.js';
import { t, tf } from '../../core/i18n/index.js';
import { formatMonthDayHM } from '../../core/format.js';
import { createRefillRequest } from '../../api/inventoryApi.js';
import {
  mountRefillModal,
  unmountRefillModal,
  openRefillModal,
} from '../inventory/RefillRequestModal.js';
import {
  mountSnapshotModal,
  unmountSnapshotModal,
  openSnapshotModal,
} from './SnapshotModal.js';
import {
  mountSectionEventsModal,
  unmountSectionEventsModal,
  openSectionEventsModal,
} from './SectionEventsModal.js';
import { scanStore } from '../../store/scanStore.js';
import { authStore } from '../../store/authStore.js';
import { ROLE } from '../../constants/roles.js';

const ROOT_ID = 'section-detail-root';

const STATUS_BADGE = {
  out_of_stock: 'bg-danger',
  critical:     'bg-danger',
  warning:      'bg-warning text-dark',
  watch:        'bg-info text-dark',
  normal:       'bg-success',
  overstock:    'bg-secondary',
  empty:        'bg-light text-muted',
};

export default function SectionDetailPage({ params } = {}) {
  const zoneId = params?.zone;
  // URL `?id=1` 은 string. ADR-028 INT 통일 정합 위해 진입 시점에 Number 변환 (pending §2.48)
  const rawId = params?.id;
  const sectionId = rawId != null && rawId !== '' && Number.isFinite(Number(rawId)) ? Number(rawId) : rawId;
  let unsubStore = null;
  let unsubApp = null;
  let unsubSocket = null;
  let unsubScan = null;
  let clickHandler = null;
  let selectedSkuIds = new Set();

  return {
    html: `<section id="${ROOT_ID}" class="section-detail-page"></section>`,

    mount() {
      if (!zoneId || !sectionId) {
        const root = document.getElementById(ROOT_ID);
        if (root) root.innerHTML = renderMissingParams();
        return;
      }

      mountRefillModal({ onSubmit: createRefillRequest });
      mountSnapshotModal();
      mountSectionEventsModal();
      unsubStore = zoneStore.subscribe(() => render(zoneId, sectionId, selectedSkuIds));
      unsubApp = appStore.subscribe(() => { render(zoneId, sectionId, selectedSkuIds); zoneStore.selectSection(zoneId, sectionId); });   // lang: UI + section 재요청
      unsubScan = scanStore.subscribe(() => render(zoneId, sectionId, selectedSkuIds)); // C-3 scan_state
      // Phase 6: inventory_update 수신 시 현재 section refetch (debounce)
      unsubSocket = subscribeInventoryRefetch(() => zoneStore.selectSection(zoneId, sectionId));
      render(zoneId, sectionId, selectedSkuIds);
      zoneStore.selectSection(zoneId, sectionId);

      clickHandler = (e) => {
        const detail = zoneStore.getState().sectionDetail.data;
        if (!detail) return;

        const checkAll = e.target.closest('[data-action="section-sku-check-all"]');
        if (checkAll) {
          const eligible = getRefillEligibleSkus(detail.skus ?? []);
          selectedSkuIds = checkAll.checked ? new Set(eligible.map((sku) => sku.skuId)) : new Set();
          render(zoneId, sectionId, selectedSkuIds);
          return;
        }

        const skuCheck = e.target.closest('[data-action="section-sku-check"]');
        if (skuCheck) {
          const id = skuCheck.dataset.skuId;
          selectedSkuIds = new Set(selectedSkuIds);
          if (skuCheck.checked) selectedSkuIds.add(id);
          else selectedSkuIds.delete(id);
          render(zoneId, sectionId, selectedSkuIds);
          return;
        }

        const refillBtn = e.target.closest('[data-action="section-refill"]');
        if (refillBtn) {
          const items = (detail.skus ?? [])
            .filter((sku) => selectedSkuIds.has(sku.skuId))
            .map((sku) => ({
              skuId:       sku.skuId,
              displayName: sku.displayName,
              currentQty:  sku.currentQty,
              standardQty: sku.standardQty,
              uom:         sku.uom,
              locationLabel: `${detail.zoneName ?? zoneId} / ${detail.sectionName ?? detail.sectionId}`,
            }));
          if (items.length > 0) openRefillModal(items);
          return;
        }

        const rescanBtn = e.target.closest('[data-action="section-rescan"]');
        if (rescanBtn) {
          scanStore.trigger(sectionId);
          return;
        }

        const snapBtn = e.target.closest('[data-action="view-snapshot"]');
        if (snapBtn) {
          const eid = snapBtn.dataset.eventId;
          if (eid) openSnapshotModal(eid);
          return;
        }

        const eventsAll = e.target.closest('[data-action="open-events-modal"]');
        if (eventsAll) {
          openSectionEventsModal({ zoneId, sectionId });
        }
      };
      document.getElementById(ROOT_ID)?.addEventListener('click', clickHandler);
    },

    destroy() {
      unsubStore?.();
      unsubApp?.();
      unsubSocket?.();
      unsubScan?.();
      unsubStore = unsubApp = unsubSocket = unsubScan = null;
      scanStore.reset();
      const root = document.getElementById(ROOT_ID);
      if (root && clickHandler) root.removeEventListener('click', clickHandler);
      clickHandler = null;
      selectedSkuIds = new Set();
      unmountRefillModal();
      unmountSnapshotModal();
      unmountSectionEventsModal();
      zoneStore.reset();
    },
  };
}

function render(zoneId, sectionId, selectedSkuIds = new Set()) {
  const root = document.getElementById(ROOT_ID);
  if (!root) return;

  const { sectionDetail } = zoneStore.getState();
  const { isLoading, error, data } = sectionDetail;

  root.innerHTML = `
    ${error
      ? renderError(error)
      : isLoading && !data
        ? renderLoading()
        : data ? renderBody(zoneId, sectionId, data, selectedSkuIds) : ''}
  `;
}

function renderBody(zoneId, sectionId, detail, selectedSkuIds) {
  const skus = detail.skus ?? [];
  const eligible = getRefillEligibleSkus(skus);
  const selectedEligibleCount = eligible.filter((sku) => selectedSkuIds.has(sku.skuId)).length;
  const allEligibleSelected = eligible.length > 0 && selectedEligibleCount === eligible.length;
  // C-3 수동 스캔 트리거 — 권한(FIELD·OPS·SUPER, zone 일치는 backend 강제) + scan_state
  const scan = scanStore.getState();
  const scanActive = scan.sectionId === sectionId && !!scan.status;
  const scanBusy = scanActive && scan.status !== 'finished' && scan.status !== 'error';
  const role = authStore.getState().user?.role;
  const canRescan = [ROLE.FIELD_MANAGER, ROLE.OPS_MANAGER, ROLE.SUPER_ADMIN].includes(role);
  const shortage = Math.max((detail.standardQty ?? 0) - (detail.totalQty ?? 0), 0);
  const lastUpdated = detail.lastUpdatedAt ? formatHM(detail.lastUpdatedAt) : '14:20';
  const zoneName = detail.zoneName ?? zoneId;
  const sectionName = detail.sectionName ?? sectionId;
  // C-1(ADR-030): 이름 + 짧은 코드 병기. backend section_code 미수신 시 S-{id} 파생
  //   (= ADR-030 DDL 기본값과 동일). backend 노출 시 sectionCode 자동 사용.
  const sectionLabel = sectionName
    + ' (' + (detail.sectionCode ?? ('S-' + sectionId)) + ')';

  return `
    <header class="section-detail-header">
      <a href="#/zone/detail?id=${encodeURIComponent(zoneId)}" class="section-detail-back">
        <span class="material-symbols-outlined" aria-hidden="true">arrow_back</span>
        ${escapeHtml(t('sectionDetail.backToZone'))}
      </a>
      <span class="section-detail-updated text-muted small">${escapeHtml(t('header.updated'))} ${escapeHtml(lastUpdated)}</span>
    </header>

    <article class="section-detail-hero">
      <div class="section-detail-hero-main">
        <div class="section-detail-title-row">
          <h1 class="section-detail-title">${escapeHtml(sectionLabel)}</h1>
          ${renderStatusBadge(detail.stockStatus)}
        </div>
        <div class="section-detail-meta-line">
          ${escapeHtml(zoneName)} · ${skus.length} ${escapeHtml(t('sectionDetail.meta.skus'))}
        </div>
      </div>

      <div class="section-detail-hero-metric">
        <div class="section-detail-hero-label">${escapeHtml(t('sectionDetail.currentQty'))}</div>
        <div class="section-detail-hero-value">${(detail.totalQty ?? 0).toLocaleString()} ${escapeHtml(t('sectionDetail.units'))}</div>
      </div>

      <div class="section-detail-hero-metric">
        <div class="section-detail-hero-label">${escapeHtml(t('sectionDetail.standardGap'))}</div>
        <div class="section-detail-hero-value ${shortage > 0 ? 'is-danger' : 'is-normal'}">
          ${shortage > 0
            ? escapeHtml(tf('sectionDetail.standardGap.short', { n: shortage.toLocaleString() }))
            : escapeHtml(t('sectionDetail.standardGap.ok'))}
        </div>
      </div>

      <div class="section-detail-hero-actions">
        ${canRescan ? `
          <span class="section-detail-scan-slot">
            ${scanActive ? `
              <span class="section-detail-scan-chip is-${escapeHtml(scan.status)}">
                ${scanBusy ? '<span class="spinner-border spinner-border-sm" role="status" aria-hidden="true"></span>' : ''}
                ${escapeHtml(t('sectionDetail.rescan.status.' + scan.status))}${scan.status === 'error' && scan.error ? ` — ${escapeHtml(scan.error)}` : ''}
              </span>` : ''}
          </span>` : ''}
        ${canRescan ? `
          <button
            type="button"
            class="section-detail-rescan-btn"
            data-action="section-rescan"
            ${scanBusy ? 'disabled' : ''}
          >
            <span class="material-symbols-outlined" aria-hidden="true">cameraswitch</span>
            ${escapeHtml(scanBusy ? t('sectionDetail.rescan.running') : t('sectionDetail.rescan.button'))}
          </button>` : ''}
        <button
          type="button"
          class="section-detail-refill-btn"
          data-action="section-refill"
          ${selectedEligibleCount > 0 ? '' : 'disabled'}
        >
          <span class="material-symbols-outlined" aria-hidden="true">add_shopping_cart</span>
          ${escapeHtml(t('sectionDetail.requestRefill'))}${selectedEligibleCount > 0 ? ` (${selectedEligibleCount})` : ''}
        </button>
      </div>
    </article>

    <div class="section-detail-layout">
      <div class="section-detail-main-col">
        <article class="section-detail-card section-detail-skus-card">
          <header class="section-detail-card-header">
            <h2>${escapeHtml(t('sectionDetail.skus.titleShort'))}</h2>
          </header>
          ${renderSkuList(skus, selectedSkuIds, allEligibleSelected)}
        </article>

        <article class="section-detail-card">
          <header class="section-detail-card-header">
            <h2>${escapeHtml(t('sectionDetail.events.title'))}</h2>
            <button type="button" class="section-detail-card-link"
                    data-action="open-events-modal">
              ${escapeHtml(t('sectionDetail.events.viewAll'))}
            </button>
          </header>
          ${renderEvents(detail.recentEvents ?? [])}
        </article>
      </div>

      <aside class="section-detail-side-col">
        <article class="section-detail-card">
          <header class="section-detail-card-header">
            <h2>${escapeHtml(t('sectionDetail.lastScan.title'))}</h2>
          </header>
          ${renderInfo(detail)}
        </article>

        <article class="section-detail-card section-detail-related-alerts">
          <header class="section-detail-alert-title">
            <span class="material-symbols-outlined" aria-hidden="true">notifications_active</span>
            <h2>${escapeHtml(t('sectionDetail.relatedAlerts.title'))}</h2>
          </header>
          ${renderRelatedAlerts(detail.relatedAlerts ?? [], zoneId, detail.sectionId)}
        </article>
      </aside>
    </div>
  `;
}

// 빈 상태 공용 — 중앙정렬 + 큰 아이콘 + muted 텍스트(부트스트랩 유틸만, 신규 CSS 0)
function renderEmptyState(icon, i18nKey) {
  return `
    <div class="text-center text-muted py-4">
      <span class="material-symbols-outlined d-block mb-2" style="font-size:2rem;opacity:0.4;">${icon}</span>
      <div class="small">${escapeHtml(t(i18nKey))}</div>
    </div>
  `;
}

function renderSkuList(skus, selectedSkuIds, allEligibleSelected) {
  if (skus.length === 0) {
    return renderEmptyState('inventory_2', 'sectionDetail.skus.empty');
  }

  return `
    <table class="section-detail-sku-table">
      <thead>
        <tr>
          <th class="section-detail-check-col">
            <input
              type="checkbox"
              class="form-check-input"
              data-action="section-sku-check-all"
              ${allEligibleSelected ? 'checked' : ''}
              aria-label="${escapeHtml(t('sectionDetail.skus.selectAll'))}"
            />
          </th>
          <th>${escapeHtml(t('sectionDetail.skus.col.skuId'))}</th>
          <th>${escapeHtml(t('sectionDetail.skus.col.productName'))}</th>
          <th class="text-end">${escapeHtml(t('sectionDetail.skus.col.qty'))}</th>
          <th>${escapeHtml(t('sectionDetail.skus.col.status'))}</th>
        </tr>
      </thead>
      <tbody>
        ${skus.map((sku) => renderSkuRow(sku, selectedSkuIds)).join('')}
      </tbody>
    </table>
  `;
}

function renderSkuRow(sku, selectedSkuIds) {
  const isEligible = isRefillEligible(sku);
  const skuLink = `#/inventory/sku-detail?id=${encodeURIComponent(sku.skuId)}`;
  return `
    <tr>
      <td class="section-detail-check-col">
        <input
          type="checkbox"
          class="form-check-input"
          data-action="section-sku-check"
          data-sku-id="${escapeHtml(sku.skuId)}"
          ${selectedSkuIds.has(sku.skuId) ? 'checked' : ''}
          ${isEligible ? '' : 'disabled'}
          aria-label="${escapeHtml(tf('sectionDetail.skus.selectSku', { skuId: sku.skuId }))}"
        />
      </td>
      <td class="text-muted">${escapeHtml(sku.skuId ?? '')}</td>
      <td><a href="${skuLink}" class="section-detail-sku-link">${escapeHtml(sku.displayName ?? sku.skuId)}</a></td>
      <td class="text-end">${(sku.currentQty ?? 0).toLocaleString()}</td>
      <td>${renderStatusBadge(sku.stockStatus, getStockStatusLabel(sku))}</td>
    </tr>
  `;
}

// §6.5 SSAFY §22-1 section 요약 — Warehouse/Zone/Section(상단 breadcrumb·hero 중복)·
//   lastUpdated 제거하고 "Last Scan" 4값+scan 시각으로 대체 (BK 2026-05-17 결정).
//   데이터 = mock-first. 실 API 경로는 backend_followup_queue Q-2.
function renderInfo(detail) {
  const n = (v) => (v ?? 0).toLocaleString();
  const delta = detail.scanDelta ?? 0;  // backend_followup_agreements Q-2 audit 평탄화 정합
  const scanAt = formatMonthDayHM(detail.lastScanAt);   // BK 2026-05-20 C1: MM-DD HH:MM 로 통일
  return `
    <dl class="section-detail-info-list">
      <div>
        <dt>${escapeHtml(t('sectionDetail.lastScan.detected'))}</dt>
        <dd>${n(detail.sectionTotalQuantity)}</dd>
      </div>
      <div>
        <dt>${escapeHtml(t('sectionDetail.lastScan.identified'))}</dt>
        <dd>${n(detail.identifiedQuantity)}</dd>
      </div>
      <div>
        <dt>${escapeHtml(t('sectionDetail.lastScan.unknown'))}</dt>
        <dd>${(detail.unknownQuantity ?? 0) > 0
          ? `<span class="section-detail-unknown-flag">▲ ${escapeHtml(t('sectionDetail.unknownFlag'))}</span> `
          : ''}${n(detail.unknownQuantity)}</dd>
      </div>
      <div>
        <dt>${escapeHtml(t('sectionDetail.lastScan.deltaVsPrev'))}</dt>
        <dd>${delta > 0 ? '+' : ''}${n(delta)}</dd>
      </div>
      <div>
        <dt>${escapeHtml(t('sectionDetail.lastScan.scanAt'))}</dt>
        <dd>${escapeHtml(scanAt)}</dd>
      </div>
    </dl>
  `;
}

function renderRelatedAlerts(alerts, zoneId, sectionId) {
  if (!alerts.length) {
    return renderEmptyState('notifications_off', 'sectionDetail.relatedAlerts.empty');
  }
  return `
    <div class="section-detail-alert-list">
      ${alerts.slice(0, 3).map((alert) => `
        <div class="section-detail-alert-item is-${escapeHtml(alert.severity ?? 'warning')}">
          ${escapeHtml(alert.message ?? alert.title ?? '')}
        </div>
      `).join('')}
    </div>
    <a href="#/alerts?section_id=${encodeURIComponent(sectionId)}&zone_id=${encodeURIComponent(zoneId)}" class="section-detail-alert-link">
      ${escapeHtml(t('sectionDetail.relatedAlerts.viewAll'))}
      <span class="material-symbols-outlined" aria-hidden="true">arrow_forward</span>
    </a>
  `;
}

function renderEvents(events) {
  if (!events.length) {
    return renderEmptyState('history', 'sectionDetail.events.empty');
  }
  return `
    <table class="section-detail-events-table">
      <thead>
        <tr>
          <th>${escapeHtml(t('sectionDetail.events.col.time'))}</th>
          <th>${escapeHtml(t('sectionDetail.events.col.event'))}</th>
          <th>${escapeHtml(t('sectionDetail.events.col.sku'))}</th>
          <th>${escapeHtml(t('sectionDetail.events.col.change'))}</th>
          <th>${escapeHtml(t('sectionDetail.events.col.action'))}</th>
        </tr>
      </thead>
      <tbody>
        ${events.slice(0, 5).map(renderEventRow).join('')}
      </tbody>
    </table>
  `;
}

function renderEventRow(event) {
  const delta = event.qtyDelta ?? event.deltaQty ?? 0;
  return `
    <tr>
      <td>${escapeHtml(formatMonthDayHM(event.occurredAt ?? event.createdAt))}</td>
      <td>${escapeHtml(getEventLabel(event.eventType ?? event.event_type))}</td>
      <td>${(() => {
        const sid = event.skuId ?? event.sku_id;
        const label = event.displayName ?? sid ?? t('sectionDetail.events.multiple');
        return sid
          ? `<a href="#/inventory/sku-detail?id=${encodeURIComponent(sid)}">${escapeHtml(label)}</a>`
          : escapeHtml(label);
      })()}</td>
      <td>${delta > 0 ? '+' : ''}${Number(delta).toLocaleString()}</td>
      <td>
        ${(event.scanId ?? event.scan_id) != null ? `
          <button type="button" class="section-detail-icon-btn"
                  data-action="view-snapshot"
                  data-event-id="${escapeHtml(event.eventId ?? event.event_id ?? '')}"
                  aria-label="${escapeHtml(t('sectionDetail.events.viewSnapshot'))}">
            <span class="material-symbols-outlined" aria-hidden="true">visibility</span>
          </button>
        ` : ''}
      </td>
    </tr>
  `;
}

function renderStatusBadge(status, label = null) {
  const badge = STATUS_BADGE[status] ?? 'bg-secondary';
  return `<span class="badge ${badge} section-detail-status-badge">${escapeHtml(label ?? t('inventory.status.' + status))}</span>`;
}

function getRefillEligibleSkus(skus) {
  return skus.filter(isRefillEligible);
}

function isRefillEligible(sku) {
  return sku?.stockStatus !== 'overstock';
}

function getStockStatusLabel(sku) {
  if ((sku.standardQty ?? 0) > 0 && (sku.currentQty ?? 0) < (sku.standardQty ?? 0)) {
    return t('sectionDetail.status.belowStandard');
  }
  return t('inventory.status.' + sku.stockStatus);
}

function getEventLabel(type) {
  const key = `sectionDetail.events.type.${type}`;
  const label = t(key);
  return label === key ? String(type ?? '').replace(/_/g, ' ') : label;
}

function renderLoading() {
  return `
    <div class="section-detail-loading">
      <div class="spinner-border text-warning" role="status"></div>
      <span class="ms-2 text-muted">${escapeHtml(t('sectionDetail.loading'))}</span>
    </div>
  `;
}

function renderError(err) {
  return `
    <div class="alert alert-danger m-4">
      <strong>${escapeHtml(t('sectionDetail.errorTitle'))}</strong>
      <div class="small mt-1">${escapeHtml(err?.message ?? t('common.error'))}</div>
    </div>
  `;
}

function renderMissingParams() {
  return `
    <div class="alert alert-warning m-4">
      <strong>${escapeHtml(t('sectionDetail.missingTitle'))}</strong>
      <div class="small mt-1">${escapeHtml(t('sectionDetail.missingBody'))}</div>
    </div>
  `;
}

function formatHM(value) {
  if (!value) return '--:--';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return '--:--';
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
