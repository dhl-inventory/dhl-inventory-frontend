/**
 * Inventory mock 응답 — 02 SKU 페이지군 (List / Detail / Refill)
 * ─────────────────────────────────────────────────────────────
 * Backend snake_case 그대로 mirror. Frontend api 어댑터(N1 패턴)에서 camelCase 변환.
 *
 * 작성 기준 (단일 진실):
 *  - architecture/api_feedback/backend_inventory_request.md (백엔드 합의 후 갱신 예정 schema)
 *  - page_data_requirements.md §5 (필요 데이터 카탈로그)
 *  - page_layout_outline.md §7 (UI 블록)
 *  - metric_definitions.md §5 (6단계 stockStatus)
 *
 * 정책:
 *  - role/scope는 무시 (단일 응답).
 *  - mock schema는 backend_inventory_request 합의 후의 **목표 schema**를 따름:
 *    · `display_name` (`sku_name` 아님)
 *    · `standard_qty` (`capacity` alias 아님)
 *    · `stock_status` enum 6단계 (frontend mock에서 derive)
 *    · `capacity_rate` (frontend mock에서 derive)
 *    · `section_id`, `section_name`, `zone_id`, `zone_name` denormalize
 *    · `target_shortage_qty` (= standard_qty - current_qty) — 본 단계 화면 미표시지만 schema엔 포함
 *  - backend가 합의 후 차이 발견 시 5-10줄 패치로 흡수 (Phase 3 schema mismatch 패턴)
 *  - mock 단계는 단일 응답 (period 없음, 실시간 갱신 없음).
 *
 * 대상 endpoint:
 *  · GET /inventory/stock           — 목록 (filter / sort / pagination)
 *  · GET /inventory/stock/{sku_id}  — 단건 (신설 요청 §3.3, mock에서 simulate)
 */

import { dn, koName, localizeRow } from './_i18n.js';

// ─── envelope 헬퍼 ───────────────────────────────────────
const envelope = (data) => ({ success: true, data, message: null });

// ─── 6단계 stockStatus derive (metric_definitions §5) ────
function deriveStockStatus(currentQty, standardQty) {
  if (currentQty === 0) return 'out_of_stock';
  if (standardQty <= 0) return 'normal';
  const rate = currentQty / standardQty;
  if (rate < 0.20) return 'critical';
  if (rate < 0.70) return 'warning';
  if (rate < 0.95) return 'watch';
  if (rate <= 1.05) return 'normal';
  return 'overstock';
}

// ─── SKU 마스터 데이터 (의약품 도메인, Dashboard mock과 일관성) ──
//   12 SKU + 6단계 stockStatus 모두 노출되도록 시나리오 설계
const SKU_MASTER = [
  // out_of_stock 1건
  {
    sku_id: 'sku-004', display_name: 'Amoxicillin 250mg',
    category: 'Antibiotic', supplier: 'KPharm', uom: 'capsules',
    current_qty: 0, standard_qty: 30, safety_stock: 6,
    monthly_consumption: 18, fefo_status: 'compliant',
    section_id: 2, section_name: 'Section A2', zone_id: 'zone-A', zone_name: 'Zone A',
    last_updated_at: '2026-05-09T13:42:00Z',
  },
  // critical 2건 (rate < 0.20)
  {
    sku_id: 'sku-002', display_name: 'Tylenol 500mg',
    category: 'Analgesic', supplier: 'JN-Med', uom: 'tablets',
    current_qty: 2, standard_qty: 20, safety_stock: 5,
    monthly_consumption: 12, fefo_status: 'compliant',
    section_id: 1, section_name: 'Section A1', zone_id: 'zone-A', zone_name: 'Zone A',
    last_updated_at: '2026-05-09T13:50:00Z',
  },
  {
    sku_id: 'sku-012', display_name: 'Simvastatin 40mg',
    category: 'Lipid-lowering', supplier: 'KPharm', uom: 'tablets',
    current_qty: 4, standard_qty: 25, safety_stock: 6,
    monthly_consumption: 15, fefo_status: 'compliant',
    section_id: 6, section_name: 'Section B2', zone_id: 'zone-B', zone_name: 'Zone B',
    last_updated_at: '2026-05-09T11:20:00Z',
  },
  // warning 4건 (0.20 ≤ rate < 0.70)
  {
    sku_id: 'sku-007', display_name: 'Omeprazole 20mg',
    category: 'Antacid', supplier: 'KPharm', uom: 'capsules',
    current_qty: 15, standard_qty: 50, safety_stock: 10,
    monthly_consumption: 22, fefo_status: 'compliant',
    section_id: 2, section_name: 'Section A2', zone_id: 'zone-A', zone_name: 'Zone A',
    last_updated_at: '2026-05-09T12:35:00Z',
  },
  {
    sku_id: 'sku-011', display_name: 'Lisinopril 10mg',
    category: 'Antihypertensive', supplier: 'JN-Med', uom: 'tablets',
    current_qty: 8, standard_qty: 20, safety_stock: 5,
    monthly_consumption: 10, fefo_status: 'compliant',
    section_id: 3, section_name: 'Section A3', zone_id: 'zone-A', zone_name: 'Zone A',
    last_updated_at: '2026-05-09T10:15:00Z',
  },
  {
    sku_id: 'sku-003', display_name: 'Ibuprofen 200mg',
    category: 'NSAID', supplier: 'JN-Med', uom: 'tablets',
    current_qty: 10, standard_qty: 20, safety_stock: 5,
    monthly_consumption: 14, fefo_status: 'compliant',
    section_id: 5, section_name: 'Section B1', zone_id: 'zone-B', zone_name: 'Zone B',
    last_updated_at: '2026-05-09T09:50:00Z',
  },
  {
    sku_id: 'sku-001', display_name: 'Aspirin 500mg',
    category: 'Analgesic', supplier: 'KPharm', uom: 'tablets',
    current_qty: 13, standard_qty: 20, safety_stock: 5,
    monthly_consumption: 11, fefo_status: 'compliant',
    section_id: 1, section_name: 'Section A1', zone_id: 'zone-A', zone_name: 'Zone A',
    last_updated_at: '2026-05-09T13:55:00Z',
  },
  // watch 2건 (0.70 ≤ rate < 0.95)
  {
    sku_id: 'sku-005', display_name: 'Vitamin C 1000mg',
    category: 'Vitamin', supplier: 'KPharm', uom: 'tablets',
    current_qty: 18, standard_qty: 25, safety_stock: 5,
    monthly_consumption: 8, fefo_status: 'compliant',
    section_id: 5, section_name: 'Section B1', zone_id: 'zone-B', zone_name: 'Zone B',
    last_updated_at: '2026-05-09T11:00:00Z',
  },
  {
    sku_id: 'sku-009', display_name: 'Metformin 500mg',
    category: 'Antidiabetic', supplier: 'JN-Med', uom: 'tablets',
    current_qty: 35, standard_qty: 40, safety_stock: 8,
    monthly_consumption: 20, fefo_status: 'compliant',
    section_id: 8, section_name: 'Section C1', zone_id: 'zone-C', zone_name: 'Zone C',
    last_updated_at: '2026-05-09T08:30:00Z',
  },
  // normal 2건 (0.95 ≤ rate ≤ 1.05)
  {
    sku_id: 'sku-006', display_name: 'Cetirizine 10mg',
    category: 'Antihistamine', supplier: 'JN-Med', uom: 'tablets',
    current_qty: 24, standard_qty: 25, safety_stock: 5,
    monthly_consumption: 13, fefo_status: 'compliant',
    section_id: 6, section_name: 'Section B2', zone_id: 'zone-B', zone_name: 'Zone B',
    last_updated_at: '2026-05-09T12:10:00Z',
  },
  {
    sku_id: 'sku-010', display_name: 'Atorvastatin 20mg',
    category: 'Lipid-lowering', supplier: 'KPharm', uom: 'tablets',
    current_qty: 22, standard_qty: 22, safety_stock: 4,
    monthly_consumption: 16, fefo_status: 'compliant',
    section_id: 3, section_name: 'Section A3', zone_id: 'zone-A', zone_name: 'Zone A',
    last_updated_at: '2026-05-09T10:42:00Z',
  },
  // overstock 1건 (rate > 1.05)
  {
    sku_id: 'sku-008', display_name: 'Loratadine 10mg',
    category: 'Antihistamine', supplier: 'KPharm', uom: 'tablets',
    current_qty: 30, standard_qty: 28, safety_stock: 5,
    monthly_consumption: 9, fefo_status: 'compliant',
    section_id: 8, section_name: 'Section C1', zone_id: 'zone-C', zone_name: 'Zone C',
    last_updated_at: '2026-05-09T09:00:00Z',
  },
];

// display_name 은 _i18n.js localizeRow 로 ko/en 분기 (B안 2026-05-20). category / uom 은
// 현재 영어 단일 — KO 모드에서도 영어 표시. backend는 Accept-Language 헤더로
// sku_name_en vs sku_name 분기 (inventory_service.py:657 _resolve_display_name).

// ─── row enrich — derived 필드 추가 ─────────────────────
function enrichRow(raw) {
  const cap = raw.standard_qty > 0 ? raw.current_qty / raw.standard_qty : 0;
  return {
    ...raw,
    capacity_rate: Math.round(cap * 1000) / 1000,                        // 0~1+ (소수 3자리)
    stock_status: deriveStockStatus(raw.current_qty, raw.standard_qty),  // 6단계 enum
    target_shortage_qty: Math.max(0, raw.standard_qty - raw.current_qty), // 목표 부족량
  };
}

// ─── /inventory/stock ────────────────────────────────────
// 목록 + filter / sort / pagination 시뮬레이트
//   query: search, status, sort_by, order, zone_id, section_id, page, limit
export function mockInventoryStock(params = {}) {
  let items = SKU_MASTER.map(enrichRow).map(localizeRow);

  // search filter (sku_id 또는 display_name 부분 일치)
  if (params.search) {
    const q = String(params.search).toLowerCase();
    items = items.filter(
      (r) =>
        r.sku_id.toLowerCase().includes(q) ||
        r.display_name.toLowerCase().includes(q),
    );
  }

  // status filter (csv 또는 단일)
  if (params.status) {
    const statuses = String(params.status).split(',').map((s) => s.trim());
    items = items.filter((r) => statuses.includes(r.stock_status));
  }

  // zone / section filter
  if (params.zone_id)    items = items.filter((r) => r.zone_id === params.zone_id);
  if (params.section_id) {
    // ADR-028 INT 통일. string 들어와도 안전하게 비교 (pending §2.48)
    const sid = Number(params.section_id);
    items = items.filter((r) => r.section_id === sid);
  }

  // sort (default: capacity_rate asc — 위험도 높은 SKU 우선)
  const sortBy = params.sort_by || 'capacity_rate';
  const order  = params.order   || 'asc';
  items.sort((a, b) => {
    const av = a[sortBy];
    const bv = b[sortBy];
    if (av === bv) return 0;
    const cmp = av < bv ? -1 : 1;
    return order === 'desc' ? -cmp : cmp;
  });

  const total_count = items.length;

  // pagination (default page=1, limit=10)
  const page  = Number(params.page)  || 1;
  const limit = Number(params.limit) || 10;
  const start = (page - 1) * limit;
  const paged = items.slice(start, start + limit);

  return envelope({
    total_count,
    page,
    limit,
    items: paged,
  });
}

// ─── /inventory/stock/{sku_id} ──────────────────────────
// 단건 SKU 상세 (신설 요청 §3.3 — backend 합의 후 활성)
//   응답에 SKU 메타 추가 필드 (category / supplier / uom)
export function mockInventoryStockDetail(skuId) {
  const raw = SKU_MASTER.find((r) => r.sku_id === skuId);
  if (!raw) {
    return { success: false, data: null, message: `SKU not found: ${skuId}` };
  }
  return envelope({
    ...localizeRow(enrichRow(raw)),
    location_label: `${raw.zone_name} / ${raw.section_name}`,
  });
}

// ─── GET /inventory/stock/{sku_id}/trend ────────────────
// 02-2 SKU Detail Stock Trend chart (Phase 5.4)
//   backend §3.5 응답 schema: { sku_id, period, items: [{date, qty, inbound_qty, outbound_qty}] }
//   period: '7d' (7개 점) | '30d' (30개 점)
//   합성 패턴: seed_qty + 일별 inbound/outbound 변동 (현실적인 곡선)
export function mockInventoryStockTrend(skuId, period = '7d') {
  const raw = SKU_MASTER.find((r) => r.sku_id === skuId);
  if (!raw) {
    return { success: false, data: null, message: `SKU not found: ${skuId}` };
  }
  const days = period === '30d' ? 30 : 7;
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  // SKU별 결정적 합성 (skuId 해시로 seed) — 새로고침해도 같은 곡선
  const seed = hashCode(skuId);
  const rand = mulberry32(seed);

  const items = [];
  let qty = Math.max(raw.current_qty - Math.round(rand() * (raw.current_qty * 0.3)), 0);

  for (let i = days - 1; i >= 0; i -= 1) {
    const d = new Date(today.getTime() - i * 86_400_000);
    // 평균 일일 outbound = current_qty / standard_qty 비율 기반 + 잡음
    const baseFlow = Math.max(1, Math.round(raw.standard_qty * 0.04));
    const outbound = Math.max(0, Math.round(baseFlow + (rand() - 0.5) * baseFlow));
    const inbound  = rand() < 0.25 ? Math.round(baseFlow * (1 + rand() * 3)) : 0;
    qty = Math.max(qty + inbound - outbound, 0);
    items.push({
      date: d.toISOString().slice(0, 10),
      qty,
      inbound_qty: inbound,
      outbound_qty: outbound,
    });
  }

  return envelope({
    sku_id: skuId,
    period,
    items,
  });
}

// ─── 작은 PRNG (deterministic per skuId) ───────────────
function hashCode(s) {
  let h = 0;
  for (let i = 0; i < s.length; i += 1) {
    h = ((h << 5) - h + s.charCodeAt(i)) | 0;
  }
  return h >>> 0;
}
function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a |= 0;
    a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// ─── GET /inventory/batches?sku_id={sku_id} ─────────────
// 02-2 SKU Detail Validity Summary용 (Phase 4 placeholder fill)
//   backend §3.3 응답: { items: [{batch_id, expiry_date, qty, ...}] }
//   wireframe 정합: Top 3 nearest-expiry Lot/Batch + "View All in Validity Tracking" drill-down
//   SKU별 결정적 합성 — seed_qty + days_remaining 변동
export function mockInventoryBatches(skuId) {
  const raw = SKU_MASTER.find((r) => r.sku_id === skuId);
  if (!raw) {
    return envelope({ items: [] });
  }
  // SKU별 deterministic — 같은 SKU 진입 시 같은 lot 보임
  const seed = hashCode(skuId);
  const rand = mulberry32(seed);
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  // lot 개수: 2~5개 사이 (rand 기반)
  const lotCount = 2 + Math.floor(rand() * 4);
  const items = [];
  let remainingQty = raw.current_qty;
  for (let i = 0; i < lotCount; i += 1) {
    // 만료 임박도 점진 증가 (lot 1: 가장 임박, lot N: 여유)
    const daysFromBase = 10 + i * 12 + Math.floor(rand() * 6);
    const expiryDate = new Date(today.getTime() + daysFromBase * 86_400_000);
    // qty 분배 — 남은 qty의 약 1/2씩
    const isLast = i === lotCount - 1;
    const lotQty = isLast ? Math.max(remainingQty, 0) : Math.floor(remainingQty * (0.3 + rand() * 0.3));
    remainingQty -= lotQty;
    items.push({
      batch_id:     `LOT-${skuId.slice(-3).toUpperCase()}${i + 1}`,
      sku_id:       skuId,
      display_name: dn(koName(skuId) ?? raw.display_name, raw.display_name),
      expiry_date:  expiryDate.toISOString().slice(0, 10),
      days_remaining: daysFromBase,
      qty:          lotQty,
      zone_id:      raw.zone_id,
      zone_name:    raw.zone_name,
      section_id:   raw.section_id,
      section_name: raw.section_name,
      fefo_violation: false,
    });
  }
  // days_remaining asc 정렬
  items.sort((a, b) => a.days_remaining - b.days_remaining);
  return envelope({ items });
}

// ─── GET /inventory/events?sku_id={sku_id} ──────────────
// 02-2 SKU Detail Recent Stock Events — 실 BE inventory_events doc 미러
//   event_type ∈ {picking, replenishment}, {before/after/delta}_qty, fefo_compliant, detected_by, created_at
//   (FE 표: 유형 / 시각 / 증감(delta) / 최종(after) / FEFO. 구 status 칼럼은 BE에 개념 없어 FEFO로 대체)
export function mockInventoryEvents(skuId, limit = 10) {
  const raw = SKU_MASTER.find((r) => r.sku_id === skuId);
  if (!raw) {
    return envelope({ items: [], total_count: 0, page: 1, limit });
  }
  const seed = hashCode(skuId + '-events');
  const rand = mulberry32(seed);
  const now = Date.now();
  const types = ['picking', 'replenishment'];   // 실 BE event_type 2종 정합
  const items = [];
  let runningQty = raw.current_qty;
  for (let i = 0; i < limit; i += 1) {
    const eventType = types[Math.floor(rand() * types.length)];
    const delta = eventType === 'picking'
      ? -Math.max(1, Math.round(rand() * 15))
      : Math.round(20 + rand() * 30);
    const beforeQty = runningQty;
    runningQty = Math.max(runningQty + delta, 0);
    // 시간: 10분~48시간 전 sliding
    const minutesAgo = Math.round(10 + rand() * (60 * 24 * 2));
    const createdAt = new Date(now - minutesAgo * 60_000).toISOString();
    items.push({
      event_id:       `evt-${skuId}-${i + 1}`,
      sku_id:         skuId,
      sku_name:       dn(koName(skuId) ?? raw.display_name, raw.display_name),
      zone_id:        raw.zone_id,
      section_id:     raw.section_id,
      event_type:     eventType,
      before_qty:     beforeQty,
      after_qty:      runningQty,
      delta_qty:      delta,
      fefo_compliant: rand() > 0.15,   // 대부분 준수, 일부 위반(FEFO 뱃지 다양성)
      detected_by:    eventType === 'picking' ? 'scanner' : 'operator',
      created_at:     createdAt,
    });
  }
  // 최신순 정렬 (created_at desc — 실 BE repo .sort("created_at", -1) 정합)
  items.sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
  return envelope({
    items,
    total_count: items.length,
    page: 1,
    limit,
  });
}

// ─── GET — Section list for selected Zone (New Inbound Modal helper) ─
// 모달 안에서 Zone 변경 시 가능한 section 옵션을 좁히기 위한 단순 헬퍼.
// 실 API에선 `/inventory/zones/{zone_id}/sections`를 호출한다.
export function mockSectionsByZone(zoneId) {
  const seen = new Map();
  for (const row of SKU_MASTER) {
    if (zoneId && row.zone_id !== zoneId) continue;
    if (!seen.has(row.section_id)) {
      seen.set(row.section_id, {
        section_id:   row.section_id,
        section_name: row.section_name,
        zone_id:      row.zone_id,
        zone_name:    row.zone_name,
      });
    }
  }
  return envelope({ items: Array.from(seen.values()) });
}

// ─── GET — Zone list (New Inbound Modal helper) ──────────
export function mockZones() {
  const seen = new Map();
  for (const row of SKU_MASTER) {
    if (!seen.has(row.zone_id)) {
      seen.set(row.zone_id, { zone_id: row.zone_id, zone_name: row.zone_name });
    }
  }
  return envelope({ items: Array.from(seen.values()) });
}

// ─── POST /inventory/inbound ────────────────────────────
// 02-4 New Inbound Modal submit — backend `inventory.py:222` 정합.
//   payload: { sku_id, section_id, expiry_date, qty }
//   backend 제약: 기존 (site_id, section_id, sku_id) batch 문서 없으면 400.
//   mock에선 SKU_MASTER에 (sku_id, section_id)가 존재해야만 성공으로 처리.
//   성공 시 SKU_MASTER의 current_qty를 증가시켜 후속 list/detail에 즉시 반영.
export function mockRegisterInbound(payload) {
  const skuId     = payload?.sku_id;
  const sectionId = payload?.section_id;
  const qty       = Number(payload?.qty);
  const expiry    = payload?.expiry_date;

  if (!skuId || sectionId == null || !expiry || !Number.isFinite(qty) || qty <= 0) {
    return { success: false, data: null, message: 'Invalid inbound payload.' };
  }

  const target = SKU_MASTER.find((r) => r.sku_id === skuId && r.section_id === sectionId);
  if (!target) {
    return {
      success: false,
      data: null,
      message: '섹션 정보가 등록되어 있지 않습니다. 먼저 섹션·SKU 매핑이 필요합니다.',
    };
  }

  target.current_qty += qty;
  target.last_updated_at = new Date().toISOString();

  return envelope({
    batch_id:      `batch_${Math.random().toString(36).slice(2, 14)}`,
    sku_id:        skuId,
    section_id:    sectionId,
    expiry_date:   expiry,
    qty,
    registered_by: 'mock-user',
    created_at:    new Date().toISOString(),
  });
}

// ─── POST /inventory/manual ─────────────────────────────
// 02-2 Adjust Stock Modal submit — backend `inventory.py:203` 정합 (F-014 수동 보정).
//   payload: { sku_id, section_id, adjusted_qty, reason }
//   backend 제약 (inventory_service.py:491 manual_adjust 정합):
//     · (site_id, section_id, sku_id) batch 문서 없으면 거절
//     · delta>0(증가)면 거절 — 증가는 /inventory/inbound (감소 전용)
//   성공 시 SKU_MASTER current_qty를 보정 절대값으로 갱신(감소). batch FEFO 차감은
//   backend 책임이라 mock은 총량만 반영(sibling inbound mock과 동일 정책).
//   Recent Events는 mockInventoryEvents가 current_qty 기준 synthetic 재생성.
export function mockAdjustStock(payload) {
  const skuId       = payload?.sku_id;
  const sectionId   = payload?.section_id;
  const adjustedQty = Number(payload?.adjusted_qty);
  const reason      = payload?.reason;

  if (!skuId || sectionId == null || !Number.isFinite(adjustedQty)
      || adjustedQty < 0 || !Number.isInteger(adjustedQty) || !reason) {
    return { success: false, data: null, message: 'Invalid adjust payload.' };
  }

  const target = SKU_MASTER.find((r) => r.sku_id === skuId && r.section_id === sectionId);
  if (!target) {
    return { success: false, data: null, message: '해당 섹션·SKU 배치 정보를 찾을 수 없습니다.' };
  }

  const before = target.current_qty;
  if (adjustedQty - before > 0) {
    return { success: false, data: null, message: '수량 증가는 /inventory/inbound로 등록하세요.' };
  }

  target.current_qty = adjustedQty;
  target.last_updated_at = new Date().toISOString();

  return envelope({
    event_id:    `evt_manual_${Math.random().toString(36).slice(2, 14)}`,
    before_qty:  before,
    after_qty:   adjustedQty,
    adjusted_by: 'mock-user',
    created_at:  new Date().toISOString(),
  });
}

// ─── POST /refill-requests ──────────────────────────────
// 02-3 Refill Request Modal submit — backend §3.4 후순위, mock으로 시작
//   payload: { items: [{ sku_id, requested_qty }, ...], reason?: string }
//   response: { refill_request_id, submitted_at, items_count, status: 'pending' }
export function mockCreateRefillRequest(payload) {
  const items = Array.isArray(payload?.items) ? payload.items : [];
  const id = 'refill-' + Math.random().toString(36).slice(2, 10);
  return envelope({
    refill_request_id: id,
    submitted_at: new Date().toISOString(),
    items_count: items.length,
    status: 'pending',
  });
}

// ─── GET /inventory/refill-requests (07 Field Requests inbox) ─
//   backend RefillRequestItem schema 정합 (models/inventory.py:256)
//   { request_id, sku_id, display_name, requested_qty, reason, status,
//     requested_by, requested_at, handled_by, handled_at }
const REFILL_REQUESTS = [
  {
    request_id: 'rr-1007', sku_id: 'sku-004', display_name: 'Amoxicillin 250mg',
    requested_qty: 18, reason: '안전재고 미만 — 처방 빈도 높음', status: 'pending',
    requested_by: 'field.kim', requested_at: '2026-05-18T08:12:00Z',
    handled_by: null, handled_at: null,
  },
  {
    request_id: 'rr-1006', sku_id: 'sku-002', display_name: 'Tylenol 500mg',
    requested_qty: 30, reason: '재고 소진 임박', status: 'pending',
    requested_by: 'field.lee', requested_at: '2026-05-18T07:45:00Z',
    handled_by: null, handled_at: null,
  },
  {
    request_id: 'rr-1005', sku_id: 'sku-012', display_name: 'Simvastatin 40mg',
    requested_qty: 12, reason: 'baseline 차이 보정 후 보충', status: 'pending',
    requested_by: 'field.kim', requested_at: '2026-05-17T16:30:00Z',
    handled_by: null, handled_at: null,
  },
  {
    request_id: 'rr-1004', sku_id: 'sku-007', display_name: 'Omeprazole 20mg',
    requested_qty: 24, reason: '주간 소비 급증', status: 'handled',
    requested_by: 'field.lee', requested_at: '2026-05-16T10:05:00Z',
    handled_by: 'ops.park', handled_at: '2026-05-16T14:20:00Z',
  },
  {
    request_id: 'rr-1003', sku_id: 'sku-001', display_name: 'Aspirin 500mg',
    requested_qty: 40, reason: '정기 보충', status: 'handled',
    requested_by: 'field.kim', requested_at: '2026-05-15T09:00:00Z',
    handled_by: 'ops.park', handled_at: '2026-05-15T11:40:00Z',
  },
];

export function mockListRefillRequests(params = {}) {
  const statusRaw = params?.status;
  const statuses = statusRaw
    ? String(statusRaw).split(',').map((s) => s.trim()).filter(Boolean)
    : null;
  const page  = Math.max(1, Number(params?.page)  || 1);
  const limit = Math.min(100, Math.max(1, Number(params?.limit) || 20));

  const filtered = statuses
    ? REFILL_REQUESTS.filter((r) => statuses.includes(r.status))
    : REFILL_REQUESTS.slice();

  const start = (page - 1) * limit;
  const items = filtered.slice(start, start + limit).map(localizeRow);

  return envelope({ items, total_count: filtered.length });
}
