/**
 * validityApi — 04 Validity Tracking API 어댑터
 * ─────────────────────────────────────────────────────────────
 * Backend `/expiry/batches` endpoint 호출 + mock 모드 분기.
 *
 * 참조 문서:
 *  - docs/project/04_api_endpoints.md (`/expiry/batches`)
 *  - docs/page_layout_outline.md §9
 *  - docs/architecture/api_connection_plan.md §7 (04 layout 재설계 진행 중)
 *
 * 모드 분기:
 *  - VITE_USE_MOCK !== 'false' → mock (dev 기본값)
 *  - VITE_USE_MOCK === 'false' → 실 API (`http.get`)
 *
 * 응답 envelope: `{ data(camel), message, receivedAt }`
 */

import { http } from '../core/http.js';
import { toCamel } from '../core/normalize.js';
import { mockValidityBatches, mockExpiryRiskItems } from '../mocks/validityMock.js';

const USE_MOCK = import.meta.env.VITE_USE_MOCK !== 'false';

function fromMock(envelope) {
  return Promise.resolve({
    data:       toCamel(envelope.data),
    message:    envelope.message,
    receivedAt: Date.now(),
  });
}

// ─── GET /expiry/batches ────────────────────────────────
//   실 BE 가 받는 것만: zone_id, sku_id, status(단일 Literal), sort=expiry_asc|expiry_desc, page, limit
//   (search/fefo_violation/section_id/sort_by+order 분리 = BE 미지원, FE 가 흡수)
export function fetchValidityBatches(params) {
  if (USE_MOCK) return fromMock(mockValidityBatches(params));
  return http.get('/expiry/batches', params);
}

// ─── GET /expiry/risk-items ─────────────────────────────
//   chip 카운트용(expired/critical/warning/normal summary). 마운트·scope 변경 시 1회만.
//   query: zone_id?(scope), status?(미사용)
export function fetchExpiryRiskItems(params = {}) {
  if (USE_MOCK) return fromMock(mockExpiryRiskItems(params));
  return http.get('/expiry/risk-items', params);
}
