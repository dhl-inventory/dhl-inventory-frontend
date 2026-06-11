/**
 * statusDisplay — enum value → 표현 (label / class / icon) 매핑 helper
 * ─────────────────────────────────────────────────────────────
 * Backend가 보내는 enum string을 화면 표현으로 변환하는 단일 출처.
 *
 * 정책:
 *  - enum value 자체는 정의하지 않음 — backend 응답이 진실 소스 (99_api §9).
 *  - 다국어 라벨은 i18n key 반환 (`t(key)`로 컴포넌트가 변환).
 *  - CSS 클래스는 `index.css`의 `bg-{ns}-{key}` 패턴 따름.
 *  - Material Symbols 아이콘 이름 반환 (컴포넌트가 `<span class="material-symbols-outlined">`로 사용).
 *
 * 사용 예:
 *   import { stockStatusBadgeClass, stockStatusLabelKey } from '../utils/statusDisplay.js';
 *   import { t } from '../core/i18n/index.js';
 *
 *   const cls = stockStatusBadgeClass(row.stockStatus);
 *   const lbl = t(stockStatusLabelKey(row.stockStatus));
 *
 * 관련:
 *  - metric_definitions.md §5 (6단계 stockStatus 정의)
 *  - backend_dashboard_agreements.md (validity 4단계)
 *  - 99_api_design_decisions.md §9 (코드값 / 다국어 분리)
 *  - pending §2.27 (폴더 구조 도입 정책)
 */

// ─── 6단계 stockStatus (재고 충족도) ────────────────────
//   metric_definitions §5
//   capacity_rate 기반 분류, backend가 enum 직접 제공
export function stockStatusBadgeClass(status) {
  if (!status) return 'bg-status-normal';
  // 'out_of_stock' → 'out-of-stock' (CSS 클래스 명명)
  return `bg-status-${status.replace(/_/g, '-')}`;
}

export function stockStatusLabelKey(status) {
  // i18n 사전 키. en.js / ko.js에 등록 필요.
  // 예: en.stockStatus.out_of_stock = 'Out of stock', ko.stockStatus.out_of_stock = '재고 없음'
  return `stockStatus.${status || 'normal'}`;
}

export function stockStatusIcon(status) {
  switch (status) {
    case 'out_of_stock': return 'error';        // 빨강 ! 삼각
    case 'critical':     return 'error';
    case 'warning':      return 'warning';      // 주황 삼각
    case 'watch':        return 'visibility';   // 관찰
    case 'normal':       return 'check_circle';
    case 'overstock':    return 'arrow_upward';
    default:             return 'help';
  }
}

// ─── 4단계 validity status (유통기한) ───────────────────
//   backend_dashboard_agreements §1
export function validityStatusBadgeClass(status) {
  if (!status) return 'bg-validity-normal';
  return `bg-validity-${status}`;
}

export function validityStatusLabelKey(status) {
  return `validityStatus.${status || 'normal'}`;
}

export function validityStatusIcon(status) {
  switch (status) {
    case 'expired':  return 'block';          // 만료
    case 'critical': return 'event_busy';     // 임박
    case 'warning':  return 'event_upcoming';
    case 'normal':   return 'event_available';
    default:         return 'event';
  }
}

// ─── 3단계 alert severity (알림 심각도) ─────────────────
//   backend alerts.py 모델 — info / warning / critical
export function severityBadgeClass(severity) {
  if (!severity) return 'bg-severity-info';
  return `bg-severity-${severity}`;
}

export function severityLabelKey(severity) {
  return `severity.${severity || 'info'}`;
}

export function severityIcon(severity) {
  switch (severity) {
    case 'critical': return 'error';
    case 'warning':  return 'warning';
    case 'info':     return 'info';
    default:         return 'notifications';
  }
}

// ─── alert_type (free string, 자주 쓰이는 유형 매핑) ────
//   ADR-012의 6종 + abnormal_access / device_issue 추가 가능
//   Backend가 새 type 추가해도 default 'notifications' 아이콘으로 fallback
export function alertTypeIcon(alertType) {
  switch (alertType) {
    case 'expiry_warning':
    case 'expiry_critical':
      return 'event_busy';
    case 'stock_low':
    case 'stock_shortage':
    case 'stock_empty':
      return 'inventory_2';
    case 'fefo_violation':
      return 'rule';
    case 'device_issue':
      return 'videocam_off';
    case 'abnormal_access':
      return 'security';
    default:
      return 'notifications';
  }
}

export function alertTypeLabelKey(alertType) {
  return `alertType.${alertType || 'notifications'}`;
}

// ─── 3단계 alert status (처리 상태) ─────────────────────
//   backend — unread / read / dismissed
//   layout outline §10의 4단계 (pending/in_process/completed/cancelled)와 차이
//   reconcile 필요 (backend_alerts_request §3.2 참고)
export function alertStatusBadgeClass(status) {
  if (!status) return 'bg-alert-status-unread';
  return `bg-alert-status-${status}`;
}

export function alertStatusLabelKey(status) {
  return `alertStatus.${status || 'unread'}`;
}

// ─── 공통 helper — 색깔 우선순위 비교용 (정렬용) ────────
//   stockStatus를 정렬 가중치 숫자로 변환 (낮을수록 위험)
const STOCK_STATUS_RANK = {
  out_of_stock: 0,
  critical:     1,
  warning:      2,
  watch:        3,
  normal:       4,
  overstock:    5,
};

export function stockStatusRank(status) {
  return STOCK_STATUS_RANK[status] ?? 99;
}

const SEVERITY_RANK = { critical: 0, warning: 1, info: 2 };

export function severityRank(severity) {
  return SEVERITY_RANK[severity] ?? 99;
}
