/**
 * alertDisplay — alert 표시 문자열(title/message)을 alertType + target 으로 생성.
 * ─────────────────────────────────────────────────────────────
 * 설계 (backend_alerts_agreements §3.2.D / post_mvp_backlog #8 종착점):
 *   - 데이터층(mock 이든 실 API 든)은 alertType + target 구조필드만 책임.
 *   - 표시/번역은 본 렌더 헬퍼가 i18n 템플릿(`alert.tpl.<type>.*`)으로 생성.
 *   - → mock / 실 API 가 동일 렌더 경로로 수렴 (분기 0). 데이터에 lang 문자열 없음.
 *   - 미정의 alert_type 은 backend raw `title`/`message` 폴백(안전망).
 */
import { t, tf } from '../../core/i18n/index.js';

const TPL_TYPES = new Set([
  'out_of_stock', 'stock_critical', 'stock_warning', 'stock_overstock',
  'expiry_critical', 'expiry_warning', 'fefo_violation',
  'device_issue', 'abnormal_access',
]);

export function alertDisplay(a) {
  const type = a?.alertType;
  if (!type || !TPL_TYPES.has(type)) {
    // 알 수 없는 타입 — backend 가 보낸 원문 그대로 (i18n 불가, 안전 폴백)
    return { title: a?.title ?? '', message: a?.message ?? '' };
  }
  const g = a?.target ?? {};
  const params = {
    displayName:   g.displayName ?? '',
    zoneName:      g.zoneName ?? '',
    sectionName:   g.sectionName ?? '',
    currentQty:    g.currentQty ?? '—',
    standardQty:   g.standardQty ?? '—',
    batchId:       g.batchId ?? g.lotId ?? '',
    expiryDate:    g.expiryDate ?? '',
    daysRemaining: g.daysRemaining ?? '',
    deviceName:    g.deviceName ?? '',
    issueCode:     g.issueCode ?? '',
  };
  return {
    title:   t(`alert.tpl.${type}.title`),
    message: tf(`alert.tpl.${type}.msg`, params),
  };
}

// ─── 알림 row 클릭 시 어디로 drill 할지 — alert_type + target 기반 ─
//   AlertCenter 벨 드롭다운에서 사용 (토스트 onClick 은 현행 `/alerts?focusId` 유지 — BK 결정).
//   매핑:
//     stock_* / out_of_stock                → Section Detail (?zone=…&id={sectionId})  ※ "그 자리에 가서 봐야지" 의도
//                                              zone_id 또는 section_id 누락 시 SKU Detail 폴백
//     expiry_* / fefo_violation             → Validity Tracking (?sku_id={skuId})  ※ BE 가 이미 sku_id filter 지원
//     abnormal_access                       → Section Detail (?zone=…&id={sectionId})
//     device_issue / unknown / target 누락 → AlertList fallback (?focusId={alertId})
export function getAlertDrillHref(alert) {
  const type = alert?.alertType;
  const g = alert?.target ?? {};

  // Stock 계열 → Section Detail (위치 우선). zone/section 정보 없으면 SKU Detail 폴백.
  if (type === 'out_of_stock' || type?.startsWith?.('stock_')) {
    if (g.zoneId && g.sectionId) {
      return `#/zone/section?zone=${encodeURIComponent(g.zoneId)}&id=${encodeURIComponent(g.sectionId)}`;
    }
    if (g.skuId) {
      return `#/inventory/sku-detail?id=${encodeURIComponent(g.skuId)}`;
    }
  }
  // Expiry / FEFO 계열 → Validity Tracking 필터
  if (g.skuId && (type?.startsWith?.('expiry_') || type === 'fefo_violation')) {
    return `#/validity?sku_id=${encodeURIComponent(g.skuId)}`;
  }
  // 비정상 접근 → Section Detail
  if (type === 'abnormal_access' && g.zoneId && g.sectionId) {
    return `#/zone/section?zone=${encodeURIComponent(g.zoneId)}&id=${encodeURIComponent(g.sectionId)}`;
  }
  // Fallback — AlertList focus
  return alert?.alertId
    ? `#/alerts?focusId=${encodeURIComponent(alert.alertId)}`
    : '#/alerts';
}
