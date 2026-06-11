/**
 * OperationalStatsPage — 07 Operational Stats
 * ─────────────────────────────────────────────────────────────
 * Layout: docs/page_layout_outline.md §12 + Track 1 §66 + wireframes/07_operational_stats.png
 *
 * 화면 구조 (wireframe 정합):
 *   ┌─ Header (title + Period selector + Zone dropdown) ────┐
 *   │ ┌─ Operational Signals ─────────────────┐ ┌─ Refill ──┐│
 *   │ │ TOP PICKED + FEFO WATCH + LIVE FEED   │ ├─ PO ──────┤│
 *   │ └───────────────────────────────────────┘ └─ Inv Acc ─┘│
 *   ├──────────────────────────────────────────────────────┤
 *   │ KPI Trend (Last 7 Days) — Chart.js Phase 5 placeholder│
 *   ├──────────────────────────────────────────────────────┤
 *   │ ┌─ SKU Consumption ──┬─ Zone Activity ──┐             │
 *   │ │ Top 5 rank bars    │ Zone/Access/...  │             │
 *   │ └────────────────────┴──────────────────┘             │
 *   ├──────────────────────────────────────────────────────┤
 *   │ Recent Operational Events                             │
 *   └──────────────────────────────────────────────────────┘
 *
 * 정책 정합 (wireframe + Track 1 §66):
 *  - Period selector: Today / 7 Days / 30 Days / Month
 *  - Zone dropdown: All Zones / 개별 zone (backend `zone_id` query 지원 endpoint만 영향)
 *  - Zone Activity CONFIRMED → **Confirm Rate** (confirmed_count / access_count, 소수점 1자리)
 *  - AVG DWELL: 60초 미만 `42s` / 60초 이상 `1m 20s`
 *  - Top Picked: `420 picks` / SKU Consumption: `1,240 units`
 *  - Compliance Rate / Inventory Accuracy: 소수점 1자리 %
 *  - Create Purchase Order: button-only placeholder (`API Offline` 배지 — MVP 외부 PO API 미연동)
 *  - LIVE FEED 배지: Phase 6 socket 활성 시 의미 활성. MVP는 정적 표기.
 *  - KPI Trend chart: Chart.js Phase 5 도입 대상 — 현재 raw 값 표로 표시
 */

import { operationalStatsStore } from '../../store/operationalStatsStore.js';
import { appStore } from '../../store/appStore.js';
import { t } from '../../core/i18n/index.js';
import { formatMonthDayHM } from '../../core/format.js';
import { createChartCanvas } from '../common/ChartCanvas.js';
import { listRefillRequests } from '../../api/inventoryApi.js';
import {
  mountRefillRequestsModal,
  unmountRefillRequestsModal,
  openRefillRequestsModal,
} from './RefillRequestsModal.js';
import { scopeStore } from '../../store/scopeStore.js';

const ROOT_ID = 'operational-stats-root';
const KPI_TREND_CHART_ID   = 'op-stats-kpi-trend-chart';
const CONSUMPTION_CHART_ID = 'op-stats-consumption-chart';
const COMPLIANCE_DONUT_CHART_ID = 'op-stats-compliance-donut';

const PERIOD_VALUES = ['today', '7d', '30d', 'month'];

export default function OperationalStatsPage() {
  let period = 'today';

  let unsubStore    = null;
  let unsubApp      = null;
  let unsubScope    = null;
  let clickHandler  = null;

  // Chart instance들 — rerender 시 destroy → 새 canvas mount 사이클 (Dashboard 5.2 패턴 동일)
  let kpiTrendChart    = null;
  let consumptionChart = null;
  let complianceDonutChart = null;

  function buildParams() {
    const q = { period };
    // zone scope = TopBar scopeStore 단일 소스 (SkuList/Validity/AlertList 동일 패턴)
    const scopeZone = scopeStore.getState().zoneId;
    if (scopeZone) q.zone_id = scopeZone;
    return q;
  }

  function refetch() {
    operationalStatsStore.fetchSummary(buildParams());
  }

  function rerender() {
    // canvas DOM 갱신 전에 기존 chart instance 정리 (Dashboard 5.2 패턴)
    kpiTrendChart?.destroy();
    consumptionChart?.destroy();
    complianceDonutChart?.destroy();
    kpiTrendChart = consumptionChart = complianceDonutChart = null;

    render(operationalStatsStore.getState(), { period });

    mountKpiTrendChart();
    mountConsumptionChart();
    mountComplianceDonutChart();
  }

  function mountKpiTrendChart() {
    const state = operationalStatsStore.getState();
    const trend = state.data?.kpi?.trend;
    if (!trend || trend.length === 0) return;
    if (!document.getElementById(KPI_TREND_CHART_ID)) return;

    kpiTrendChart = createChartCanvas({
      id: KPI_TREND_CHART_ID,
      type: 'line',
      data:    () => buildKpiTrendData(trend),
      options: () => buildKpiTrendOptions(),
    });
    kpiTrendChart.mount();
  }

  function mountConsumptionChart() {
    const state = operationalStatsStore.getState();
    const items = state.data?.consumption?.items;
    if (!items || items.length === 0) return;
    if (!document.getElementById(CONSUMPTION_CHART_ID)) return;

    consumptionChart = createChartCanvas({
      id: CONSUMPTION_CHART_ID,
      type: 'bar',
      data:    () => buildConsumptionData(items),
      options: () => buildConsumptionOptions(),
    });
    consumptionChart.mount();
  }

  function mountComplianceDonutChart() {
    const state = operationalStatsStore.getState();
    const fefo  = state.data?.stats?.fefoWatch;  // ← 경로 수정: data.stats.fefoWatch
    if (!fefo || fefo.complianceRate == null) return;
    if (!document.getElementById(COMPLIANCE_DONUT_CHART_ID)) return;
    // 분수(0~1)/이미-퍼센트(>1) 양쪽 방어 — 실 backend 가 percent 로 반환하는 케이스 차단
    const r = fefo.complianceRate;
    const pct = Math.max(0, Math.min(100, r <= 1.0001 ? r * 100 : r));
    complianceDonutChart = createChartCanvas({
      id: COMPLIANCE_DONUT_CHART_ID,
      type: 'doughnut',
      data: () => ({
        labels: ['Compliant', 'Remaining'],
        datasets: [{
          data: [pct, Math.max(0, 100 - pct)],
          // theming §6.3 — 다크 모드 정합 (헬퍼가 자동 분기)
          backgroundColor: [getOpStatsAccuracyColor(), getOpStatsAccuracyTrackColor()],
          borderColor: getOpStatsDonutBorderColor(),   // 카드 배경과 같은 색 → 분리 효과
          borderWidth: 2,
          cutout: '60%',           // Chart.js v4 권장 위치 = dataset 내부
        }],
      }),
      options: () => ({
        responsive: false,
        maintainAspectRatio: false,
        plugins: {
          legend:  { display: false },
          tooltip: { enabled: false },
        },
      }),
    });
    complianceDonutChart.mount();
  }

  return {
    html: `<section id="${ROOT_ID}" class="op-stats-page"></section>`,

    mount() {
      unsubStore = operationalStatsStore.subscribe(rerender);
      unsubApp   = appStore.subscribe(() => { rerender(); refetch(); });   // lang: UI + BE 데이터 재요청
      rerender();

      const root = document.getElementById(ROOT_ID);

      clickHandler = (e) => {
        const periodBtn = e.target.closest('[data-action="period"]');
        if (periodBtn) {
          const next = periodBtn.dataset.period;
          if (next && next !== period) {
            period = next;
            refetch();
          }
          return;
        }
        const poBtn = e.target.closest('[data-action="create-po"]');
        if (poBtn) {
          window.alert(t('opStats.alerts.poNotReady'));
          return;
        }
        const refillBtn = e.target.closest('[data-action="refill-requests"]');
        if (refillBtn) {
          openRefillRequestsModal();
          return;
        }
      };
      root?.addEventListener('click', clickHandler);

      // zone scope 변경(TopBar) 시 자동 refetch — 페이지 내부 zone 드롭다운 제거, scopeStore 단일화 (pending §2.37/§2.26)
      unsubScope = scopeStore.subscribe(() => refetch());

      mountRefillRequestsModal({ onFetch: listRefillRequests });
      refetch();
    },

    destroy() {
      kpiTrendChart?.destroy();
      consumptionChart?.destroy();
      complianceDonutChart?.destroy();
      kpiTrendChart = consumptionChart = complianceDonutChart = null;
      unsubStore?.();
      unsubApp?.();
      unsubStore = unsubApp = null;
      const root = document.getElementById(ROOT_ID);
      if (root && clickHandler)  root.removeEventListener('click',  clickHandler);
      clickHandler = null;
      unsubScope?.();
      unsubScope = null;
      unmountRefillRequestsModal();
      operationalStatsStore.reset();
    },
  };
}

// ─── render ──────────────────────────────────────────────
function render(state, ctx) {
  const root = document.getElementById(ROOT_ID);
  if (!root) return;

  const { isLoading, error, data, receivedAt } = state;
  const zoneScoped = !!scopeStore.getState().zoneId;

  root.innerHTML = `
    <header class="op-stats-header">
      <h1 class="h3 fw-bold mb-0">${escapeHtml(t('opStats.title'))}</h1>
      <div class="op-stats-controls">
        ${renderPeriodSelector(ctx.period)}
        <a class="btn btn-warning btn-sm ms-2"
           href="#/operational-stats/report?period=${ctx.period}"
           data-action="generate-report">
          <span class="material-symbols-outlined align-middle me-1">summarize</span>
          ${escapeHtml(t('opStats.generateReport'))}
        </a>
      </div>
    </header>

    ${error
      ? renderError(error)
      : isLoading && !data
        ? renderLoading()
        : data ? renderBody(data, receivedAt, zoneScoped) : ''}
  `;
}

function renderPeriodSelector(period) {
  return `
    <div class="op-stats-period">
      ${PERIOD_VALUES.map((value) => `
        <button type="button" class="op-stats-period-btn ${value === period ? 'is-active' : ''}"
                data-action="period" data-period="${value}">${escapeHtml(t('opStats.period.' + value))}</button>
      `).join('')}
    </div>
  `;
}

function renderLoading() {
  return `
    <div class="op-stats-loading">
      <div class="spinner-border text-warning" role="status"></div>
      <span class="ms-2 text-muted">${escapeHtml(t('opStats.loading'))}</span>
    </div>
  `;
}

function renderError(err) {
  return `
    <div class="alert alert-danger m-4" role="alert">
      <strong>${escapeHtml(t('opStats.errorTitle'))}</strong>
      <div class="small mt-1">${escapeHtml(err?.message ?? t('common.error'))}</div>
    </div>
  `;
}

function renderBody(data, receivedAt, zoneScoped) {
  return `
    <div class="op-stats-top-row">
      <div class="op-stats-signals-col">
        ${renderOperationalSignals(data.stats, data.outboundFrequency)}
      </div>
      <div class="op-stats-side-col">
        ${renderSideCard('inventory_2',   t('opStats.side.refill.title'), t('opStats.side.refill.subtitle'), 'refill-requests', null)}
        ${renderSideCard('shopping_cart', t('opStats.side.po.title'),     t('opStats.side.po.subtitle'),     'create-po',       t('opStats.side.po.badge'))}
        ${renderInventoryAccuracyCard(data.stats)}
      </div>
    </div>

    <div class="op-stats-grid-2x2">
      ${renderKpiTrendCard(data.kpi, zoneScoped)}
      ${renderZoneActivity(data.zoneAccess)}
      ${renderSkuConsumption(data.consumption)}
      ${renderRecentEvents(data.events)}
    </div>

    ${receivedAt ? `<div class="op-stats-footer text-muted small">${escapeHtml(t('header.updated'))} ${formatHM(receivedAt)}</div>` : ''}
  `;
}

// ─── Operational Signals (Top Picked + FEFO Watch + LIVE FEED) ─────
function renderOperationalSignals(stats, outboundFreq) {
  const top = (outboundFreq?.items ?? []).slice(0, 3);
  const fefo = stats?.fefoWatch ?? {};
  const issue = fefo.latestIssue ?? {};
  // 분수(0~1)/이미-퍼센트(>1) 양쪽 방어 (실 backend 가 percent 로 반환하는 케이스)
  const compliancePct = fefo.complianceRate != null
    ? `${(fefo.complianceRate <= 1.0001 ? fefo.complianceRate * 100 : fefo.complianceRate).toFixed(1)}%` : '—';

  return `
    <article class="op-stats-card op-stats-signals">
      <header class="op-stats-signals-header">
        <h2 class="h6 fw-bold mb-0">
          <span class="material-symbols-outlined">graphic_eq</span>
          ${escapeHtml(t('opStats.signals.title'))}
        </h2>
        <span class="op-stats-live-badge">${escapeHtml(t('opStats.signals.liveBadge'))}</span>
      </header>

      <div class="op-stats-signals-body">
        <div class="op-stats-signals-left">
          <div class="op-stats-signals-section-label">${escapeHtml(t('opStats.signals.topPicked'))}</div>
          ${top.length === 0
            ? `<div class="text-muted small">${escapeHtml(t('opStats.noData'))}</div>`
            : top.map((row) => `
                <div class="op-stats-top-row-item">
                  <span class="op-stats-top-row-name">${escapeHtml(row.displayName ?? row.skuId)}</span>
                  <span class="op-stats-top-row-picks">${(row.picks ?? 0).toLocaleString()} ${escapeHtml(t('opStats.signals.picksSuffix'))}</span>
                </div>
              `).join('')}
        </div>

        <div class="op-stats-signals-right">
          <div class="op-stats-signals-section-label">${escapeHtml(t('opStats.signals.fefoWatch'))}</div>
          <div class="op-stats-fefo-grid">
            <div class="op-stats-fefo-donut">
              <canvas id="${COMPLIANCE_DONUT_CHART_ID}" width="128" height="128"></canvas>
              <div class="op-stats-fefo-donut-center">
                <span class="op-stats-fefo-donut-pct">${compliancePct}</span>
                <span class="op-stats-fefo-donut-label">${escapeHtml(t('opStats.signals.compliance'))}</span>
              </div>
            </div>
            <div class="op-stats-fefo-chips-col">
              <div class="op-stats-fefo-chip op-stats-fefo-chip-violations">
                <span class="op-stats-fefo-chip-label">${escapeHtml(t('opStats.signals.violations'))}</span>
                <span class="op-stats-fefo-chip-value">${fefo.violations ?? 0}</span>
              </div>
              <div class="op-stats-fefo-chip">
                <span class="op-stats-fefo-chip-label">${escapeHtml(t('opStats.signals.latestIssue'))}</span>
                <span class="op-stats-fefo-chip-value">
                  ${escapeHtml(issue.skuId ?? '—')}
                  ${issue.zoneName ? `<span class="op-stats-fefo-chip-zone">${escapeHtml(issue.zoneName)}</span>` : ''}
                </span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </article>
  `;
}

// ─── Side cards (Refill / PO / Inventory Accuracy) ─────
function renderSideCard(icon, title, subtitle, action, badge) {
  return `
    <button type="button" class="op-stats-side-card" data-action="${action}">
      <span class="material-symbols-outlined op-stats-side-icon">${icon}</span>
      <div class="op-stats-side-text">
        <div class="op-stats-side-title">${escapeHtml(title)}</div>
        <div class="op-stats-side-subtitle">${escapeHtml(subtitle)}</div>
      </div>
      ${badge
        ? `<span class="op-stats-side-badge">${escapeHtml(badge)}</span>`
        : `<span class="material-symbols-outlined op-stats-side-chevron">chevron_right</span>`}
    </button>
  `;
}

function renderInventoryAccuracyCard(stats) {
  // 분수(0~1)/이미-퍼센트(>1) 양쪽 방어 (실 backend 가 percent 로 반환하는 케이스)
  const accuracy = stats?.inventoryAccuracy != null
    ? `${(stats.inventoryAccuracy <= 1.0001 ? stats.inventoryAccuracy * 100 : stats.inventoryAccuracy).toFixed(1)}%` : '—';
  return `
    <div class="op-stats-side-card op-stats-side-card-static">
      <span class="material-symbols-outlined op-stats-side-icon">inventory_2</span>
      <div class="op-stats-side-text">
        <div class="op-stats-side-title">${escapeHtml(t('opStats.side.accuracy.title'))}</div>
        <div class="op-stats-side-subtitle">${escapeHtml(t('opStats.side.accuracy.subtitle'))}</div>
      </div>
      <span class="op-stats-side-value">${accuracy}</span>
    </div>
  `;
}

// ─── KPI Trend (Phase 5.2 패턴 — Chart.js line) ────────
//   raw 표 → Chart.js line chart 교체.
//   2 series: inventoryAccuracy / fefoCompliance (모두 0~1 → %)
//   데이터: 실 BE `kpi.trend[]` (analytics_service.get_kpi) — mock 도 동일 형식 미러.
function renderKpiTrendCard(kpi, zoneScoped) {
  const trend = kpi?.trend ?? [];
  return `
    <article class="op-stats-card op-stats-kpi-trend">
      <header class="op-stats-kpi-trend-header">
        <h2 class="h6 fw-bold mb-0">${escapeHtml(t('opStats.kpi.title'))} <span class="text-muted small fw-normal">${escapeHtml(t('opStats.kpi.subtitle'))}</span>${zoneScoped ? ` <span class="op-stats-kpi-sitewide">${escapeHtml(t('opStats.kpi.siteWide'))}</span>` : ''}</h2>
        <div class="op-stats-kpi-trend-legend">
          <span class="op-stats-legend-dot op-stats-legend-accuracy"></span> ${escapeHtml(t('opStats.kpi.legend.accuracy'))}
          <span class="op-stats-legend-dot op-stats-legend-fefo ms-3"></span> ${escapeHtml(t('opStats.kpi.legend.fefo'))}
        </div>
      </header>
      ${trend.length === 0
        ? `<div class="text-muted text-center py-5">${escapeHtml(t('opStats.noData'))}</div>`
        : `<div class="op-stats-kpi-trend-chart-wrap" style="height: 260px;"><canvas id="${KPI_TREND_CHART_ID}"></canvas></div>`}
    </article>
  `;
}

// BE trend point 의 date(예: '2026-05-19') → 짧은 'M/D' x축 라벨. 파싱 실패 시 원본.
function formatTrendLabel(date) {
  const d = new Date(date);
  return Number.isNaN(d.getTime()) ? String(date ?? '') : `${d.getMonth() + 1}/${d.getDate()}`;
}

// 2 series: accuracy (DHL red) + fefo compliance (blue). 둘 다 0~1 → 100 곱해서 %로 plot.
function buildKpiTrendData(trend) {
  return {
    labels: trend.map((d) => formatTrendLabel(d.date)),
    datasets: [
      {
        label: t('opStats.kpi.legend.accuracy'),
        data: trend.map((d) => d.inventoryAccuracy != null ? d.inventoryAccuracy * 100 : null),
        borderColor: getOpStatsAccuracyColor(),
        backgroundColor: getOpStatsAccuracyColor(),
        borderWidth: 2,
        tension: 0.3,
        pointRadius: 3,
        pointHoverRadius: 5,
        spanGaps: true,
      },
      {
        label: t('opStats.kpi.legend.fefo'),
        data: trend.map((d) => d.fefoCompliance != null ? d.fefoCompliance * 100 : null),
        borderColor: getOpStatsFefoColor(),
        backgroundColor: getOpStatsFefoColor(),
        borderWidth: 2,
        tension: 0.3,
        pointRadius: 3,
        pointHoverRadius: 5,
        spanGaps: true,
      },
    ],
  };
}

function buildKpiTrendOptions() {
  return {
    maintainAspectRatio: false,
    responsive: true,
    interaction: { mode: 'index', intersect: false },
    plugins: {
      legend: { display: false },   // 카드 헤더에 이미 legend 있음
      tooltip: {
        callbacks: {
          label: (ctx) => `${ctx.dataset.label}: ${ctx.parsed.y?.toFixed(1) ?? '—'}%`,
        },
      },
    },
    scales: {
      x: {
        grid:   { display: false },
        border: { display: false },
        ticks:  { font: { size: 11 } },
      },
      y: {
        // 값이 보통 90%+ 영역에 모여 있어 0~100 스케일에선 직선처럼 보임.
        // 75~100 로 확대해 추이가 잘 보이도록 함.
        min: 75,
        max: 100,
        ticks: {
          stepSize: 5,
          callback: (val) => val + '%',
          font: { size: 11 },
        },
        /* grid.color 명시 제거 → Chart.defaults.borderColor (ChartCanvas 가 테마별 갱신) */
        border: { display: false },
      },
    },
  };
}

function getOpStatsAccuracyColor() {
  // 라이트=#d40511, 다크=#d24852 자동 정합
  const root = document.documentElement;
  return getComputedStyle(root).getPropertyValue('--accent-primary').trim() || '#d40511';
}

/* 도넛 두번째 색 — 라이트=light gray, 다크=어두운 회색 */
function getOpStatsAccuracyTrackColor() {
  return appStore.getState().theme === 'dark' ? '#3a3d44' : '#e9ecef';
}

/* 도넛 segment 경계선 — 카드 배경과 동일 색 (양 모드 자연 분리) */
function getOpStatsDonutBorderColor() {
  const root = document.documentElement;
  return getComputedStyle(root).getPropertyValue('--surface-card').trim() || '#ffffff';
}

function getOpStatsFefoColor() {
  // Bootstrap blue. 다크에선 채도 -25 보정 (theming §6.3)
  return appStore.getState().theme === 'dark' ? '#5e8fd6' : '#0d6efd';
}

// ─── SKU Consumption (Phase 5.6 — Chart.js horizontal bar) ─
//   기존 CSS 그라데이션 막대 → Chart.js bar (5.2 Dashboard Top Movement 패턴 동일)
//   - rank는 Y축 라벨 prefix로 ("1. Aspirin 81mg")
//   - 막대 색: DHL red (기존 CSS와 일관)
//   - 데이터 라벨: 5.2에서 등록한 datalabelRight 플러그인 재사용
//   - 클릭 → SKU Detail navigate (Dashboard Top Movement와 일관)
function renderSkuConsumption(consumption) {
  const items = consumption?.items ?? [];
  return `
    <article class="op-stats-card op-stats-consumption">
      <header><h2 class="h6 fw-bold mb-3">${escapeHtml(t('opStats.consumption.title'))}</h2></header>
      ${items.length === 0
        ? `<div class="text-muted small">${escapeHtml(t('opStats.noData'))}</div>`
        : `<div class="op-stats-consumption-chart-wrap" style="height: 220px;"><canvas id="${CONSUMPTION_CHART_ID}"></canvas></div>`}
    </article>
  `;
}

function buildConsumptionData(items) {
  return {
    labels: items.map((r) => `${r.rank ?? '·'}. ${r.displayName ?? r.skuId}`),
    datasets: [{
      label: t('opStats.consumption.title'),
      data: items.map((r) => r.consumedUnits ?? 0),
      backgroundColor: getConsumptionColor(),
      hoverBackgroundColor: getConsumptionColorHover(),
      borderRadius: 4,
      borderSkipped: false,
      barPercentage: 0.82,
      _skuIds: items.map((r) => r.skuId),
    }],
  };
}

function buildConsumptionOptions() {
  return {
    indexAxis: 'y',
    maintainAspectRatio: false,
    responsive: true,
    layout: { padding: { right: 64 } },   // datalabel 자리 확보
    plugins: {
      legend:  { display: false },
      tooltip: {
        callbacks: {
          label: (ctx) => `${ctx.parsed.x.toLocaleString()} ${t('opStats.consumption.units')}`,
        },
      },
      // 5.2에서 ChartJS.register로 전역 등록한 인라인 플러그인 재사용
      datalabelRight: { enabled: true, unitsKey: 'opStats.consumption.units' },
    },
    scales: {
      x: {
        beginAtZero: true,
        ticks:  { display: false },
        grid:   { display: false },
        border: { display: false },
      },
      y: {
        ticks:  { autoSkip: false, font: { size: 12 } },
        grid:   { display: false },
        border: { display: false },
      },
    },
    onClick: (_evt, elements, chart) => {
      if (!elements.length) return;
      const idx = elements[0].index;
      const skuId = chart.data.datasets?.[0]?._skuIds?.[idx];
      if (skuId) window.location.hash = '#/inventory/sku-detail?id=' + encodeURIComponent(skuId);
    },
    onHover: (evt, elements) => {
      const target = evt.native?.target;
      if (target) target.style.cursor = elements.length ? 'pointer' : 'default';
    },
  };
}

function getConsumptionColor() {
  // 연한 노란색 — KPI red 와 차별화 (BK 결정 2026-05-21). 다크에선 채도 -25 보정
  return appStore.getState().theme === 'dark' ? '#a89260' : '#fde68a';
}

function getConsumptionColorHover() {
  return appStore.getState().theme === 'dark' ? '#c2a76b' : '#fcd34d';
}

// ─── Zone Activity (CONFIRMED → Confirm Rate derive) ───
// F-017 A+ — Zone별 접근 빈도 히트맵: 폭 ∝ accessCount, 색강도 ∝ accessCount.
//   1D(zone별 총계)로 "네모+색=양" 충족. 트리맵/2D 시간매트릭스는 pending §2.57.
function renderZoneHeatStrip(items) {
  const max = Math.max(...items.map((z) => z.accessCount ?? 0), 1);
  return `
    <div class="op-stats-zone-heat">
      ${items.map((z) => {
        const v = z.accessCount ?? 0;
        const ratio = v / max;
        const bg = `rgba(217,72,15,${(0.15 + 0.8 * ratio).toFixed(3)})`;
        const dark = ratio > 0.55;
        return `
          <div class="op-stats-zone-heat-tile${dark ? ' is-dark' : ''}"
               style="flex-grow:${v || 1};background:${bg};"
               title="${escapeHtml(z.zoneName ?? z.zoneId ?? '')} · ${v.toLocaleString()}">
            <span class="op-stats-zone-heat-name">${escapeHtml(z.zoneName ?? z.zoneId ?? '')}</span>
            <span class="op-stats-zone-heat-val">${v.toLocaleString()}</span>
          </div>`;
      }).join('')}
    </div>
    <div class="op-stats-zone-heat-legend small text-muted">
      <span>${escapeHtml(t('opStats.zone.heatLabel'))}</span>
      <span>${escapeHtml(t('opStats.zone.heatLow'))}</span>
      <span class="op-stats-zone-heat-legend-bar" aria-hidden="true"></span>
      <span>${escapeHtml(t('opStats.zone.heatHigh'))}</span>
    </div>
  `;
}

function renderZoneActivity(zoneAccess) {
  // zoneName 알파벳순 — BE 응답 순서 보장 없어 FE 표현 계층에서 정렬 (heat strip + table 동시 적용)
  const items = [...(zoneAccess?.items ?? [])].sort((a, b) =>
    String(a.zoneName ?? a.zoneId ?? '').localeCompare(String(b.zoneName ?? b.zoneId ?? ''))
  );

  return `
    <article class="op-stats-card op-stats-zone-activity">
      <header class="op-stats-zone-activity-header">
        <h2 class="h6 fw-bold mb-0">${escapeHtml(t('opStats.zone.title'))}</h2>
      </header>
      ${items.length === 0
        ? `<div class="text-muted small">${escapeHtml(t('opStats.noData'))}</div>`
        : `
          <div class="op-stats-zone-heat-wrap">
            ${items.length >= 2
              ? renderZoneHeatStrip(items)
              : `<div class="op-stats-zone-heat-single">${escapeHtml(t('opStats.zone.heatSingleZone'))}</div>`}
          </div>
          <table class="op-stats-zone-table">
            <thead>
              <tr>
                <th>${escapeHtml(t('opStats.zone.col.zone'))}</th>
                <th class="text-end">${escapeHtml(t('opStats.zone.col.access'))}</th>
                <th class="text-end">${escapeHtml(t('opStats.zone.col.confirmRate'))}</th>
              </tr>
            </thead>
            <tbody>
              ${items.map((z) => {
                const access = z.accessCount ?? 0;
                const confirmed = z.confirmedCount ?? 0;
                const rate = access > 0 ? (confirmed / access * 100) : 0;
                const rateCls = rate >= 95 ? 'is-good' : rate >= 80 ? 'is-watch' : 'is-bad';
                return `
                  <tr>
                    <td>${escapeHtml(z.zoneName ?? z.zoneId)}</td>
                    <td class="text-end">${access.toLocaleString()}</td>
                    <td class="text-end op-stats-confirm-rate ${rateCls}">${rate.toFixed(1)}%</td>
                  </tr>
                `;
              }).join('')}
            </tbody>
          </table>
        `}
    </article>
  `;
}

// ─── Recent Operational Events ─────────────────────────
function renderRecentEvents(events) {
  const items = events?.items ?? [];
  return `
    <article class="op-stats-card op-stats-events">
      <header><h2 class="h6 fw-bold mb-3">${escapeHtml(t('opStats.events.title'))}</h2></header>
      ${items.length === 0
        ? `<div class="text-muted small">${escapeHtml(t('opStats.events.empty'))}</div>`
        : `
          <ul class="op-stats-events-list">
            ${items.map((ev) => `
              <li class="op-stats-events-item">
                <span class="op-stats-events-type op-stats-events-type-${escapeHtml(ev.eventType ?? 'default')}">${escapeHtml(eventTypeLabel(ev.eventType))}</span>
                <span class="op-stats-events-msg">${escapeHtml(ev.message ?? '')}</span>
                <span class="op-stats-events-time text-muted small">${escapeHtml(formatMonthDayHM(ev.occurredAt))}</span>
              </li>
            `).join('')}
          </ul>
        `}
    </article>
  `;
}

function eventTypeLabel(evType) {
  if (!evType) return t('opStats.events.type.default');
  // 지정된 카테고리만 i18n, 그 외는 원본 string fallback
  const known = ['fefo_violation', 'low_stock', 'replenishment', 'picking', 'scan_failure'];
  return known.includes(evType) ? t('opStats.events.type.' + evType) : evType;
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
