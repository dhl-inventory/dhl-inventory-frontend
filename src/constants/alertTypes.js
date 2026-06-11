/**
 * Alert Type — 4종 (page_data_requirements §8)
 * ─────────────────────────────────────────────────────────────
 * Backend는 socket.io alert 이벤트의 alert_type으로 더 세분화된 값을 보냄
 * (expiry_warning, expiry_critical, stock_low, stock_shortage, stock_empty,
 *  fevo_violation — socket_io_guide.md). 이를 frontend는 4종 alertType으로 분류:
 *
 *   stock_low / stock_shortage / stock_empty  → STOCK_SHORTAGE
 *   expiry_warning / expiry_critical          → VALIDITY_RISK
 *   fefo_violation                            → VALIDITY_RISK
 *   (장비 telemetry 관련)                       → DEVICE_ISSUE
 *   (이상 행동 / motion 관련)                   → ABNORMAL_ACCESS
 */

export const ALERT_TYPE = Object.freeze({
  STOCK_SHORTAGE:  'stock_shortage',
  VALIDITY_RISK:   'validity_risk',
  DEVICE_ISSUE:    'device_issue',
  ABNORMAL_ACCESS: 'abnormal_access',
});

/**
 * Backend socket.io alert_type → frontend ALERT_TYPE 매핑
 * (Phase 6 socket 활성 시 notificationStore에서 사용)
 */
export const SOCKET_ALERT_TYPE_MAP = Object.freeze({
  expiry_warning:  ALERT_TYPE.VALIDITY_RISK,
  expiry_critical: ALERT_TYPE.VALIDITY_RISK,
  fefo_violation:  ALERT_TYPE.VALIDITY_RISK,
  stock_low:       ALERT_TYPE.STOCK_SHORTAGE,
  stock_shortage:  ALERT_TYPE.STOCK_SHORTAGE,
  stock_empty:     ALERT_TYPE.STOCK_SHORTAGE,
});
