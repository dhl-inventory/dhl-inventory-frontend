/**
 * Alert 도메인 상수 — 05 Alert List / AlertDetailModal 공용
 * ─────────────────────────────────────────────────────────────
 * ADR-019 정합 (status 4단계 / severity 3단계 / target denormalize / title·message 자유).
 *
 * 정책 정합 출처:
 *  - docs/architecture/api_feedback/agreements/backend_alerts_agreements.md
 *  - docs/page_layout_outline.md §10
 *
 * 본 파일이 4종 상위 카테고리 ↔ backend alert_type enum 매핑의 단일 진실.
 * backend가 alert_type을 추가하면 본 파일에 enum + 매핑 + 의미 설명을 동시에 갱신.
 */

// ─── 4종 상위 카테고리 (와이어프레임 정합) ──────────────
//   layout outline §10: row Type 컬럼은 4종 카테고리만 노출.
export const CATEGORY_META = {
  stock_shortage: {
    label: 'Stock Shortage',
    icon:  'inventory_2',           // Material Symbols
    description: '재고 부족 / 과잉 — 출고 대응이나 보충 발주 결정이 필요한 상황.',
  },
  validity_risk: {
    label: 'Validity Risk',
    icon:  'schedule',
    description: '유통기한 임박 / FEFO 위반 — 폐기·교체·우선 출고 결정이 필요한 상황.',
  },
  device_issue: {
    label: 'Device Issue',
    icon:  'videocam_off',
    description: 'AI 카메라 / 스캐너 device heartbeat / stream / collection 이상.',
  },
  abnormal_access: {
    label: 'Abnormal Access',
    icon:  'shield',
    description: '비정상 접근 / 비인가 행동 감지.',
  },
};

// ─── alert_type enum → 카테고리 매핑 ────────────────────
//   backend ADR-019 enum. 새 enum이 들어오면 매핑 추가.
export const ALERT_TYPE_CATEGORY = {
  // Stock 묶음 (overstock 포함 — "재고 정상 범위 이탈" 통합 표시)
  out_of_stock:    'stock_shortage',
  stock_critical:  'stock_shortage',
  stock_warning:   'stock_shortage',
  stock_overstock: 'stock_shortage',
  // Validity 묶음 (FEFO 포함 — 유통기한·만료 임박 우선 출고 위반)
  expiry_critical: 'validity_risk',
  expiry_warning:  'validity_risk',
  fefo_violation:  'validity_risk',
  // Abnormal access (C-5 mock-first) — 자기 자신이 카테고리. Device 는 enum 도입 시 추가
  abnormal_access: 'abnormal_access',
};

// ─── alert_type 사용자 노출 라벨 ───────────────────────
export const ALERT_TYPE_LABEL = {
  out_of_stock:    'Out of stock',
  stock_critical:  'Stock critical',
  stock_warning:   'Stock warning',
  stock_overstock: 'Stock overstock',
  expiry_critical: 'Expiry critical',
  expiry_warning:  'Expiry warning',
  fefo_violation:  'FEFO violation',
};

// ─── alert_type 의미 한 줄 설명 (modal 안에서 노출) ────
export const ALERT_TYPE_DESCRIPTION = {
  out_of_stock:    '재고 0 — 즉시 보충 발주 또는 출고 보류 결정 필요.',
  stock_critical:  '기준 수량의 20% 미만 — 곧 출고 불가 위험.',
  stock_warning:   '기준 수량의 70% 미만 — 보충 검토 권장 시점.',
  stock_overstock: '기준 수량의 105% 초과 — 정리 / 슬롯 재배치 검토.',
  expiry_critical: '유통기한 7일 이내 — 즉시 출고 / 폐기 결정 필요.',
  expiry_warning:  '유통기한 30일 이내 — 우선 출고 (FEFO) 대상.',
  fefo_violation:  '만료 임박 lot 대신 신규 lot이 우선 출고됨 — 입출고 흐름 점검.',
};

// ─── severity (ADR-019 §2) ──────────────────────────────
export const SEVERITY_META = {
  critical: {
    label: 'Critical',
    badge: 'bg-danger',
    description: '즉시 조치가 필요한 위험. 운영 결정 / 출고 보류 / 폐기 등 시급한 액션 대상.',
  },
  warning: {
    label: 'Warning',
    badge: 'bg-warning text-dark',
    description: '곧 critical로 악화될 수 있는 주의 단계. 단기 내 검토·결정 필요.',
  },
  info: {
    label: 'Info',
    badge: 'bg-secondary',
    description: '참고용 알림. 즉시 조치는 불필요하나 기록·모니터링 대상.',
  },
};

// ─── status (ADR-019 §1, 4단계 워크플로우) ─────────────
export const STATUS_META = {
  pending: {
    label: 'Pending',
    badge: 'bg-warning text-dark',
    description: '미확인 / 운영자가 아직 손대지 않은 상태. 가장 먼저 보아야 할 카테고리.',
  },
  in_process: {
    label: 'In Process',
    badge: 'bg-info text-dark',
    description: '확인 / 조치 중. 담당자가 처리에 착수한 단계.',
  },
  completed: {
    label: 'Completed',
    badge: 'bg-success',
    description: '조치 완료. 더 이상 actionable 하지 않으며 기록으로 보관.',
  },
  cancelled: {
    label: 'Cancelled',
    badge: 'bg-secondary',
    description: '잘못된 / 무의미한 알림으로 판정되어 취소된 상태. 처리 대상에서 제외.',
  },
};

// ─── status 전이 매트릭스 (layout outline §10) ────────
//   Pending → In Process → Completed / Cancelled
//   Pending에서 곧장 Cancelled로 갈 수도 있음 (오인 알림 즉시 폐기)
export const STATUS_TRANSITIONS = {
  pending:    ['in_process', 'cancelled'],
  in_process: ['completed', 'cancelled'],
  completed:  [],
  cancelled:  [],
};

// ─── 카테고리 → backend alert_type list (filter에서 사용) ──
//   category id 단일 선택 시 q.alert_type을 콤마로 묶어 backend에 전달.
export const CATEGORY_TO_ALERT_TYPES = {
  stock_shortage:  ['out_of_stock', 'stock_critical', 'stock_warning', 'stock_overstock'],
  validity_risk:   ['expiry_critical', 'expiry_warning', 'fefo_violation'],
  device_issue:    [],   // 추가 enum 도입 시 채움
  abnormal_access: [],
};
