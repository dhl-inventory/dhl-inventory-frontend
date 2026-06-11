/**
 * Company mock 응답 — 11 Company Management (단일 페이지)
 * ─────────────────────────────────────────────────────────────
 * 11은 pending §2.29 Post-MVP 이연. backend `/companies/*` 전무.
 * MVP는 mock-first read-only — 신규 backend 0건이며, 이미 ship된
 * `/scope/zones`(zoneMock) · `/admin/users`(usersMock) 데이터 모양을
 * 그대로 미러해 단일 view-model로 조립한다.
 *
 * 가상 endpoint (추후 backend 요청 대상 — backend_followup_queue Q):
 *   GET /companies/overview
 *     → { company, warehouses[], operators[] }
 *
 * multi-warehouse 대응 구조 (BK 2026-05-19):
 *  - `warehouses[]` 는 복수 전제. 각 warehouse 가 자기 zones[] 를 소유.
 *    현재 backend = 1 site = 1 warehouse (auth_service.py:113, §2.49 Post-MVP)
 *    라 mock 은 W-1 단일 원소이지만, W-2 추가 시 구조 변경 0 (원소만 추가).
 *  - operator.scope[] 도 warehouse 단위로 그룹. 1 warehouse 면 단일 원소라
 *    화면상 현재와 동일하게 보이고, 복수면 자동으로 창고별 그룹 표시.
 *
 * operators = ops_manager + field_manager 만 (super_admin / ai_monitor는
 *   zone scope 모델이 없어 제외 — backend §4.5 / usersMock 정합).
 */

const envelope = (data) => ({ success: true, data, message: null });

export function mockCompanyOverview() {
  return envelope({
    company: {
      company_id: 'company-001',
      company_name: 'DHL Korea',
      site_id: 'site-001',
      status: 'active',
    },
    // 복수 전제. 현재는 1 site = 1 warehouse (§2.49 Post-MVP)라 1원소.
    // multi-warehouse 도입 시 { warehouse_id:'W-2', ... } 원소만 추가하면 됨.
    warehouses: [
      {
        warehouse_id: 'W-1',
        warehouse_name: 'Seoul DC',
        zones: [
          { zone_id: 'zone-A', zone_name: 'Zone A' },
          { zone_id: 'zone-B', zone_name: 'Zone B' },
          { zone_id: 'zone-C', zone_name: 'Zone C' },
        ],
      },
    ],
    // scope = warehouse 단위 그룹. 1 warehouse면 단일 원소(화면상 현재와 동일).
    operators: [
      { user_id: 'user-002', username: 'marcus.chen',   role: 'ops_manager',   scope: [{ warehouse_id: 'W-1', zones: ['Zone A', 'Zone B', 'Zone C'] }] },
      { user_id: 'user-003', username: 'industrial.ops', role: 'ops_manager',   scope: [{ warehouse_id: 'W-1', zones: ['Zone A', 'Zone B'] }] },
      { user_id: 'user-004', username: 'emma.wang',      role: 'ops_manager',   scope: [{ warehouse_id: 'W-1', zones: ['Zone B', 'Zone C'] }] },
      { user_id: 'user-001', username: 'hana.lee',       role: 'field_manager', scope: [{ warehouse_id: 'W-1', zones: ['Zone A'] }] },
      { user_id: 'user-005', username: 'ji.park',        role: 'field_manager', scope: [{ warehouse_id: 'W-1', zones: ['Zone B'] }] },
      { user_id: 'user-006', username: 'min.kim',        role: 'field_manager', scope: [{ warehouse_id: 'W-1', zones: ['Zone A'] }] },
      { user_id: 'user-007', username: 'sara.choi',      role: 'field_manager', scope: [{ warehouse_id: 'W-1', zones: ['Zone C'] }] },
    ],
  });
}
