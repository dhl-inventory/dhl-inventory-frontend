/**
 * Alert Workflow Status + Priority (page_data_requirements §8 / metric_definitions §7)
 * ─────────────────────────────────────────────────────────────
 * Frontend가 정한 4단계 워크플로우 (backend `unread/read/dismissed`와 의미 다름).
 */

export const ALERT_STATUS = Object.freeze({
  PENDING:    'pending',
  IN_PROCESS: 'in_process',
  COMPLETED:  'completed',
  CANCELLED:  'cancelled',
});

export const ALERT_PRIORITY = Object.freeze({
  LOW:      'low',
  MEDIUM:   'medium',
  HIGH:     'high',
  CRITICAL: 'critical',
});

/** Priority 정렬용 (큰 숫자가 먼저 처리할 항목) */
export const ALERT_PRIORITY_RANK = Object.freeze({
  critical: 4,
  high:     3,
  medium:   2,
  low:      1,
});
