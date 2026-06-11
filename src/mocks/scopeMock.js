/**
 * Scope ID → 표시 이름 mock 매핑
 * ─────────────────────────────────────────────────────────────
 * Phase 7 실 API 전환 시 /scope/zones 응답의 zone_name 같은 필드로 대체.
 * 현재는 authStore의 mock accessScope id를 사람 읽기 이름으로 변환.
 *
 * WAREHOUSE_ZONES는 계층 의존성 매핑 (warehouse → 그 안의 zone들).
 * Phase 3+에서 scopeStore가 warehouse 선택 시 zone 옵션 동적 갱신에 사용.
 */

export const SCOPE_NAME_MAP = Object.freeze({
  customer: {
    'C-1': 'DHL',
    'C-2': 'FedEx',
    'C-3': 'Maersk',
  },
  region: {
    'R-1': 'Singapore',
    'R-2': 'Tokyo',
  },
  warehouse: {
    'W-1': 'Warehouse 1',
    'W-2': 'Warehouse 2',
  },
  zone: {
    'zone-A': 'Zone A',
    'zone-B': 'Zone B',
    'zone-C': 'Zone C',
  },
});

/** Warehouse → 그 안의 Zone 목록 (Phase 3+ scopeStore의 계층 의존성용).
 *  현재는 1 site = 1 warehouse 가정 (backend auth_service.py:113) 이라 W-1 단독.
 *  Multi-warehouse Post-MVP 도입 시 W-2 / W-3 추가. */
export const WAREHOUSE_ZONES = Object.freeze({
  'W-1': ['zone-A', 'zone-B', 'zone-C'],
});

export function nameOfCustomer(id)  { return SCOPE_NAME_MAP.customer[id]  || id; }
export function nameOfRegion(id)    { return SCOPE_NAME_MAP.region[id]    || id; }
export function nameOfWarehouse(id) { return SCOPE_NAME_MAP.warehouse[id] || id; }
export function nameOfZone(id)      { return SCOPE_NAME_MAP.zone[id]      || id; }
