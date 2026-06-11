/**
 * alertsApi — Alerts 도메인 API 어댑터
 * ─────────────────────────────────────────────────────────────
 * Backend `/alerts/*` endpoint 호출 + mock 모드 분기.
 *
 * 자세한 패턴:
 *  - architecture/api_connection_plan.md §3.1 N1 (snake→camel)
 *  - architecture/api_connection_plan.md §3.8 M1 (Date.now receivedAt)
 *  - ADR-019 Alerts status 정책 (status 4단계, severity 단일, target denormalize)
 *  - backend_alerts_request.md §3.1 (sku_id / section_id / zone_id query 확정)
 *
 * 모드 분기:
 *  - VITE_USE_MOCK !== 'false' → mock (dev 기본값)
 *  - VITE_USE_MOCK === 'false' → 실 API (`http.get`)
 *
 * 모든 응답은 `{ data(camel), message, receivedAt }` 모양으로 통일.
 */

import { http } from '../core/http.js';
import { toCamel } from '../core/normalize.js';
import { mockAlerts, mockAlertStatusUpdate } from '../mocks/alertsMock.js';

const USE_MOCK = import.meta.env.VITE_USE_MOCK !== 'false';

// ─── mock helper ─────────────────────────────────────────
function fromMock(envelope) {
  return Promise.resolve({
    data:       toCamel(envelope.data),
    message:    envelope.message,
    receivedAt: Date.now(),
  });
}

// ─── GET /alerts (목록) ──────────────────────────────────
//   query: sku_id, section_id, zone_id, status, alert_type, severity, sort_by, order, page, limit
//   응답: { pendingCount, inProcessCount, criticalCount, items, totalCount }
//
//   ⚠️ Backend는 status를 단일 Literal로만 받음 (콤마 묶음 미지원).
//     status === 'active' 인 가상 필터는 frontend가 pending + in_process 두 번 호출 후 합성.
//     items는 합치고 counts는 둘 중 첫 응답값 사용 (site-wide 동일 응답).
//     pagination은 'active' 일 때는 backend에서 별도 페이지로 잡힘 — limit 안에서만 안전.
//     'active'를 한 페이지로 표시할 때 limit가 작으면 일부 누락 가능 → limit 충분히 크게 권장.
export function fetchAlerts(params) {
  if (USE_MOCK) {
    return fromMock(mockAlerts(params));
  }
  if (params?.status === 'active') {
    return fetchAlertsActive(params);
  }
  return http.get('/alerts', params);
}

// active = pending + in_process 두 번 호출 후 합성 (frontend 측 정합)
async function fetchAlertsActive(params) {
  const { status: _omit, ...rest } = params;
  const [pendingRes, inProcessRes] = await Promise.all([
    http.get('/alerts', { ...rest, status: 'pending' }),
    http.get('/alerts', { ...rest, status: 'in_process' }),
  ]);
  // backend 응답 envelope은 이미 http.get에서 normalize (camelCase data)
  const pendingData    = pendingRes?.data ?? {};
  const inProcessData  = inProcessRes?.data ?? {};
  const items = [...(pendingData.items ?? []), ...(inProcessData.items ?? [])];
  // counts는 site-wide라 둘 중 어느 응답 값을 써도 동일 (방어적으로 max 사용)
  return {
    data: {
      items,
      totalCount:     (pendingData.totalCount ?? 0) + (inProcessData.totalCount ?? 0),
      pendingCount:   pendingData.pendingCount   ?? inProcessData.pendingCount   ?? 0,
      inProcessCount: pendingData.inProcessCount ?? inProcessData.inProcessCount ?? 0,
      criticalCount:  pendingData.criticalCount  ?? inProcessData.criticalCount  ?? 0,
    },
    message:    pendingRes?.message ?? null,
    receivedAt: Date.now(),
  };
}

// ─── PATCH /alerts/{alert_id} (status 변경) ──────────────
//   body: { status: 'pending' | 'in_process' | 'completed' | 'cancelled' }
export function updateAlertStatus(alertId, status) {
  if (USE_MOCK) {
    return fromMock(mockAlertStatusUpdate(alertId, status));
  }
  return http.patch(`/alerts/${encodeURIComponent(alertId)}`, { status });
}
