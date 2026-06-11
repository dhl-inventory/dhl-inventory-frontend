/**
 * DashboardPage — 01 Dashboard
 * ─────────────────────────────────────────────────────────────
 * Mount 시 dashboardStore.fetchSummary(periodQuery) → 6 endpoint 병렬 호출 →
 * KPI 4개 + 본문 카드 3개 (Movement Top 5 / Validity Top / Stock Watchlist) 렌더.
 *
 * UI ↔ API 매핑 단일 진실: docs/architecture/ui_api_mapping.md §01 Dashboard
 *
 * 와이어프레임 정합 (2026-05-08 레퍼런스 합성):
 *  - KPI 아이콘은 라벨 좌측. Capacity 카드 하단 노란 progress bar.
 *  - 본문은 3 equal columns (Top / Validity / Watchlist).
 *  - Top Movement는 Inbound ↔ Outbound 토글 (split 아님, JS state로 전환).
 *  - 헤더에 Period selector (Today/1W/1M/Custom) — 변경 시 fetchSummary 재호출.
 *  - 막대는 DHL yellow.
 *  - Validity Top List는 3 컬럼 (SKU / Location / D-day pill).
 *  - Watchlist는 3-col 테이블 + 헤더에 urgent / below standard 카운트.
 *
 * Period 동작:
 *  - 'today' → start=오늘 00:00, end=오늘 23:59, compare_to='prev_day'
 *  - '1w'    → 최근 7일,            compare_to='prev_period'
 *  - '1m'    → 최근 30일,           compare_to='prev_period'
 *  - 'custom'→ 1차 placeholder (최근 10일 hardcode, 후속 작업에 date picker)
 *  - mock 모드는 응답 단일 (period 무시) — 변화 시각적 검증은 실 API 모드에서.
 */

import { dashboardStore } from '../../store/dashboardStore.js';
import { appStore } from '../../store/appStore.js';
import { t, tf } from '../../core/i18n/index.js';
import { createChartCanvas } from '../common/ChartCanvas.js';
import { Chart as ChartJS } from 'chart.js';

const ROOT_ID = 'dashboard-root';
const TOP_ITEMS_CHART_ID = 'dashboard-top-items-chart';

// ─── 인라인 datalabel 플러그인 (의존성 0) ─────────────────
//   horizontal bar 막대 끝에 "1,234 units" 같은 라벨을 그림.
//   opts.enabled / opts.unitsKey 로 호출처에서 활성·라벨 제어.
//   Chart.js plugin spec: id + afterDatasetsDraw 표준 hook.
const DATALABEL_RIGHT_PLUGIN = {
  id: 'datalabelRight',
  afterDatasetsDraw(chart, _args, opts) {
    if (!opts?.enabled) return;
    const { ctx, data, chartArea } = chart;
    if (!chartArea) return;
    const dataset = data.datasets?.[0];
    if (!dataset) return;
    const meta = chart.getDatasetMeta(0);
    const unitsLabel = opts.unitsKey ? t(opts.unitsKey) : '';

    ctx.save();
    ctx.font = '12px system-ui, -apple-system, sans-serif';
    // theming §6.3 — 다크 모드 대응 (라이트=text-secondary, 다크=text-secondary 다크값)
    ctx.fillStyle = appStore.getState().theme === 'dark' ? '#b8bdc4' : '#40484c';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';

    meta.data.forEach((bar, idx) => {
      const value = dataset.data[idx];
      if (value == null) return;
      const text = `${Number(value).toLocaleString()}${unitsLabel ? ' ' + unitsLabel : ''}`;
      const x = bar.x + 6;          // 막대 끝에서 6px 우측
      const y = bar.y;
      ctx.fillText(text, x, y);
    });
    ctx.restore();
  },
};

ChartJS.register(DATALABEL_RIGHT_PLUGIN);

export default function DashboardPage() {
  let unsubStore   = null;
  let unsubApp     = null;
  let clickHandler = null;
  let inputHandler = null;
  let activeTopTab = 'inbound';   // 'inbound' | 'outbound'
  let activePeriod = 'today';     // 'today' | '1w' | '1m' | 'custom'
  let customRange  = initCustomRange();   // { start: 'YYYY-MM-DD', end: 'YYYY-MM-DD' }

  // Chart instance — rerender 시 destroy → 새 canvas mount 사이클로 관리
  let topItemsChart = null;

  function rerender() {
    // canvas DOM 갱신 전에 기존 chart instance 정리 (memory leak 방지)
    topItemsChart?.destroy();
    topItemsChart = null;

    render(dashboardStore.getState(), { activeTopTab, activePeriod, customRange });

    // innerHTML 갱신 후 chart 재생성 (data 도착 + canvas 존재 시에만)
    mountTopItemsChart();
  }

  function mountTopItemsChart() {
    const state = dashboardStore.getState();
    if (!state.data) return;
    if (!document.getElementById(TOP_ITEMS_CHART_ID)) return;

    topItemsChart = createChartCanvas({
      id: TOP_ITEMS_CHART_ID,
      type: 'bar',
      data:    () => buildTopItemsData(state.data.topItems, activeTopTab),
      options: () => buildTopItemsOptions(state.data.topItems, activeTopTab),
    });
    topItemsChart.mount();
  }

  return {
    html: `<section id="${ROOT_ID}" class="dashboard-page"></section>`,

    mount() {
      unsubStore = dashboardStore.subscribe(rerender);
      unsubApp   = appStore.subscribe(() => { rerender(); dashboardStore.fetchSummary(buildPeriodQuery(activePeriod, customRange)); });   // lang: UI + 6 endpoint 재요청
      rerender();

      const root = document.getElementById(ROOT_ID);

      // delegated click handler — Top Movement 토글 + Period 셀렉터
      clickHandler = (e) => {
        const tabBtn = e.target.closest('[data-action="top-tab"]');
        if (tabBtn) {
          const next = tabBtn.dataset.tab;
          if (next === activeTopTab) return;
          activeTopTab = next;
          rerender();
          return;
        }
        const periodBtn = e.target.closest('[data-action="period"]');
        if (periodBtn) {
          const next = periodBtn.dataset.period;
          if (next === activePeriod) return;
          activePeriod = next;
          rerender();   // 활성 버튼 즉시 강조 + custom일 경우 date input 노출
          dashboardStore.fetchSummary(buildPeriodQuery(activePeriod, customRange));
          return;
        }
      };
      root?.addEventListener('click', clickHandler);

      // delegated change handler — Custom date input
      inputHandler = (e) => {
        const input = e.target.closest('[data-action="custom-date"]');
        if (!input) return;
        const side = input.dataset.side;
        if (side !== 'start' && side !== 'end') return;
        customRange = { ...customRange, [side]: input.value };
        if (activePeriod === 'custom') {
          dashboardStore.fetchSummary(buildPeriodQuery('custom', customRange));
        }
      };
      root?.addEventListener('change', inputHandler);

      dashboardStore.fetchSummary(buildPeriodQuery(activePeriod, customRange));
      // 실시간 갱신 — inventory_update 수신 시 lastParams로 fetchSummary 재호출 (debounce 300ms)
      dashboardStore.subscribeSocket();
    },

    destroy() {
      topItemsChart?.destroy();
      topItemsChart = null;
      unsubStore?.();
      unsubApp?.();
      unsubStore = unsubApp = null;
      const root = document.getElementById(ROOT_ID);
      if (root && clickHandler) root.removeEventListener('click',  clickHandler);
      if (root && inputHandler) root.removeEventListener('change', inputHandler);
      clickHandler = null;
      inputHandler = null;
      dashboardStore.unsubscribeSocket();
      dashboardStore.reset();
    },
  };
}

// 초기 customRange — 최근 10일 default (start = 9일 전, end = 오늘)
function initCustomRange() {
  const day = 24 * 60 * 60 * 1000;
  const now = new Date();
  return {
    start: toYmd(new Date(now.getTime() - 9 * day)),
    end:   toYmd(now),
  };
}

function toYmd(d) {
  const y  = d.getFullYear();
  const m  = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${dd}`;
}

// ─── period → query 변환 ─────────────────────────────────
// Backend dashboard.py: { start_date: datetime, end_date: datetime, compare_to: enum }
// /capacity, /validity-list는 기간 영향 없지만 무해한 query라 통일해서 보냄.
function buildPeriodQuery(period, customRange) {
  const day = 24 * 60 * 60 * 1000;
  const now = new Date();
  const t0  = new Date(now.getFullYear(), now.getMonth(), now.getDate());   // 오늘 00:00
  const t1  = new Date(t0.getTime() + day - 1);                             // 오늘 23:59:59.999

  let startDate, endDate, compareTo;
  switch (period) {
    case 'today':
      startDate = t0; endDate = t1; compareTo = 'prev_day';
      break;
    case '1w':
      startDate = new Date(t0.getTime() -  6 * day); endDate = t1; compareTo = 'prev_period';
      break;
    case '1m':
      startDate = new Date(t0.getTime() - 29 * day); endDate = t1; compareTo = 'prev_period';
      break;
    case 'custom':
      // 사용자가 date input으로 지정한 범위. 미지정 시 최근 10일.
      startDate = customRange?.start
        ? new Date(`${customRange.start}T00:00:00`)
        : new Date(t0.getTime() - 9 * day);
      endDate = customRange?.end
        ? new Date(`${customRange.end}T23:59:59.999`)
        : t1;
      compareTo = 'prev_period';
      break;
    default:
      return {};
  }
  return {
    start_date: startDate.toISOString(),
    end_date:   endDate.toISOString(),
    compare_to: compareTo,
  };
}

// ─── render ──────────────────────────────────────────────
function render(state, ctx) {
  const root = document.getElementById(ROOT_ID);
  if (!root) return;

  if (state.error) {
    root.innerHTML = renderError(state.error);
    return;
  }
  if (!state.data) {
    root.innerHTML = renderLoading();
    return;
  }

  const { inbound, outbound, validity, capacity, topItems, validityList } = state.data;

  root.innerHTML = `
    <header class="dashboard-header">
      <h1 class="h3 fw-bold mb-0">${escapeHtml(t('dashboard.title'))}</h1>
    </header>

    <div class="dashboard-controls">
      ${renderPeriodSelector(ctx.activePeriod, ctx.customRange)}
      <span class="dashboard-updated text-muted small">
        ${escapeHtml(t('header.updated'))} ${formatHM(state.receivedAt)}
      </span>
    </div>

    <div class="dashboard-kpi-row">
      ${renderInboundKpi(inbound)}
      ${renderOutboundKpi(outbound)}
      ${renderValidityKpi(validity)}
      ${renderCapacityKpi(capacity)}
    </div>

    <div class="dashboard-body">
      ${renderTopItemsCard(topItems, ctx.activeTopTab)}
      ${renderValidityListCard(validityList)}
      ${renderWatchlistCard(capacity)}
    </div>
  `;
}

// ─── Loading / Error ─────────────────────────────────────
function renderLoading() {
  return `
    <div class="dashboard-loading">
      <div class="spinner-border text-warning" role="status"></div>
      <span class="ms-2 text-muted">${escapeHtml(t('dashboard.loading'))}</span>
    </div>
  `;
}

function renderError(err) {
  return `
    <div class="alert alert-danger m-4" role="alert">
      <strong>${escapeHtml(t('dashboard.errorTitle'))}</strong>
      <div class="small mt-1">${escapeHtml(err?.message ?? t('dashboard.errorUnknown'))}</div>
    </div>
  `;
}

// ─── Period Selector ─────────────────────────────────────
const PERIOD_KEYS = ['today', '1w', '1m', 'custom'];

function renderPeriodSelector(active, customRange) {
  return `
    <div class="period-area">
      <div class="period-toggle" role="tablist" aria-label="${escapeHtml(t('dashboard.period.aria'))}">
        ${PERIOD_KEYS.map((key) => `
          <button type="button" role="tab"
                  data-action="period" data-period="${key}"
                  class="${active === key ? 'is-active' : ''}">${escapeHtml(t('dashboard.period.' + key))}</button>
        `).join('')}
      </div>
      ${active === 'custom' ? `
        <div class="period-custom-range">
          <input type="date" data-action="custom-date" data-side="start"
                 value="${customRange?.start ?? ''}"
                 max="${customRange?.end ?? ''}"
                 aria-label="${escapeHtml(t('dashboard.period.startAria'))}" />
          <span class="period-custom-sep">~</span>
          <input type="date" data-action="custom-date" data-side="end"
                 value="${customRange?.end ?? ''}"
                 min="${customRange?.start ?? ''}"
                 aria-label="${escapeHtml(t('dashboard.period.endAria'))}" />
        </div>
      ` : ''}
    </div>
  `;
}

// ─── KPI ─────────────────────────────────────────────────
function renderInboundKpi({ cases, units, changeRate }) {
  return movementKpi({ label: t('dashboard.kpi.inbound'), icon: 'download', cases, units, changeRate });
}

function renderOutboundKpi({ cases, units, changeRate }) {
  return movementKpi({ label: t('dashboard.kpi.outbound'), icon: 'upload', cases, units, changeRate });
}

function movementKpi({ label, icon, cases, units, changeRate }) {
  return `
    <div class="kpi-card">
      <div class="kpi-label">
        <span class="material-symbols-outlined kpi-icon">${icon}</span>
        <span>${escapeHtml(label)}</span>
      </div>
      <div class="kpi-big">
        <span class="kpi-big-number">${(cases ?? 0).toLocaleString()}</span>
        <span class="kpi-big-unit">${escapeHtml(t('dashboard.kpi.cases'))}</span>
        <span class="kpi-big-divider">/</span>
        <span class="kpi-big-number">${(units ?? 0).toLocaleString()}</span>
        <span class="kpi-big-unit">${escapeHtml(t('dashboard.kpi.units'))}</span>
      </div>
      ${renderTrend(changeRate ?? 0, t('dashboard.kpi.vsPrev'))}
    </div>
  `;
}

function renderValidityKpi({ totalRiskCount, baseDays, deltaCount }) {
  const risk  = totalRiskCount ?? 0;
  const days  = baseDays ?? 0;
  const delta = deltaCount ?? 0;
  return `
    <div class="kpi-card">
      <div class="kpi-label">
        <span class="material-symbols-outlined kpi-icon">schedule</span>
        <span>${escapeHtml(t('dashboard.kpi.validity'))}</span>
      </div>
      <div class="kpi-big">
        <span class="kpi-big-number">${risk.toLocaleString()}</span>
        <span class="kpi-big-unit">${escapeHtml(t('dashboard.kpi.items'))}</span>
      </div>
      <div class="kpi-trend kpi-trend-flat">
        <span>${escapeHtml(tf('dashboard.kpi.withinDays', { days }))}</span>
        ${delta !== 0 ? `
          <span class="kpi-trend-sep">·</span>
          <span class="material-symbols-outlined ${delta > 0 ? 'kpi-trend-down' : 'kpi-trend-up'}">${delta > 0 ? 'arrow_upward' : 'arrow_downward'}</span>
          <span class="${delta > 0 ? 'kpi-trend-down' : 'kpi-trend-up'}">${Math.abs(delta)}</span>
        ` : ''}
      </div>
    </div>
  `;
}

function renderCapacityKpi({ scopeSummary }) {
  const pct = Math.round(scopeSummary.standardCoverage * 100);
  return `
    <div class="kpi-card kpi-card-with-bar">
      <div class="kpi-label">
        <span class="material-symbols-outlined kpi-icon">inventory_2</span>
        <span>${escapeHtml(t('dashboard.kpi.capacity'))}</span>
      </div>
      <div class="kpi-big">
        <span class="kpi-big-number">${pct}%</span>
        <span class="kpi-big-unit">${escapeHtml(t('dashboard.kpi.vsStandard'))}</span>
      </div>
      <div class="kpi-trend kpi-trend-flat">
        <span>${escapeHtml(tf('dashboard.kpi.belowStandard', { count: scopeSummary.belowBaselineCount }))}</span>
      </div>
      <div class="kpi-capacity-bar">
        <div class="kpi-capacity-bar-fill" style="width: ${Math.min(pct, 100)}%"></div>
      </div>
    </div>
  `;
}

function renderTrend(rate, suffix) {
  const pct = Math.round(Math.abs(rate) * 100);
  let cls = 'kpi-trend-flat', icon = 'trending_flat';
  if (rate > 0) { cls = 'kpi-trend-up';   icon = 'arrow_upward'; }
  else if (rate < 0) { cls = 'kpi-trend-down'; icon = 'arrow_downward'; }
  return `
    <div class="kpi-trend ${cls}">
      <span class="material-symbols-outlined">${icon}</span>
      <span>${pct}% ${escapeHtml(suffix)}</span>
    </div>
  `;
}

// ─── Top Movement (toggle Inbound/Outbound) ─────────────
//   Phase 5.2: CSS 가로 막대 → Chart.js horizontal bar
//   - 정책 (2026-05-15 사용자 결정):
//     Q3: DHL yellow 단일. Q4: 막대 클릭 → SKU Detail navigate 유지.
//     Q5: 데이터 라벨은 인라인 커스텀 플러그인 (의존성 0)
//   - 토글 / 클릭 핸들러는 root delegated click handler가 그대로 처리. 차트는 canvas만 둠.
function renderTopItemsCard({ inbound, outbound }, activeTab) {
  return `
    <div class="dashboard-card dashboard-top-items">
      <div class="dashboard-card-header">
        <h2 class="h6 fw-bold mb-0">${escapeHtml(t('dashboard.topItems.title'))}</h2>
        <div class="top-items-toggle" role="tablist">
          <button type="button" role="tab"
                  data-action="top-tab" data-tab="inbound"
                  class="${activeTab === 'inbound' ? 'is-active' : ''}">${escapeHtml(t('dashboard.topItems.inbound'))}</button>
          <button type="button" role="tab"
                  data-action="top-tab" data-tab="outbound"
                  class="${activeTab === 'outbound' ? 'is-active' : ''}">${escapeHtml(t('dashboard.topItems.outbound'))}</button>
        </div>
      </div>
      <div class="top-items-chart-wrap" style="height: 260px;">
        <canvas id="${TOP_ITEMS_CHART_ID}"></canvas>
      </div>
    </div>
  `;
}

// Chart.js horizontal bar 데이터 생성. labels = SKU 표시명, dataset = quantity.
// activeTab에 따라 inbound / outbound 둘 중 하나 선택.
function buildTopItemsData(topItems, activeTab) {
  const rows = activeTab === 'outbound' ? topItems.outbound : topItems.inbound;
  return {
    labels: rows.map((r) => r.displayName),
    datasets: [{
      label: t(activeTab === 'outbound' ? 'dashboard.topItems.outbound' : 'dashboard.topItems.inbound'),
      data: rows.map((r) => r.quantity),
      backgroundColor: getDhlYellow(),
      hoverBackgroundColor: getDhlYellowHover(),
      borderRadius: 4,
      borderSkipped: false,
      // 막대 두께: Chart.js 기본 0.9에서 약 9% 축소 (사용자 피드백 2026-05-15)
      barPercentage: 0.82,
      // skuId를 raw 데이터에 보관 — onClick에서 navigate 시 사용
      _skuIds: rows.map((r) => r.skuId),
    }],
  };
}

function buildTopItemsOptions(topItems, activeTab) {
  return {
    indexAxis: 'y',         // 가로 막대
    maintainAspectRatio: false,
    responsive: true,
    layout: { padding: { right: 56 } },  // datalabel 자리 확보
    plugins: {
      legend:  { display: false },
      tooltip: {
        callbacks: {
          label: (ctx) => `${ctx.parsed.x.toLocaleString()} ${t('dashboard.topItems.units')}`,
        },
      },
      // 인라인 datalabel 플러그인 (의존성 0). 키는 plugin.id (`datalabelRight`)와 일치해야 함.
      datalabelRight: { enabled: true, unitsKey: 'dashboard.topItems.units' },
    },
    scales: {
      x: {
        beginAtZero: true,
        ticks:    { display: false },
        grid:     { display: false },
        border:   { display: false },
      },
      y: {
        ticks:    { autoSkip: false, font: { size: 12 } },
        grid:     { display: false },
        border:   { display: false },
      },
    },
    onClick: (_evt, elements, chart) => {
      if (!elements.length) return;
      const idx = elements[0].index;
      const dataset = chart.data.datasets?.[0];
      const skuId = dataset?._skuIds?.[idx];
      if (skuId) {
        window.location.hash = '#/inventory/sku-detail?id=' + encodeURIComponent(skuId);
      }
    },
    onHover: (evt, elements) => {
      const target = evt.native?.target;
      if (target) target.style.cursor = elements.length ? 'pointer' : 'default';
    },
  };
}

function getDhlYellow() {
  // Top Movement 막대 차트용 (큰 면적) — 다크에선 채도 -25 보정 (theming §6.3).
  // 작은 아이콘 액센트는 var(--accent-warning) 그대로 사용 (#ffcc00 brand 유지).
  return appStore.getState().theme === 'dark' ? '#caa83b' : '#ffcc00';
}

function getDhlYellowHover() {
  return appStore.getState().theme === 'dark' ? '#b59030' : '#e6b800';
}

// ─── Validity Top List (3-col simplified) ────────────────
function renderValidityListCard({ items }) {
  return `
    <div class="dashboard-card dashboard-validity">
      <div class="dashboard-card-header">
        <h2 class="h6 fw-bold mb-0">${escapeHtml(t('dashboard.validity.title'))}</h2>
        <a href="#/validity" class="small">${escapeHtml(t('dashboard.validity.viewMore'))}</a>
      </div>
      <table class="validity-table">
        <thead>
          <tr>
            <th>${escapeHtml(t('dashboard.validity.col.sku'))}</th>
            <th>${escapeHtml(t('dashboard.validity.col.location'))}</th>
            <th class="text-end">${escapeHtml(t('dashboard.validity.col.dday'))}</th>
          </tr>
        </thead>
        <tbody>
          ${items.map(validityRow).join('')}
        </tbody>
      </table>
    </div>
  `;
}

function validityRow(row) {
  return `
    <tr>
      <td class="fw-semibold">${escapeHtml(row.displayName)}</td>
      <td class="text-muted small">${escapeHtml(row.zoneName)} / ${escapeHtml(row.sectionName)}</td>
      <td class="text-end">${ddayPill(row.daysRemaining, row.status)}</td>
    </tr>
  `;
}

function ddayPill(days, status) {
  const cls =
    status === 'expired'  ? 'dday-expired'  :
    status === 'critical' ? 'dday-critical' :
    status === 'warning'  ? 'dday-warning'  :
                            'dday-normal';
  const label = days < 0 ? t('dashboard.validity.expired') : `D-${days}`;
  return `<span class="dday-pill ${cls}">${escapeHtml(label)}</span>`;
}

// ─── Stock Watchlist (3-col table) ───────────────────────
function renderWatchlistCard({ alertSummary, scopeSummary, topAttentionList }) {
  return `
    <div class="dashboard-card dashboard-watchlist">
      <div class="dashboard-card-header">
        <h2 class="h6 fw-bold mb-0">${escapeHtml(t('dashboard.watchlist.title'))}</h2>
        <a href="#/alerts?alertType=stock_shortage" class="small">${escapeHtml(t('dashboard.watchlist.viewAll'))}</a>
      </div>
      <div class="watchlist-summary">
        <span class="watchlist-summary-urgent">
          <span class="material-symbols-outlined">error</span>
          ${escapeHtml(tf('dashboard.watchlist.urgent', { count: alertSummary.urgentCount }))}
        </span>
        <span class="watchlist-summary-below">
          <span class="material-symbols-outlined">remove_circle</span>
          ${escapeHtml(tf('dashboard.watchlist.belowStandard', { count: scopeSummary.belowBaselineCount }))}
        </span>
      </div>
      <table class="watchlist-table">
        <thead>
          <tr>
            <th>${escapeHtml(t('dashboard.watchlist.col.sku'))}</th>
            <th class="text-end">${escapeHtml(t('dashboard.watchlist.col.shortage'))}</th>
            <th class="text-end">${escapeHtml(t('dashboard.watchlist.col.status'))}</th>
          </tr>
        </thead>
        <tbody>
          ${topAttentionList.map(watchlistRow).join('')}
        </tbody>
      </table>
    </div>
  `;
}

function watchlistRow(row) {
  const shortage = row.standardQty - row.currentQty;
  const statusKey = row.stockStatus.replace(/_/g, '-');
  // status label은 i18n inventory.status.* 사용 (한국어 토글 시 자동 번역)
  const statusText = t('inventory.status.' + row.stockStatus);
  return `
    <tr>
      <td class="fw-semibold">${escapeHtml(row.displayName)}</td>
      <td class="text-end watchlist-shortage">${shortage.toLocaleString()} ${escapeHtml(t('dashboard.watchlist.short'))}</td>
      <td class="text-end"><span class="badge bg-status-${statusKey}">${escapeHtml(statusText)}</span></td>
    </tr>
  `;
}

// ─── helpers ─────────────────────────────────────────────
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
