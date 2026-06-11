/**
 * scanStore — 03-3 수동 스캔 트리거 상태 (C-3, mock-first)
 * ─────────────────────────────────────────────────────────────
 * agreement: POST /api/v1/scans → Socket.io `scan_state`
 *   (accepted → moving → scanning → analyzing → finished | error)
 *
 * backend 미구현 동안 (SCAN_API_BACKEND_READY=false):
 *   trigger 후 mock 으로 단계 진행을 시뮬레이션 (실 socket emit 없음).
 * backend ship 시 (READY=true):
 *   wireSocket() 으로 subscribeSocket('scan_state') 실 수신 — 시뮬레이션 미사용.
 */

import { createStore } from '../core/createStore.js';
import { triggerScan, SCAN_API_BACKEND_READY } from '../api/scanApi.js';
import { subscribeSocket } from '../core/socket.js';

const initial = { scanId: null, sectionId: null, status: null, error: null };
const inner = createStore({ ...initial });

const MOCK_SEQ = ['moving', 'scanning', 'analyzing', 'finished'];
let _timers = [];
let _unsubSocket = null;

function clearTimers() {
  _timers.forEach(clearTimeout);
  _timers = [];
}

// mock: accepted 이후 단계를 순차 진행 (데모용 — 실 backend 없음)
function simulate(sectionId) {
  clearTimers();
  MOCK_SEQ.forEach((status, i) => {
    _timers.push(setTimeout(() => {
      // 진행 중 다른 섹션 trigger 됐으면 무시
      if (inner.getState().sectionId === sectionId) inner.setState({ status });
    }, (i + 1) * 900));
  });
}

async function trigger(sectionId) {
  clearTimers();
  inner.setState({ ...initial, sectionId, status: 'accepted' });
  try {
    const res = await triggerScan(sectionId);
    const d = res?.data ?? {};
    inner.setState({
      scanId:    d.scanId ?? d.scan_id ?? null,
      sectionId,
      status:    'accepted',
      error:     null,
    });
    if (!SCAN_API_BACKEND_READY) simulate(sectionId);
  } catch (err) {
    inner.setState({
      status: 'error',
      error:  err?.body?.message || err?.message || 'scan trigger failed',
    });
  }
}

// 실 모드 전용 (backend ship 후 호출) — 현재 dormant
function wireSocket() {
  if (_unsubSocket) return;
  _unsubSocket = subscribeSocket('scan_state', (payload) => {
    const d = payload?.data ?? payload;
    if (d?.section_id == null) return;
    inner.setState({
      scanId:    d.scan_id,
      sectionId: d.section_id,
      status:    d.status,
      error:     d.status === 'error' ? (d.error_message ?? 'scan error') : null,
    });
  });
}

function reset() {
  clearTimers();
  _unsubSocket?.();
  _unsubSocket = null;
  inner.setState({ ...initial });
}

export const scanStore = {
  subscribe: inner.subscribe,
  getState:  inner.getState,
  trigger,
  wireSocket,
  reset,
};
