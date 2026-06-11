/**
 * Stock Status Helpers (D1 패턴)
 * ─────────────────────────────────────────────────────────────
 * Backend는 raw 수치(currentQty, standardQty)만 보내고 frontend가
 * metric_definitions.md §5 기준으로 6단계 stockStatus를 derive.
 *
 * 자세한 패턴: docs/architecture/api_connection_plan.md §3.4 (D1)
 *
 * 임계값 (2026-05-26 완화 — 사용자 피드백, 관심 리스트 노이즈 감소):
 *   out_of_stock  qty = 0
 *   critical      0 < rate < 0.20
 *   warning       0.20 <= rate < 0.50
 *   watch         0.50 <= rate < 0.70
 *   normal        0.70 <= rate <= 1.30
 *   overstock     rate > 1.30
 *
 * backend (alert_jobs.py / dashboard_service.py / inventory_service.py) 동일 유지.
 */

import { STOCK_STATUS } from '../constants/stockStatusEnums.js';

// 시연 demo SKU — backend 의 _DEMO_TIGHT_SKUS 와 동기.
const DEMO_TIGHT_SKUS = new Set(['20763000001136', '20753000091136']);

/**
 * 6단계 stockStatus 분류
 * @param {number} currentQty
 * @param {number} baselineQty - SKU별 기준 수량 (= standardQty)
 * @param {string} [skuId] - SKU id (시연 SKU 면 더 타이트한 threshold 적용)
 */
export function deriveStockStatus(currentQty, baselineQty, skuId = null) {
  if (currentQty === 0) return STOCK_STATUS.OUT_OF_STOCK;
  if (!baselineQty || baselineQty <= 0) return STOCK_STATUS.NORMAL;

  const rate = currentQty / baselineQty;
  // 시연 SKU 만 critical threshold 60% (일반은 20%)
  if (DEMO_TIGHT_SKUS.has(skuId)) {
    if (rate < 0.60) return STOCK_STATUS.CRITICAL;
    if (rate <= 1.30) return STOCK_STATUS.NORMAL;
    return STOCK_STATUS.OVERSTOCK;
  }
  if (rate < 0.20) return STOCK_STATUS.CRITICAL;
  if (rate < 0.50) return STOCK_STATUS.WARNING;
  if (rate < 0.70) return STOCK_STATUS.WATCH;
  if (rate <= 1.30) return STOCK_STATUS.NORMAL;
  return STOCK_STATUS.OVERSTOCK;
}

export function deriveCapacityRate(currentQty, baselineQty) {
  if (!baselineQty || baselineQty <= 0) return 0;
  return currentQty / baselineQty;
}

export function deriveShortageQty(currentQty, baselineQty) {
  return Math.max((baselineQty || 0) - (currentQty || 0), 0);
}

export function deriveExcessQty(currentQty, baselineQty) {
  return Math.max((currentQty || 0) - (baselineQty || 0), 0);
}

/**
 * F-002 stock_low (의약품 사전 경고)
 * 절대 수량 1~2개 임계 — 6단계 stockStatus와 직교 축
 * 자세한 의도: pending §2.24, metric_definitions §11
 */
export function isStockLow(currentQty) {
  return currentQty > 0 && currentQty <= 2;
}
