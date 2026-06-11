/**
 * Operational Stats mock — 07 Operational Stats
 * ─────────────────────────────────────────────────────────────
 * Backend snake_case 그대로 mirror. Frontend api 어댑터(N1)에서 camelCase 변환.
 *
 * 출처:
 *  - docs/project/04_api_endpoints.md (`/analytics/*` 6 endpoint)
 *  - docs/page_layout_outline.md §12 + Track 1 §66 정책
 *  - docs/wireframes/07_operational_stats.png
 *
 * 6 endpoint:
 *  - GET /analytics/stats              → Operational Signals (FEFO watch / inventory accuracy)
 *  - GET /analytics/kpi                → KPI Trend (Last 7 Days)
 *  - GET /analytics/outbound-frequency → Top Picked SKUs
 *  - GET /analytics/consumption        → SKU Consumption
 *  - GET /analytics/zone-access        → Zone Activity (CONFIRMED → frontend 비율 derive)
 *  - GET /analytics/events             → Recent Operational Events
 *
 * 정책:
 *  - period: today / 7d / 30d / month. mock은 period 무시 (단일 응답)
 *  - Confirm Rate는 frontend에서 confirmed_count / access_count로 derive
 *  - Track 1 §66: Total Picking / Total Replenishment KPI는 wireframe에 없으므로 미포함
 */

import { dn } from './_i18n.js';

const envelope = (data) => ({ success: true, data, message: null });

// ─── GET /analytics/stats ────────────────────────────────
// Operational Signals 카드 (top picked + FEFO watch) + inventory accuracy
export function mockAnalyticsStats(params = {}) {
  return envelope({
    period: params.period ?? 'today',
    fefo_watch: {
      compliance_rate: 0.964,
      violations:      12,
      latest_issue: {
        sku_id:    'SKU-2231',
        zone_id:   'zone-C',
        zone_name: 'Zone C',
      },
    },
    inventory_accuracy: 0.987,
    live_feed: true,           // wireframe LIVE FEED 배지 — Phase 6 socket 활성 시 갱신
  });
}

// ─── GET /analytics/kpi ──────────────────────────────────
// 최근 7일 일별 inventory_accuracy + fefo_compliance 두 line
export function mockAnalyticsKpi() {
  // 실 BE analytics_service.get_kpi 미러: trend[{date, inventory_accuracy, fefo_compliance}] + 최신값 스칼라
  const accuracy   = [0.982, 0.984, 0.983, 0.986, 0.987, 0.985, 0.984];
  const compliance = [0.952, 0.956, 0.961, 0.958, 0.964, 0.962, 0.960];
  const today = new Date();
  const trend = accuracy.map((acc, i) => {
    const d = new Date(today);
    d.setDate(today.getDate() - (6 - i));   // 6일 전 → 오늘
    return {
      date: d.toISOString().slice(0, 10),   // 'YYYY-MM-DD'
      inventory_accuracy: acc,
      fefo_compliance:    compliance[i],
    };
  });
  const latest = trend[trend.length - 1];

  return envelope({
    inventory_accuracy:  latest.inventory_accuracy,
    fefo_compliance:     latest.fefo_compliance,
    ocr_success_rate:    0.973,
    detection_accuracy:  0.961,
    false_positive_rate: 0.028,
    trend,
  });
}

// ─── GET /analytics/outbound-frequency ──────────────────
// Top Picked SKUs — Operational Signals 카드 좌측
export function mockAnalyticsOutboundFrequency(params = {}) {
  return envelope({
    period: params.period ?? 'today',
    items: [
      { sku_id: 'sku-aspirin-81',     display_name: dn('아스피린 81mg', 'Aspirin 81mg'), picks: 420, rank: 1 },
      { sku_id: 'sku-tylenol-es',     display_name: dn('타이레놀 ES', 'Tylenol Extra Strength'), picks: 385, rank: 2 },
      { sku_id: 'sku-cefixime',       display_name: dn('세픽심 시럽', 'Cefixime Oral Suspension'), picks: 312, rank: 3 },
      { sku_id: 'sku-ibuprofen-400',  display_name: dn('이부프로펜 400mg', 'Ibuprofen 400mg'), picks: 268, rank: 4 },
      { sku_id: 'sku-amoxicillin',    display_name: dn('아목시실린 250mg', 'Amoxicillin 250mg'), picks: 224, rank: 5 },
    ],
  });
}

// ─── GET /analytics/consumption ─────────────────────────
// SKU Consumption — 하단 좌측 카드
export function mockAnalyticsConsumption(params = {}) {
  return envelope({
    period: params.period ?? 'today',
    items: [
      { sku_id: 'sku-aspirin-81',     display_name: dn('아스피린 81mg', 'Aspirin 81mg'), consumed_units: 1240, rank: 1 },
      { sku_id: 'sku-tylenol-es',     display_name: dn('타이레놀 ES', 'Tylenol Extra Strength'), consumed_units: 980,  rank: 2 },
      { sku_id: 'sku-cefixime',       display_name: dn('세픽심 시럽', 'Cefixime Oral Suspension'), consumed_units: 760,  rank: 3 },
      { sku_id: 'sku-ibuprofen-400',  display_name: dn('이부프로펜 400mg', 'Ibuprofen 400mg'), consumed_units: 612,  rank: 4 },
      { sku_id: 'sku-amoxicillin',    display_name: dn('아목시실린 250mg', 'Amoxicillin 250mg'), consumed_units: 540,  rank: 5 },
    ],
  });
}

// ─── GET /analytics/zone-access ─────────────────────────
// Zone Activity — 하단 우측 카드. CONFIRMED 컬럼은 frontend가 비율 derive
export function mockAnalyticsZoneAccess(params = {}) {
  return envelope({
    period: params.period ?? 'today',
    items: [
      // Zone A: 2391 / 2410 = 99.21%
      { zone_id: 'zone-A', zone_name: 'Zone A (Fast Moving)', access_count: 2410, confirmed_count: 2391, avg_dwell_time_sec: 42 },
      { zone_id: 'zone-B', zone_name: 'Zone B',               access_count: 1820, confirmed_count: 1798, avg_dwell_time_sec: 38 },
      { zone_id: 'zone-C', zone_name: 'Zone C',               access_count: 1340, confirmed_count: 1289, avg_dwell_time_sec: 55 },
    ],
  });
}

// ─── GET /analytics/events ──────────────────────────────
// Recent Operational Events — wireframe에서 잘렸으나 layout outline §12 / spec에 있음
export function mockAnalyticsEvents(params = {}) {
  const iso = (minutesAgo) => new Date(Date.now() - minutesAgo * 60 * 1000).toISOString();
  return envelope({
    period: params.period ?? 'today',
    items: [
      { event_id: 'evt-1', event_type: 'fefo_violation', message: 'FEFO 위반 — Zone C / Aspirin 81mg', occurred_at: iso(15) },
      { event_id: 'evt-2', event_type: 'low_stock',      message: '재고 위험 — Zone B / Tylenol Extra Strength (12/50)', occurred_at: iso(45) },
      { event_id: 'evt-3', event_type: 'replenishment',  message: 'Replenishment 완료 — Zone A / sku-cefixime +200', occurred_at: iso(120) },
      { event_id: 'evt-4', event_type: 'picking',        message: 'Picking 완료 — Zone A / sku-aspirin-81 -45',  occurred_at: iso(180) },
      { event_id: 'evt-5', event_type: 'scan_failure',   message: 'OCR 인식 실패 — Zone C / slot-C2-04 재시도',    occurred_at: iso(240) },
    ],
  });
}
