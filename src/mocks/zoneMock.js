/**
 * Zone 도메인 mock — 03-1 Zone Overview / 03-2 Zone Detail / 03-3 Section Detail
 * ─────────────────────────────────────────────────────────────
 * Backend snake_case 그대로 mirror. Frontend api 어댑터에서 toCamel.
 *
 * 출처:
 *  - docs/architecture/api_feedback/requests/backend_zone_request.md §1.1 진척 표
 *  - docs/page_layout_outline.md §8 (03-1 / 03-2 / 03-3)
 *  - docs/wireframes/03-2_zone_detail.png
 *
 * 3 endpoint:
 *  - GET /scope/zones (zone-level summary)
 *  - GET /inventory/zones/{zone_id}/sections (section grid)
 *  - GET /inventory/zones/{zone_id}/sections/{section_id} (section detail)
 *
 * 정책:
 *  - inventoryMock.js의 SKU 마스터와 sku_id / display_name 정합
 *  - Section-level 4필드(total_qty / standard_qty / capacity_rate / stock_status)는
 *    mock에서는 단건 응답에도 직접 박음 (backend §3.3 옵션 B 흡수 시 자연 정합)
 */

import { dn, koName, localizeRow } from './_i18n.js';

const envelope = (data) => ({ success: true, data, message: null });

// FEFO 위반 row 는 sku_id 없이 sku_name(영문)만 보유 — _i18n.KO_NAMES 대신 영문명 키 매핑.
const FEFO_KO_BY_EN = {
  'Aspirin 500mg':     '아스피린 500mg',
  'Ibuprofen 200mg':   '이부프로펜 200mg',
  'Paracetamol 500mg': '파라세타몰 500mg',
  'Amoxicillin 250mg': '아목시실린 250mg',
};

// ─── /scope/zones 응답 ──────────────────────────────────
//   backend scope_service.py:83-90와 동일 schema
export function mockScopeZones() {
  return envelope({
    zones: [
      {
        zone_id:                   'zone-A',
        zone_name:                 'Zone A',
        status:                    'warning',
        below_standard_sku_count:  3,
        section_count:             4,
        low_stock_section_count:   2,
      },
      {
        zone_id:                   'zone-B',
        zone_name:                 'Zone B',
        status:                    'critical',
        below_standard_sku_count:  2,
        section_count:             3,
        low_stock_section_count:   1,
      },
      {
        zone_id:                   'zone-C',
        zone_name:                 'Zone C',
        status:                    'normal',
        below_standard_sku_count:  0,
        section_count:             3,
        low_stock_section_count:   0,
      },
    ],
  });
}

// ─── Section 마스터 (zone 안 4 / 3 / 3 분포) ──────────
//   각 section의 total/standard/sku_count는 inventoryMock과 정합
const SECTION_MASTER = [
  // Zone A — 4 sections
  { zone_id: 'zone-A', section_id: 1, section_name: 'Sec-1', total_qty: 38,  standard_qty: 40,  sku_count: 1 }, // normal
  { zone_id: 'zone-A', section_id: 2, section_name: 'Sec-2', total_qty: 15,  standard_qty: 80,  sku_count: 2 }, // warning
  { zone_id: 'zone-A', section_id: 3, section_name: 'Sec-3', total_qty: 8,   standard_qty: 20,  sku_count: 1 }, // warning
  { zone_id: 'zone-A', section_id: 4, section_name: 'Sec-4', total_qty: 0,   standard_qty: 30,  sku_count: 0 }, // empty
  // Zone B — 3 sections
  { zone_id: 'zone-B', section_id: 5, section_name: 'Sec-1', total_qty: 32,  standard_qty: 60,  sku_count: 2 }, // warning
  { zone_id: 'zone-B', section_id: 6, section_name: 'Sec-2', total_qty: 49,  standard_qty: 73,  sku_count: 2 }, // warning
  { zone_id: 'zone-B', section_id: 7, section_name: 'Sec-3', total_qty: 2,   standard_qty: 20,  sku_count: 1 }, // critical
  // Zone C — 3 sections
  { zone_id: 'zone-C', section_id: 8, section_name: 'Sec-1', total_qty: 70,  standard_qty: 78,  sku_count: 2 }, // normal
  { zone_id: 'zone-C', section_id: 9, section_name: 'Sec-2', total_qty: 80,  standard_qty: 80,  sku_count: 1 }, // normal
  { zone_id: 'zone-C', section_id: 10, section_name: 'Sec-3', total_qty: 65,  standard_qty: 75,  sku_count: 1 }, // normal
];

// Section 안 SKU 매핑 (inventoryMock.js와 정합)
const SECTION_SKUS = {
  1: [
    { sku_id: 'sku-001', display_name: 'Aspirin 500mg',     current_qty: 38, standard_qty: 40, fefo_status: 'compliant' },
  ],
  2: [
    { sku_id: 'sku-007', display_name: 'Omeprazole 20mg',   current_qty: 15, standard_qty: 50, fefo_status: 'compliant' },
    { sku_id: 'sku-004', display_name: 'Amoxicillin 250mg', current_qty: 0,  standard_qty: 30, fefo_status: 'compliant' },
  ],
  3: [
    { sku_id: 'sku-011', display_name: 'Lisinopril 10mg',   current_qty: 8,  standard_qty: 20, fefo_status: 'compliant' },
  ],
  4: [],
  5: [
    { sku_id: 'sku-005', display_name: 'Vitamin C 1000mg',  current_qty: 18, standard_qty: 32, fefo_status: 'warning'   },
    { sku_id: 'sku-003', display_name: 'Ibuprofen 200mg',   current_qty: 14, standard_qty: 28, fefo_status: 'violation' },
  ],
  6: [
    { sku_id: 'sku-006', display_name: 'Cetirizine 10mg',   current_qty: 24, standard_qty: 25, fefo_status: 'compliant' },
    { sku_id: 'sku-012', display_name: 'Simvastatin 40mg',  current_qty: 25, standard_qty: 48, fefo_status: 'compliant' },
  ],
  7: [
    { sku_id: 'sku-002', display_name: 'Tylenol 500mg',     current_qty: 2,  standard_qty: 20, fefo_status: 'compliant' },
  ],
  8: [
    { sku_id: 'sku-008', display_name: 'Loratadine 10mg',   current_qty: 30, standard_qty: 28, fefo_status: 'compliant' },
    { sku_id: 'sku-009', display_name: 'Metformin 500mg',   current_qty: 40, standard_qty: 50, fefo_status: 'compliant' },
  ],
  9: [
    { sku_id: 'sku-010', display_name: 'Vitamin D 1000IU',  current_qty: 80, standard_qty: 80, fefo_status: 'compliant' },
  ],
  10: [
    { sku_id: 'sku-010', display_name: 'Vitamin D 1000IU',  current_qty: 65, standard_qty: 75, fefo_status: 'compliant' },
  ],
};

// recent_events — backend 정합 (pending §2.54): event_type 은 picking/replenishment 2종만.
//   count_change 제거 (backend 없음 + delta 0 은 timeline 제외 정책, page_layout §02-2).
//   자동/수동 구분 = scan_id(스캔만 값, 수동 null) + detected_by("system"/user).
//   eye 버튼: scan_id 있으면 표시, 수동(scan_id null)은 미렌더(공란) — backend_snapshot_agreements §2.
const SECTION_EVENTS = {
  1: [
    { event_id: 'evt-sec-a1-1', occurred_at: '2026-05-15T14:20:00+09:00', event_type: 'picking',       display_name: 'Aspirin 500mg', sku_id: 'sku-001', qty_delta: -5,  scan_id: 'scan-a1-031', detected_by: 'system' },
    { event_id: 'evt-sec-a1-2', occurred_at: '2026-05-15T11:05:00+09:00', event_type: 'picking',       display_name: 'Aspirin 500mg', sku_id: 'sku-001', qty_delta: -3,  scan_id: null,          detected_by: 'user-ops' },
    { event_id: 'evt-sec-a1-3', occurred_at: '2026-05-15T09:45:00+09:00', event_type: 'replenishment', display_name: 'Aspirin 500mg', sku_id: 'sku-001', qty_delta: 10,  scan_id: 'scan-a1-028', detected_by: 'system' },
  ],
  2: [
    { event_id: 'evt-sec-a2-1', occurred_at: '2026-05-15T13:50:00+09:00', event_type: 'picking',       display_name: 'Omeprazole 20mg',  sku_id: 'sku-007', qty_delta: -12, scan_id: 'scan-a2-045', detected_by: 'system' },
    { event_id: 'evt-sec-a2-2', occurred_at: '2026-05-15T10:10:00+09:00', event_type: 'picking',       display_name: 'Amoxicillin 250mg', sku_id: 'sku-004', qty_delta: -8,  scan_id: 'scan-a2-040', detected_by: 'system' },
  ],
  5: [
    { event_id: 'evt-sec-b1-1', occurred_at: '2026-05-15T11:35:00+09:00', event_type: 'picking',       display_name: 'Ibuprofen 200mg',  sku_id: 'sku-003', qty_delta: -6,  scan_id: 'scan-b1-022', detected_by: 'system' },
  ],
};

// 전체 section event 평탄화 → event_id 로 단건 조회 (mockEventSnapshots 용)
function findSectionEventById(eventId) {
  for (const evs of Object.values(SECTION_EVENTS)) {
    const found = evs.find((e) => e.event_id === eventId);
    if (found) return found;
  }
  return null;
}

// ─── GET /inventory/events?section_id=&page=&limit= (Section Events 모달) ──
//   backend InventoryEventsResponse 미러: { items, total_count, page, limit }.
//   sectionId → SECTION_EVENTS 매칭 후 occurred_at desc, page slicing.
export function mockSectionEvents(sectionId, page = 1, limit = 20) {
  const sid = Number(sectionId);
  const all = (SECTION_EVENTS[sid] ?? [])
    .slice()
    .sort((a, b) => new Date(b.occurred_at) - new Date(a.occurred_at));
  const start = Math.max(0, (page - 1) * limit);
  const items = all.slice(start, start + limit).map(localizeRow);
  return envelope({
    items,
    total_count: all.length,
    page,
    limit,
  });
}

// ─── GET /inventory/events?zone_id= (R-1 Recent Zone Events) ──
//   zone 단위 집계 overview. backend 동일 endpoint (03-3=section_id, 여기=zone_id).
//   mock: zone→section 매핑으로 SECTION_EVENTS 병합 후 occurred_at desc.
const ZONE_SECTION_IDS = { 'zone-A': [1, 2], 'zone-B': [5] };
export function mockZoneEvents(zoneId) {
  const items = (ZONE_SECTION_IDS[zoneId] ?? [])
    .flatMap((sid) => SECTION_EVENTS[sid] ?? [])
    .sort((a, b) => new Date(b.occurred_at) - new Date(a.occurred_at))
    .slice(0, 5)
    .map(localizeRow);
  return envelope({ items });
}

// ─── GET /inventory/events/{event_id}/snapshots ──────────
//   backend_snapshot_agreements §2: scan 이벤트(scan_id 값)만 이미지 보유.
//   수동(scan_id null) / 미존재 event 는 snapshots:[] 안전 응답 (backend 동일 동작).
//   실 API는 presigned S3 URL(1h) — mock 은 placeholder 이미지.
export function mockEventSnapshots(eventId) {
  const ev = findSectionEventById(eventId);
  if (!ev || ev.scan_id == null) {
    return envelope({ event_id: eventId, scan_id: ev?.scan_id ?? null, snapshots: [] });
  }
  return envelope({
    event_id:  eventId,
    scan_id:   ev.scan_id,
    snapshots: [
      {
        id:            1,
        presigned_url: `https://placehold.co/640x420/eef/445?text=${encodeURIComponent(ev.scan_id)}`,
        file_size_kb:  128,
        captured_at:   ev.occurred_at,
      },
    ],
  });
}

const SECTION_ALERTS = {
  1: [
    { alert_id: 'al-sec-a1-1', severity: 'critical', message: 'Below standard (2 units short)' },
    { alert_id: 'al-sec-a1-2', severity: 'warning', message: 'Refill review recommended' },
  ],
  2: [
    { alert_id: 'al-sec-a2-1', severity: 'critical', message: 'Below standard (65 units short)' },
    { alert_id: 'al-sec-a2-2', severity: 'warning', message: 'High outbound movement detected' },
  ],
  5: [
    { alert_id: 'al-sec-b1-1', severity: 'warning', message: 'FEFO review recommended' },
  ],
};

// 6단계 stockStatus derive (metric_definitions §5)
function classifyStock(currentQty, standardQty) {
  if (standardQty <= 0) return 'normal';
  if (currentQty === 0) return 'out_of_stock';
  const rate = currentQty / standardQty;
  if (rate < 0.20)  return 'critical';
  if (rate < 0.70)  return 'warning';
  if (rate < 0.95)  return 'watch';
  if (rate <= 1.05) return 'normal';
  return 'overstock';
}

// ─── /expiry/fefo/by-zone (F-008 구역별 FEFO 준수율) ────
// backend get_fefo_by_zone 정합:
//   { zone_id, compliance_rate, violation_count, violations:[{event_id,sku_name,section_id,created_at}] }
const FEFO_BY_ZONE = {
  'zone-A': {
    compliance_rate: 96.4,
    violations: [
      { event_id: 'evt-fefo-a1', sku_name: 'Aspirin 500mg',     section_id: 1, mins_ago: 95 },
      { event_id: 'evt-fefo-a2', sku_name: 'Ibuprofen 200mg',   section_id: 2, mins_ago: 1320 },
      { event_id: 'evt-fefo-a3', sku_name: 'Paracetamol 500mg', section_id: 2, mins_ago: 2660 },
    ],
  },
  'zone-B': {
    compliance_rate: 98.9,
    violations: [
      { event_id: 'evt-fefo-b1', sku_name: 'Amoxicillin 250mg', section_id: 5, mins_ago: 230 },
    ],
  },
  'zone-C': { compliance_rate: 100, violations: [] },
};

export function mockZoneFefo(zoneId) {
  const cfg = FEFO_BY_ZONE[zoneId] ?? { compliance_rate: 100, violations: [] };
  const now = Date.now();
  const violations = cfg.violations.map((v) => ({
    event_id:   v.event_id,
    sku_name:   dn(FEFO_KO_BY_EN[v.sku_name] ?? v.sku_name, v.sku_name),
    section_id: v.section_id,
    created_at: new Date(now - v.mins_ago * 60000).toISOString(),
  }));
  return envelope({
    zone_id:         zoneId,
    compliance_rate: cfg.compliance_rate,
    violation_count: violations.length,
    violations,
  });
}

// ─── POST section 등록 (C-2 mock-first) ─────────────────
// 고객 SSAFY §8 section 등록. backend endpoint/계약 회신 시 zoneApi.createSection
//   mock 분기만 실 호출로 교체(UI·계약 변경 0). pending §2.44 / work_plan §C-2.
//   mock: SECTION_MASTER 에 추가 → 후속 mockZoneSections 가 grid 에 즉시 반영.
export function mockCreateSection(payload) {
  const zoneId = payload?.zone_id;
  const name = (payload?.section_name ?? '').trim();
  const no = Number(payload?.section_no);
  if (!zoneId || !name || !Number.isFinite(no) || !Number.isInteger(no) || no < 0) {
    return { success: false, data: null, message: 'Invalid section payload.' };
  }
  const nextId = Math.max(0, ...SECTION_MASTER.map((s) => s.section_id)) + 1;
  const code = (payload?.section_code ?? '').trim() || `S-${no}`;
  SECTION_MASTER.push({
    zone_id: zoneId, section_id: nextId, section_name: name,
    total_qty: 0, standard_qty: 0, sku_count: 0,
  });
  return envelope({
    zone_id:      zoneId,
    section_id:   nextId,
    section_name: name,
    section_no:   no,
    section_code: code,
    x_mm:         payload?.x_mm ?? null,
    y_mm:         payload?.y_mm ?? null,
    z_mm:         payload?.z_mm ?? null,
    camera_id:    payload?.camera_id ?? null,
  });
}

// ─── /inventory/zones/{zone_id}/sections ───────────────
//   응답 wrapper: backend는 `items` 사용 (다른 inventory endpoint와 정합)
export function mockZoneSections(zoneId) {
  const sections = SECTION_MASTER.filter((s) => s.zone_id === zoneId).map((s) => {
    const rate = s.standard_qty > 0 ? s.total_qty / s.standard_qty : 0;
    return {
      section_id:    s.section_id,
      section_name:  s.section_name,
      total_qty:     s.total_qty,
      standard_qty:  s.standard_qty,
      capacity_rate: Number(rate.toFixed(4)),
      stock_status:  classifyStock(s.total_qty, s.standard_qty),
      sku_count:     s.sku_count,
    };
  });
  return envelope({ items: sections });
}

// ─── /inventory/zones/{zone_id}/sections/{section_id} ──
//   mock은 backend §3.3 옵션 B 흡수 형태 — Section-level 4필드 포함
//   실 backend가 옵션 A로 가더라도 frontend api 어댑터에서 동일 schema 합성
export function mockZoneSectionDetail(zoneId, sectionId) {
  // URL params / dataset 등에서 string으로 올 수 있어 INT 강제 변환 (pending §2.48)
  sectionId = Number(sectionId);
  const sec = SECTION_MASTER.find((s) => s.zone_id === zoneId && s.section_id === sectionId);
  if (!sec) {
    return { success: false, data: null, message: `Section not found: ${sectionId}` };
  }
  const zone = mockScopeZones().data.zones.find((z) => z.zone_id === zoneId);
  const rate = sec.standard_qty > 0 ? sec.total_qty / sec.standard_qty : 0;
  const skus = (SECTION_SKUS[sectionId] ?? []).map((s) => ({
    sku_id:        s.sku_id,
    display_name:  s.display_name,
    current_qty:   s.current_qty,
    standard_qty:  s.standard_qty,
    capacity_rate: s.standard_qty > 0 ? Number((s.current_qty / s.standard_qty).toFixed(4)) : 0,
    stock_status:  classifyStock(s.current_qty, s.standard_qty),
    fefo_status:   s.fefo_status,
  })).map(localizeRow);

  // open_alert_count — mock은 section 단위로 임의값 (Phase 6 socket / alerts 연결 시 정합)
  const openAlertCountMap = {
    1: 2, 2: 2, 5: 1, 7: 3,
  };

  return envelope({
    section_id:    sec.section_id,
    section_name:  sec.section_name,
    zone_id:       zoneId,
    zone_name:     zone?.zone_name ?? zoneId,
    total_qty:     sec.total_qty,
    standard_qty:  sec.standard_qty,
    capacity_rate: Number(rate.toFixed(4)),
    stock_status:  classifyStock(sec.total_qty, sec.standard_qty),
    skus,
    open_alert_count: openAlertCountMap[sectionId] ?? 0,
    warehouse_name: 'Warehouse 1',
    last_updated_at: '2026-05-15T14:20:00+09:00',
    // §6.5 SSAFY §22-1 section scan 요약 (mock-first; 실 API 경로 = backend_followup_queue Q-2)
    section_total_quantity: 36,
    identified_quantity:    34,
    unknown_quantity:       2,
    delta_vs_prev_scan:     -3,
    last_scan_at:           '2026-05-15T14:20:00+09:00',
    recent_events: (SECTION_EVENTS[sectionId] ?? []).map(localizeRow),
    related_alerts: SECTION_ALERTS[sectionId] ?? [],
  });
}
