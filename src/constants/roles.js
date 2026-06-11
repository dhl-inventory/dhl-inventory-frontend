/**
 * 4 Role 코드 (백엔드 06_api_spec 영문 코드와 일치)
 * ─────────────────────────────────────────────────────────────
 * docs/role_based_ia.md §3·§4 IA 기준
 */

export const ROLE = Object.freeze({
  FIELD_MANAGER: 'field_manager',
  OPS_MANAGER:   'ops_manager',
  SUPER_ADMIN:   'super_admin',
  AI_MONITOR:    'ai_monitor',
});

export const ROLE_VALUES = Object.values(ROLE);

export function isValidRole(role) {
  return ROLE_VALUES.includes(role);
}
