/**
 * alertSettingsApi — 06 Alert Settings
 * ─────────────────────────────────────────────────────────────
 * Backend 정합 (2026-05-14 정정):
 *   - GET   /admin/capacity-settings           → SKU별 standard_qty (Stock Threshold 표 데이터)
 *   - PATCH /admin/capacity-settings           → standard_qty 편집 (body: { sku_id, section_id?, standard_qty })
 *   - GET   /alerts/settings                   → alert_type별 { threshold_value, threshold_unit, is_active }
 *   - PATCH /alerts/settings/{alert_type}      → { threshold_value, is_active }
 *
 * 정책:
 *  - UI 표기: "Standard Qty" / 내부 변수는 standard_qty 또는 baseline 어느 쪽이든 OK (pending §3.8).
 *  - SKU 메타 (display_name / current_qty)는 mock에서는 합성 응답. 실 API에서는
 *    `/admin/capacity-settings`만으로 부족하면 frontend가 `/inventory/stock` 별도 호출하여 합성.
 *
 * 모드 분기:
 *  - VITE_USE_MOCK !== 'false' → mock
 *  - VITE_USE_MOCK === 'false' → 실 API (지금은 mock 합성 응답에 맞춰 sku 메타 자체 합성 권장)
 */

import { http } from '../core/http.js';
import { toCamel } from '../core/normalize.js';
import {
  mockCapacitySettingsWithSku,
  mockUpdateCapacitySetting,
  mockAlertSettingsList,
  mockUpdateAlertSetting,
} from '../mocks/alertSettingsMock.js';

const USE_MOCK = import.meta.env.VITE_USE_MOCK !== 'false';

function fromMock(envelope) {
  if (!envelope?.success) {
    const err = new Error(envelope?.message || 'Mock error');
    err.status = 400;
    err.body = envelope;
    return Promise.reject(err);
  }
  return Promise.resolve({
    data:       toCamel(envelope.data),
    message:    envelope.message,
    receivedAt: Date.now(),
  });
}

// ─── Stock Thresholds (SKU별 standard_qty + SKU 메타 합성) ─
//   mock: 단일 응답에서 SKU 메타 같이 반환
//   real: /admin/capacity-settings + /inventory/stock 두 호출 합성
export async function fetchStockThresholds(params = {}) {
  if (USE_MOCK) return fromMock(mockCapacitySettingsWithSku(params));

  const [capRes, stockRes] = await Promise.all([
    http.get('/admin/capacity-settings'),
    http.get('/inventory/stock', { limit: 100 }),
  ]);
  const caps = capRes?.data?.items ?? [];
  const stocks = stockRes?.data?.items ?? [];
  const stockMap = new Map(stocks.map((s) => [s.skuId, s]));
  const search = (params.search ?? '').toLowerCase();

  const rows = caps.map((cap) => {
    const stock = stockMap.get(cap.skuId);
    return {
      skuId:        cap.skuId,
      displayName:  stock?.displayName ?? cap.skuId,
      currentQty:   stock?.currentQty ?? 0,
      standardQty:  cap.standardQty,
      triggerRule:  'below_standard',   // read-only placeholder (Post-MVP)
    };
  });
  const filtered = search
    ? rows.filter((r) =>
        r.skuId.toLowerCase().includes(search) ||
        (r.displayName ?? '').toLowerCase().includes(search))
    : rows;

  return {
    data:       { items: filtered },
    message:    null,
    receivedAt: Date.now(),
  };
}

// ─── PATCH /admin/capacity-settings (단건 standard_qty 편집) ─
export function updateStockThreshold(skuId, standardQty) {
  if (USE_MOCK) return fromMock(mockUpdateCapacitySetting(skuId, { standard_qty: standardQty }));
  return http.patch('/admin/capacity-settings', { sku_id: skuId, standard_qty: standardQty });
}

// ─── GET /alerts/settings ──────────────────────────────
export function fetchAlertRules() {
  if (USE_MOCK) return fromMock(mockAlertSettingsList());
  return http.get('/alerts/settings');
}

// ─── PATCH /alerts/settings/{alert_type} ──────────────
export function updateAlertRule(alertType, payload) {
  if (USE_MOCK) return fromMock(mockUpdateAlertSetting(alertType, payload));
  return http.patch(`/alerts/settings/${encodeURIComponent(alertType)}`, payload);
}
