/**
 * zoneApi — Zone 도메인 API 어댑터 (03-1 / 03-2 / 03-3)
 * ─────────────────────────────────────────────────────────────
 * Backend endpoint 3건 + 옵션 A 우회 (Section detail 4필드 합성):
 *  - GET /scope/zones                                            → 03-1 Zone Overview
 *  - GET /inventory/zones/{zone_id}/sections                     → 03-2 Section grid
 *  - GET /inventory/zones/{zone_id}/sections/{section_id}        → 03-2 panel / 03-3 detail
 *
 * 자세한 정합:
 *  - docs/architecture/api_feedback/requests/backend_zone_request.md §1 진척 표 + §5.5 옵션 A/B
 *
 * §3.3 4필드(`total_qty / standard_qty / capacity_rate / stock_status`) 처리:
 *  - mock 모드: mockZoneSectionDetail이 이미 4필드 포함 — 무관
 *  - 실 API 모드: backend §3.3 옵션 A/B 결정 대기.
 *    옵션 A 우회 — fetchZoneSectionDetail이 Promise.all로 /sections + /section/{id} 동시 호출 후
 *    section_id로 4필드 추출해서 detail에 합성. backend §3.3 옵션 B 채택 시 합성 코드 제거 가능.
 *
 * 모드 분기:
 *  - VITE_USE_MOCK !== 'false' → mock (dev 기본값)
 *  - VITE_USE_MOCK === 'false' → 실 API
 */

import { http } from '../core/http.js';
import { toCamel } from '../core/normalize.js';
import {
  mockScopeZones,
  mockZoneSections,
  mockZoneSectionDetail,
  mockEventSnapshots,
  mockZoneFefo,
  mockZoneEvents,
  mockSectionEvents,
  mockCreateSection,
} from '../mocks/zoneMock.js';

const USE_MOCK = import.meta.env.VITE_USE_MOCK !== 'false';

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

// section_id 정합 helper (pending §2.48):
//   backend section_id는 ADR-028로 INT 통일. mock 'sec-A1' 같은 string은 NaN → raw fallback.
//   실 API 모드에서 mock 데이터가 INT로 일괄 변환되면(B 옵션) 이 헬퍼는 자연스럽게 INT만 전달.
function toIntOrRaw(v) {
  if (v == null || v === '') return v;
  const n = Number(v);
  return Number.isFinite(n) ? n : v;
}

// ─── /scope/zones ────────────────────────────────────────
export function fetchZoneOverview() {
  if (USE_MOCK) return fromMock(mockScopeZones());
  return http.get('/scope/zones');
}

// ─── /inventory/zones/{zone_id}/sections ────────────────
export function fetchZoneSections(zoneId) {
  if (USE_MOCK) return fromMock(mockZoneSections(zoneId));
  return http.get(`/inventory/zones/${encodeURIComponent(zoneId)}/sections`);
}

// ─── /inventory/zones/{zone_id}/sections/{section_id} ──
// 옵션 A 우회 적용: backend 실 응답에 Section-level 4필드가 없으면 /sections list에서 합성.
// backend §3.3 옵션 B 채택 시: detail 응답이 4필드를 이미 포함 → 합성 noop.
export async function fetchZoneSectionDetail(zoneId, sectionId) {
  // URL params 등에서 string으로 올 수 있어 함수 진입 시 INT 변환 (pending §2.48)
  const sectionIdInt = toIntOrRaw(sectionId);
  if (USE_MOCK) return fromMock(mockZoneSectionDetail(zoneId, sectionIdInt));

  // backend /inventory/zones/{}/sections/{} 가 related_alerts 를 내려주지 않아
  //   /alerts?section_id=&status=pending 으로 직접 합성. 알림 API 실패해도 section detail
  //   본체 로딩은 유지되도록 .catch 로 빈 envelope fallback.
  const [sectionsRes, detailRes, eventsRes, alertsRes] = await Promise.all([
    http.get(`/inventory/zones/${encodeURIComponent(zoneId)}/sections`),
    http.get(`/inventory/zones/${encodeURIComponent(zoneId)}/sections/${encodeURIComponent(sectionIdInt)}`),
    http.get('/inventory/events', { section_id: sectionIdInt, limit: 5 }).catch(() => ({ data: { items: [] } })),
    http.get('/alerts', { section_id: sectionIdInt, status: 'pending', limit: 5 }).catch(() => ({ data: { items: [] } })),
  ]);
  const aggregate = (sectionsRes?.data?.items ?? []).find((s) => s.sectionId === sectionIdInt);
  const detail = detailRes?.data ?? {};

  // detail에 4필드가 이미 있으면 그대로, 없으면 aggregate에서 보강 (옵션 A 합성)
  return {
    ...detailRes,
    data: {
      ...detail,
      totalQty:     detail.totalQty     ?? aggregate?.totalQty,
      standardQty:  detail.standardQty  ?? aggregate?.standardQty,
      capacityRate: detail.capacityRate ?? aggregate?.capacityRate,
      stockStatus:  detail.stockStatus  ?? aggregate?.stockStatus,
      recentEvents: detail.recentEvents ?? eventsRes?.data?.items ?? [],
      relatedAlerts: detail.relatedAlerts ?? alertsRes?.data?.items ?? [],
    },
  };
}

// ─── GET /inventory/events?section_id=&page=&limit= (Section Events 모달) ──
//   backend InventoryEventsResponse 그대로 사용 (BE limit max 100, default 20).
export function fetchSectionEvents(sectionId, { page = 1, limit = 20 } = {}) {
  const sectionIdInt = toIntOrRaw(sectionId);
  if (USE_MOCK) return fromMock(mockSectionEvents(sectionIdInt, page, limit));
  return http.get('/inventory/events', { section_id: sectionIdInt, page, limit });
}

// ─── GET /inventory/events/{event_id}/snapshots ─────────
// backend_snapshot_agreements §2: Recent Events eye 버튼 → 이벤트 시점 촬영 snapshot.
//   scan 이벤트만 이미지 보유, 수동(scan_id null)은 snapshots:[] 안전 응답.
//   실 API presigned URL 만료 1h → 모달 오픈 시점 lazy fetch (호출 측에서 보장).
export function fetchEventSnapshots(eventId) {
  if (USE_MOCK) return fromMock(mockEventSnapshots(eventId));
  return http.get(`/inventory/events/${encodeURIComponent(eventId)}/snapshots`);
}

// ─── POST section 등록 (C-2, mock-first) ────────────────
// 고객 SSAFY §8 section 등록. 실 endpoint·계약 = backend 미확정
//   (agreement §4 §3.4 후속 회차 분리, followup Q-6).
// READY 가드: backend 가 endpoint 구현·계약 확정 전까지 prod(VITE_USE_MOCK=false)
//   에서도 **무조건 mock** 반환 → 미구현 endpoint 호출 에러 0.
//   backend ship 시 SECTION_CREATE_BACKEND_READY = true 한 줄만 → 실 연결(UI 변경 0).
const SECTION_CREATE_BACKEND_READY = true;

export function createSection(payload) {
  if (USE_MOCK || !SECTION_CREATE_BACKEND_READY) {
    const env = mockCreateSection(payload);
    if (!env.success) {
      return Promise.reject({ body: { message: env.message }, message: env.message });
    }
    return fromMock(env);
  }
  // backend_followup_agreements Q-6: 실 endpoint = `POST /api/v1/admin/sections`(권한 super+ops)
  return http.post('/admin/sections', payload);
}

// ─── GET /expiry/fefo/by-zone (03-2 Zone Detail F-008 구역별 FEFO 준수율) ─
// backend get_fefo_by_zone 정합:
//   { zone_id, compliance_rate, violation_count, violations:[{event_id,sku_name,section_id,created_at}] }
export function fetchZoneFefo(zoneId) {
  if (USE_MOCK) return fromMock(mockZoneFefo(zoneId));
  return http.get('/expiry/fefo/by-zone', { zone_id: zoneId });
}

// ─── GET /inventory/events?zone_id= (R-1 Recent Zone Events) ──
//   03-3 section events 와 동일 endpoint, zone_id 필터. backend 신규 0.
export function fetchZoneEvents(zoneId) {
  if (USE_MOCK) return fromMock(mockZoneEvents(zoneId));
  return http.get('/inventory/events', { zone_id: zoneId, limit: 5 });
}
