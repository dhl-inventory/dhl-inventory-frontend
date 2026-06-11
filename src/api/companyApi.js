/**
 * companyApi — 11 Company Management API 어댑터
 * ─────────────────────────────────────────────────────────────
 * 11은 pending §2.29 Post-MVP. backend `/companies/*` endpoint 전무.
 * MVP는 mock-first read-only 조립이라 신규 backend 0건.
 *
 * backend가 scope/company 도메인을 ship하면 아래 한 줄만 true 로 바꾸면
 * 실 endpoint 연결(UI 변경 0). 추후 요청 스펙은
 * docs/architecture/api_feedback/backend_followup_queue.md 의 Q 항목.
 *
 * 모드 분기 (zoneApi와 동일):
 *  - VITE_USE_MOCK !== 'false' → mock (dev 기본값)
 *  - VITE_USE_MOCK === 'false' → 실 API (단, BACKEND_READY=false면 강제 mock)
 */

import { http } from '../core/http.js';
import { toCamel } from '../core/normalize.js';
import { mockCompanyOverview } from '../mocks/companyMock.js';

const USE_MOCK = import.meta.env.VITE_USE_MOCK !== 'false';

// backend `/companies/overview` 미ship — true 전 강제 mock (zoneApi createSection 가드와 동일 패턴)
const COMPANY_API_BACKEND_READY = false;

function fromMock(envelope) {
  if (!envelope?.success) {
    const err = new Error(envelope?.message || 'Mock error');
    err.status = 404;
    err.body = envelope;
    return Promise.reject(err);
  }
  return Promise.resolve({
    data:       toCamel(envelope.data),
    message:    envelope.message,
    receivedAt: Date.now(),
  });
}

// ─── GET /companies/overview ─────────────────────────────
export function fetchCompanyOverview() {
  if (USE_MOCK || !COMPANY_API_BACKEND_READY) return fromMock(mockCompanyOverview());
  return http.get('/companies/overview');
}
