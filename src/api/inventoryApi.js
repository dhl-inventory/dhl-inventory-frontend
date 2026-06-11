/**
 * inventoryApi — Inventory 도메인 API 어댑터
 * ─────────────────────────────────────────────────────────────
 * Backend `/inventory/*` endpoint 호출 + mock 모드 분기.
 *
 * 자세한 패턴:
 *  - architecture/api_connection_plan.md §3.1 N1 (snake→camel)
 *  - architecture/api_connection_plan.md §3.8 M1 (Date.now receivedAt)
 *  - architecture/api_feedback/backend_inventory_request.md (응답 schema 합의 진행 중)
 *
 * 모드 분기:
 *  - VITE_USE_MOCK !== 'false' → mock (dev 기본값)
 *  - VITE_USE_MOCK === 'false' → 실 API (`http.get`)
 *
 * 모든 응답은 `{ data(camel), message, receivedAt }` 모양으로 통일.
 */

import { http } from '../core/http.js';
import { toCamel } from '../core/normalize.js';
import {
  mockInventoryStock,
  mockInventoryStockDetail,
  mockInventoryStockTrend,
  mockInventoryBatches,
  mockInventoryEvents,
  mockCreateRefillRequest,
  mockListRefillRequests,
  mockRegisterInbound,
  mockAdjustStock,
  mockZones,
  mockSectionsByZone,
} from '../mocks/inventoryMock.js';

const USE_MOCK = import.meta.env.VITE_USE_MOCK !== 'false';

// ─── mock helper ─────────────────────────────────────────
function fromMock(envelope) {
  return Promise.resolve({
    data:       toCamel(envelope.data),
    message:    envelope.message,
    receivedAt: Date.now(),
  });
}

// ─── /inventory/stock (목록) ─────────────────────────────
//   query: search, status, sort_by, order, zone_id, section_id, page, limit
export function fetchInventoryStock(params) {
  if (USE_MOCK) {
    return fromMock(mockInventoryStock(params));
  }
  return http.get('/inventory/stock', params);
}

// ─── /inventory/stock/{sku_id} (단건 상세) ──────────────
//   backend 신설 요청 진행 중 (backend_inventory_request §3.3)
//   mock은 이미 simulate
export function fetchInventoryStockDetail(skuId) {
  if (USE_MOCK) {
    return fromMock(mockInventoryStockDetail(skuId));
  }
  return http.get(`/inventory/stock/${encodeURIComponent(skuId)}`);
}

// ─── /inventory/stock/{sku_id}/trend (Phase 5.4) ────────
//   backend_inventory_agreements §3.5 — period=7d|30d, items=[{date,qty,inbound_qty,outbound_qty}]
//   backend 구현 완료 (`inventory.py:56`). frontend는 mock + 실 API 양쪽 정합.
export function fetchInventoryStockTrend(skuId, period = '7d') {
  if (USE_MOCK) {
    return fromMock(mockInventoryStockTrend(skuId, period));
  }
  return http.get(`/inventory/stock/${encodeURIComponent(skuId)}/trend`, { period });
}

// ─── /inventory/batches?sku_id={sku_id} (SKU Detail Validity Summary) ─
//   backend `inventory.py:90` 정합. items=[{batch_id, expiry_date, qty, ...}]
export function fetchInventoryBatches(skuId) {
  if (USE_MOCK) {
    return fromMock(mockInventoryBatches(skuId));
  }
  return http.get('/inventory/batches', { sku_id: skuId });
}

// ─── /inventory/events?sku_id={sku_id} (SKU Detail Recent Stock Events) ─
//   backend `inventory.py:138` 정합. items=[{event_id, event_type, ...}]
export function fetchInventoryEvents(skuId, limit = 10) {
  if (USE_MOCK) {
    return fromMock(mockInventoryEvents(skuId, limit));
  }
  return http.get('/inventory/events', { sku_id: skuId, limit });
}

// ─── POST /inventory/refill-requests ────────────────────
//   backend `inventory.py:177` 정합 (router prefix `/inventory`).
//   payload: { items: [{ sku_id, requested_qty }], reason?: string }
export function createRefillRequest(payload) {
  if (USE_MOCK) {
    return fromMock(mockCreateRefillRequest(payload));
  }
  return http.post('/inventory/refill-requests', payload);
}

// ─── GET /inventory/refill-requests (07 Operational Stats — Field Requests inbox) ─
//   backend `inventory.py:198` 정합 (router prefix `/inventory`).
//   query: status(콤마 다중), page, limit. site_id 는 JWT 자동 스코프.
//   응답: { items:[{request_id, sku_id, display_name, requested_qty, reason, status,
//          requested_by, requested_at, handled_by, handled_at}], total_count }
//   결정 근거: pending_design_decisions.md §2.15 (backend 구현됨 → 실데이터 연동)
export function listRefillRequests(params = {}) {
  if (USE_MOCK) {
    return fromMock(mockListRefillRequests(params));
  }
  return http.get('/inventory/refill-requests', params);
}

// ─── POST /inventory/inbound (Phase 2 — New Inbound Modal) ─
//   backend `inventory.py:222` 정합. payload: { sku_id, section_id, expiry_date, qty }
//   실패 시 message 키를 그대로 surface — 모달이 "기존 batch 문서 없음" 분기에서 활용.
export function registerInbound(payload) {
  if (USE_MOCK) {
    const env = mockRegisterInbound(payload);
    if (!env.success) {
      return Promise.reject({ body: { message: env.message }, message: env.message });
    }
    return fromMock(env);
  }
  return http.post('/inventory/inbound', payload);
}

// ─── POST /inventory/manual (02-2 Adjust Stock Modal — F-014 수동 보정) ─
//   backend `inventory.py:203` 정합. payload: { sku_id, section_id, adjusted_qty, reason }
//   backend 제약: delta>0(증가) 거절(증가는 /inventory/inbound) · batch 문서 없으면 거절.
//   감소분 batch 차감은 backend FEFO(유통기한 임박순) 책임. 실패 시 message surface.
export function adjustStock(payload) {
  if (USE_MOCK) {
    const env = mockAdjustStock(payload);
    if (!env.success) {
      return Promise.reject({ body: { message: env.message }, message: env.message });
    }
    return fromMock(env);
  }
  return http.post('/inventory/manual', payload);
}

// ─── GET /inventory/zones (New Inbound Modal helper) ─────
//   mock 전용 헬퍼. 실 API는 `/admin/zones` 또는 dashboard scope에서 derive.
//   현재 실 모드에서는 stock 목록 응답으로부터 추출하므로 별도 호출 불요.
export function fetchInventoryZones() {
  if (USE_MOCK) {
    return fromMock(mockZones());
  }
  // 실 모드에서는 호출자 측에서 stock 목록에서 zone을 derive 한다.
  return Promise.resolve({ data: { items: [] }, message: null, receivedAt: Date.now() });
}

// ─── GET /inventory/zones/{zone_id}/sections (New Inbound Modal helper) ─
//   backend `inventory.py:106` 정합. mock은 SKU_MASTER에서 derive.
export function fetchSectionsByZone(zoneId) {
  if (USE_MOCK) {
    return fromMock(mockSectionsByZone(zoneId));
  }
  return http.get(`/inventory/zones/${encodeURIComponent(zoneId)}/sections`);
}
