/**
 * OperationalStatsReportPage — 07-R 운영 통계 리포트 (P1+P2)
 * ─────────────────────────────────────────────────────────────
 * 설계: bk_agent §74 후속 / backend_analytics_report_request.md
 *
 * P1 정형 리포트 (결정형) + P2 선형회귀 예측. backend 신규 endpoint 0.
 *   - 데이터 = 기존 `fetchOperationalStatsSummary` (07 OpStats 와 동일 6 endpoint 합성)
 *   - 예측 = `fetchInventoryStockTrend(sku, '30d')` per Top consumption SKU → JS 선형회귀
 *   - 내보내기 = 브라우저 인쇄→PDF (`@media print`) / CSV blob 다운로드
 *
 * T3 (LLM 원인분석)은 별도 endpoint (`POST /analytics/report`, request 문서 발송 대상).
 *   현재 = gated stub — backend ship 시 `AI_REPORT_BACKEND_READY` 한 줄 true 로 활성.
 *
 * 진입: OpStats 헤더 [리포트 생성] → /operational-stats/report?period=...
 * 권한: ops_manager (route 가드)
 */

import { appStore } from '../../store/appStore.js';
import { t } from '../../core/i18n/index.js';
import { fetchOperationalStatsSummary } from '../../api/operationalStatsApi.js';
import { fetchInventoryStockTrend } from '../../api/inventoryApi.js';
import { linearRegression } from '../../utils/forecast.js';

const ROOT_ID = 'op-stats-report-root';
const PERIOD_VALUES = ['today', '7d', '30d', 'month'];
const FORECAST_TOP_N = 5;

// T3 LLM endpoint ship 시 true. 현재 gated stub.
const AI_REPORT_BACKEND_READY = false;

export default function OperationalStatsReportPage() {
  const state = {
    period:     '7d',
    isLoading:  true,
    error:      null,
    data:       null,         // { stats, kpi, outboundFrequency, consumption, zoneAccess, events }
    forecasts:  [],           // [{ skuId, displayName, current, dailyConsumption, daysToStockout, rSquared, note }]
    generatedAt: null,
    isDownloadingPdf: false,  // PDF 생성 중 버튼 disable 용
  };

  let unsubApp = null;
  let clickHandler = null;

  // PDF 다운로드 — html2pdf.js 를 동적 import 로 lazy 로드(초기 번들 무영향).
  async function downloadPdf() {
    if (state.isDownloadingPdf) return;

    // (1) 로딩 상태 → rerender (controls DOM 새로 만들어짐)
    state.isDownloadingPdf = true;
    rerender();

    // (2) rerender 된 *새* controls 엘리먼트를 잡아 DOM 에서 제거.
    //     `style.display='none'` 만으로는 html2canvas 클로닝 타이밍에 누락되는 케이스가
    //     있어 `.remove()` 가 더 확실. `finally` 의 rerender() 가 다시 만들어주므로 복원 X.
    const root = document.getElementById(ROOT_ID);
    if (!root) {
      state.isDownloadingPdf = false;
      rerender();
      return;
    }
    const controls = root.querySelector('.op-stats-report-controls');
    if (controls) controls.remove();
    // 다음 paint frame 대기 — layout 이 controls 빠진 상태로 settle 됐는지 보장
    await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));

    try {
      const mod = await import('html2pdf.js');
      const html2pdf = mod.default || mod;
      await html2pdf().set({
        margin:      [12, 12, 14, 12],   // mm — top, left, bottom, right
        filename:    buildDownloadName('.pdf'),
        image:       { type: 'jpeg', quality: 0.95 },
        html2canvas: { scale: 2, useCORS: true, backgroundColor: '#ffffff' },
        jsPDF:       { unit: 'mm', format: 'a4', orientation: 'portrait' },
        pagebreak:   { mode: ['css', 'legacy'] },
      }).from(root).save();
    } catch (err) {
      console.error('[opStatsReport] PDF download failed', err);
      window.alert(t('opStatsReport.pdfFailed') || 'PDF generation failed');
    } finally {
      // 최종 rerender 가 controls 를 다시 visible 상태로 재생성하므로
      //   여기서 display 복원은 불필요(어차피 새 DOM 으로 교체).
      state.isDownloadingPdf = false;
      rerender();
    }
  }

  function rerender() {
    const root = document.getElementById(ROOT_ID);
    if (!root) return;
    root.innerHTML = renderBody(state);
  }

  function readPeriodFromUrl() {
    const hash = window.location.hash || '';
    const qIdx = hash.indexOf('?');
    if (qIdx < 0) return '7d';
    const params = new URLSearchParams(hash.slice(qIdx + 1));
    const p = params.get('period');
    return PERIOD_VALUES.includes(p) ? p : '7d';
  }

  function setPeriodInUrl(p) {
    const base = (window.location.hash || '').split('?')[0] || '#/operational-stats/report';
    // history 한 칸 안 늘리고 교체 — period 토글이 뒤로가기 스택 더럽히지 않게
    history.replaceState(null, '', `${base}?period=${encodeURIComponent(p)}`);
  }

  async function load() {
    const startLang = appStore.getState().lang;   // race 차단(이 페이지는 store 안 거치고 컴포넌트 로컬 state 사용)
    state.isLoading = true;
    state.error = null;
    rerender();
    try {
      const summary = await fetchOperationalStatsSummary({ period: state.period });
      if (appStore.getState().lang !== startLang) return;   // lang 바뀜 → 응답 폐기
      state.data = summary;
      state.forecasts = await buildForecasts(summary);
      if (appStore.getState().lang !== startLang) return;   // forecasts 도 trend+display_name 의존 → 다시 체크
      state.generatedAt = Date.now();
    } catch (err) {
      state.error = err?.body?.message || err?.message || t('common.error');
    } finally {
      state.isLoading = false;
      rerender();
    }
  }

  return {
    html: `<section id="${ROOT_ID}" class="op-stats-report container py-4"></section>`,

    mount() {
      state.period = readPeriodFromUrl();

      // 인쇄/리포트 전용 스타일 — page 내부 inline 으로 두면 unmount 시 자연 제거
      const style = document.createElement('style');
      style.id = 'op-stats-report-style';
      style.textContent = REPORT_STYLE;
      document.head.appendChild(style);

      // lang 변경 시 UI 즉시 갱신 + BE 데이터(요약+예측) 새 Accept-Language 로 재요청
      unsubApp = appStore.subscribe(() => { rerender(); load(); });

      const root = document.getElementById(ROOT_ID);
      clickHandler = (e) => {
        const periodBtn = e.target.closest('[data-action="period"]');
        if (periodBtn) {
          const p = periodBtn.dataset.period;
          if (PERIOD_VALUES.includes(p) && p !== state.period) {
            state.period = p;
            setPeriodInUrl(p);
            load();
          }
          return;
        }
        const pdfBtn = e.target.closest('[data-action="export-pdf"]');
        if (pdfBtn) {
          downloadPdf();
          return;
        }
        const csvBtn = e.target.closest('[data-action="export-csv"]');
        if (csvBtn) {
          downloadCsv(state);
          return;
        }
      };
      root?.addEventListener('click', clickHandler);

      load();
    },

    destroy() {
      unsubApp?.();
      unsubApp = null;
      const root = document.getElementById(ROOT_ID);
      if (root && clickHandler) root.removeEventListener('click', clickHandler);
      clickHandler = null;
      document.getElementById('op-stats-report-style')?.remove();
    },
  };
}

// ─── 데이터 파생 ─────────────────────────────────────────

/**
 * Top consumption SKU 별 선형회귀 forecast.
 * - trend 는 항상 30d (단기 변동 흡수, 회귀 안정성)
 * - daily_consumption = -slope (음수 기울기 = 재고 감소)
 * - days_to_stockout = current / daily_consumption
 */
async function buildForecasts(summary) {
  const top = (summary.consumption?.items ?? []).slice(0, FORECAST_TOP_N);
  if (top.length === 0) return [];

  const results = await Promise.allSettled(
    top.map(async (item) => {
      const skuId = item.skuId || item.sku_id;
      const displayName = item.displayName || item.display_name || skuId;
      if (!skuId) return null;
      try {
        const res = await fetchInventoryStockTrend(skuId, '30d');
        const trend = res?.data?.items ?? [];
        if (trend.length < 3) {
          return {
            skuId, displayName,
            current: numOr(trend[trend.length - 1]?.qty, 0),
            dailyConsumption: 0, daysToStockout: null, rSquared: null,
            note: 'insufficient_data',
          };
        }
        const points = trend.map((p, i) => ({ x: i, y: numOr(p.qty, 0) }));
        const reg = linearRegression(points);
        const current = points[points.length - 1].y;
        const dailyConsumption = Math.max(0, -reg.slope);
        const daysToStockout = dailyConsumption > 0 ? current / dailyConsumption : null;
        return {
          skuId, displayName,
          current,
          dailyConsumption,
          daysToStockout,
          rSquared: reg.rSquared,
          note: dailyConsumption === 0 ? 'no_consumption' : null,
        };
      } catch {
        return { skuId, displayName, current: 0, dailyConsumption: 0, daysToStockout: null, rSquared: null, note: 'fetch_failed' };
      }
    }),
  );
  return results.filter((r) => r.status === 'fulfilled' && r.value).map((r) => r.value);
}

// linearRegression — 공용 헬퍼 `utils/forecast.js` 에서 import (SKU Detail 차트와 공유).

// ─── 렌더 ───────────────────────────────────────────────

function renderBody(state) {
  // 구조: controls (PDF 캡처 시 hide) → header (캡처 포함) → sections (캡처 포함)
  return `
    ${renderControls(state)}
    ${renderReportHeader(state)}
    ${
      state.error
        ? `<div class="alert alert-danger">${escapeHtml(state.error)}</div>`
        : state.isLoading
          ? renderLoading()
          : renderSections(state)
    }
  `;
}

function renderControls(state) {
  return `
    <div class="op-stats-report-controls d-flex flex-wrap align-items-center justify-content-between gap-2 mb-3">
      <a href="#/operational-stats" class="section-detail-back" data-action="back">
        <span class="material-symbols-outlined" aria-hidden="true">arrow_back</span>
        ${escapeHtml(t('opStatsReport.back'))}
      </a>
      <div class="d-flex flex-wrap align-items-center gap-2">
        <div class="op-stats-report-period btn-group btn-group-sm" role="group">
          ${PERIOD_VALUES.map((v) => `
            <button type="button"
                    class="btn ${v === state.period ? 'btn-warning' : 'btn-outline-secondary'}"
                    data-action="period" data-period="${v}">
              ${escapeHtml(t('opStats.period.' + v))}
            </button>
          `).join('')}
        </div>
        <button type="button" class="btn btn-sm btn-outline-dark"
                data-action="export-pdf"
                ${state.isDownloadingPdf ? 'disabled' : ''}>
          <span class="material-symbols-outlined align-middle me-1">picture_as_pdf</span>
          ${escapeHtml(state.isDownloadingPdf ? t('opStatsReport.downloadingPdf') : t('opStatsReport.exportPdf'))}
        </button>
        <button type="button" class="btn btn-sm btn-outline-dark" data-action="export-csv">
          <span class="material-symbols-outlined align-middle me-1">download</span>
          ${escapeHtml(t('opStatsReport.exportCsv'))}
        </button>
      </div>
    </div>
  `;
}

// PDF 캡처에 포함되는 헤더 (controls 바깥, header 안 — controls 는 캡처 시 hide 됨)
function renderReportHeader(state) {
  return `
    <header class="op-stats-report-header mb-3">
      <h1 class="h3 fw-bold mb-1">${escapeHtml(t('opStatsReport.title'))}</h1>
      <div class="text-muted small">
        ${escapeHtml(t('opStatsReport.period'))}:
        <strong>${escapeHtml(periodLabel(state.period))}</strong>
        ${
          state.generatedAt
            ? ` · ${escapeHtml(t('opStatsReport.generatedAt'))}: ${formatDateTime(state.generatedAt)}`
            : ''
        }
      </div>
    </header>
  `;
}

function renderLoading() {
  return `
    <div class="d-flex align-items-center justify-content-center py-5 text-muted">
      <div class="spinner-border text-warning me-2" role="status"></div>
      ${escapeHtml(t('opStatsReport.loading'))}
    </div>
  `;
}

function renderSections(state) {
  const d = state.data || {};
  return `
    ${renderKpiSection(d.kpi, d.stats)}
    ${renderZoneSection(d.zoneAccess)}
    ${renderConsumptionSection(d.consumption)}
    ${renderTopPickedSection(d.outboundFrequency)}
    ${renderForecastSection(state.forecasts)}
    ${renderEventsSection(d.events)}
    ${renderAiSection()}
  `;
}

// §1 핵심 지표
function renderKpiSection(kpi, stats) {
  const items = [
    { label: t('opStatsReport.kpi.inventoryAccuracy'), value: formatPercent(kpi?.inventoryAccuracy ?? stats?.inventoryAccuracy) },
    { label: t('opStatsReport.kpi.fefoCompliance'),    value: formatPercent(kpi?.fefoCompliance ?? stats?.fefoWatch?.complianceRate) },
    { label: t('opStatsReport.kpi.fefoViolations'),    value: numOr(stats?.fefoWatch?.violations, 0).toLocaleString() },
    { label: t('opStatsReport.kpi.ocrSuccess'),        value: formatPercent(kpi?.ocrSuccessRate) },
    { label: t('opStatsReport.kpi.detectionAccuracy'), value: formatPercent(kpi?.detectionAccuracy) },
  ];
  return sectionCard(t('opStatsReport.section.kpi'), `
    <div class="row g-2">
      ${items.map((it) => `
        <div class="col-6 col-md">
          <div class="border rounded p-2 h-100 text-center">
            <div class="text-muted small">${escapeHtml(it.label)}</div>
            <div class="fs-5 fw-bold">${escapeHtml(it.value)}</div>
          </div>
        </div>
      `).join('')}
    </div>
  `);
}

// §2 Zone 활동
function renderZoneSection(zoneAccess) {
  const items = zoneAccess?.items ?? [];
  if (items.length === 0) {
    return sectionCard(t('opStatsReport.section.zoneActivity'), `<div class="text-muted">${escapeHtml(t('opStatsReport.empty.zone'))}</div>`);
  }
  return sectionCard(t('opStatsReport.section.zoneActivity'), `
    <div class="table-responsive">
      <table class="table table-sm mb-0">
        <thead>
          <tr>
            <th>${escapeHtml(t('opStatsReport.col.zone'))}</th>
            <th class="text-end">${escapeHtml(t('opStatsReport.col.access'))}</th>
            <th class="text-end">${escapeHtml(t('opStatsReport.col.confirmed'))}</th>
            <th class="text-end">${escapeHtml(t('opStatsReport.col.confirmRate'))}</th>
            <th class="text-end">${escapeHtml(t('opStatsReport.col.avgDwell'))}</th>
          </tr>
        </thead>
        <tbody>
          ${items.map((z) => {
            const access = numOr(z.accessCount, 0);
            const confirmed = numOr(z.confirmedCount, 0);
            const rate = access > 0 ? confirmed / access : 0;
            return `
              <tr>
                <td>${escapeHtml(z.zoneName || z.zoneId || '—')}</td>
                <td class="text-end">${access.toLocaleString()}</td>
                <td class="text-end">${confirmed.toLocaleString()}</td>
                <td class="text-end">${formatPercent(rate)}</td>
                <td class="text-end">${formatDwell(z.avgDwellTimeSec)}</td>
              </tr>
            `;
          }).join('')}
        </tbody>
      </table>
    </div>
  `);
}

// §3 SKU 소비량
function renderConsumptionSection(consumption) {
  const items = consumption?.items ?? [];
  return rankList(
    t('opStatsReport.section.consumption'),
    items,
    (it) => numOr(it.consumedUnits, 0).toLocaleString() + ' ' + t('opStatsReport.units.units'),
    'opStatsReport.empty.consumption',
  );
}

// §4 출고 빈도 Top
function renderTopPickedSection(outboundFrequency) {
  const items = outboundFrequency?.items ?? [];
  return rankList(
    t('opStatsReport.section.topPicked'),
    items,
    (it) => numOr(it.picks, 0).toLocaleString() + ' ' + t('opStatsReport.units.picks'),
    'opStatsReport.empty.topPicked',
  );
}

function rankList(title, items, metricFn, emptyKey) {
  if (items.length === 0) {
    return sectionCard(title, `<div class="text-muted">${escapeHtml(t(emptyKey || 'opStatsReport.empty'))}</div>`);
  }
  return sectionCard(title, `
    <div class="table-responsive">
      <table class="table table-sm mb-0">
        <thead>
          <tr>
            <th style="width:3rem;" class="text-end">#</th>
            <th>${escapeHtml(t('opStatsReport.col.sku'))}</th>
            <th class="text-end">${escapeHtml(t('opStatsReport.col.metric'))}</th>
          </tr>
        </thead>
        <tbody>
          ${items.map((it, i) => `
            <tr>
              <td class="text-end text-muted">${numOr(it.rank, i + 1)}</td>
              <td>${escapeHtml(it.displayName || it.skuId || '—')}</td>
              <td class="text-end fw-semibold">${escapeHtml(metricFn(it))}</td>
            </tr>
          `).join('')}
        </tbody>
      </table>
    </div>
  `);
}

// §5 부족 예측 (T2 선형회귀)
function renderForecastSection(forecasts) {
  if (!forecasts || forecasts.length === 0) {
    return sectionCard(t('opStatsReport.section.forecast'), `<div class="text-muted">${escapeHtml(t('opStatsReport.empty.forecast'))}</div>`);
  }
  // 신뢰도(R²) 컬럼 제거 (BK 2026-05-20): 섹션 상단 disclaimer 가 이미 "추정치" 표시하고,
  //   안전장치(R²<0.3 등)로 불신할 행은 이미 거른 상태 → 행별 신뢰도 뱃지는 중복.
  //   `formatConfidence`/관련 i18n 키는 향후 부활 가능성 대비 dormant 유지.
  return sectionCard(t('opStatsReport.section.forecast'), `
    <p class="text-muted small mb-2">${escapeHtml(t('opStatsReport.forecast.note'))}</p>
    <div class="table-responsive">
      <table class="table table-sm mb-0">
        <thead>
          <tr>
            <th>${escapeHtml(t('opStatsReport.col.sku'))}</th>
            <th class="text-end">${escapeHtml(t('opStatsReport.col.currentQty'))}</th>
            <th class="text-end">${escapeHtml(t('opStatsReport.col.dailyConsumption'))}</th>
            <th class="text-end">${escapeHtml(t('opStatsReport.col.daysToStockout'))}</th>
          </tr>
        </thead>
        <tbody>
          ${forecasts.map((f) => `
            <tr>
              <td>${escapeHtml(f.displayName)}</td>
              <td class="text-end">${numOr(f.current, 0).toLocaleString()}</td>
              <td class="text-end">${
                f.note === 'no_consumption' || f.dailyConsumption === 0
                  ? `<span class="text-muted">${escapeHtml(t('opStatsReport.forecast.noConsumption'))}</span>`
                  : f.dailyConsumption.toFixed(2)
              }</td>
              <td class="text-end">${formatStockoutDays(f)}</td>
            </tr>
          `).join('')}
        </tbody>
      </table>
    </div>
  `);
}

// §6 최근 이벤트
function renderEventsSection(events) {
  const items = events?.items ?? [];
  if (items.length === 0) {
    return sectionCard(t('opStatsReport.section.events'), `<div class="text-muted">${escapeHtml(t('opStatsReport.empty.events'))}</div>`);
  }
  return sectionCard(t('opStatsReport.section.events'), `
    <div class="table-responsive">
      <table class="table table-sm mb-0">
        <thead>
          <tr>
            <th>${escapeHtml(t('opStatsReport.col.eventType'))}</th>
            <th>${escapeHtml(t('opStatsReport.col.message'))}</th>
            <th class="text-end" style="white-space:nowrap;">${escapeHtml(t('opStatsReport.col.time'))}</th>
          </tr>
        </thead>
        <tbody>
          ${items.map((e) => `
            <tr>
              <td><span class="badge bg-light text-dark border">${escapeHtml(e.eventType || '—')}</span></td>
              <td>${escapeHtml(e.message || '—')}</td>
              <td class="text-end text-muted small">${formatDateTime(e.occurredAt)}</td>
            </tr>
          `).join('')}
        </tbody>
      </table>
    </div>
  `);
}

// §7 AI 원인 분석 (gated stub)
function renderAiSection() {
  // backend 미ship — 섹션 자체 비표시 (자리·안내 박스 둘 다 안 그림. BK 결정 2026-05-20).
  //   post_mvp_backlog 추적 항목 참조. backend `POST /api/v1/analytics/report` ship 시
  //   AI_REPORT_BACKEND_READY=true 로 1줄 + 아래 fetch+narrative 렌더 채우면 즉시 활성.
  if (!AI_REPORT_BACKEND_READY) return '';
  // TODO(backend ship 후): fetch('/api/v1/analytics/report', {...}) → narrative 단락 렌더
  return sectionCard(t('opStatsReport.section.aiAnalysis'), `<div class="text-muted">${escapeHtml(t('opStatsReport.empty'))}</div>`);
}

function sectionCard(title, bodyHtml) {
  return `
    <section class="card mb-3 op-stats-report-section">
      <header class="card-header bg-white">
        <h2 class="h6 fw-bold mb-0">${escapeHtml(title)}</h2>
      </header>
      <div class="card-body">${bodyHtml}</div>
    </section>
  `;
}

// ─── CSV 내보내기 ───────────────────────────────────────

function downloadCsv(state) {
  const d = state.data || {};
  const rows = [];
  const pushSection = (title) => { rows.push([]); rows.push([`# ${title}`]); };

  pushSection(t('opStatsReport.section.kpi'));
  rows.push([t('opStatsReport.kpi.inventoryAccuracy'), formatPercent(d.kpi?.inventoryAccuracy ?? d.stats?.inventoryAccuracy)]);
  rows.push([t('opStatsReport.kpi.fefoCompliance'),    formatPercent(d.kpi?.fefoCompliance ?? d.stats?.fefoWatch?.complianceRate)]);
  rows.push([t('opStatsReport.kpi.fefoViolations'),    numOr(d.stats?.fefoWatch?.violations, 0)]);
  rows.push([t('opStatsReport.kpi.ocrSuccess'),        formatPercent(d.kpi?.ocrSuccessRate)]);
  rows.push([t('opStatsReport.kpi.detectionAccuracy'), formatPercent(d.kpi?.detectionAccuracy)]);

  pushSection(t('opStatsReport.section.zoneActivity'));
  rows.push([t('opStatsReport.col.zone'), t('opStatsReport.col.access'), t('opStatsReport.col.confirmed'), t('opStatsReport.col.confirmRate'), t('opStatsReport.col.avgDwell')]);
  (d.zoneAccess?.items ?? []).forEach((z) => {
    const access = numOr(z.accessCount, 0);
    const confirmed = numOr(z.confirmedCount, 0);
    const rate = access > 0 ? confirmed / access : 0;
    rows.push([z.zoneName || z.zoneId, access, confirmed, formatPercent(rate), formatDwell(z.avgDwellTimeSec)]);
  });

  pushSection(t('opStatsReport.section.consumption'));
  rows.push(['#', t('opStatsReport.col.sku'), t('opStatsReport.col.consumed')]);
  (d.consumption?.items ?? []).forEach((it, i) => {
    rows.push([numOr(it.rank, i + 1), it.displayName || it.skuId, numOr(it.consumedUnits, 0)]);
  });

  pushSection(t('opStatsReport.section.topPicked'));
  rows.push(['#', t('opStatsReport.col.sku'), t('opStatsReport.col.picks')]);
  (d.outboundFrequency?.items ?? []).forEach((it, i) => {
    rows.push([numOr(it.rank, i + 1), it.displayName || it.skuId, numOr(it.picks, 0)]);
  });

  pushSection(t('opStatsReport.section.forecast'));
  // 신뢰도(R²) 컬럼 제거 — 표 표시와 일치 (BK 2026-05-20)
  rows.push([t('opStatsReport.col.sku'), t('opStatsReport.col.currentQty'), t('opStatsReport.col.dailyConsumption'), t('opStatsReport.col.daysToStockout')]);
  (state.forecasts || []).forEach((f) => {
    rows.push([
      f.displayName,
      numOr(f.current, 0),
      f.dailyConsumption === 0 ? '—' : f.dailyConsumption.toFixed(2),
      f.daysToStockout == null ? '—' : f.daysToStockout.toFixed(1),
    ]);
  });

  pushSection(t('opStatsReport.section.events'));
  rows.push([t('opStatsReport.col.eventType'), t('opStatsReport.col.message'), t('opStatsReport.col.time')]);
  (d.events?.items ?? []).forEach((e) => {
    rows.push([e.eventType, e.message, formatDateTime(e.occurredAt)]);
  });

  const csv = '﻿' + rows.map((r) => r.map(csvCell).join(',')).join('\n');
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = buildDownloadName('.csv');
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

function csvCell(v) {
  const s = v == null ? '' : String(v);
  if (s.includes(',') || s.includes('"') || s.includes('\n')) {
    return `"${s.replace(/"/g, '""')}"`;
  }
  return s;
}

// ─── format helpers ─────────────────────────────────────

function numOr(v, fallback) {
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
}

function formatPercent(v) {
  const n = Number(v);
  if (!Number.isFinite(n)) return '—';
  // 분수(0~1.0)와 이미-퍼센트(>1, 실 backend 가 percent 로 반환하는 케이스) 양쪽 방어.
  //   mock=0.984 → 98.4% / real=98.5 → 98.5% (×100 두 번 방지)
  const pct = n <= 1.0001 ? n * 100 : n;
  return pct.toFixed(1) + '%';
}

function formatDwell(sec) {
  const n = Number(sec);
  if (!Number.isFinite(n)) return '—';
  if (n < 60) return `${Math.round(n)}s`;
  const m = Math.floor(n / 60);
  const s = Math.round(n - m * 60);
  return s === 0 ? `${m}m` : `${m}m ${s}s`;
}

function formatStockoutDays(f) {
  if (f.note === 'no_consumption' || f.dailyConsumption === 0) {
    return `<span class="text-muted">—</span>`;
  }
  if (f.daysToStockout == null) {
    return `<span class="text-muted">—</span>`;
  }
  const days = f.daysToStockout;
  const urgent = days < 7;
  return `<span class="${urgent ? 'text-danger fw-bold' : ''}">${days.toFixed(1)}d</span>`;
}

function formatConfidence(r2, note) {
  if (note === 'insufficient_data' || note === 'fetch_failed') {
    return `<span class="badge bg-light text-muted border">${escapeHtml(t('opStatsReport.forecast.insufficientData'))}</span>`;
  }
  if (r2 == null) return '—';
  const label =
    r2 >= 0.7 ? t('opStatsReport.forecast.confidenceHigh') :
    r2 >= 0.4 ? t('opStatsReport.forecast.confidenceMid')  :
                t('opStatsReport.forecast.confidenceLow');
  const cls =
    r2 >= 0.7 ? 'bg-success-subtle text-success-emphasis' :
    r2 >= 0.4 ? 'bg-warning-subtle text-warning-emphasis' :
                'bg-secondary-subtle text-secondary-emphasis';
  return `<span class="badge ${cls}" title="R²=${r2.toFixed(2)}">${escapeHtml(label)}</span>`;
}

function formatDateTime(v) {
  if (!v) return '—';
  const d = new Date(v);
  if (Number.isNaN(d.getTime())) return '—';
  const pad = (n) => (n < 10 ? '0' + n : '' + n);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function periodLabel(p) {
  const key = 'opStats.period.' + p;
  const v = t(key);
  return v === key ? p : v;
}

// 다운로드 파일명: "<기본명> <YYYY-MM-DD><확장자>"  (ko: "운영 통계 리포트 2026-05-20.pdf")
//   파일시스템에 안전하지 않은 문자(/ \ : * ? " < > |) 만 제거 — 공백·한글은 유지 (Chrome download attr 는 Unicode OK).
function buildDownloadName(ext) {
  const baseKey = 'opStatsReport.fileBaseName';
  let base = t(baseKey);
  if (base === baseKey) base = 'Operational Stats Report';
  base = base.replace(/[\\/:*?"<>|]/g, '').trim();
  const dateStr = new Date().toISOString().slice(0, 10);
  return `${base} ${dateStr}${ext}`;
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

// ─── 인쇄 / 리포트 전용 CSS ─────────────────────────────

const REPORT_STYLE = `
  .op-stats-report .card-header { border-bottom: 1px solid var(--border-subtle); }
  .op-stats-report-section table { font-size: 0.92rem; }

  @media print {
    /* 전역 chrome 숨김 — 실제 ID: #aura-sidebar / #aura-topbar (코드 확인) + 토스트·알림센터 */
    #aura-sidebar, #aura-topbar,
    .aura-toast-container, .alert-center,
    .op-stats-report-controls { display: none !important; }

    /* layout 컨테이너가 사이드바 폭만큼 margin/grid 잡고 있으면 풀어서 리포트가 페이지 전체 차지 */
    body, html { background: #fff !important; margin: 0 !important; padding: 0 !important; }
    body * { visibility: visible; }
    .container, .container-fluid { max-width: 100% !important; padding: 0 !important; margin: 0 !important; }
    main, .app-main, .main-content { margin: 0 !important; padding: 0 !important; width: 100% !important; max-width: 100% !important; }

    .card { box-shadow: none !important; border-color: #ddd !important; page-break-inside: avoid; }
    a { color: inherit !important; text-decoration: none !important; }
    @page { size: A4; margin: 14mm; }
  }
`;
