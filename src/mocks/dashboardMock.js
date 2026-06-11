/**
 * Dashboard mock 응답 — 6개 endpoint
 * ─────────────────────────────────────────────────────────────
 * Backend snake_case 그대로 mirror. Frontend api 어댑터(N1 패턴)에서 camelCase 변환.
 *
 * 작성 기준 (단일 진실):
 *  - architecture/backend_dashboard_agreements.md (응답 schema 합의)
 *  - page_data_requirements.md §4 (필드 의미)
 *  - page_layout_outline.md §6 (UI 표시 위치)
 *  - metric_definitions.md (stockStatus 6단계, validity 4단계)
 *
 * 정책:
 *  - role/scope는 무시 (단일 응답).
 *  - **period는 반영** — start_date/end_date 차이를 multiplier로 사용해
 *    inbound/outbound/top-items의 누적 수량을 일자 비례로 변동시킴.
 *    (validity / capacity / validity-list는 snapshot 데이터라 period 무관 → 단일 응답 유지)
 *  - envelope에 meta 필드 없음 — frontend가 Date.now() 자체 기록 (M1, agreements §3.1).
 *  - 비율은 0~1 통일 (agreements §1).
 *  - dashboardApi.fetchSummary()가 6개 함수를 Promise.all로 합성.
 *
 * 명명 (실 backend 응답 검증 후 확정, 2026-05-08):
 *  - `cases` / `units` (snake) — `case_count` 아님
 *  - `change_rate` (음수 가능)
 *  - validity는 `total_risk_count`
 *  - validity-list row에 lot_id / batch_id / expiry_date 미포함
 *
 * mock 기준일: 2026-05-08 (today)
 *  - days_remaining 임계: <0 expired / 0~7 critical / 8~30 warning / 30+ normal
 */

import { dn } from './_i18n.js';

// ─── envelope 헬퍼 ───────────────────────────────────────
const envelope = (data) => ({ success: true, data, message: null });

// ─── period multiplier ──────────────────────────────────
// params.{start_date, end_date}로 일자 차이 계산 → 누적 수량 multiplier로 사용.
// dashboardApi가 ISO string으로 넘김. 둘 중 하나라도 없으면 1 (today 기본).
const DAY_MS = 24 * 60 * 60 * 1000;
function periodMultiplier(params) {
  if (!params?.start_date || !params?.end_date) return 1;
  const start = new Date(params.start_date);
  const end   = new Date(params.end_date);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) return 1;
  const days = Math.round((end - start) / DAY_MS) + 1;   // 양 끝 포함
  return Math.max(1, days);
}

// ─── /dashboard/inbound ──────────────────────────────────
// Inbound 카드: cases / units / change_rate
// 실 backend 응답 schema 검증 (2026-05-08): { cases, units, change_rate }
//   compare_to는 응답에 없음 (query param에만 존재)
//   누적 수량은 일자 multiplier 적용 → period별 변화 시각적 검증 가능
export function mockDashboardInbound(params) {
  const m = periodMultiplier(params);
  return envelope({
    cases:        124 * m,
    units:        1856 * m,
    change_rate:  0.12,            // +12% vs prev_period
  });
}

// ─── /dashboard/outbound ─────────────────────────────────
// Outbound 카드: 동일 schema (change_rate 음수 가능)
export function mockDashboardOutbound(params) {
  const m = periodMultiplier(params);
  return envelope({
    cases:        89 * m,
    units:        1234 * m,
    change_rate: -0.05,            // -5% vs prev_period
  });
}

// ─── /dashboard/validity ─────────────────────────────────
// Validity 카드: 임박/위험 batch 카운트
// 실 backend 응답 schema 검증 (2026-05-08):
//   { total_risk_count, critical_count, warning_count, delta_count, base_days }
//  - total_risk_count = critical + warning (expired 제외 정책 — 운영자 즉시 조치 대상 위주)
//  - base_days: alert_settings의 warning_days 임계값 (운영자가 06에서 조정)
export function mockDashboardValidity() {
  return envelope({
    total_risk_count: 14,
    critical_count:    4,
    warning_count:    10,
    delta_count:       3,
    base_days:        30,
  });
}

// ─── /dashboard/capacity ─────────────────────────────────
// Capacity 카드 + Stock Watchlist 카드 통합 응답 (agreements §2)
//  - scope_summary: Capacity KPI (standard_coverage, below_baseline_count)
//  - alert_summary: Watchlist 헤더 (urgent_count = out_of_stock + critical)
//  - top_attention_list: Watchlist row (정렬: stockStatus 위험도 → capacity_rate asc, 5개 제한)
//
// total_shortage_qty는 응답에 포함되지만 Dashboard Capacity 카드 기본 문구엔 안 씀
// (Operational Stats / SKU Detail에서 사용. data_requirements §4)
export function mockDashboardCapacity() {
  return envelope({
    scope_summary: {
      standard_coverage: 0.764,    // 76.4% vs standard
      below_baseline_count: 8,     // 8 SKUs below standard
      total_shortage_qty: 234,
    },
    alert_summary: {
      urgent_count: 3,             // out_of_stock(1) + critical(2)
    },
    top_attention_list: [
      // 정렬: out_of_stock → critical → warning, 위험도 동일 시 capacity_rate asc
      {
        sku_id: 'sku-007',
        display_name: dn('오메프라졸 20mg', 'Omeprazole 20mg'),
        stock_status: 'out_of_stock',
        current_qty: 0,
        standard_qty: 200,
        capacity_rate: 0.0,
        section_id: 2,
        section_name: 'Section A2',
        zone_id: 'zone-A',
        zone_name: 'Zone A',
      },
      {
        sku_id: 'sku-002',
        display_name: dn('타이레놀 500mg', 'Tylenol 500mg'),
        stock_status: 'critical',
        current_qty: 50,
        standard_qty: 500,
        capacity_rate: 0.10,
        section_id: 3,
        section_name: 'Section A3',
        zone_id: 'zone-A',
        zone_name: 'Zone A',
      },
      {
        sku_id: 'sku-004',
        display_name: dn('아목시실린 250mg', 'Amoxicillin 250mg'),
        stock_status: 'critical',
        current_qty: 30,
        standard_qty: 300,
        capacity_rate: 0.10,
        section_id: 1,
        section_name: 'Section A1',
        zone_id: 'zone-A',
        zone_name: 'Zone A',
      },
      {
        sku_id: 'sku-001',
        display_name: dn('아스피린 500mg', 'Aspirin 500mg'),
        stock_status: 'warning',
        current_qty: 118,
        standard_qty: 250,
        capacity_rate: 0.472,
        section_id: 1,
        section_name: 'Section A1',
        zone_id: 'zone-A',
        zone_name: 'Zone A',
      },
      {
        sku_id: 'sku-006',
        display_name: dn('세티리진 10mg', 'Cetirizine 10mg'),
        stock_status: 'warning',
        current_qty: 95,
        standard_qty: 200,
        capacity_rate: 0.475,
        section_id: 6,
        section_name: 'Section B2',
        zone_id: 'zone-B',
        zone_name: 'Zone B',
      },
    ],
  });
}

// ─── /dashboard/top-items ────────────────────────────────
// 단일 응답에 inbound + outbound 통합 (agreements §1)
//  - quantity: case 단위 (display_name은 agreements §1에서 sku_name → display_name으로 변경)
//  - 누적 수량이라 period multiplier 적용
export function mockDashboardTopItems(params) {
  const m = periodMultiplier(params);
  const scale = (rows) => rows.map((r) => ({ ...r, quantity: r.quantity * m }));
  return envelope({
    inbound: scale([
      { sku_id: 'sku-005', display_name: dn('비타민C 1000mg', 'Vitamin C 1000mg'), quantity: 156, rank: 1 },
      { sku_id: 'sku-001', display_name: dn('아스피린 500mg', 'Aspirin 500mg'),    quantity: 132, rank: 2 },
      { sku_id: 'sku-009', display_name: dn('메트포르민 500mg', 'Metformin 500mg'),  quantity:  98, rank: 3 },
      { sku_id: 'sku-002', display_name: dn('타이레놀 500mg', 'Tylenol 500mg'),    quantity:  87, rank: 4 },
      { sku_id: 'sku-008', display_name: dn('로라타딘 10mg', 'Loratadine 10mg'),  quantity:  65, rank: 5 },
    ]),
    outbound: scale([
      { sku_id: 'sku-001', display_name: dn('아스피린 500mg', 'Aspirin 500mg'),    quantity: 142, rank: 1 },
      { sku_id: 'sku-003', display_name: dn('이부프로펜 400mg', 'Ibuprofen 400mg'),  quantity: 118, rank: 2 },
      { sku_id: 'sku-002', display_name: dn('타이레놀 500mg', 'Tylenol 500mg'),    quantity:  96, rank: 3 },
      { sku_id: 'sku-009', display_name: dn('메트포르민 500mg', 'Metformin 500mg'),  quantity:  78, rank: 4 },
      { sku_id: 'sku-005', display_name: dn('비타민C 1000mg', 'Vitamin C 1000mg'), quantity:  52, rank: 5 },
    ]),
  });
}

// ─── /dashboard/validity-list ────────────────────────────
// Validity Top List row — SKU + Section + 만료 임박 단위
// 실 backend 응답 schema 검증 (2026-05-08):
//   row { sku_id, display_name, section_id/name, zone_id/name, days_remaining, batch_qty, status }
//  - lot_id / batch_id / expiry_date / validity_item_id 등은 응답에 포함 안 됨
//    (Phase 4 04 Validity Tracking 페이지의 row click 상세에서 별도 endpoint로 조회 예정)
//  - 정렬: days_remaining asc (expired 음수 우선 노출)
//  - status enum: expired / critical / warning / normal (4단계)
export function mockDashboardValidityList() {
  return envelope({
    items: [
      {
        sku_id:         'sku-006',
        display_name:   dn('세티리진 10mg', 'Cetirizine 10mg'),
        section_id:     6,
        section_name:   'Section B2',
        zone_id:        'zone-B',
        zone_name:      'Zone B',
        days_remaining: -4,
        batch_qty:      25,
        status:         'expired',
      },
      {
        sku_id:         'sku-007',
        display_name:   dn('오메프라졸 20mg', 'Omeprazole 20mg'),
        section_id:     2,
        section_name:   'Section A2',
        zone_id:        'zone-A',
        zone_name:      'Zone A',
        days_remaining: 4,
        batch_qty:      50,
        status:         'critical',
      },
      {
        sku_id:         'sku-002',
        display_name:   dn('타이레놀 500mg', 'Tylenol 500mg'),
        section_id:     3,
        section_name:   'Section A3',
        zone_id:        'zone-A',
        zone_name:      'Zone A',
        days_remaining: 7,
        batch_qty:      80,
        status:         'critical',
      },
      {
        sku_id:         'sku-001',
        display_name:   dn('아스피린 500mg', 'Aspirin 500mg'),
        section_id:     1,
        section_name:   'Section A1',
        zone_id:        'zone-A',
        zone_name:      'Zone A',
        days_remaining: 17,
        batch_qty:      118,
        status:         'warning',
      },
      {
        sku_id:         'sku-005',
        display_name:   dn('비타민C 1000mg', 'Vitamin C 1000mg'),
        section_id:     5,
        section_name:   'Section B1',
        zone_id:        'zone-B',
        zone_name:      'Zone B',
        days_remaining: 22,
        batch_qty:      95,
        status:         'warning',
      },
    ],
  });
}
