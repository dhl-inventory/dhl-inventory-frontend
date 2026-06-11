/**
 * Validity mock 응답 — 04 Validity Tracking
 * ─────────────────────────────────────────────────────────────
 * Backend snake_case 그대로 mirror. Frontend api 어댑터(N1)에서 camelCase 변환.
 *
 * Schema 출처:
 *  - docs/project/04_api_endpoints.md `/expiry/batches`
 *  - docs/page_layout_outline.md §9 (04 Validity Tracking)
 *  - docs/wireframes/04_validity_tracking.png
 *
 * status threshold (api_endpoints §):
 *  - expired:         days_remaining <= 0
 *  - critical:        0 < days_remaining <= 7
 *  - warning:         7 < days_remaining <= 30
 *  - normal:          days_remaining > 30
 *
 * 정책 정합:
 *  - SKU + Lot/Batch + Expiry Date 단위 row (같은 SKU도 batch 다르면 다른 row)
 *  - 기본 정렬 expiry_date asc (만료 임박 우선)
 *  - inventoryMock.js의 SKU_MASTER와 sku_id / display_name 정합
 *  - fefo_violation 신호는 boolean 필드로 separate (status enum과 별도 축)
 */

import { dn, koName } from './_i18n.js';

const envelope = (data) => ({ success: true, data, message: null });

// 오늘 기준 N일 후 ISO date — mock 시각 생성용
function dateInDays(n) {
  const d = new Date();
  d.setUTCHours(0, 0, 0, 0);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10); // YYYY-MM-DD
}

function deriveStatus(daysRemaining) {
  if (daysRemaining <= 0)  return 'expired';
  if (daysRemaining <= 7)  return 'critical';
  if (daysRemaining <= 30) return 'warning';
  return 'normal';
}

// ─── mock master (12 batches — 다양한 status 분포) ───────
const BATCH_MASTER_RAW = [
  // expired 1건
  { batch_id: 'A250320', sku_id: 'sku-001', display_name: 'Aspirin 500mg',     qty: 5,   days: -5, zone_id: 'zone-A', zone_name: 'Zone A', section_id: 1, section_name: 'Section A1' },
  // critical 3건 (1~7 days)
  { batch_id: 'V250508', sku_id: 'sku-005', display_name: 'Vitamin C 1000mg',  qty: 12,  days: 5,  zone_id: 'zone-B', zone_name: 'Zone B', section_id: 5, section_name: 'Section B1', fefo_violation: false },
  { batch_id: 'T250510', sku_id: 'sku-002', display_name: 'Tylenol 500mg',     qty: 8,   days: 7,  zone_id: 'zone-A', zone_name: 'Zone A', section_id: 1, section_name: 'Section A1' },
  { batch_id: 'I250410', sku_id: 'sku-003', display_name: 'Ibuprofen 200mg',   qty: 22,  days: 2,  zone_id: 'zone-B', zone_name: 'Zone B', section_id: 5, section_name: 'Section B1', fefo_violation: true },
  // warning 6건 (8~30 days)
  { batch_id: 'M250501', sku_id: 'sku-009', display_name: 'Metformin 500mg',   qty: 40,  days: 18, zone_id: 'zone-C', zone_name: 'Zone C', section_id: 8, section_name: 'Section C1' },
  { batch_id: 'A250425', sku_id: 'sku-001', display_name: 'Aspirin 500mg',     qty: 22,  days: 22, zone_id: 'zone-A', zone_name: 'Zone A', section_id: 1, section_name: 'Section A1' },
  { batch_id: 'C250515', sku_id: 'sku-006', display_name: 'Cetirizine 10mg',   qty: 30,  days: 15, zone_id: 'zone-B', zone_name: 'Zone B', section_id: 6, section_name: 'Section B2' },
  { batch_id: 'O250520', sku_id: 'sku-007', display_name: 'Omeprazole 20mg',   qty: 35,  days: 25, zone_id: 'zone-A', zone_name: 'Zone A', section_id: 2, section_name: 'Section A2' },
  { batch_id: 'L250425', sku_id: 'sku-008', display_name: 'Loratadine 10mg',   qty: 100, days: 28, zone_id: 'zone-C', zone_name: 'Zone C', section_id: 8, section_name: 'Section C1' },
  { batch_id: 'S250428', sku_id: 'sku-012', display_name: 'Simvastatin 40mg',  qty: 45,  days: 12, zone_id: 'zone-B', zone_name: 'Zone B', section_id: 6, section_name: 'Section B2', fefo_violation: true },
  // normal 2건 (>30 days)
  { batch_id: 'L250601', sku_id: 'sku-011', display_name: 'Lisinopril 10mg',   qty: 60,  days: 75, zone_id: 'zone-A', zone_name: 'Zone A', section_id: 3, section_name: 'Section A3' },
  { batch_id: 'V250610', sku_id: 'sku-010', display_name: 'Vitamin D 1000IU',  qty: 80,  days: 90, zone_id: 'zone-C', zone_name: 'Zone C', section_id: 9, section_name: 'Section C2' },
];

const BATCH_MASTER = BATCH_MASTER_RAW.map((b) => {
  const status = deriveStatus(b.days);
  return {
    batch_id:        b.batch_id,
    sku_id:          b.sku_id,
    display_name:    b.display_name,
    qty:             b.qty,
    expiry_date:     dateInDays(b.days),
    days_remaining:  b.days,
    zone_id:         b.zone_id,
    zone_name:       b.zone_name,
    section_id:      b.section_id,
    section_name:    b.section_name,
    status,
    fefo_violation:  Boolean(b.fefo_violation),
    // 상세 modal 표시용 (Post-MVP 정합)
    read_method:     b.fefo_violation ? 'ocr' : 'barcode',
    scan_id:         `scan-${b.batch_id}`,
  };
});

// ─── /expiry/batches — 실 BE expiry_service.get_batches 미러 ─
//   응답 = { items: ExpiryBatchItem[], total_count }
//   ExpiryBatchItem = { sku_id, sku_name, section_id, batch_id, expiry_date, days_remaining, qty, status, is_priority }
//   counts 는 /expiry/risk-items 로 분리 (mockExpiryRiskItems 아래). zone/section명·fefo_violation 은 BE 미반환.
//   params: zone_id, sku_id, status(단일 Literal), sort='expiry_asc'|'expiry_desc', page, limit
export function mockValidityBatches(params = {}) {
  let items = BATCH_MASTER.map((b) => ({
    sku_id:         b.sku_id,
    sku_name:       dn(koName(b.sku_id) ?? b.display_name, b.display_name),  // 실 BE 가 sku_name 키로 줌 (ko/en 분기)
    section_id:     b.section_id,
    batch_id:       b.batch_id,
    expiry_date:    b.expiry_date,
    days_remaining: b.days_remaining,
    qty:            b.qty,
    status:         b.status,
    is_priority:    false,              // BE 는 첫 lot 만 true; mock 은 단순화
  }));

  // 필터 — 실 BE 가 받는 것만 (zone_id, sku_id, status 단일 정확일치)
  if (params.sku_id)  items = items.filter((b) => b.sku_id === params.sku_id);
  if (params.zone_id) {
    // BATCH_MASTER 의 zone_id 매핑 사용 (응답 item 에는 zone_id 미포함이지만 필터는 가능)
    const allowed = new Set(BATCH_MASTER.filter((b) => b.zone_id === params.zone_id).map((b) => b.batch_id));
    items = items.filter((b) => allowed.has(b.batch_id));
  }
  if (params.status)  items = items.filter((b) => b.status === params.status);

  // 정렬 — 실 BE: sort = expiry_asc | expiry_desc (그 외 미지원)
  const sort = params.sort || 'expiry_asc';
  items.sort((a, b) => {
    const cmp = a.expiry_date < b.expiry_date ? -1 : a.expiry_date > b.expiry_date ? 1 : 0;
    return sort === 'expiry_desc' ? -cmp : cmp;
  });

  const total_count = items.length;
  const page  = Number(params.page)  || 1;
  const limit = Number(params.limit) || 10;
  const start = (page - 1) * limit;
  const paged = items.slice(start, start + limit);

  return envelope({ items: paged, total_count });
}

// ─── /expiry/risk-items — 실 BE expiry_service.get_risk_items 미러 ─
//   응답 = { summary: { expired_count, critical_count, warning_count, normal_count }, items: [...] }
//   chip 4종 카운트 전용. 마운트/scope 변경 시 1회만 호출.
export function mockExpiryRiskItems(params = {}) {
  const pool = params.zone_id
    ? BATCH_MASTER.filter((b) => b.zone_id === params.zone_id)
    : BATCH_MASTER;
  const summary = {
    expired_count:  pool.filter((b) => b.status === 'expired').length,
    critical_count: pool.filter((b) => b.status === 'critical').length,
    warning_count:  pool.filter((b) => b.status === 'warning').length,
    normal_count:   pool.filter((b) => b.status === 'normal').length,
  };
  return envelope({ summary, items: [] });   // items 는 chip 용도엔 안 쓰지만 BE 가 같이 줌
}
