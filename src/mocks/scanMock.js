/**
 * scanMock — 03-3 수동 스캔 트리거 mock (C-3)
 * ─────────────────────────────────────────────────────────────
 * agreement(backend_device_api_agreements §1-1):
 *   POST /api/v1/scans { section_id } → 202 { scan_id, section_id, status:'accepted' }
 * scan_id 는 BE 생성 — mock 은 Date.now() 로 대체.
 */
export function mockTriggerScan(sectionId) {
  return {
    success: true,
    data: { scan_id: Date.now(), section_id: sectionId, status: 'accepted' },
    message: null,
  };
}
