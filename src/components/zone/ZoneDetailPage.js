/**
 * ZoneDetailPage — 03-2 Zone Detail
 * ─────────────────────────────────────────────────────────────
 * Layout: docs/page_layout_outline.md §8 final Track1 adjustment + wireframe 03-2_zone_detail.png
 *
 * 화면 구조 (wireframe 정합):
 *   ┌─ Header (Zone breadcrumb) ───────────────────────────┐
 *   │ ┌─ Section Layout (grid) ───┬─ Selected Section ────┐│
 *   │ │ Sec-1 / Sec-2 / ...        │ name + status         ││
 *   │ │ tile: name, total_qty,     │ capacity bar          ││
 *   │ │       sku_count, color     │ SKU List (max 3)      ││
 *   │ │ click → 우측 panel 갱신    │ open_alert_count      ││
 *   │ └────────────────────────────┴───────────────────────┘│
 *   ├──────────────────────────────────────────────────────┤
 *   │ Recent Section Events (선택된 Section 기준)            │
 *   └──────────────────────────────────────────────────────┘
 *
 * 정책 (§8 final Track1 adjustment):
 *  - Section tile에 SKU 이름 X — `section_name / total_qty / sku_count / stock_status` 만
 *  - Color/badge는 backend stock_status enum 그대로
 *  - Empty section은 `total_qty === 0`이면 frontend가 derive
 *  - Tile click은 우측 패널만 갱신 — 03-3은 View Section Detail 명시 클릭
 *  - Section Capacity = sum(current_qty) / sum(standard_qty) (aggregate)
 *  - stock_status = worst SKU status (aggregate capacity 양호해도 critical SKU 표시)
 *  - Open Alerts는 count만 표시 (list 없음)
 *
 * URL: #/zone/detail?id=zone-A
 */

import { zoneStore } from '../../store/zoneStore.js';
import { appStore } from '../../store/appStore.js';
import { scopeStatusStore } from '../../store/scopeStatusStore.js';
import { subscribeInventoryRefetch } from '../../core/socket.js';
import { t, tf } from '../../core/i18n/index.js';
import { formatMonthDayHM } from '../../core/format.js';
import { authStore } from '../../store/authStore.js';
import { ROLE } from '../../constants/roles.js';
import { createSection } from '../../api/zoneApi.js';
import {
  mountSectionRegisterModal,
  unmountSectionRegisterModal,
  openSectionRegisterModal,
} from './SectionRegisterModal.js';

const ROOT_ID = 'zone-detail-root';

const STATUS_BADGE = {
  out_of_stock: 'bg-danger',
  critical:     'bg-danger',
  warning:      'bg-warning text-dark',
  watch:        'bg-info text-dark',
  normal:       'bg-success',
  overstock:    'bg-secondary',
  empty:        'bg-light text-muted',
};

const STATUS_TILE_CLASS = {
  out_of_stock: 'section-tile-danger',
  critical:     'section-tile-danger',
  warning:      'section-tile-warning',
  watch:        'section-tile-info',
  normal:       'section-tile-normal',
  overstock:    'section-tile-overstock',
  empty:        'section-tile-empty',
};

// status label은 i18n inventory.status.* 사용 (lang 변경 시 자동 번역).

export default function ZoneDetailPage({ params } = {}) {
  const zoneId = params?.id;
  let unsubStore = null;
  let unsubApp   = null;
  let unsubScope = null;
  let unsubSocket = null;
  let clickHandler = null;

  return {
    html: `<section id="${ROOT_ID}" class="zone-detail-page"></section>`,

    mount() {
      if (!zoneId) {
        const root = document.getElementById(ROOT_ID);
        if (root) root.innerHTML = renderMissingZoneId();
        return;
      }

      unsubStore = zoneStore.subscribe(() => render(zoneId));
      unsubApp   = appStore.subscribe(() => { render(zoneId); zoneStore.fetchSections(zoneId); zoneStore.fetchFefo(zoneId); zoneStore.fetchRecentEvents(zoneId); });   // lang: UI + 3 endpoint 재요청
      unsubScope = scopeStatusStore.subscribe(() => render(zoneId));   // hidden pending overlay
      // Phase 6: inventory_update 수신 시 sections + scope 카운트 refetch
      unsubSocket = subscribeInventoryRefetch(() => {
        zoneStore.fetchSections(zoneId);
        zoneStore.fetchFefo(zoneId);
        zoneStore.fetchRecentEvents(zoneId);
        scopeStatusStore.refresh();
      });
      render(zoneId);
      zoneStore.fetchSections(zoneId);
      zoneStore.fetchFefo(zoneId);
      zoneStore.fetchRecentEvents(zoneId);
      scopeStatusStore.refresh();

      // C-2 섹션 등록 모달 — 성공 시 sections refetch (mock-first, backend 회신 시 실 endpoint)
      mountSectionRegisterModal({
        onSubmit: async (payload) => {
          const res = await createSection(payload);
          zoneStore.fetchSections(zoneId);
          return res;
        },
      });

      const root = document.getElementById(ROOT_ID);
      clickHandler = (e) => {
        const tile = e.target.closest('[data-action="select-section"]');
        if (tile) {
          // dataset 은 항상 string. ADR-028 INT 통일 정합 (pending §2.48)
          const raw = tile.dataset.sectionId;
          const sectionId = raw && Number.isFinite(Number(raw)) ? Number(raw) : raw;
          if (sectionId) zoneStore.selectSection(zoneId, sectionId);
          return;
        }
        const close = e.target.closest('[data-action="panel-close"]');
        if (close) {
          zoneStore.clearSelectedSection();
          return;
        }
        const reg = e.target.closest('[data-action="register-section"]');
        if (reg) {
          openSectionRegisterModal({ zoneId });
          return;
        }
      };
      root?.addEventListener('click', clickHandler);
    },

    destroy() {
      unsubStore?.();
      unsubApp?.();
      unsubScope?.();
      unsubSocket?.();
      unsubStore = unsubApp = unsubScope = unsubSocket = null;
      const root = document.getElementById(ROOT_ID);
      if (root && clickHandler) root.removeEventListener('click', clickHandler);
      clickHandler = null;
      unmountSectionRegisterModal();
      zoneStore.reset();
    },
  };
}

function render(zoneId) {
  const root = document.getElementById(ROOT_ID);
  if (!root) return;

  const { sections, sectionDetail, fefo, recentEvents } = zoneStore.getState();
  const selected = sectionDetail.sectionId ? sectionDetail.data : null;
  // C-2: 섹션 등록 = 인프라 셋업 → OPS_MANAGER·SUPER_ADMIN 만 버튼 노출
  const role = authStore.getState().user?.role;
  const canRegister = role === ROLE.OPS_MANAGER || role === ROLE.SUPER_ADMIN;

  root.innerHTML = `
    <header class="zone-detail-header">
      <div>
        <nav class="zone-detail-breadcrumb">
          <a href="#/zone" class="text-muted">${escapeHtml(t('zoneDetail.breadcrumbZones'))}</a>
          <span class="material-symbols-outlined">chevron_right</span>
          <span class="fw-semibold">${escapeHtml(zoneId)}</span>
        </nav>
        <h1 class="h3 fw-bold mb-0">${escapeHtml(t('zoneDetail.title'))}</h1>
      </div>
      <div class="zone-detail-header-actions">
        ${canRegister ? `
          <button type="button" class="btn btn-outline-secondary btn-sm zone-detail-register-btn" data-action="register-section">
            <span class="material-symbols-outlined" aria-hidden="true">add</span>
            ${escapeHtml(t('zoneDetail.registerSection.button'))}
          </button>` : ''}
        <span class="zone-detail-updated text-muted small">
          ${sections.receivedAt ? `${escapeHtml(t('header.updated'))} ${formatHM(sections.receivedAt)}` : ''}
        </span>
      </div>
    </header>

    <div class="zone-detail-body">
      <div class="zone-detail-main">
        ${renderSectionLayout(zoneId, sections, sectionDetail.sectionId)}
        <div class="zone-detail-zonewide-grid">
          ${renderFefoCard(fefo)}
          ${renderRecentEvents(recentEvents)}
        </div>
      </div>
      ${selected
        ? renderSectionPanel(zoneId, selected, sectionDetail.isLoading)
        : renderSectionPanelEmpty()}
    </div>
  `;
}

// ─── Section Layout (left main) ────────────────────────
function renderSectionLayout(zoneId, sectionsSlice, selectedSectionId) {
  const { isLoading, error } = sectionsSlice;
  // sectionCode (S-1, S-2, S-3 …) 의 숫자 부분 오름차순 — BE 응답 순서 보장 없어 FE 표현 계층에서 정렬
  const items = [...(sectionsSlice.items ?? [])].sort((a, b) => {
    const na = Number(String(a.sectionCode ?? '').match(/\d+/)?.[0] ?? a.sectionId ?? 0);
    const nb = Number(String(b.sectionCode ?? '').match(/\d+/)?.[0] ?? b.sectionId ?? 0);
    return na - nb;
  });

  if (error) {
    return `
      <article class="zone-detail-card">
        <div class="alert alert-danger m-0">
          <strong>${escapeHtml(t('zoneDetail.sections.loadError'))}</strong>
          <div class="small mt-1">${escapeHtml(error.message ?? t('common.error'))}</div>
        </div>
      </article>
    `;
  }
  if (isLoading && items.length === 0) {
    return `
      <article class="zone-detail-card zone-detail-loading">
        <div class="spinner-border text-warning" role="status"></div>
        <span class="ms-2 text-muted">${escapeHtml(t('zoneDetail.sections.loading'))}</span>
      </article>
    `;
  }

  return `
    <article class="zone-detail-card">
      <header class="zone-detail-card-header">
        <h2 class="h6 fw-bold mb-0">${escapeHtml(tf('zoneDetail.layout.title', { zone: zoneId }))}</h2>
        <div class="zone-detail-legend small text-muted">
          <span class="zone-detail-legend-dot zone-detail-legend-danger"></span> ${escapeHtml(t('zoneDetail.legend.critical'))}
          <span class="zone-detail-legend-dot zone-detail-legend-warning ms-2"></span> ${escapeHtml(t('zoneDetail.legend.warning'))}
          <span class="zone-detail-legend-dot zone-detail-legend-normal ms-2"></span> ${escapeHtml(t('zoneDetail.legend.normal'))}
        </div>
      </header>

      ${items.length === 0
        ? `<div class="text-muted small">${escapeHtml(t('zoneDetail.sections.empty'))}</div>`
        : `<div class="zone-detail-grid">
            ${items.map((s) => renderSectionTile(s, selectedSectionId === s.sectionId)).join('')}
          </div>`}
    </article>
  `;
}

function renderSectionTile(s, isSelected) {
  const status = (s.totalQty ?? 0) === 0 ? 'empty' : (s.stockStatus ?? 'normal');
  const tileCls = STATUS_TILE_CLASS[status] ?? '';
  const skuCount = s.skuCount ?? 0;
  const skuLabel = skuCount === 1 ? t('zoneDetail.section.skuOne') : t('zoneDetail.section.skuOther');
  const statusLabel = t('inventory.status.' + status);
  // hidden pending alert overlay — scopeStatusStore (5.7)
  const hiddenCount = scopeStatusStore.getState().bySection[s.sectionId]?.count ?? 0;
  const overlayCls = hiddenCount > 0 ? ' has-hidden-pending' : '';
  return `
    <button type="button"
            class="section-tile ${tileCls} ${isSelected ? 'is-selected' : ''}${overlayCls}"
            data-action="select-section"
            data-section-id="${escapeHtml(s.sectionId)}">
      <div class="section-tile-name">${escapeHtml((s.sectionName ?? s.sectionId) + ' (' + (s.sectionCode ?? ('S-' + s.sectionId)) + ')')}</div>
      <div class="section-tile-qty">${(s.totalQty ?? 0).toLocaleString()} ${escapeHtml(t('zoneDetail.section.units'))}</div>
      <div class="section-tile-meta">
        ${skuCount} ${escapeHtml(skuLabel)}
        ${status !== 'empty' ? ` · <span class="badge ${STATUS_BADGE[status] ?? 'bg-secondary'} section-tile-status-badge">${escapeHtml(statusLabel)}</span>` : ''}
      </div>
    </button>
  `;
}

// ─── Selected Section panel (right) ───────────────────
function renderSectionPanel(zoneId, detail, isLoading) {
  const badge = STATUS_BADGE[detail.stockStatus] ?? 'bg-secondary';
  const label = t('inventory.status.' + detail.stockStatus);
  const capacityPct = Math.round((detail.capacityRate ?? 0) * 100);
  const skus = (detail.skus ?? []).slice(0, 3);
  const sectionDetailHref = `#/zone/section?zone=${encodeURIComponent(zoneId)}&id=${encodeURIComponent(detail.sectionId)}`;
  const openAlerts = detail.openAlertCount;
  const openAlertText = openAlerts === 1
    ? tf('zoneDetail.panel.openAlertOne',   { n: openAlerts })
    : tf('zoneDetail.panel.openAlertOther', { n: openAlerts });

  return `
    <aside class="section-panel">
      <header class="section-panel-header">
        <div>
          <div class="section-panel-eyebrow">${escapeHtml(t('zoneDetail.panel.eyebrow'))}</div>
          <h2 class="section-panel-title">${escapeHtml((detail.sectionName ?? detail.sectionId) + ' (' + (detail.sectionCode ?? ('S-' + detail.sectionId)) + ')')}</h2>
        </div>
        <button type="button" class="btn-close" data-action="panel-close" aria-label="${escapeHtml(t('zoneDetail.panel.close'))}"></button>
      </header>

      <div class="section-panel-badges">
        <span class="badge ${badge}">${escapeHtml(label)}</span>
        ${openAlerts > 0
          ? `<span class="badge bg-danger ms-1">${escapeHtml(openAlertText)}</span>`
          : ''}
      </div>

      <div class="section-panel-capacity">
        <div class="section-panel-capacity-label small text-muted">${escapeHtml(t('zoneDetail.panel.storage'))}</div>
        <div class="section-panel-capacity-val">
          ${(detail.totalQty ?? 0).toLocaleString()} / ${(detail.standardQty ?? 0).toLocaleString()}
          <span class="text-muted small">(${capacityPct}%)</span>
        </div>
        <div class="section-panel-capacity-bar">
          <div class="section-panel-capacity-bar-fill is-${escapeHtml(detail.stockStatus || 'normal')}" style="width: ${Math.min(capacityPct, 100)}%"></div>
        </div>
      </div>

      <div class="section-panel-skus">
        <div class="section-panel-skus-header small text-muted">${escapeHtml(tf('zoneDetail.panel.skusHeader', { n: skus.length }))}</div>
        ${skus.length === 0
          ? `<div class="text-muted small">${escapeHtml(t('zoneDetail.panel.skuEmpty'))}</div>`
          : skus.map((sku) => {
              const skuBadge = STATUS_BADGE[sku.stockStatus] ?? 'bg-secondary';
              const skuLink = `#/inventory/sku-detail?id=${encodeURIComponent(sku.skuId)}`;
              const skuStatusLabel = t('inventory.status.' + sku.stockStatus);
              return `
                <div class="section-panel-sku-row">
                  <a href="${skuLink}" class="section-panel-sku-name">${escapeHtml(sku.displayName ?? sku.skuId)}</a>
                  <span class="section-panel-sku-qty">${sku.currentQty ?? 0}</span>
                  <span class="badge ${skuBadge} section-panel-sku-badge">${escapeHtml(skuStatusLabel)}</span>
                </div>
              `;
            }).join('')}
      </div>

      <a href="${sectionDetailHref}" class="btn btn-warning section-panel-action">
        ${escapeHtml(t('zoneDetail.panel.viewSectionDetail'))}
        <span class="material-symbols-outlined ms-1">arrow_forward</span>
      </a>

      ${isLoading ? `<div class="text-muted small mt-2">${escapeHtml(t('zoneDetail.panel.refreshing'))}</div>` : ''}
    </aside>
  `;
}

// ─── Selected Section panel — 미선택 시 예약 공간(빈 상태) ──
//   우측 30%를 상시 점유해 섹션 선택/해제 시 레이아웃이 흔들리지 않게 함.
function renderSectionPanelEmpty() {
  return `
    <aside class="section-panel section-panel-empty">
      <div class="section-panel-empty-inner">
        <span class="material-symbols-outlined section-panel-empty-icon" aria-hidden="true">ads_click</span>
        <div class="section-panel-empty-title">${escapeHtml(t('zoneDetail.panel.emptyTitle'))}</div>
        <div class="section-panel-empty-body">${escapeHtml(t('zoneDetail.panel.emptyBody'))}</div>
      </div>
    </aside>
  `;
}

// ─── F-008 구역별 FEFO 준수율 (풀폭, 2a) ───────────────
//   backend /expiry/fefo/by-zone. 위반 목록 top 5 (카드 내부 스크롤 없음 — 통일성).
function renderFefoCard(fefo) {
  const { data, isLoading, error } = fefo;
  if (isLoading && !data) {
    return `
      <article class="zone-detail-card zone-detail-loading">
        <div class="spinner-border text-warning" role="status"></div>
        <span class="ms-2 text-muted">${escapeHtml(t('zoneDetail.fefo.loading'))}</span>
      </article>`;
  }
  if (error) {
    return `
      <article class="zone-detail-card">
        <h2 class="h6 fw-bold mb-2">${escapeHtml(t('zoneDetail.fefo.title'))}</h2>
        <div class="text-muted small">${escapeHtml(t('zoneDetail.fefo.loadError'))}</div>
      </article>`;
  }
  if (!data) return '';

  const rate = data.complianceRate ?? 0;
  const vcount = data.violationCount ?? 0;
  const violations = (data.violations ?? []).slice(0, 5);
  const rateCls = rate >= 99 ? 'is-good' : (rate >= 95 ? 'is-warn' : 'is-bad');

  return `
    <article class="zone-detail-card zone-detail-fefo">
      <header class="zone-detail-card-header">
        <h2 class="h6 fw-bold mb-0">${escapeHtml(t('zoneDetail.fefo.title'))}</h2>
        <span class="text-muted small">${escapeHtml(t('zoneDetail.fefo.window'))}</span>
      </header>

      <div class="zone-detail-fefo-summary">
        <div>
          <div class="zone-detail-fefo-rate ${rateCls}">${rate}<span class="zone-detail-fefo-rate-unit">%</span></div>
          <div class="small text-muted">${escapeHtml(t('zoneDetail.fefo.rateLabel'))}</div>
        </div>
        <span class="badge ${vcount > 0 ? 'bg-danger' : 'bg-success'} zone-detail-fefo-vcount">
          ${escapeHtml(tf('zoneDetail.fefo.violationCount', { n: vcount }))}
        </span>
      </div>

      ${vcount === 0
        ? renderEmptyState('verified', 'zoneDetail.fefo.none')
        : `<ul class="zone-detail-fefo-list">
            ${violations.map((v) => `
              <li class="zone-detail-fefo-row">
                <span class="zone-detail-fefo-time">${escapeHtml((v.createdAt ?? '').replace('T', ' ').slice(0, 16) || '—')}</span>
                <span class="zone-detail-fefo-sku">${
                  v.skuName
                    ? escapeHtml(v.skuName)
                    : (v.skuId ?? v.sku_id)
                      ? `<a href="#/inventory/sku-detail?id=${encodeURIComponent(v.skuId ?? v.sku_id)}">${escapeHtml(v.skuId ?? v.sku_id)}</a>`
                      : '—'
                }</span>
                <span class="zone-detail-fefo-sec text-muted">${escapeHtml(tf('zoneDetail.fefo.section', { n: v.sectionId ?? '—' }))}</span>
              </li>`).join('')}
          </ul>`}
    </article>
  `;
}

// 빈 상태 공용 — SectionDetailPage 와 동일 패턴(부트스트랩 유틸만, 신규 CSS 0)
function renderEmptyState(icon, i18nKey) {
  return `
    <div class="text-center text-muted py-4">
      <span class="material-symbols-outlined d-block mb-2" style="font-size:2rem;opacity:0.4;">${icon}</span>
      <div class="small">${escapeHtml(t(i18nKey))}</div>
    </div>
  `;
}

// ─── Recent Section Events ─────────────────────────────
// R-1: zone 단위 집계 Recent Zone Events (03-3 events 렌더 패턴 재사용, zone-scope)
function renderRecentEvents(slice) {
  const events = slice?.items ?? [];
  return `
    <article class="zone-detail-card zone-detail-events">
      <header class="zone-detail-card-header">
        <h2 class="h6 fw-bold mb-0">${escapeHtml(t('zoneDetail.events.title'))}</h2>
      </header>
      ${events.length === 0
        ? renderEmptyState('history', 'sectionDetail.events.empty')
        : `<table class="section-detail-events-table">
            <thead>
              <tr>
                <th>${escapeHtml(t('sectionDetail.events.col.time'))}</th>
                <th>${escapeHtml(t('sectionDetail.events.col.event'))}</th>
                <th>${escapeHtml(t('sectionDetail.events.col.sku'))}</th>
                <th>${escapeHtml(t('sectionDetail.events.col.change'))}</th>
              </tr>
            </thead>
            <tbody>${events.slice(0, 5).map(renderZoneEventRow).join('')}</tbody>
          </table>`}
    </article>
  `;
}

function renderZoneEventRow(ev) {
  const delta = ev.qtyDelta ?? ev.deltaQty ?? 0;
  return `
    <tr>
      <td>${escapeHtml(formatMonthDayHM(ev.occurredAt ?? ev.createdAt))}</td>
      <td>${escapeHtml(getEventLabel(ev.eventType ?? ev.event_type))}</td>
      <td>${(() => {
        const sid = ev.skuId ?? ev.sku_id;
        const label = ev.displayName ?? sid;  // Q-10: display_name 우선, sku_id 폴백
        if (!label) return '—';
        return sid
          ? `<a href="#/inventory/sku-detail?id=${encodeURIComponent(sid)}">${escapeHtml(label)}</a>`
          : escapeHtml(label);
      })()}</td>
      <td>${delta > 0 ? '+' : ''}${Number(delta).toLocaleString()}</td>
    </tr>
  `;
}

function getEventLabel(type) {
  const key = `sectionDetail.events.type.${type}`;
  const label = t(key);
  return label === key ? String(type ?? '').replace(/_/g, ' ') : label;
}

function renderMissingZoneId() {
  return `
    <div class="alert alert-warning m-4">
      <strong>${escapeHtml(t('zoneDetail.missingTitle'))}</strong>
      <div class="small mt-1">${escapeHtml(t('zoneDetail.missingBody'))} (<a href="#/zone">/zone</a>)</div>
    </div>
  `;
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
