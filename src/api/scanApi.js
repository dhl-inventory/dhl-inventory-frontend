/**
 * scanApi — 수동 스캔 트리거 (C-3)
 * ─────────────────────────────────────────────────────────────
 * agreement: backend_device_api_agreements §1-1
 *   POST /api/v1/scans { section_id } (JWT) → 202 { scan_id, section_id, status }
 *   진행은 Socket.io `scan_state` 채널 (scanStore 에서 수신)
 *
 * READY 가드: backend 가 위 endpoint·scan_state 를 ship 하기 전까지
 *   prod(VITE_USE_MOCK=false) 에서도 **무조건 mock** 반환 → 미구현 endpoint
 *   호출 에러 0. ship 시 SCAN_API_BACKEND_READY = true 한 줄 (+ scanStore.wireSocket).
 */

import { http } from '../core/http.js';
import { toCamel } from '../core/normalize.js';
import { mockTriggerScan } from '../mocks/scanMock.js';

const USE_MOCK = import.meta.env.VITE_USE_MOCK !== 'false';
export const SCAN_API_BACKEND_READY = true;

function fromMock(env) {
  return Promise.resolve({
    data:       toCamel(env.data),
    message:    env.message,
    receivedAt: Date.now(),
  });
}

// POST /scans — 수동 스캔 트리거. trigger_source 는 BE 가 "manual" 강제(FE 미전송).
//   ⚠ http.js BASE 가 이미 `/api/v1` → path 는 `/scans` (다른 api 어댑터 컨벤션 동일).
//   `/api/v1/scans` 쓰면 `/api/v1/api/v1/scans` 더블프리픽스 404 됨.
export function triggerScan(sectionId) {
  if (USE_MOCK || !SCAN_API_BACKEND_READY) {
    return fromMock(mockTriggerScan(sectionId));
  }
  return http.post('/scans', { section_id: sectionId });
}
