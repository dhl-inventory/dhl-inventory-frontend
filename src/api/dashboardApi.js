/**
 * dashboardApi — Dashboard 6 endpoint 합성 어댑터
 * ─────────────────────────────────────────────────────────────
 * Backend는 단일 `/dashboard/summary`를 제공하지 않음. Frontend가
 * 6개 호출을 Promise.all로 병렬 합성해서 dashboardStore에 넣는다.
 *
 * 자세한 패턴:
 *  - architecture/backend_dashboard_agreements.md (응답 schema)
 *  - architecture/api_connection_plan.md §3.1 N1 (snake→camel) §3.8 M1 (receivedAt)
 *
 * 모드 분기:
 *  - VITE_USE_MOCK !== 'false' → mock 데이터 (dev 기본값)
 *  - VITE_USE_MOCK === 'false' → 실 API (`http.get`)
 *
 * 모든 응답은 `{ data, message, receivedAt }` 모양으로 통일되어 downstream에서
 * mock / 실 API 구분 불필요. snake→camel 변환은 mock 경로에서도 toCamel로 처리.
 */

import { http } from '../core/http.js';
import { toCamel } from '../core/normalize.js';
import {
  mockDashboardInbound,
  mockDashboardOutbound,
  mockDashboardValidity,
  mockDashboardCapacity,
  mockDashboardTopItems,
  mockDashboardValidityList,
} from '../mocks/dashboardMock.js';

const USE_MOCK = import.meta.env.VITE_USE_MOCK !== 'false';

// ─── mock helper ─────────────────────────────────────────
// mock 함수는 raw envelope `{ success, data, message }` 반환.
// http.get과 동일한 `{ data(camel), message, receivedAt }` 모양으로 변환.
function fromMock(mockFn, params) {
  const env = mockFn(params);
  return Promise.resolve({
    data:       toCamel(env.data),
    message:    env.message,
    receivedAt: Date.now(),
  });
}

// ─── 개별 endpoint ───────────────────────────────────────
export function fetchInbound(params) {
  return USE_MOCK
    ? fromMock(mockDashboardInbound, params)
    : http.get('/dashboard/inbound', params);
}

export function fetchOutbound(params) {
  return USE_MOCK
    ? fromMock(mockDashboardOutbound, params)
    : http.get('/dashboard/outbound', params);
}

export function fetchValidity(params) {
  return USE_MOCK
    ? fromMock(mockDashboardValidity, params)
    : http.get('/dashboard/validity', params);
}

export function fetchCapacity(params) {
  return USE_MOCK
    ? fromMock(mockDashboardCapacity, params)
    : http.get('/dashboard/capacity', params);
}

export function fetchTopItems(params) {
  return USE_MOCK
    ? fromMock(mockDashboardTopItems, params)
    : http.get('/dashboard/top-items', params);
}

export function fetchValidityList(params) {
  return USE_MOCK
    ? fromMock(mockDashboardValidityList, params)
    : http.get('/dashboard/validity-list', params);
}

// ─── 합성 ────────────────────────────────────────────────
/**
 * 6개 endpoint를 병렬 호출하고 단일 summary 객체로 합성.
 *
 * @param {object} [params] - period / scope 등 query (mock 단계에선 무시)
 * @returns {Promise<{
 *   inbound, outbound, validity, capacity, topItems, validityList,
 *   receivedAt: number
 * }>}
 */
export async function fetchDashboardSummary(params) {
  const [inbound, outbound, validity, capacity, topItems, validityList] = await Promise.all([
    fetchInbound(params),
    fetchOutbound(params),
    fetchValidity(params),
    fetchCapacity(params),
    fetchTopItems(params),
    fetchValidityList(params),
  ]);

  return {
    inbound:      inbound.data,
    outbound:     outbound.data,
    validity:     validity.data,
    capacity:     capacity.data,
    topItems:     topItems.data,
    validityList: validityList.data,
    // 6개 응답 모두 받은 시점. TopBar "Updated 14:23" 표시용 (M1).
    receivedAt:   Date.now(),
  };
}
