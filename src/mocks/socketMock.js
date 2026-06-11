/**
 * socketMock — Phase 6 dev helper
 * ─────────────────────────────────────────────────────────────
 * `VITE_USE_MOCK=true` 환경에서 실 socket 서버 없이도 Phase 6 UX를
 * 검증할 수 있도록 가짜 alert / inventory_update 이벤트를 발사한다.
 *
 * 사용 (브라우저 console):
 *   import('/src/mocks/socketMock.js').then((m) => {
 *     m.emitMockAlert('stock_critical');             // critical → toast popup + 벨 badge ++
 *     m.emitMockAlert('expiry_warning');             // warning → 벨 badge ++ (toast X)
 *     m.emitMockAlert();                              // 랜덤 1건
 *     m.emitMockInventoryUpdate();                    // dashboard/inventory refetch
 *     m.startMockBurst();                             // 5초마다 random emit (개발 데모)
 *     m.stopMockBurst();
 *   });
 *
 * 본 파일은 dev 보조이므로 production 코드 경로에서 import되지 않는다
 * (browser console에서 명시적으로 import).
 *
 * 발사하는 alert payload schema는 backend changestream.py 정합:
 *   { type: 'alert', data: <alert_doc> }
 *   alert_doc은 alertConstants.js의 7종 alert_type 중 하나.
 */

import { _emitMockEvent } from '../core/socket.js';

const USE_MOCK = import.meta.env.VITE_USE_MOCK !== 'false';

// ─── alert_type ↔ severity ↔ title 매핑 (backend alert_jobs.py 정합) ─
const ALERT_TYPE_META = {
  stock_warning:   { severity: 'warning',  title: '재고 주의',     message: '재고 부족 (현재 15/50)' },
  stock_critical:  { severity: 'critical', title: '재고 위험',     message: '재고 부족 (현재 2/20)' },
  out_of_stock:    { severity: 'critical', title: '재고 소진',     message: '재고 소진' },
  stock_overstock: { severity: 'info',     title: '재고 초과',     message: '재고 과다 (현재 30/28)' },
  expiry_warning:  { severity: 'warning',  title: '유통기한 주의', message: '유통기한 25일 남음' },
  expiry_critical: { severity: 'critical', title: '유통기한 위험', message: '유통기한 5일 남음' },
  fefo_violation:  { severity: 'warning',  title: 'FEFO 위반',     message: 'FEFO 위반 감지: section A-1 / sku sku-001' },
};

const ALL_ALERT_TYPES = Object.keys(ALERT_TYPE_META);

// ─── public API ──────────────────────────────────────────

/**
 * 가짜 alert 1건 emit.
 * @param {string} [alertType]  미지정 시 랜덤
 */
export function emitMockAlert(alertType) {
  if (!USE_MOCK) {
    console.warn('[socketMock] not in mock mode — ignored');
    return null;
  }
  const type = alertType && ALERT_TYPE_META[alertType]
    ? alertType
    : pickRandom(ALL_ALERT_TYPES);
  const meta = ALERT_TYPE_META[type];

  const alertDoc = {
    alert_id:    `mock_alert_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
    site_id:     'site-001',
    alert_type:  type,
    severity:    meta.severity,
    title:       meta.title,
    status:      'pending',
    target: {
      sku_id:       `sku-${String(1 + Math.floor(Math.random() * 12)).padStart(3, '0')}`,
      display_name: 'Mock Product',
      section_id:   1 + Math.floor(Math.random() * 6),
      section_name: `Section ${'ABC'[Math.floor(Math.random() * 3)]}${1 + Math.floor(Math.random() * 3)}`,
      zone_id:      `zone-${'ABC'[Math.floor(Math.random() * 3)]}`,
      zone_name:    `Zone ${'ABC'[Math.floor(Math.random() * 3)]}`,
    },
    message:    meta.message,
    created_at: new Date().toISOString(),
  };

  _emitMockEvent('alert', { type: 'alert', data: alertDoc });
  return alertDoc;
}

/**
 * 가짜 inventory_update 1건 emit. dashboard / inventory 페이지의 refetch 트리거.
 * @param {'inventory_event'|'batches'} [type]  미지정 시 inventory_event
 */
export function emitMockInventoryUpdate(type = 'inventory_event') {
  if (!USE_MOCK) {
    console.warn('[socketMock] not in mock mode — ignored');
    return null;
  }
  const payload = type === 'batches'
    ? {
        type: 'batches',
        data: {
          batch_id:    `batch_mock_${Date.now()}`,
          sku_id:      `sku-${String(1 + Math.floor(Math.random() * 12)).padStart(3, '0')}`,
          section_id:  1 + Math.floor(Math.random() * 6),
          total_qty:   Math.floor(Math.random() * 50),
          updated_at:  new Date().toISOString(),
        },
      }
    : {
        type: 'inventory_event',
        data: {
          event_id:    `mock_evt_${Date.now()}`,
          site_id:     'site-001',
          event_type:  Math.random() < 0.6 ? 'picking' : 'replenishment',
          sku_id:      `sku-${String(1 + Math.floor(Math.random() * 12)).padStart(3, '0')}`,
          section_id:  1 + Math.floor(Math.random() * 6),
          delta_qty:   Math.random() < 0.6 ? -(1 + Math.floor(Math.random() * 5)) : (1 + Math.floor(Math.random() * 10)),
          created_at: new Date().toISOString(),
        },
      };

  _emitMockEvent('inventory_update', payload);
  return payload;
}

// ─── burst mode (개발 데모용) ─────────────────────────────

let _burstTimer = null;

/**
 * N초 간격으로 랜덤 alert / inventory_update 발사.
 * console에서 `m.startMockBurst()` / `m.stopMockBurst()` 로 토글.
 */
export function startMockBurst({ intervalMs = 5000 } = {}) {
  if (_burstTimer) return;
  _burstTimer = setInterval(() => {
    if (Math.random() < 0.5) emitMockAlert();
    else                     emitMockInventoryUpdate();
  }, intervalMs);
  console.info(`[socketMock] burst started — every ${intervalMs}ms`);
}

export function stopMockBurst() {
  if (_burstTimer) {
    clearInterval(_burstTimer);
    _burstTimer = null;
    console.info('[socketMock] burst stopped');
  }
}

// ─── helpers ─────────────────────────────────────────────

function pickRandom(arr) {
  return arr[Math.floor(Math.random() * arr.length)];
}

// browser console에서 쉽게 접근하도록 window에 노출 (mock 모드 한정)
if (USE_MOCK && typeof window !== 'undefined') {
  window.__socketMock = {
    emitMockAlert,
    emitMockInventoryUpdate,
    startMockBurst,
    stopMockBurst,
  };
}
