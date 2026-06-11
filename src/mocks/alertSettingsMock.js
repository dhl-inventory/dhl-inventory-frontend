/**
 * Alert Settings mock — 06 Alert Settings
 * ─────────────────────────────────────────────────────────────
 * Backend 정합 schema (2026-05-14 정정):
 *   - GET  /admin/capacity-settings           → SKU별 standard_qty (Stock Threshold)
 *   - PATCH /admin/capacity-settings          → standard_qty 편집
 *   - GET  /alerts/settings                   → alert_type별 { threshold_value, threshold_unit, is_active }
 *   - PATCH /alerts/settings/{alert_type}     → 토글 / threshold_value 편집
 *
 * 정책:
 *  - 내부 코드/backend는 baseline / standard_qty 혼용 OK. **UI는 "Standard"** 단일 표기.
 *  - Trigger Rule (SKU-level alert_when)는 backend 미합의 — Post-MVP. UI에 read-only
 *    "Below standard" 라벨로 표시 (변경 불가).
 *  - Action channels (Push/Banner/Email/SMS) — Post-MVP. UI에 disabled chip으로만 표시.
 *  - Rule 4종 정합 (ADR-019): stock_shortage / validity_risk / device_issue / abnormal_access.
 *  - 글로벌 Save/Reset — frontend가 변경 추적 후 backend PATCH를 차례로 호출.
 */

const envelope = (data) => ({ success: true, data, message: null });

// ─── /admin/capacity-settings (SKU별 standard_qty) ─────
// in-memory state — mock 동안 PATCH 반영
let capacitySettings = [
  { site_id: 'site-001', sku_id: 'ELC-9021', section_id: null, standard_qty: 150 },
  { site_id: 'site-001', sku_id: 'ELC-8834', section_id: null, standard_qty: 20  },
  { site_id: 'site-001', sku_id: 'PWR-4410', section_id: null, standard_qty: 500 },
  { site_id: 'site-001', sku_id: 'MCH-1102', section_id: null, standard_qty: 50  },
];

// SKU 마스터 (display_name / current_qty) — mock 단계용
const SKU_MASTER = [
  { sku_id: 'ELC-9021', display_name: 'Sensory Array Module V2',   current_qty: 142 },
  { sku_id: 'ELC-8834', display_name: 'Optic Fiber Spool 100m',    current_qty: 12  },
  { sku_id: 'PWR-4410', display_name: 'Lithium Cell Pack High-Cap', current_qty: 850 },
  { sku_id: 'MCH-1102', display_name: 'Titanium Bearing Assembly', current_qty: 45  },
];

// ─── GET /admin/capacity-settings + sku 메타 합성 ──────
// 화면용 row = capacity_settings + SKU master + Trigger Rule (read-only)
// 실 API에서는 frontend가 /admin/capacity-settings + /inventory/stock 합성.
export function mockCapacitySettingsWithSku(params = {}) {
  const search = (params.search ?? '').toLowerCase();
  const rows = capacitySettings.map((cap) => {
    const sku = SKU_MASTER.find((s) => s.sku_id === cap.sku_id) ?? { display_name: cap.sku_id, current_qty: 0 };
    return {
      sku_id:       cap.sku_id,
      display_name: sku.display_name,
      current_qty:  sku.current_qty,
      standard_qty: cap.standard_qty,
      trigger_rule: 'below_standard',          // read-only, Post-MVP
    };
  });
  const filtered = search
    ? rows.filter((r) => r.sku_id.toLowerCase().includes(search) || r.display_name.toLowerCase().includes(search))
    : rows;
  return envelope({ items: filtered });
}

// ─── PATCH /admin/capacity-settings (단건) ─────────────
export function mockUpdateCapacitySetting(skuId, payload = {}) {
  const idx = capacitySettings.findIndex((c) => c.sku_id === skuId);
  if (idx < 0) {
    return { success: false, data: null, message: `SKU not found: ${skuId}` };
  }
  if (payload.standard_qty != null) {
    capacitySettings[idx] = { ...capacitySettings[idx], standard_qty: Number(payload.standard_qty) };
  }
  return envelope({ ...capacitySettings[idx] });
}

// ─── /alerts/settings (alert_type 단위) ────────────────
let alertRules = [
  {
    alert_type:       'stock_shortage',
    threshold_value:  20,
    threshold_unit:   'percent',
    is_active:        true,
    // 아래 두 필드는 Post-MVP — UI placeholder. mock state는 보관만.
    action_channels:  ['push_notification', 'dashboard_banner'],
  },
  {
    alert_type:       'validity_risk',
    threshold_value:  30,
    threshold_unit:   'days',
    is_active:        false,
    action_channels:  ['daily_report_email'],
  },
  {
    alert_type:       'device_issue',
    threshold_value:  5,
    threshold_unit:   'minutes',
    is_active:        true,
    action_channels:  ['sms_alert_ops_lead'],
  },
  {
    alert_type:       'abnormal_access',
    threshold_value:  1,
    threshold_unit:   'event',
    is_active:        false,
    action_channels:  ['log_only', 'notify_security'],
  },
];

// ─── GET /alerts/settings ──────────────────────────────
export function mockAlertSettingsList() {
  return envelope({
    items: alertRules.map((r) => ({ ...r, action_channels: [...r.action_channels] })),
  });
}

// ─── PATCH /alerts/settings/{alert_type} ──────────────
export function mockUpdateAlertSetting(alertType, payload = {}) {
  const idx = alertRules.findIndex((r) => r.alert_type === alertType);
  if (idx < 0) {
    return { success: false, data: null, message: `Alert type not found: ${alertType}` };
  }
  const next = { ...alertRules[idx] };
  if (payload.is_active        != null) next.is_active = Boolean(payload.is_active);
  if (payload.threshold_value  != null) next.threshold_value = Number(payload.threshold_value);
  alertRules[idx] = next;
  return envelope({ ...next });
}
