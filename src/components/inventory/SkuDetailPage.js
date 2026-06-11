/**
 * SkuDetailPage — 02-2 SKU Detail
 * ─────────────────────────────────────────────────────────────
 * Mount 시 skuDetailStore.fetchDetail(skuId) → inventory + alerts 합성 호출 → 렌더.
 *
 * Layout 정합: docs/page_layout_outline.md §02-2
 *
 * 구현 범위 (Phase 4 MVP):
 *  - Back to SKU List 링크
 *  - SKU hero header (ID / name / status / capacity / location / Request Refill)
 *  - SKU Information (category / supplier / uom / safety stock / last updated)
 *  - Related Alerts (mockAlerts({sku_id}) — ADR-019 schema)
 *  - Stock Trend / Validity Summary / Recent Stock Events: 영역만, Phase 4 후반에 채움
 *
 * 진입: SKU List에서 SKU ID 또는 Product Name 클릭 →
 *       `#/inventory/sku-detail?id=sku-xxx` → router가 params.id 전달.
 */

import { skuDetailStore } from '../../store/skuDetailStore.js';
import { appStore } from '../../store/appStore.js';
import { t, tf } from '../../core/i18n/index.js';
import { createRefillRequest, adjustStock } from '../../api/inventoryApi.js';
import { subscribeInventoryRefetch } from '../../core/socket.js';
import { stockStatusBadgeClass } from '../../utils/statusDisplay.js';
import { buildForecastFromTrend } from '../../utils/forecast.js';
import { createChartCanvas } from '../common/ChartCanvas.js';
import { Chart as ChartJS } from 'chart.js';
import {
  mountRefillModal,
  unmountRefillModal,
  openRefillModal,
} from './RefillRequestModal.js';
import {
  mountAdjustStockModal,
  unmountAdjustStockModal,
  openAdjustStockModal,
} from './AdjustStockModal.js';

const ROOT_ID = 'sku-detail-root';
const TREND_CHART_ID = 'sku-detail-trend-chart';
// 모든 라벨은 i18n 키 사용 (inventory.status.*, alert.severity.*, alert.status.*)

export default function SkuDetailPage({ params } = {}) {
  const skuId = params?.id;
  let unsubStore   = null;
  let unsubApp     = null;
  let unsubSocket  = null;
  let clickHandler = null;
  let trendChart   = null;

  function rerender() {
    // canvas DOM 갱신 전에 기존 chart instance 정리 (5.2 패턴)
    trendChart?.destroy();
    trendChart = null;

    render(skuDetailStore.getState());

    mountTrendChart();
  }

  function mountTrendChart() {
    const trend = skuDetailStore.getState().trend;
    if (!trend.items || trend.items.length === 0) return;
    if (!document.getElementById(TREND_CHART_ID)) return;

    trendChart = createChartCanvas({
      id: TREND_CHART_ID,
      type: 'line',
      data:    () => {
        const st = skuDetailStore.getState();
        const tr = st.trend;
        // C reconcile: trend 마지막 snapshot 이 실시간 current_qty 와 다를 수 있어
        //   (trend = 일자 집계, current_qty = 실시간). 차트 끝과 라벨·헤더 카드 일치 위해 후자 우선.
        return buildTrendData(tr.items, tr.period, st.data?.detail?.currentQty);
      },
      options: () => buildTrendOptions(),
    });
    trendChart.mount();
  }

  return {
    html: `<section id="${ROOT_ID}" class="sku-detail-page"></section>`,

    mount() {
      unsubStore = skuDetailStore.subscribe(rerender);
      unsubApp   = appStore.subscribe(() => { rerender(); skuDetailStore.fetchDetail(skuId); skuDetailStore.fetchBatches(skuId); skuDetailStore.fetchEvents(skuId); });   // lang: UI + 데이터 재요청
      rerender();

      mountRefillModal({
        onSubmit: (payload) => createRefillRequest(payload),
      });

      // Adjust Stock modal — F-014 수동 보정. 성공 시 detail/trend/batches/events refetch
      mountAdjustStockModal({
        onSubmit: async (payload) => {
          const result = await adjustStock(payload);
          skuDetailStore.fetchDetail(skuId);
          skuDetailStore.fetchTrend(skuId, skuDetailStore.getState().trend?.period || '7d');
          skuDetailStore.fetchBatches(skuId);
          skuDetailStore.fetchEvents(skuId, 10);
          return result;
        },
      });

      const root = document.getElementById(ROOT_ID);
      clickHandler = (e) => {
        // Request Refill — 02-3 modal 진입 (단일 SKU)
        const refillBtn = e.target.closest('[data-action="refill"]');
        if (refillBtn) {
          const detail = skuDetailStore.getState().data?.detail;
          if (!detail) return;
          openRefillModal([{
            skuId:         detail.skuId,
            displayName:   detail.displayName,
            currentQty:    detail.currentQty,
            standardQty:   detail.standardQty,
            uom:           detail.uom,
            locationLabel: detail.locationLabel || `${detail.zoneName} / ${detail.sectionName}`,
          }]);
          return;
        }

        // Adjust Stock — F-014 수동 보정 modal 진입 (감소 전용)
        const adjustBtn = e.target.closest('[data-action="adjust"]');
        if (adjustBtn) {
          const detail = skuDetailStore.getState().data?.detail;
          if (!detail) return;
          openAdjustStockModal({
            skuId:       detail.skuId,
            sectionId:   detail.sectionId,
            displayName: detail.displayName,
            currentQty:  detail.currentQty,
            uom:         detail.uom,
          });
          return;
        }

        // Phase 5.4 — Trend period 토글 (7d / 30d)
        const periodBtn = e.target.closest('[data-action="trend-period"]');
        if (periodBtn) {
          const next = periodBtn.dataset.period;
          const cur = skuDetailStore.getState().trend.period;
          if (next && next !== cur) skuDetailStore.fetchTrend(skuId, next);
          return;
        }
      };
      root?.addEventListener('click', clickHandler);

      skuDetailStore.fetchDetail(skuId);
      skuDetailStore.fetchTrend(skuId, '7d');
      skuDetailStore.fetchBatches(skuId);
      skuDetailStore.fetchEvents(skuId, 10);

      // Phase 6: inventory_update 수신 시 현재 SKU의 detail/trend/batches/events refetch
      const trendPeriod = () => skuDetailStore.getState().trend?.period || '7d';
      unsubSocket = subscribeInventoryRefetch(() => {
        skuDetailStore.fetchDetail(skuId);
        skuDetailStore.fetchTrend(skuId, trendPeriod());
        skuDetailStore.fetchBatches(skuId);
        skuDetailStore.fetchEvents(skuId, 10);
      });
    },

    destroy() {
      trendChart?.destroy();
      trendChart = null;
      unsubStore?.();
      unsubApp?.();
      unsubSocket?.();
      unsubStore = unsubApp = unsubSocket = null;
      const root = document.getElementById(ROOT_ID);
      if (root && clickHandler) root.removeEventListener('click', clickHandler);
      clickHandler = null;
      unmountRefillModal();
      unmountAdjustStockModal();
      skuDetailStore.reset();
    },
  };
}

// ─── render ──────────────────────────────────────────────
function render(state) {
  const root = document.getElementById(ROOT_ID);
  if (!root) return;

  if (state.error) {
    root.innerHTML = renderError(state.error);
    return;
  }
  if (state.isLoading || !state.data) {
    root.innerHTML = renderLoading();
    return;
  }

  const { detail, alerts } = state.data;

  root.innerHTML = `
    <a href="#/inventory/skus" class="sku-detail-back">
      <span class="material-symbols-outlined">arrow_back</span>
      ${escapeHtml(t('skuDetail.backToList'))}
    </a>

    ${renderHero(detail)}

    ${renderKpiRow(detail)}

    <div class="sku-detail-body sku-detail-body-2col">
      <div class="sku-detail-body-left">
        ${renderTrendCard(detail)}
      </div>
      <div class="sku-detail-body-right">
        ${renderInfo(detail)}
        ${renderValidityCard(detail)}
      </div>
    </div>

    ${renderEventsCard(detail, alerts)}
  `;
}

function renderLoading() {
  return `
    <div class="sku-detail-loading">
      <div class="spinner-border text-warning" role="status"></div>
      <span class="ms-2 text-muted">${escapeHtml(t('skuDetail.loading'))}</span>
    </div>
  `;
}

function renderError(err) {
  return `
    <a href="#/inventory/skus" class="sku-detail-back">
      <span class="material-symbols-outlined">arrow_back</span>
      ${escapeHtml(t('skuDetail.backToList'))}
    </a>
    <div class="alert alert-danger m-4" role="alert">
      <strong>${escapeHtml(t('skuDetail.errorTitle'))}</strong>
      <div class="small mt-1">${escapeHtml(err?.message ?? t('common.error'))}</div>
    </div>
  `;
}

// ─── Hero header ─────────────────────────────────────────
function renderHero(detail) {
  const isOverstock = detail.stockStatus === 'overstock';
  const capacityPct = Math.round((detail.capacityRate ?? 0) * 100);
  const badgeClass  = stockStatusBadgeClass(detail.stockStatus);
  const statusLabel = t('inventory.status.' + detail.stockStatus);
  const location    = detail.locationLabel
    || `${detail.zoneName ?? ''}${detail.sectionName ? ' / ' + detail.sectionName : ''}`;

  return `
    <header class="sku-detail-hero">
      <div class="sku-detail-hero-main">
        <div class="sku-detail-id">${escapeHtml(detail.skuId)}</div>
        <h1 class="sku-detail-name">${escapeHtml(detail.displayName)}</h1>
        <div class="sku-detail-meta">
          <span class="sku-detail-location">
            <span class="material-symbols-outlined">place</span>
            ${escapeHtml(location)}
          </span>
        </div>
      </div>

      <div class="sku-detail-hero-status">
        <span class="badge ${badgeClass} sku-detail-status-badge">${escapeHtml(statusLabel)}</span>
        <div class="sku-detail-capacity">
          <span class="sku-detail-capacity-pct">${capacityPct}%</span>
          <span class="sku-detail-capacity-qty text-muted">
            ${(detail.currentQty ?? 0).toLocaleString()} / ${(detail.standardQty ?? 0).toLocaleString()} ${escapeHtml(detail.uom ?? '')}
          </span>
        </div>
        <div class="sku-detail-hero-actions">
          <button type="button" class="btn btn-warning sku-detail-refill" data-action="refill" ${isOverstock ? 'disabled' : ''}>
            ${escapeHtml(t('skuDetail.refill'))}
          </button>
          <button type="button" class="btn btn-outline-secondary sku-detail-adjust" data-action="adjust"
                  title="${escapeHtml(t('skuDetail.adjust.button'))}"
                  aria-label="${escapeHtml(t('skuDetail.adjust.button'))}">
            <span class="material-symbols-outlined" aria-hidden="true">edit</span>
            ${escapeHtml(t('skuDetail.adjust.btnShort'))}
          </button>
        </div>
      </div>
    </header>
  `;
}

// ─── KPI 5-card row (wireframe 정합) ─────────────────────
//   Capacity Rate / Current Qty / Baseline Status / Location / Last Scan
function renderKpiRow(detail) {
  const capacityPct = Math.round((detail.capacityRate ?? 0) * 100);
  const diff = (detail.currentQty ?? 0) - (detail.standardQty ?? 0);
  let baselineMain, baselineCls;
  if (diff < 0) {
    baselineMain = tf('skuDetail.kpi.belowTarget', { n: Math.abs(diff).toLocaleString() });
    baselineCls = 'is-below';
  } else if (diff > 0) {
    baselineMain = tf('skuDetail.kpi.aboveTarget', { n: diff.toLocaleString() });
    baselineCls = 'is-above';
  } else {
    baselineMain = t('skuDetail.kpi.atTarget');
    baselineCls = '';
  }
  const targetLine = tf('skuDetail.kpi.targetLabel', {
    n: (detail.standardQty ?? 0).toLocaleString(),
    uom: detail.uom ?? t('skuDetail.kpi.units'),
  });
  const location = detail.locationLabel
    || `${detail.zoneName ?? ''}${detail.sectionName ? ' / ' + detail.sectionName : ''}`;
  const lastScan = formatRelative(detail.lastUpdatedAt);

  return `
    <div class="sku-detail-kpi-row">
      ${kpiCard(t('skuDetail.kpi.capacityRate'), `${capacityPct}%`, '')}
      ${kpiCard(t('skuDetail.kpi.currentQty'), `${(detail.currentQty ?? 0).toLocaleString()}`, escapeHtml(detail.uom ?? t('skuDetail.kpi.units')))}
      ${kpiCardBaseline(t('skuDetail.kpi.baselineStatus'), baselineMain, targetLine, baselineCls)}
      ${kpiCard(t('skuDetail.kpi.location'), escapeHtml(location || '—'), '')}
      ${kpiCard(t('skuDetail.kpi.lastScan'), escapeHtml(lastScan), '')}
    </div>
  `;
}

function kpiCard(label, value, suffix) {
  return `
    <div class="sku-detail-kpi-card">
      <div class="sku-detail-kpi-label">${escapeHtml(label)}</div>
      <div class="sku-detail-kpi-value">${value}${suffix ? ` <span class="sku-detail-kpi-unit text-muted">${suffix}</span>` : ''}</div>
    </div>
  `;
}

function kpiCardBaseline(label, mainText, subText, cls) {
  return `
    <div class="sku-detail-kpi-card sku-detail-kpi-baseline ${cls}">
      <div class="sku-detail-kpi-label">${escapeHtml(label)}</div>
      <div class="sku-detail-kpi-value">${escapeHtml(mainText)}</div>
      <div class="sku-detail-kpi-sub text-muted small">${escapeHtml(subText)}</div>
    </div>
  `;
}

// ─── SKU Information (wireframe 정합 + 중복 정리, 2026-05-15) ─
//   Category / Supplier / UoM 만 표시. Warehouse / Zone / Section은 KPI Location 카드와
//   중복이라 제외 (사용자 결정 — 와이어프레임 정합보다 정보 중복 회피 우선).
function renderInfo(detail) {
  return `
    <section class="sku-detail-card">
      <h2 class="sku-detail-card-title">${escapeHtml(t('skuDetail.info.title'))}</h2>
      <dl class="sku-detail-info">
        <dt>${escapeHtml(t('skuDetail.info.category'))}</dt>      <dd>${escapeHtml(detail.category ?? '—')}</dd>
        <dt>${escapeHtml(t('skuDetail.info.supplier'))}</dt>      <dd>${escapeHtml(detail.supplier ?? '—')}</dd>
        <dt>${escapeHtml(t('skuDetail.info.uom'))}</dt>           <dd>${escapeHtml(detail.uom ?? '—')}</dd>
      </dl>
    </section>
  `;
}

// ─── Related Alerts — wireframe 정합 후 compact link banner로 단순화 (2026-05-15)
//   기존 Related Alerts 카드는 와이어프레임에 없어 우측 column에서 제거.
//   대신 alerts 존재 시 "X alerts on this SKU — View All →" 한 줄 link로 alert 진입점 보존.
function renderAlertsLink(detail, alerts) {
  const total = alerts?.totalCount ?? 0;
  if (total === 0) return '';
  const href = `#/alerts?sku_id=${encodeURIComponent(detail.skuId)}`;
  return `
    <a href="${href}" class="sku-detail-alerts-link">
      <span class="material-symbols-outlined">notifications</span>
      <span>${escapeHtml(tf('skuDetail.alerts.viewAll', { total }))}</span>
    </a>
  `;
}

// ─── Stock Trend (Phase 5.4 — Chart.js line, wireframe 정합) ─
//   backend §3.5 GET /inventory/stock/{sku_id}/trend (period=7d|30d) 활용.
//   wireframe: line + 점선 standard threshold + 우측 현재 값 annotation
function renderTrendCard(detail) {
  const trend = skuDetailStore.getState().trend;
  return `
    <section class="sku-detail-card sku-detail-trend">
      <header class="sku-detail-card-header">
        <h2 class="sku-detail-card-title">${escapeHtml(t('skuDetail.trend.title'))}</h2>
        <div class="sku-detail-trend-toggle" role="tablist">
          <button type="button" role="tab"
                  data-action="trend-period" data-period="7d"
                  class="${trend.period === '7d' ? 'is-active' : ''}">${escapeHtml(t('skuDetail.trend.period.7d'))}</button>
          <button type="button" role="tab"
                  data-action="trend-period" data-period="30d"
                  class="${trend.period === '30d' ? 'is-active' : ''}">${escapeHtml(t('skuDetail.trend.period.30d'))}</button>
        </div>
      </header>
      ${renderTrendBody(trend, detail)}
    </section>
  `;
}

function renderTrendBody(trend, _detail) {
  if (trend.error) {
    return `<div class="text-danger small">${escapeHtml(t('skuDetail.trend.error'))}</div>`;
  }
  if (trend.isLoading && trend.items.length === 0) {
    return `<div class="text-muted small">${escapeHtml(t('skuDetail.trend.loading'))}</div>`;
  }
  if (trend.items.length === 0) {
    return `<div class="text-muted small">${escapeHtml(t('skuDetail.trend.empty'))}</div>`;
  }
  return `<div class="sku-detail-trend-chart-wrap" style="height: 280px;"><canvas id="${TREND_CHART_ID}"></canvas></div>`;
}

// 인라인 plugin — 차트 안 standard threshold 점선 + 마지막 점 위에 "Current: N" 박스.
const TREND_OVERLAY_PLUGIN = {
  id: 'skuDetailTrendOverlay',
  afterDatasetsDraw(chart, _args, opts) {
    if (!opts?.enabled) return;
    const { ctx, chartArea, scales } = chart;
    if (!chartArea || !scales?.y) return;
    // theming §6.3 — 매 그리기마다 현재 theme 기반 색 결정
    const isDark = appStore.getState().theme === 'dark';
    const standardQty = Number(opts.standardQty);
    // dashed threshold line
    if (Number.isFinite(standardQty) && standardQty > 0) {
      const yPos = scales.y.getPixelForValue(standardQty);
      if (yPos > chartArea.top && yPos < chartArea.bottom) {
        ctx.save();
        ctx.setLineDash([5, 4]);
        ctx.strokeStyle = isDark ? '#6b7280' : '#9ca3af';
        ctx.lineWidth = 1.2;
        ctx.beginPath();
        ctx.moveTo(chartArea.left, yPos);
        ctx.lineTo(chartArea.right, yPos);
        ctx.stroke();
        // label
        ctx.setLineDash([]);
        ctx.font = '10px system-ui, -apple-system, sans-serif';
        ctx.fillStyle = isDark ? '#b8bdc4' : '#6c757d';
        ctx.textAlign = 'right';
        ctx.textBaseline = 'bottom';
        ctx.fillText(opts.thresholdLabel ?? '', chartArea.right - 4, yPos - 2);
        ctx.restore();
      }
    }
    // current value annotation — 마지막 데이터 포인트 옆 박스
    const meta = chart.getDatasetMeta(0);
    const lastBar = meta?.data?.[meta.data.length - 1];
    if (lastBar && opts.currentLabel) {
      ctx.save();
      const x = lastBar.x;
      const y = lastBar.y;
      const text = opts.currentLabel;
      ctx.font = '11px system-ui, -apple-system, sans-serif';
      const padX = 6;
      const w = ctx.measureText(text).width + padX * 2;
      const h = 18;
      // 박스 위치: 마지막 점 좌측 아래 (그래프 밖으로 안 나가게)
      const boxX = Math.min(x - w - 6, chartArea.right - w - 4);
      const boxY = Math.min(y + 10, chartArea.bottom - h - 2);
      // DHL red — 다크 채도 -25 보정 (accent-primary 통일)
      ctx.fillStyle = isDark ? '#d24852' : '#d40511';
      ctx.beginPath();
      // rounded rect manual fallback (Chart.js canvas)
      const r = 3;
      ctx.moveTo(boxX + r, boxY);
      ctx.lineTo(boxX + w - r, boxY);
      ctx.quadraticCurveTo(boxX + w, boxY, boxX + w, boxY + r);
      ctx.lineTo(boxX + w, boxY + h - r);
      ctx.quadraticCurveTo(boxX + w, boxY + h, boxX + w - r, boxY + h);
      ctx.lineTo(boxX + r, boxY + h);
      ctx.quadraticCurveTo(boxX, boxY + h, boxX, boxY + h - r);
      ctx.lineTo(boxX, boxY + r);
      ctx.quadraticCurveTo(boxX, boxY, boxX + r, boxY);
      ctx.closePath();
      ctx.fill();
      ctx.fillStyle = '#fff';
      ctx.textAlign = 'left';
      ctx.textBaseline = 'middle';
      ctx.fillText(text, boxX + padX, boxY + h / 2);
      ctx.restore();
    }
  },
};

// 등록 (Chart.js 전역). DashboardPage의 datalabelRight와 같은 패턴.
ChartJS.register(TREND_OVERLAY_PLUGIN);

// C reconcile (BK 2026-05-20): trend 마지막 snapshot 이 실시간 current_qty 와 다를 수 있어
//   차트 끝/라벨/헤더카드 일치 위해 마지막 점 qty 를 real-time current 로 교체.
//   회귀 입력도 자동으로 새 anchor 기반 — 예측이 진짜 current 에서 시작.
function reconcileItemsWithCurrent(items, currentQty) {
  if (
    currentQty == null || !Number.isFinite(Number(currentQty)) ||
    !Array.isArray(items) || items.length === 0 ||
    items[items.length - 1]?.qty === currentQty
  ) return items;
  const out = items.slice();
  out[out.length - 1] = { ...out[out.length - 1], qty: Number(currentQty) };
  return out;
}

function buildTrendData(items, period, currentQty) {
  const reconciled = reconcileItemsWithCurrent(items, currentQty);

  const labels = reconciled.map((r) => r.date);
  const data   = reconciled.map((r) => r.qty);
  const datasets = [{
    label: t('skuDetail.trend.qtyLabel'),
    data,
    borderColor: getTrendColor(),
    backgroundColor: getTrendFillColor(),
    borderWidth: 2,
    tension: 0.3,
    pointRadius: 2,
    pointHoverRadius: 5,
    fill: true,
    spanGaps: true,
  }];

  // T2 추세선 오버레이 — 7d 차트=1일 / 30d 차트=3일 (BK 2026-05-20)
  //   두 컨텍스트 의미 통일: 차트도 *부족 임박* 신호 (감소 추세만).
  //   리포트 §5 표보다 R² 살짝 완화(0.15) — 약한 감소 추세도 캐치.
  //   stockout 임박 시 0 지점에서 끝. 라벨 없이 회색 faint 점선만.
  const projectionDays = period === '30d' ? 3 : 1;
  const fc = buildForecastFromTrend(reconciled, projectionDays, {
    minRSquared: 0.15,
    // allowIncreasing 기본값(false) — 증가 추세는 actionable value 약해 비표시
  });
  if (fc.visible && fc.projection && fc.projection.length > 0) {
    // 실측 마지막 점 = 점선 시작점(연결되어 자연스럽게 이어지도록).
    const baseLen = data.length;
    const projData = Array(baseLen - 1).fill(null);
    projData.push(data[baseLen - 1]);           // anchor 점 (실측 마지막 = 진짜 current)
    fc.projection.forEach((p) => projData.push(p.y));
    const projLabels = [...labels];
    const lastDate = reconciled[reconciled.length - 1]?.date;
    for (let i = 1; i <= fc.projection.length; i += 1) {
      projLabels.push(addDaysLabel(lastDate, i));
    }
    datasets.push({
      label: t('skuDetail.trend.forecastLabel'),
      data: projData,
      borderColor: 'rgba(156, 163, 175, 0.7)',   // 회색 (Tailwind gray-400 #9ca3af, 70% opacity) — 주석성
      backgroundColor: 'transparent',
      borderWidth: 1.5,
      borderDash: [3, 5],                         // 더 faint dash
      tension: 0.1,
      pointRadius: 0,
      pointHoverRadius: 3,
      fill: false,
      spanGaps: true,
    });
    return { labels: projLabels, datasets };
  }

  return { labels, datasets };
}

function addDaysLabel(lastDate, plusN) {
  if (!lastDate) return `+${plusN}d`;
  const d = new Date(lastDate);
  if (Number.isNaN(d.getTime())) return `+${plusN}d`;
  d.setDate(d.getDate() + plusN);
  const pad = (n) => (n < 10 ? '0' + n : '' + n);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

function buildTrendOptions() {
  const detail = skuDetailStore.getState().data?.detail ?? {};
  const standardQty = detail.standardQty;
  const trend = skuDetailStore.getState().trend;
  // 실시간 current_qty 우선 — 차트의 reconcile 된 마지막 점과 라벨 일치 (BK 2026-05-20).
  //   trend 마지막 snapshot 은 일자 집계라 오늘 추가 picking 미반영 가능성 → 헤더카드 = 차트 = 라벨 통일.
  const currentValue = detail.currentQty ?? trend.items?.[trend.items.length - 1]?.qty;
  return {
    maintainAspectRatio: false,
    responsive: true,
    interaction: { mode: 'index', intersect: false },
    layout: { padding: { top: 20, right: 16 } },   // threshold 라벨 / annotation 자리
    plugins: {
      legend: { display: false },
      tooltip: {
        callbacks: {
          label: (ctx) => `${ctx.dataset.label}: ${ctx.parsed.y?.toLocaleString() ?? '—'}`,
        },
      },
      skuDetailTrendOverlay: {
        enabled: true,
        standardQty,
        thresholdLabel: tf('skuDetail.trend.thresholdLabel', { n: (standardQty ?? 0).toLocaleString() }),
        currentLabel:   tf('skuDetail.trend.currentLabel',   { n: (currentValue ?? 0).toLocaleString() }),
      },
    },
    scales: {
      x: {
        grid:   { display: false },
        border: { display: false },
        ticks:  { font: { size: 11 }, maxRotation: 0, autoSkip: true, maxTicksLimit: 8 },
      },
      y: {
        beginAtZero: true,
        ticks:  { font: { size: 11 } },
        /* grid.color 명시 제거 → Chart.defaults.borderColor (ChartCanvas 가 테마별 갱신) */
        border: { display: false },
      },
    },
  };
}

function getTrendColor() {
  const root = document.documentElement;
  return getComputedStyle(root).getPropertyValue('--accent-primary').trim() || '#d40511';
}

function getTrendFillColor() {
  return 'rgba(212, 5, 17, 0.08)';
}

// ─── Validity Summary (wireframe 정합) ───────────────────
//   backend `/inventory/batches?sku_id={id}` 활용. Top 3 lot + drill-down link.
function renderValidityCard(detail) {
  const batches = skuDetailStore.getState().batches;
  if (batches.error) {
    return `
      <section class="sku-detail-card">
        <h2 class="sku-detail-card-title">${escapeHtml(t('skuDetail.validity.title'))}</h2>
        <div class="text-danger small">${escapeHtml(t('skuDetail.errorTitle'))}</div>
      </section>
    `;
  }
  if (batches.isLoading && batches.items.length === 0) {
    return `
      <section class="sku-detail-card">
        <h2 class="sku-detail-card-title">${escapeHtml(t('skuDetail.validity.title'))}</h2>
        <div class="text-muted small">${escapeHtml(t('skuDetail.validity.loading'))}</div>
      </section>
    `;
  }

  const top3 = (batches.items ?? []).slice(0, 3);
  const nearestDays = top3[0]?.daysRemaining;
  const validityHref = `#/validity?sku_id=${encodeURIComponent(detail.skuId)}`;

  return `
    <section class="sku-detail-card sku-detail-validity">
      <header class="sku-detail-card-header">
        <h2 class="sku-detail-card-title">${escapeHtml(t('skuDetail.validity.title'))}</h2>
        ${Number.isFinite(nearestDays)
          ? `<span class="sku-detail-validity-nearest badge bg-danger-subtle text-danger">${escapeHtml(tf('skuDetail.validity.nearestExp', { n: nearestDays }))}</span>`
          : ''}
      </header>
      ${top3.length === 0
        ? `<div class="text-muted small">${escapeHtml(t('skuDetail.validity.empty'))}</div>`
        : `<ul class="sku-detail-validity-lots">
            ${top3.map(renderLotRow).join('')}
          </ul>
          <a href="${validityHref}" class="sku-detail-card-link small">${escapeHtml(t('skuDetail.validity.viewAll'))} →</a>`}
    </section>
  `;
}

function renderLotRow(lot) {
  const days = lot.daysRemaining;
  const dCls = days <= 7 ? 'is-critical' : days <= 30 ? 'is-warning' : '';
  const dText = days < 0 ? `D+${Math.abs(days)}` : `D-${days}`;
  return `
    <li class="sku-detail-validity-lot">
      <span class="sku-detail-validity-lot-tag">${escapeHtml(t('skuDetail.validity.lotPrefix'))}</span>
      <span class="sku-detail-validity-lot-id">${escapeHtml(lot.batchId ?? '')}</span>
      <span class="sku-detail-validity-lot-qty text-muted small">${(lot.qty ?? 0).toLocaleString()}</span>
      <span class="sku-detail-validity-lot-dday ${dCls}">${escapeHtml(dText)}</span>
    </li>
  `;
}

// ─── Recent Stock Events (wireframe 정합) ────────────────
//   backend `/inventory/events?sku_id={id}` 활용. full-width table 형식.
function renderEventsCard(detail, alerts) {
  const events = skuDetailStore.getState().events;
  if (events.error) {
    return `
      <section class="sku-detail-card sku-detail-events-card">
        <h2 class="sku-detail-card-title">${escapeHtml(t('skuDetail.events.title'))}</h2>
        <div class="text-danger small">${escapeHtml(t('skuDetail.errorTitle'))}</div>
      </section>
    `;
  }
  if (events.isLoading && events.items.length === 0) {
    return `
      <section class="sku-detail-card sku-detail-events-card">
        <h2 class="sku-detail-card-title">${escapeHtml(t('skuDetail.events.title'))}</h2>
        <div class="text-muted small">${escapeHtml(t('skuDetail.events.loading'))}</div>
      </section>
    `;
  }

  const items = events.items ?? [];
  // "View All Events" 링크는 전용 페이지가 없어 제거 (2026-05-15). 최근 10건만 표시.

  return `
    <section class="sku-detail-card sku-detail-events-card">
      <header class="sku-detail-card-header">
        <h2 class="sku-detail-card-title">${escapeHtml(t('skuDetail.events.title'))}</h2>
        ${renderAlertsLink(detail, alerts)}
      </header>
      ${items.length === 0
        ? `<div class="text-muted small">${escapeHtml(t('skuDetail.events.empty'))}</div>`
        : renderEventsTable(items)}
    </section>
  `;
}

function renderEventsTable(items) {
  return `
    <div class="sku-detail-events-table-wrap">
      <table class="sku-detail-events-table">
        <thead>
          <tr>
            <th>${escapeHtml(t('skuDetail.events.col.type'))}</th>
            <th>${escapeHtml(t('skuDetail.events.col.timestamp'))}</th>
            <th class="text-end">${escapeHtml(t('skuDetail.events.col.adjustment'))}</th>
            <th class="text-end">${escapeHtml(t('skuDetail.events.col.finalBalance'))}</th>
            <th>${escapeHtml(t('skuDetail.events.col.fefo'))}</th>
          </tr>
        </thead>
        <tbody>
          ${items.map(renderEventRow).join('')}
        </tbody>
      </table>
    </div>
  `;
}

function renderEventRow(ev) {
  const adj = ev.deltaQty ?? 0;
  const adjCls = adj > 0 ? 'is-positive' : adj < 0 ? 'is-negative' : '';
  const adjText = adj > 0 ? `+${adj.toLocaleString()}` : adj.toLocaleString();
  const eventTypeLabel = t('skuDetail.events.type.' + ev.eventType) || ev.eventType;
  const fefoOk    = ev.fefoCompliant !== false;   // true/undefined→준수, false→위반
  const fefoLabel = fefoOk ? t('skuDetail.events.fefo.compliant') : t('skuDetail.events.fefo.violated');
  const fefoBadge = fefoOk ? 'bg-success-subtle text-success' : 'bg-danger-subtle text-danger';
  return `
    <tr>
      <td class="fw-semibold">${escapeHtml(eventTypeLabel)}</td>
      <td class="text-muted small">${escapeHtml(formatRelative(ev.createdAt))}</td>
      <td class="text-end sku-detail-events-adj ${adjCls}">${escapeHtml(adjText)}</td>
      <td class="text-end">${ev.afterQty != null ? ev.afterQty.toLocaleString() : '—'}</td>
      <td><span class="badge ${fefoBadge}">${escapeHtml(fefoLabel)}</span></td>
    </tr>
  `;
}

// ─── helpers ────────────────────────────────────────────
function formatRelative(iso) {
  if (!iso) return '—';
  const diff = Date.now() - new Date(iso).getTime();
  if (Number.isNaN(diff)) return '—';
  const min = Math.floor(diff / 60000);
  if (min < 1)  return t('alertList.relative.justNow');
  if (min < 60) return tf('alertList.relative.minutes', { n: min });
  const hr = Math.floor(min / 60);
  if (hr < 24)  return tf('alertList.relative.hours', { n: hr });
  return tf('alertList.relative.days', { n: Math.floor(hr / 24) });
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
