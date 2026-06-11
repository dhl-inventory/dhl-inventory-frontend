/**
 * 6단계 재고 상태 (metric_definitions §5)
 * ─────────────────────────────────────────────────────────────
 * 임계값 (2026-05-26 완화):
 *   out_of_stock  currentQty = 0
 *   critical      0 < capacityRate < 0.20
 *   warning       0.20 <= capacityRate < 0.50
 *   watch         0.50 <= capacityRate < 0.70
 *   normal        0.70 <= capacityRate <= 1.30
 *   overstock     capacityRate > 1.30
 *
 * backend (alert_jobs.py, dashboard_service.py, inventory_service.py) 와 동일 유지.
 * 임계값 계산 헬퍼: utils/stockStatus.js
 */

export const STOCK_STATUS = Object.freeze({
  OUT_OF_STOCK: 'out_of_stock',
  CRITICAL:     'critical',
  WARNING:      'warning',
  WATCH:        'watch',
  NORMAL:       'normal',
  OVERSTOCK:    'overstock',
});

/** 위험도 정렬용 — 큰 숫자가 먼저 표시되어야 할 우선순위 */
export const STOCK_STATUS_PRIORITY = Object.freeze({
  out_of_stock: 5,
  critical:     4,
  warning:      3,
  watch:        2,
  normal:       1,
  overstock:    0,   // top_attention_list 정렬에서 후순위
});

/** Bootstrap utility class 매핑 (index.css의 .bg-status-* 클래스) */
export const STOCK_STATUS_BADGE_CLASS = Object.freeze({
  out_of_stock: 'bg-status-out-of-stock',
  critical:     'bg-status-critical',
  warning:      'bg-status-warning',
  watch:        'bg-status-watch',
  normal:       'bg-status-normal',
  overstock:    'bg-status-overstock',
});
