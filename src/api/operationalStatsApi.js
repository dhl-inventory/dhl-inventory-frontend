/**
 * operationalStatsApi — 07 Operational Stats 6 endpoint 합성 어댑터
 * ─────────────────────────────────────────────────────────────
 * Dashboard 패턴 차용 — Promise.allSettled로 6 endpoint 병렬 호출.
 * 일부 endpoint 실패해도 페이지가 부분 표시되도록 graceful fallback.
 *
 * Backend schema (검증 2026-05-14):
 *  - /analytics/stats:               start_date, end_date (필수), period(daily/weekly/monthly)
 *  - /analytics/kpi:                 start_date, end_date (필수, date 타입)
 *  - /analytics/outbound-frequency:  start_date, end_date (필수), zone_id, limit
 *  - /analytics/consumption:         year (필수), month (선택)
 *  - /analytics/zone-access:         start_date, end_date (필수), zone_id
 *  - /analytics/events:              start_date, end_date (선택), category, page, limit, zone_id
 *
 * Frontend의 period(today/7d/30d/month) → start_date/end_date 변환은 본 파일이 단일 책임.
 * consumption은 year/month 별도 변환.
 *
 * 모드 분기:
 *  - VITE_USE_MOCK !== 'false' → mock (dev 기본값)
 *  - VITE_USE_MOCK === 'false' → 실 API
 */

import { http } from '../core/http.js';
import { toCamel } from '../core/normalize.js';
import {
  mockAnalyticsStats,
  mockAnalyticsKpi,
  mockAnalyticsOutboundFrequency,
  mockAnalyticsConsumption,
  mockAnalyticsZoneAccess,
  mockAnalyticsEvents,
} from '../mocks/operationalStatsMock.js';

const USE_MOCK = import.meta.env.VITE_USE_MOCK !== 'false';

function fromMock(mockFn, params) {
  const env = mockFn(params);
  return Promise.resolve({
    data:       toCamel(env.data),
    message:    env.message,
    receivedAt: Date.now(),
  });
}

// ─── period → start_date/end_date 변환 ──────────────────
// backend는 'daily'/'weekly'/'monthly' enum만 받으므로 period는 mock에만 전달.
function periodToDateRange(period) {
  const now = new Date();
  let start = new Date(now);
  let end   = new Date(now);

  if (period === 'today') {
    start.setHours(0, 0, 0, 0);
    end.setHours(23, 59, 59, 999);
  } else if (period === '7d') {
    start.setDate(now.getDate() - 6);
    start.setHours(0, 0, 0, 0);
    end.setHours(23, 59, 59, 999);
  } else if (period === '30d') {
    start.setDate(now.getDate() - 29);
    start.setHours(0, 0, 0, 0);
    end.setHours(23, 59, 59, 999);
  } else if (period === 'month') {
    start = new Date(now.getFullYear(), now.getMonth(), 1, 0, 0, 0);
    end   = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59);
  } else {
    start.setHours(0, 0, 0, 0);
    end.setHours(23, 59, 59, 999);
  }
  return {
    start_date: start.toISOString(),
    end_date:   end.toISOString(),
  };
}

// /kpi는 datetime이 아닌 date(YYYY-MM-DD) 타입을 받는다고 한 명세를 고려.
function periodToDateOnlyRange(period) {
  const { start_date, end_date } = periodToDateRange(period);
  return {
    start_date: start_date.slice(0, 10),
    end_date:   end_date.slice(0, 10),
  };
}

// consumption은 year/month로만 받음
function periodToYearMonth(period) {
  const now = new Date();
  const year = now.getFullYear();
  // today / month → 이번달 / 7d / 30d → year만 (month 미지정)
  if (period === 'today' || period === 'month') {
    return { year, month: now.getMonth() + 1 };
  }
  return { year };
}

// ─── 개별 endpoint (실 API용 query 변환 포함) ──────────────
export function fetchAnalyticsStats(params = {}) {
  if (USE_MOCK) return fromMock(mockAnalyticsStats, params);
  return http.get('/analytics/stats', {
    ...periodToDateRange(params.period),
    period: 'daily',
    ...(params.zone_id ? { zone_id: params.zone_id } : {}),
  });
}

export function fetchAnalyticsKpi(params = {}) {
  if (USE_MOCK) return fromMock(mockAnalyticsKpi, params);
  return http.get('/analytics/kpi', {
    ...periodToDateOnlyRange(params.period),
    period: 'daily',
  });
}

export function fetchAnalyticsOutboundFrequency(params = {}) {
  if (USE_MOCK) return fromMock(mockAnalyticsOutboundFrequency, params);
  return http.get('/analytics/outbound-frequency', {
    ...periodToDateRange(params.period),
    period: 'daily',
    limit: 10,
    ...(params.zone_id ? { zone_id: params.zone_id } : {}),
  });
}

export function fetchAnalyticsConsumption(params = {}) {
  if (USE_MOCK) return fromMock(mockAnalyticsConsumption, params);
  return http.get('/analytics/consumption', {
    ...periodToYearMonth(params.period),
    ...(params.zone_id ? { zone_id: params.zone_id } : {}),
  });
}

export function fetchAnalyticsZoneAccess(params = {}) {
  if (USE_MOCK) return fromMock(mockAnalyticsZoneAccess, params);
  return http.get('/analytics/zone-access', {
    ...periodToDateRange(params.period),
    period: 'daily',
    ...(params.zone_id ? { zone_id: params.zone_id } : {}),
  });
}

export function fetchAnalyticsEvents(params = {}) {
  if (USE_MOCK) return fromMock(mockAnalyticsEvents, params);
  return http.get('/analytics/events', {
    ...periodToDateRange(params.period),
    limit: 10,
    ...(params.zone_id ? { zone_id: params.zone_id } : {}),
  });
}

// ─── 합성 (Promise.allSettled — graceful) ─────────────────
/**
 * 6 endpoint 병렬 호출. 일부 실패해도 나머지 카드는 표시.
 *
 * @returns {Promise<{
 *   stats, kpi, outboundFrequency, consumption, zoneAccess, events, receivedAt,
 *   partialErrors: { [name]: Error }
 * }>}
 */
export async function fetchOperationalStatsSummary(params) {
  const results = await Promise.allSettled([
    fetchAnalyticsStats(params),
    fetchAnalyticsKpi(params),
    fetchAnalyticsOutboundFrequency(params),
    fetchAnalyticsConsumption(params),
    fetchAnalyticsZoneAccess(params),
    fetchAnalyticsEvents(params),
  ]);
  const names = ['stats', 'kpi', 'outboundFrequency', 'consumption', 'zoneAccess', 'events'];
  const summary = { receivedAt: Date.now(), partialErrors: {} };
  results.forEach((res, i) => {
    const key = names[i];
    if (res.status === 'fulfilled') {
      summary[key] = res.value.data;
    } else {
      summary[key] = null;
      summary.partialErrors[key] = res.reason;
      console.warn(`[operationalStats] ${key} fetch failed`, res.reason);
    }
  });
  return summary;
}
