/**
 * Alerts mock 응답 — 05 Alert List / 02-2 SKU Detail 관련 알림 / Dashboard Watchlist
 * ─────────────────────────────────────────────────────────────
 * Backend snake_case 그대로 mirror. Frontend api 어댑터(N1)에서 camelCase 변환.
 *
 * Schema (ADR-019, backend/app/models/alerts.py):
 *  - AlertItem: alert_id, alert_type, severity, title, message, target(dict), status, created_at
 *  - AlertsListResponse: pending_count, in_process_count, critical_count, items, total_count
 *
 * 정책:
 *  - target dict denormalize: sku_id + display_name, zone_id + zone_name, section_id + section_name (ADR-019 §3)
 *  - title/message 자유 텍스트 유지 (ADR-019 §3.2.D backend reject 결과 — frontend i18n 합성 안 함, backend 값 그대로 표시)
 *  - severity 매핑 (ADR-019 §2): alert_type → info | warning | critical
 *  - status 4단계 (ADR-019 §1): pending / in_process / completed / cancelled
 *  - mock SKU 데이터는 inventoryMock.js와 일관성 유지
 *
 * Query 지원 (ADR-019 §3.1):
 *  - sku_id, section_id, zone_id (filter)
 *  - status, alert_type, severity (filter)
 *  - page, limit (pagination)
 *  - sort_by, order (default: created_at desc)
 */

import { localizeTarget } from './_i18n.js';

// ─── envelope 헬퍼 ───────────────────────────────────────
const envelope = (data) => ({ success: true, data, message: null });

// ─── ISO 시각 helper (mock 시각을 현재 시점 기준 상대 시간으로) ───
function iso(minutesAgo) {
  return new Date(Date.now() - minutesAgo * 60 * 1000).toISOString();
}

// ─── alert 마스터 데이터 (12건, 다양성 확보) ──────────────
//   inventoryMock.js의 SKU_MASTER와 sku_id / display_name / zone / section 정합
const ALERT_MASTER = [
  // 1. out_of_stock — critical / pending, 30분 전
  {
    alert_id: 'alert-001',
    alert_type: 'out_of_stock',
    severity: 'critical',
    title: '재고 소진',
    message: 'Amoxicillin 250mg 재고가 0개입니다. 즉시 보충이 필요합니다.',
    target: {
      sku_id: 'sku-004', display_name: 'Amoxicillin 250mg',
      zone_id: 'zone-A', zone_name: 'Zone A',
      section_id: 2, section_name: 'Section A2',
      slot_id: 'slot-A2-03',
      current_qty: 0, standard_qty: 30,
    },
    status: 'pending',
    created_at: iso(30),
  },
  // 2. stock_critical — critical / pending, 1시간 전
  {
    alert_id: 'alert-002',
    alert_type: 'stock_critical',
    severity: 'critical',
    title: '재고 위험',
    message: 'Simvastatin 40mg 재고가 기준의 16%입니다 (4/25).',
    target: {
      sku_id: 'sku-012', display_name: 'Simvastatin 40mg',
      zone_id: 'zone-B', zone_name: 'Zone B',
      section_id: 6, section_name: 'Section B2',
      slot_id: 'slot-B2-05',
      current_qty: 4, standard_qty: 25, capacity_rate: 0.16,
    },
    status: 'pending',
    created_at: iso(60),
  },
  // 3. expiry_critical — critical / pending, 1시간 전
  {
    alert_id: 'alert-003',
    alert_type: 'expiry_critical',
    severity: 'critical',
    title: '유통기한 위험',
    message: 'Vitamin C 1000mg Lot V250508 유통기한 5일 남음 (2026-05-17 만료).',
    target: {
      sku_id: 'sku-005', display_name: 'Vitamin C 1000mg',
      zone_id: 'zone-B', zone_name: 'Zone B',
      section_id: 5, section_name: 'Section B1',
      slot_id: 'slot-B1-02',
      batch_id: 'V250508', days_remaining: 5, expiry_date: '2026-05-17',
    },
    status: 'pending',
    created_at: iso(65),
  },
  // 4. stock_critical — critical / pending, 2시간 전
  {
    alert_id: 'alert-004',
    alert_type: 'stock_critical',
    severity: 'critical',
    title: '재고 위험',
    message: 'Tylenol 500mg 재고가 기준의 10%입니다 (2/20).',
    target: {
      sku_id: 'sku-002', display_name: 'Tylenol 500mg',
      zone_id: 'zone-A', zone_name: 'Zone A',
      section_id: 1, section_name: 'Section A1',
      slot_id: 'slot-A1-02',
      current_qty: 2, standard_qty: 20, capacity_rate: 0.1,
    },
    status: 'pending',
    created_at: iso(120),
  },
  // 5. expiry_warning — warning / pending, 4시간 전
  {
    alert_id: 'alert-005',
    alert_type: 'expiry_warning',
    severity: 'warning',
    title: '유통기한 주의',
    message: 'Aspirin 500mg Lot A250420 유통기한 25일 남음 (2026-06-06 만료).',
    target: {
      sku_id: 'sku-001', display_name: 'Aspirin 500mg',
      zone_id: 'zone-A', zone_name: 'Zone A',
      section_id: 1, section_name: 'Section A1',
      slot_id: 'slot-A1-01',
      batch_id: 'A250420', days_remaining: 25, expiry_date: '2026-06-06',
    },
    status: 'pending',
    created_at: iso(240),
  },
  // 6. stock_warning — warning / pending, 5시간 전
  {
    alert_id: 'alert-006',
    alert_type: 'stock_warning',
    severity: 'warning',
    title: '재고 주의',
    message: 'Lisinopril 10mg 재고가 기준의 40%입니다 (8/20).',
    target: {
      sku_id: 'sku-011', display_name: 'Lisinopril 10mg',
      zone_id: 'zone-A', zone_name: 'Zone A',
      section_id: 3, section_name: 'Section A3',
      slot_id: 'slot-A3-04',
      current_qty: 8, standard_qty: 20, capacity_rate: 0.4,
    },
    status: 'pending',
    created_at: iso(300),
  },
  // 7. stock_warning — warning / in_process, 1일 전
  {
    alert_id: 'alert-007',
    alert_type: 'stock_warning',
    severity: 'warning',
    title: '재고 주의',
    message: 'Omeprazole 20mg 재고가 기준의 30%입니다 (15/50). 보충 검토 중.',
    target: {
      sku_id: 'sku-007', display_name: 'Omeprazole 20mg',
      zone_id: 'zone-A', zone_name: 'Zone A',
      section_id: 2, section_name: 'Section A2',
      slot_id: 'slot-A2-01',
      current_qty: 15, standard_qty: 50, capacity_rate: 0.3,
    },
    status: 'in_process',
    created_at: iso(60 * 24),
  },
  // 8. fefo_violation — warning / in_process, 2일 전
  {
    alert_id: 'alert-008',
    alert_type: 'fefo_violation',
    severity: 'warning',
    title: 'FEFO 위반',
    message: 'Ibuprofen 200mg — 만료 임박 Lot I250410 대신 신규 Lot I250520 우선 출고됨.',
    target: {
      sku_id: 'sku-003', display_name: 'Ibuprofen 200mg',
      zone_id: 'zone-B', zone_name: 'Zone B',
      section_id: 5, section_name: 'Section B1',
      slot_id: 'slot-B1-04',
      violated_batch_id: 'I250410', picked_batch_id: 'I250520',
    },
    status: 'in_process',
    created_at: iso(60 * 24 * 2),
  },
  // 9. stock_overstock — info / completed, 3일 전
  {
    alert_id: 'alert-009',
    alert_type: 'stock_overstock',
    severity: 'info',
    title: '재고 초과',
    message: 'Loratadine 10mg 재고가 기준의 107%입니다 (30/28). 정리 완료.',
    target: {
      sku_id: 'sku-008', display_name: 'Loratadine 10mg',
      zone_id: 'zone-C', zone_name: 'Zone C',
      section_id: 8, section_name: 'Section C1',
      slot_id: 'slot-C1-02',
      current_qty: 30, standard_qty: 28, capacity_rate: 1.07,
    },
    status: 'completed',
    created_at: iso(60 * 24 * 3),
  },
  // 10. expiry_warning — warning / cancelled, 5일 전 (잘못된 알림으로 cancelled)
  {
    alert_id: 'alert-010',
    alert_type: 'expiry_warning',
    severity: 'warning',
    title: '유통기한 주의',
    message: 'Metformin 500mg Lot M250501 유통기한 — 폐기 후 알림 취소.',
    target: {
      sku_id: 'sku-009', display_name: 'Metformin 500mg',
      zone_id: 'zone-C', zone_name: 'Zone C',
      section_id: 8, section_name: 'Section C1',
      slot_id: 'slot-C1-01',
      batch_id: 'M250501', days_remaining: 28, expiry_date: '2026-06-09',
    },
    status: 'cancelled',
    created_at: iso(60 * 24 * 5),
  },
  // 11. abnormal_access — critical / pending, 8분 전 (비인가 접근/도난 의심). F-022 mock-first.
  //   실 연결 시 backend ML 감지 + 고정카메라 S3 이미지 파이프(B-1 scan-images와 별개) = Post-MVP.
  {
    alert_id: 'alert-011',
    alert_type: 'abnormal_access',
    severity: 'critical',
    title: '비정상 접근 감지',
    message: 'Zone A Section A1 에서 비인가 접근(이상 행동)이 감지되었습니다.',
    target: {
      zone_id: 'zone-A', zone_name: 'Zone A',
      section_id: 1, section_name: 'Section A1',
      snapshot_url: 'https://placehold.co/640x420/fdeaea/b02a37?text=Abnormal+Access',
      event_id: 'evt-acc-7741',
      detected_at: iso(8),
    },
    status: 'pending',
    created_at: iso(8),
  },
  // 12. abnormal_access — warning / in_process, 50분 전 (단시간 반복 접근 패턴)
  {
    alert_id: 'alert-012',
    alert_type: 'abnormal_access',
    severity: 'warning',
    title: '비정상 접근 감지',
    message: 'Zone C Section C1 에서 단시간 반복 접근 패턴이 감지되었습니다.',
    target: {
      zone_id: 'zone-C', zone_name: 'Zone C',
      section_id: 8, section_name: 'Section C1',
      snapshot_url: 'https://placehold.co/640x420/fdeaea/b02a37?text=Abnormal+Access',
      event_id: 'evt-acc-7762',
      detected_at: iso(50),
    },
    status: 'in_process',
    created_at: iso(50),
  },
];

// ─── /alerts (목록 + filter / sort / pagination) ──────────
//   query: sku_id, section_id, zone_id, status, alert_type, severity, sort_by, order, page, limit
export function mockAlerts(params = {}) {
  // counts는 항상 ALERT_MASTER 전체(=site 전체) 기준으로 계산.
  //   layout outline §10: chip은 "운영자 actionable 상황을 한눈에" 보여주는 site-wide 지표이므로
  //   filter / pagination과 무관해야 한다. backend 실 응답도 같은 모양으로 합의됨(ADR-019 §3.1).
  const pending_count    = ALERT_MASTER.filter((a) => a.status === 'pending').length;
  const in_process_count = ALERT_MASTER.filter((a) => a.status === 'in_process').length;
  const critical_count   = ALERT_MASTER.filter((a) => a.severity === 'critical').length;

  let items = ALERT_MASTER.map((a) => ({ ...a, target: { ...a.target } })).map(localizeTarget);

  // filter
  if (params.sku_id)     items = items.filter((a) => a.target.sku_id === params.sku_id);
  if (params.section_id) items = items.filter((a) => a.target.section_id === params.section_id);
  if (params.zone_id)    items = items.filter((a) => a.target.zone_id === params.zone_id);
  if (params.status) {
    const statuses = String(params.status).split(',').map((s) => s.trim());
    items = items.filter((a) => statuses.includes(a.status));
  }
  if (params.alert_type) {
    // 실 BE(alerts_repo) 정합 — 단일 정확일치(콤마 분해 안 함)
    items = items.filter((a) => a.alert_type === params.alert_type);
  }
  if (params.severity) {
    const sevs = String(params.severity).split(',').map((s) => s.trim());
    items = items.filter((a) => sevs.includes(a.severity));
  }

  // sort (default created_at desc — 최신 알림 우선)
  const sortBy = params.sort_by || 'created_at';
  const order  = params.order   || 'desc';
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
    pending_count,
    in_process_count,
    critical_count,
    items: paged,
    total_count,
  });
}

// ─── PATCH /alerts/{alert_id} (status 변경) ──────────────
//   현재는 mock 응답만 — 실제 ALERT_MASTER 변경은 SKU Detail / Alert List 작업 시점에 정책 결정
export function mockAlertStatusUpdate(alertId, status) {
  const alert = ALERT_MASTER.find((a) => a.alert_id === alertId);
  if (!alert) {
    return { success: false, data: null, message: `Alert not found: ${alertId}` };
  }
  return envelope({ alert_id: alertId, status });
}
