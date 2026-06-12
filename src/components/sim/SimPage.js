/**
 * SimPage — 플로터 디지털 트윈 화면 (/#/sim).
 *
 * 두 시연 시나리오 자동 재생 — 호출 순서는 production vision pipeline 과 1:1.
 * v2 freeze 유지, v3 신규 (multi-section TSP 가시화).
 *
 * 공통: backend POST /api/v1/device/event/access (ENTER/EXIT) + /api/v1/device/scan-queue 직접 호출 (vision 우회).
 *      SSS scan 응답의 ScanItem.expiry_date 가 batches 자동 갱신 — 수동 inbound 불필요.
 *
 * ── v2 시나리오 (단일 section, 박스 행동 중심) ──────────────────────────
 *   [1/7] ENTER → [2/7] APPROACH → [3/7] s-1 박스 3개 꺼냄 → [4/7] EXIT
 *         → scan [1] → SSS(=3) → reconcile 6→3 → stock_critical
 *   [5/7] ENTER → [6/7] s-1 박스 2개 보충 → [7/7] EXIT
 *         → scan [1] → SSS(=5, 1박스 +1d) → reconcile 3→5 + 새 batch → expiry_critical
 *
 * ── v3 시나리오 (multi-section TSP, "각각 넣고 뺴고" 차별점) ────────────
 *   Action 1 [1~5/10] — 1차 ENTER → s-1 박스 3개 꺼냄 + s-2 박스 1개 입고 → EXIT
 *         → multi-section scan [1,2] (TSP planner 활성, n=2)
 *         → s-1: SSS(=3) → reconcile 6→3 → stock_critical (타이레놀)
 *         → s-2: SSS(=6) → reconcile 5→6 (입고 인식, 판콜에이 normal, 알림 없음)
 *   Action 2 [6~10/10] — 2차 ENTER → s-1 박스 2개 보충 (1개 critical) → EXIT
 *         → scan [1] → SSS(=5, 1박스 +1d) → reconcile 3→5 + 새 batch → expiry_critical
 *         (시각적 stock_critical 해소 — 현재 backend 는 수동 close 필요,
 *          향후 자동 close 별도 작업 [[project-alert-auto-resolve]])
 *
 * v3 차별점 (v2 대비):
 *   - Action 1 의 multi-section scan = TSP planner 가시화
 *   - "넣고 뺴고" 두 방향 행동 한 cycle 에 노출 (s-1 out / s-2 in)
 *   - 알림은 s-1 만 (청중 혼란 최소화)
 *
 * 우측 패널 — 디버그 슬라이더 유지, 메인은 v2 / v3 자동 재생 버튼.
 */

import { PlotterScene } from './PlotterScene.js';
import { PLOTTER_SPEC } from './spec.js';
import { http } from '../../core/http.js';

const ROOT_ID = 'sim-root';
const CANVAS_ID = 'sim-canvas';
const LOG_ID = 'sim-log';

const sleep = (ms) => new Promise(r => setTimeout(r, ms));

function html() {
  return `
    <section id="${ROOT_ID}" class="container-fluid py-3">
      <div class="row g-3">
        <div class="col-md-9">
          <div class="card bg-dark text-light" style="height: 78vh;">
            <div class="card-body p-0 d-flex">
              <canvas id="${CANVAS_ID}" style="width: 100%; height: 100%; display: block;"></canvas>
            </div>
            <div class="card-footer small text-muted d-flex justify-content-between">
              <span>마우스 드래그 = 회전 / 휠 = 줌 / 우클릭 드래그 = 이동</span>
              <span id="sim-status" class="text-info"></span>
            </div>
          </div>
        </div>
        <div class="col-md-3">
          <div class="card mb-2 border-primary">
            <div class="card-header py-2 bg-primary text-white">
              <strong>▶ v2 시나리오</strong>
            </div>
            <div class="card-body py-2">
              <div class="d-grid gap-1 mb-2">
                <button id="sim-play" class="btn btn-primary">▶ 재생</button>
                <button id="sim-reset-scenario" class="btn btn-outline-secondary btn-sm">↺ 초기 상태</button>
              </div>
              <div class="small text-muted">
                ENTER → 꺼냄 → scan → stock_critical → ENTER → 보충 → scan → expiry_critical
              </div>
            </div>
          </div>

          <div class="card mb-2 border-success">
            <div class="card-header py-2 bg-success text-white">
              <strong>▶ v3 시나리오 (multi-section TSP)</strong>
            </div>
            <div class="card-body py-2">
              <div class="d-grid gap-1 mb-2">
                <button id="sim-play-v3" class="btn btn-success">▶ 재생</button>
                <button id="sim-reset-v3" class="btn btn-outline-secondary btn-sm">↺ 초기 상태</button>
              </div>
              <div class="small text-muted">
                Act 1: s-1 출고 + s-2 입고 → scan [1,2] (TSP) → stock_critical<br>
                Act 2: s-1 보충 (1 critical) → scan [1] → expiry_critical
              </div>
            </div>
          </div>

          <div class="card mb-2">
            <div class="card-header py-2 small text-muted">실행 로그</div>
            <div class="card-body py-2">
              <pre id="${LOG_ID}" class="small mb-0" style="max-height: 18vh; overflow-y: auto; background: var(--surface-sunken); padding: 6px; font-size: 11px;"></pre>
            </div>
          </div>

          <details class="card">
            <summary class="card-header py-2 small text-muted" style="cursor: pointer;">
              디버그 — 수동 조작
            </summary>
            <div class="card-body py-2">
              <label class="form-label small mb-0">X (0 ~ ${PLOTTER_SPEC.strokes.x_mm})</label>
              <input id="sim-x" type="range" class="form-range" min="0" max="${PLOTTER_SPEC.strokes.x_mm}" value="200" step="5">
              <div class="small text-muted mb-2" id="sim-x-val">200</div>

              <label class="form-label small mb-0">Y (0 ~ ${PLOTTER_SPEC.strokes.y_mm})</label>
              <input id="sim-y" type="range" class="form-range" min="0" max="${PLOTTER_SPEC.strokes.y_mm}" value="340" step="5">
              <div class="small text-muted mb-2" id="sim-y-val">340</div>

              <label class="form-label small mb-0">Z (0 ~ ${PLOTTER_SPEC.strokes.z_mm_back_safe})</label>
              <input id="sim-z" type="range" class="form-range" min="0" max="${PLOTTER_SPEC.strokes.z_mm_back_safe}" value="0" step="1">
              <div class="small text-muted mb-2" id="sim-z-val">0</div>

              ${PLOTTER_SPEC.sections.map(sec => `
                <label class="form-label small mb-0">section ${sec.id} qty</label>
                <input id="sim-qty-${sec.id}" type="range" class="form-range" min="0" max="4" value="4" step="1">
                <div class="small text-muted mb-2" id="sim-qty-${sec.id}-val">4</div>
              `).join('')}
            </div>
          </details>
        </div>
      </div>
    </section>
  `;
}

export default function SimPage() {
  let scene = null;
  const handlers = [];
  let scenarioRunning = false;
  let scenarioCancel = false;

  function appendLog(line) {
    const el = document.getElementById(LOG_ID);
    if (!el) return;
    const t = new Date().toLocaleTimeString();
    el.textContent += `[${t}] ${line}\n`;
    el.scrollTop = el.scrollHeight;
  }
  function setStatus(text) {
    const el = document.getElementById('sim-status');
    if (el) el.textContent = text;
  }

  function wireRange(id, valId, onChange) {
    const input = document.getElementById(id);
    const valEl = document.getElementById(valId);
    if (!input || !valEl) return;
    const fn = () => {
      valEl.textContent = input.value;
      onChange(Number(input.value));
    };
    input.addEventListener('input', fn);
    handlers.push(() => input.removeEventListener('input', fn));
  }
  function setHeadFromRanges() {
    if (!scene || scenarioRunning) return;
    const x = Number(document.getElementById('sim-x').value);
    const y = Number(document.getElementById('sim-y').value);
    const z = Number(document.getElementById('sim-z').value);
    scene.setHeadPosition(x, y, z);
  }

  // Device endpoint — backend 통합 후 /api/v1/device/* 하위 (구 DCA 별도 프로세스 폐기).
  // sim 은 vision 대체로 SimPage 가 직접 호출 (person_simulator 우회).
  const PLOTTER_ID = 'plotter-001';
  const CAMERA_ID = 'camera-001';

  function _utcNow() {
    return new Date().toISOString().replace(/\.\d{3}Z$/, 'Z');
  }

  /** device /event/access 호출 — production vision 의 ENTER/EXIT 발사 모사. */
  async function triggerAccessEvent({ eventType, count }) {
    try {
      await http.post('/device/event/access', {
        event_type:           eventType,
        camera_id:            CAMERA_ID,
        plotter_id:           PLOTTER_ID,
        current_person_count: count,
        timestamp:            _utcNow(),
      });
      appendLog(`✓ device /event/access ${eventType} (count=${count})`);
    } catch (e) {
      appendLog(`⚠️ device /event/access ${eventType} 실패 (${e?.status ?? e?.message ?? '?'}) — 시각화만 진행`);
    }
  }

  /** device /scan-queue 호출 — production vision 의 joint compute 결과 발사 모사.
   *
   * sectionIds: number | number[] — 단일 또는 multi-section. multi 일 때 device TSP planner 활성.
   */
  async function triggerScanQueue(sectionIds) {
    const arr = Array.isArray(sectionIds) ? sectionIds : [sectionIds];
    try {
      await http.post('/device/scan-queue', {
        sections:       arr,
        plotter_id:     PLOTTER_ID,
        trigger_source: 'access',
      });
      appendLog(`✓ device /scan-queue sections=[${arr.join(',')}]`);
    } catch (e) {
      appendLog(`⚠️ device /scan-queue 실패 (${e?.status ?? e?.message ?? '?'}) — 시각화만 진행`);
    }
  }

  /** v2 시나리오 자동 재생 — 사람 + 헤드 + 박스 동시 진행 + person_simulator 실 호출. */
  async function runScenario() {
    if (!scene || scenarioRunning) return;
    scenarioRunning = true;
    scenarioCancel = false;

    const SEC_1 = 1;
    const sec1 = PLOTTER_SPEC.sections.find(s => s.id === SEC_1);
    const playBtn = document.getElementById('sim-play');
    if (playBtn) playBtn.disabled = true;

    const yield_ = async (ms) => {
      for (let i = 0; i < ms; i += 50) {
        if (scenarioCancel) throw new Error('cancelled');
        await sleep(50);
      }
    };

    try {
      // 초기 상태 — v2 narrative: 6/6 normal, 알림 0건 (v2-setup-ec2.sh standard=6)
      // Hybrid 디지털 트윈: 시작 시 모든 박스 'normal' (이미 vision 이 한 번 인식했다 가정).
      appendLog('초기 상태 — section 1: 6개 (normal, 알림 0건)');
      scene.resetAllIndicators();
      scene.setSectionQty(SEC_1, 6);
      scene.setSectionQty(2, 4);
      for (let i = 0; i < 6; i++) scene.setBoxState(SEC_1, i, 'normal');
      for (let i = 0; i < 4; i++) scene.setBoxState(2, i, 'normal');
      scene.setPersonVisible(false);
      scene.setPersonHoldingBox(false);
      scene.setHandRaise(0);
      await scene.animateHeadTo(0, 0, 0, 1000);    // home
      await yield_(500);

      // ─── [1/7] 사람 등장 (ENTER access 발사) ─────────────────────────
      // production vision 흐름: YOLO+pose 가 진입 즉시 PLOTTER_ENTER 발사.
      appendLog('[1/7] 사람 PLOTTER_ENTER');
      setStatus('▶ 사람 접근 중');
      scene.setPersonVisible(true);
      scene.setPersonPosition(-1.1, 0.45);
      const enter1 = scene.animatePersonTo(-0.30, 0.35, 1800);
      triggerAccessEvent({ eventType: 'PLOTTER_ENTER', count: 1 });
      await enter1;
      await yield_(200);

      // ─── [2/7] APPROACH_CONFIRMED — 손 들기 (선반 안쪽 reach) ─────
      appendLog('[2/7] APPROACH_CONFIRMED — section 1 손 들기');
      setStatus('🤚 접근 확정');
      scene.setAccessIndicator(SEC_1, true);
      for (let i = 0; i <= 10; i++) {
        scene.setHandRaise(i / 10);
        await yield_(60);
      }
      await yield_(800);

      // ─── [3/7] 박스 3개 꺼냄 (visual only) ─────────────────────────
      appendLog('[3/7] 박스 3개 꺼냄');
      setStatus('📦 박스 꺼냄');
      scene.setHandRaise(0);
      scene.setPersonHoldingBox(true);
      scene.setAccessIndicator(SEC_1, false);
      await yield_(500);

      // ─── [4/7] 사람 이탈 (EXIT access) + 자동 plotter scan ─────────
      // production: vision EXIT 발사 → compute lag → vision joint detection 이
      // scan-queue 발사 → device handler → SSS → BE reconcile.
      appendLog('[4/7] 사람 이탈 (PLOTTER_EXIT) → compute lag → scan-queue');
      setStatus('🚶 사람 이탈 → 📷 plotter scan');
      const exit1 = scene.animatePersonTo(-1.1, 0.45, 1800);
      triggerAccessEvent({ eventType: 'PLOTTER_EXIT', count: 0 });
      await exit1;
      scene.setPersonVisible(false);
      scene.setPersonHoldingBox(false);

      // compute lag (vision joint detection) + ADR-014 delay 모사
      appendLog('  ADR-014: section ROI 사람==0 후 N초 대기 (compute lag)');
      await yield_(1500);
      // vision 의 scan-queue 발사 — device handler → plotter scan → SSS mock=3 → reconcile 6→3
      triggerScanQueue(SEC_1);
      // plotter scan visual
      const head1 = scene.animateHeadTo(sec1.x_mm, sec1.y_mm, 0, 1800);
      await yield_(900);
      scene.flashSnap(700);
      await head1;
      await yield_(300);
      scene.setSectionQty(SEC_1, 3);
      appendLog('⚠️ 알림 +1: stock_critical (3/6)');
      scene.setAlertIndicator(SEC_1, true);
      await scene.animateHeadTo(0, 0, 0, 1000);
      await yield_(1000);

      // ─── [5/7] 사람 다시 등장 — 박스 2개 들고 (ENTER access) ─────
      appendLog('[5/7] 사람 다시 PLOTTER_ENTER — 박스 2개 들고 보충');
      setStatus('🚶 사람 보충 ENTER');
      scene.setPersonVisible(true);
      scene.setPersonHoldingBox(true);
      scene.setPersonPosition(-1.1, 0.45);
      const enter2 = scene.animatePersonTo(-0.30, 0.35, 1500);
      triggerAccessEvent({ eventType: 'PLOTTER_ENTER', count: 1 });
      await enter2;
      await yield_(200);

      // ─── [6/7] 박스 2개 release (visual only) ────────────────────
      // 사람이 박스를 채우는 행위만. expiry 등록은 [7/7] EXIT 후 SSS scan 응답
      // (ScanItem.expiry_date) 으로 backend 가 자동 reconcile → batch 등록.
      appendLog('[6/7] 박스 2개 release (보충)');
      setStatus('📥 보충 중');
      scene.setAccessIndicator(SEC_1, true);
      for (let i = 0; i <= 10; i++) {
        scene.setHandRaise(i / 10);
        await yield_(60);
      }
      await yield_(400);
      scene.setHandRaise(0);
      scene.setPersonHoldingBox(false);
      scene.setAccessIndicator(SEC_1, false);
      // Hybrid 디지털 트윈: 박스 위치는 즉시 5개로 (physical),
      //   새 박스 2개는 vision 미인식 상태라 *회색 (unknown)*. 색은 Stage 7 scan 후 갱신.
      scene.setSectionQty(SEC_1, 5);
      scene.setBoxState(SEC_1, 3, 'unknown');
      scene.setBoxState(SEC_1, 4, 'unknown');
      appendLog('  새 박스 2개 채움 — vision 미인식 (회색, expiry 는 다음 scan 에서 SSS 가 인식)');
      await yield_(800);

      // ─── [7/7] 사람 이탈 (EXIT access) + 자동 plotter 재 scan ─────
      appendLog('[7/7] 사람 이탈 (PLOTTER_EXIT) → compute lag → scan-queue (재 scan)');
      setStatus('🚶 이탈 → 📷 plotter 재 scan');
      const exit2 = scene.animatePersonTo(-1.1, 0.45, 1500);
      triggerAccessEvent({ eventType: 'PLOTTER_EXIT', count: 0 });
      await exit2;
      scene.setPersonVisible(false);

      appendLog('  ADR-014: section ROI 사람==0 후 N초 대기 (compute lag)');
      await yield_(1500);
      // vision 의 scan-queue 두 번째 발사 — SSS mock=5 → reconcile 5→5 변화 없음
      triggerScanQueue(SEC_1);
      const head2 = scene.animateHeadTo(sec1.x_mm, sec1.y_mm, 0, 1800);
      await yield_(900);
      scene.flashSnap(700);
      await head2;
      await yield_(300);
      // Hybrid 디지털 트윈: snap 직후 vision 이 박스 인식 — 색 갱신
      //   index 3 = expiry=내일 batch → critical (빨강)
      //   index 4 = 정상 batch → normal (기본색)
      scene.setBoxState(SEC_1, 3, 'critical');
      scene.setBoxState(SEC_1, 4, 'normal');
      appendLog('  → BE reconcile 5→5 (보충된 5개 정상 확인, 변화 없음)');
      appendLog('  → 박스 색 갱신: index 3 = critical (빨강, 1일 만료), index 4 = normal');
      await scene.animateHeadTo(0, 0, 0, 1000);

      appendLog('✓ 완료 — 알림 2건 pending (stock_critical + expiry_critical)');
      setStatus('✓ 완료');
    } catch (err) {
      if (err.message === 'cancelled') {
        appendLog('— 정지됨'); setStatus('정지됨');
      } else {
        appendLog(`error: ${err.message}`); setStatus('에러');
      }
      scene.setPersonVisible(false);
      scene.setPersonHoldingBox(false);
      scene.setHandRaise(0);
    } finally {
      scenarioRunning = false;
      if (playBtn) playBtn.disabled = false;
    }
  }

  /** v2 초기 상태 — silent=true 면 로그 안 남김 (mount 시 자동 호출 용도). */
  function resetScenario(opts = {}) {
    if (!scene) return;
    scenarioCancel = true;
    scene.resetAllIndicators();
    scene.setSectionQty(1, 6);
    scene.setSectionQty(2, 4);
    // 초기 상태는 모든 박스 'normal' (이미 vision 한 번 인식했다 가정).
    for (let i = 0; i < 6; i++) scene.setBoxState(1, i, 'normal');
    for (let i = 0; i < 4; i++) scene.setBoxState(2, i, 'normal');
    scene.setPersonVisible(false);
    scene.setPersonHoldingBox(false);
    scene.setHandRaise(0);
    scene.animateHeadTo(0, 0, 0, 800);
    if (!opts.silent) appendLog('— v2 초기 상태로 리셋');
    setStatus('');
  }

  /** v3 초기 상태 — backend baseline reset API 호출 + 화면 reset.
   *
   *  backend /api/v1/demo/v3-baseline 이 다음을 한 번에 수행:
   *    - MySQL capacity_settings + sections 좌표 보정
   *    - Mongo batches (s-1 6/6, s-2 5/6) UPSERT
   *    - Mongo pending alerts close (해당 SKU 만)
   *    - Redis dedup 키 삭제 (해당 SKU 만)
   *    - SSS mock cycle reset (in-process)
   *
   *  화면 리셋: 박스 6개(0..5) 상태 'normal' 명시 초기화. visibility 는 setSectionQty 토글.
   *  이전 실행의 'critical'/'unknown' 잔재 안 비치게 0..5 전체 명시.
   */
  async function resetScenarioV3() {
    if (!scene) return;
    scenarioCancel = true;
    const btn = document.getElementById('sim-reset-v3');
    const playBtn = document.getElementById('sim-play-v3');
    if (btn) { btn.disabled = true; btn.textContent = '… 초기화 중'; }
    if (playBtn) playBtn.disabled = true;

    appendLog('— v3 baseline reset 요청 → backend (Mongo seed + alerts close + sss-mock reset)');
    try {
      const res = await http.post('/demo/v3-baseline');
      const d = res?.data ?? {};
      appendLog(`  OK backend reset (alerts_closed=${d.alertsClosed ?? '?'}, alert_state_keys_deleted=${d.alertStateKeysDeleted ?? '?'}, sss_mock=${d.dcaMockReset ?? '?'})`);
    } catch (e) {
      appendLog(`  FAIL backend reset: ${e?.message ?? e} — 화면만 reset`);
    }

    // 화면 reset (backend 성공·실패 무관)
    scene.resetAllIndicators();
    for (let i = 0; i < 6; i++) scene.setBoxState(1, i, 'normal');
    for (let i = 0; i < 6; i++) scene.setBoxState(2, i, 'normal');
    scene.setSectionQty(1, 6);
    scene.setSectionQty(2, 5);
    scene.setPersonVisible(false);
    scene.setPersonHoldingBox(false);
    scene.setHandRaise(0);
    scene.animateHeadTo(0, 0, 0, 800);
    appendLog('  ✓ 화면 reset 완료 — s-1 6/6, s-2 5/6');
    setStatus('');

    if (btn) { btn.disabled = false; btn.textContent = '↺ 초기 상태'; }
    if (playBtn) playBtn.disabled = false;
  }

  /** v3 시나리오 자동 재생 — multi-section TSP narrative (2 access cycle, 10 phase).
   *
   * 흐름:
   *   Action 1 [1..5/10] — 1차 ENTER → s-1 출고 + s-2 입고 → EXIT → multi-section scan
   *     · s-1: 박스 3개 꺼냄 (qty 6→3 reconcile 후 stock_critical)
   *     · s-2: 박스 1개 입고 (qty 5→6 reconcile, 새 박스 회색→normal, 알림 없음)
   *     · scan [1,2] → TSP planner 활성 (Held-Karp DP, n=2)
   *   Action 2 [6..10/10] — 2차 ENTER → s-1 보충 → EXIT → single scan
   *     · s-1: 박스 2개 보충, 1개는 critical expiry
   *     · scan [1] → expiry_critical 발화 (회색 박스 → critical/normal 색 확정)
   *
   * v2 대비 차별점:
   *   - Action 1 의 multi-section scan = TSP planner 가시화
   *   - "넣고 뺴고" 두 방향 행동 한 cycle 에 (s-1 out / s-2 in)
   *   - 알림은 s-1 만 (사용자 narrative: "한 곳에서만 알림" — 청중 혼란 최소화)
   *
   * 알림 타이밍: snap → BE reconcile 텀(700ms) → qty/색 변화 → 평가 텀(600ms) → alert 점등.
   *   인과 순서 명확화 위해 단계별 텀 삽입 — 동시 발화 시 청중이 인과 인지 어려움.
   *
   * 향후 (별도 작업, [[project-alert-auto-resolve]]):
   *   재고 보충 시 stock_critical 자동 close. 현재는 수동 close 필요 — sim 은 시각적으로만
   *   해소 표시 (의도 narrative 와 일치하지만 backend 알림 큐와 불일치).
   */
  async function runScenarioV3() {
    if (!scene || scenarioRunning) return;
    scenarioRunning = true;
    scenarioCancel = false;

    const SEC_1 = 1;
    const SEC_2 = 2;
    const sec1 = PLOTTER_SPEC.sections.find(s => s.id === SEC_1);
    const sec2 = PLOTTER_SPEC.sections.find(s => s.id === SEC_2);
    const playBtnV3 = document.getElementById('sim-play-v3');
    const playBtnV2 = document.getElementById('sim-play');
    if (playBtnV3) playBtnV3.disabled = true;
    if (playBtnV2) playBtnV2.disabled = true;

    const yield_ = async (ms) => {
      for (let i = 0; i < ms; i += 50) {
        if (scenarioCancel) throw new Error('cancelled');
        await sleep(50);
      }
    };

    // 속도 튜닝 (2026-05-25 사용자 피드백):
    //   - SLOW: 사람 / plotter 동작 → 0.8x 배속 (= duration * 1.25). 청중이 따라갈 시간.
    //   - ALERT: scan → alert 사이 텀 → 더 짧게. 알람 timing 빠르게.
    const SLOW = (ms) => Math.round(ms * 1.25);
    const ALERT = (ms) => Math.round(ms * 0.5);

    try {
      // 초기 상태 — s-1 6/6 normal, s-2 5/6 (scan 전이라 알림 X)
      // 박스 상태는 0..5 모두 'normal' 로 명시 초기화 (이전 실행 잔여 state — 'critical'/'unknown' — 안 비치게).
      // 가시성은 setSectionQty 가 결정.
      appendLog('━━━ v3 narrative 시작 ━━━');
      appendLog('초기 상태 — s-1 타이레놀 6/6 normal, s-2 판콜에이 5/6 (scan 전)');
      scene.resetAllIndicators();
      for (let i = 0; i < 6; i++) scene.setBoxState(SEC_1, i, 'normal');
      for (let i = 0; i < 6; i++) scene.setBoxState(SEC_2, i, 'normal');
      scene.setSectionQty(SEC_1, 6);
      scene.setSectionQty(SEC_2, 5);
      scene.setPersonVisible(false);
      scene.setPersonHoldingBox(false);
      scene.setHandRaise(0);
      await scene.animateHeadTo(0, 0, 0, SLOW(1000));
      await yield_(SLOW(500));

      // ═══════════════════════════════════════════════════════════════
      // Action 1 — 사람 1차 ENTER → s-1 출고 + s-2 입고 → EXIT → multi-section scan
      // ═══════════════════════════════════════════════════════════════

      // ─── [1/10] 사람 1차 ENTER ───────────────────────────────────────
      appendLog('[1/10] Action 1 — 사람 1차 PLOTTER_ENTER');
      setStatus('▶ Action 1 — 사람 접근');
      scene.setPersonVisible(true);
      scene.setPersonPosition(-1.1, 0.45);
      const enter1 = scene.animatePersonTo(-0.30, 0.35, SLOW(1800));
      triggerAccessEvent({ eventType: 'PLOTTER_ENTER', count: 1 });
      await enter1;
      await yield_(SLOW(200));

      // ─── [2/10] s-1 (상단) 박스 3개 꺼냄 — 손 높게 ─────────────────
      appendLog('[2/10] s-1 상단 — 박스 3개 꺼냄');
      setStatus('📦 s-1 박스 꺼냄');
      scene.setAccessIndicator(SEC_1, true);
      for (let i = 0; i <= 10; i++) {
        scene.setHandRaise(0.4 + i / 25); // s-1 위쪽이라 손 높게
        await yield_(SLOW(60));
      }
      scene.setPersonHoldingBox(true);
      scene.setAccessIndicator(SEC_1, false);
      await yield_(SLOW(500));

      // ─── [3/10] s-2 (하단) 박스 1개 입고 — 손 낮게 ──────────────────
      appendLog('[3/10] s-2 하단 — 박스 1개 입고 (5 → 6)');
      setStatus('📥 s-2 입고');
      // 작업자가 s-1 에서 꺼낸 박스 들고 있음 + s-2 에 새 박스도 들고 있다 가정
      scene.setAccessIndicator(SEC_2, true);
      for (let i = 0; i <= 10; i++) {
        scene.setHandRaise(0.4 - i / 25);
        await yield_(SLOW(60));
      }
      await yield_(SLOW(300));
      // 새 박스 1개 즉시 visual 추가 — vision 미인식 회색 (Action 1 scan 에서 확정).
      scene.setSectionQty(SEC_2, 6);
      scene.setBoxState(SEC_2, 5, 'unknown');
      appendLog('  새 박스 1개 진열 (vision 미인식, 회색 — scan 에서 확정)');
      await yield_(SLOW(400));
      scene.setHandRaise(0);
      scene.setAccessIndicator(SEC_2, false);
      await yield_(SLOW(300));

      // ─── [4/10] 사람 1차 EXIT + compute lag ────────────────────────
      appendLog('[4/10] 사람 PLOTTER_EXIT → compute lag → multi-section scan-queue');
      setStatus('🚶 1차 EXIT');
      const exit1 = scene.animatePersonTo(-1.1, 0.45, SLOW(1800));
      triggerAccessEvent({ eventType: 'PLOTTER_EXIT', count: 0 });
      await exit1;
      scene.setPersonVisible(false);
      scene.setPersonHoldingBox(false);

      appendLog('  ADR-014: compute lag (vision joint detection)');
      await yield_(SLOW(1500));

      // ─── [5/10] multi-section scan [1,2] → TSP planner → s-1, s-2 ──
      appendLog('[5/10] device /scan-queue sections=[1,2] → TSP planner 활성 (n=2)');
      setStatus('📷 multi-section scan (TSP 정렬)');
      triggerScanQueue([SEC_1, SEC_2]);

      appendLog('  plotter: home → s-1 (상단) snap → s-2 (하단) snap → home');
      // ── s-1 scan ──────────────────────────────────────────────────
      const goSec1 = scene.animateHeadTo(sec1.x_mm, sec1.y_mm, 0, SLOW(1500));
      await yield_(SLOW(800));
      scene.flashSnap(SLOW(700));
      await goSec1;
      appendLog('  → s-1 snap 완료, BE reconcile 중...');
      await yield_(ALERT(700));     // BE reconcile 텀 — 알람 빠르게 (사용자 피드백)
      // 결과 — qty 6→3 visual
      scene.setSectionQty(SEC_1, 3);
      appendLog('  → BE reconcile: s-1 타이레놀 6→3');
      await yield_(ALERT(600));     // qty 변화 → alert 평가 텀 — 알람 빠르게
      // alert 점등 — state machine 이 새 severity 평가 후 발화
      scene.setAlertIndicator(SEC_1, true);
      appendLog('  → ⚠️ stock_critical (타이레놀)');
      await yield_(SLOW(500));

      // ── s-2 scan ──────────────────────────────────────────────────
      const goSec2 = scene.animateHeadTo(sec2.x_mm, sec2.y_mm, 0, SLOW(1500));
      await yield_(SLOW(800));
      scene.flashSnap(SLOW(700));
      await goSec2;
      appendLog('  → s-2 snap 완료, BE reconcile 중...');
      await yield_(ALERT(700));
      // 새 박스 색 갱신 — 정상 expiry 로 확정
      scene.setBoxState(SEC_2, 5, 'normal');
      appendLog('  → BE reconcile: s-2 판콜에이 5→6 (1박스 입고 확정, normal — 알림 없음)');
      await yield_(SLOW(500));

      await scene.animateHeadTo(0, 0, 0, SLOW(1200));
      appendLog('  ★ Action 1 완료: s-1 stock_critical pending, s-2 정상 유지');
      await yield_(SLOW(800));

      // ═══════════════════════════════════════════════════════════════
      // Action 2 — 사람 2차 ENTER → s-1 보충 (1개 critical) → EXIT → single scan
      // ═══════════════════════════════════════════════════════════════

      // ─── [6/10] 사람 2차 ENTER (박스 들고) ─────────────────────────
      appendLog('[6/10] Action 2 — 사람 2차 PLOTTER_ENTER (박스 2개 들고 보충)');
      setStatus('▶ Action 2 — 보충 ENTER');
      scene.setPersonVisible(true);
      scene.setPersonHoldingBox(true);
      scene.setPersonPosition(-1.1, 0.45);
      const enter2 = scene.animatePersonTo(-0.30, 0.35, SLOW(1500));
      triggerAccessEvent({ eventType: 'PLOTTER_ENTER', count: 1 });
      await enter2;
      await yield_(SLOW(200));

      // ─── [7/10] s-1 박스 2개 보충 ──────────────────────────────────
      appendLog('[7/10] s-1 상단 — 박스 2개 보충 (그중 1개는 critical expiry)');
      setStatus('📥 s-1 보충');
      scene.setAccessIndicator(SEC_1, true);
      for (let i = 0; i <= 10; i++) {
        scene.setHandRaise(0.4 + i / 25);
        await yield_(SLOW(60));
      }
      await yield_(SLOW(400));
      scene.setHandRaise(0);
      scene.setPersonHoldingBox(false);
      scene.setAccessIndicator(SEC_1, false);
      // 새 박스 2개 즉시 visual 추가 (vision 미인식 상태 — 회색 unknown)
      scene.setSectionQty(SEC_1, 5);
      scene.setBoxState(SEC_1, 3, 'unknown');
      scene.setBoxState(SEC_1, 4, 'unknown');
      appendLog('  새 박스 2개 진열 (vision 미인식, 회색 — 다음 scan 에서 SSS 가 expiry 확인)');
      await yield_(SLOW(500));

      // ─── [8/10] 사람 2차 EXIT + compute lag ────────────────────────
      appendLog('[8/10] 사람 PLOTTER_EXIT → compute lag → single-section scan-queue');
      setStatus('🚶 2차 EXIT');
      const exit2 = scene.animatePersonTo(-1.1, 0.45, SLOW(1500));
      triggerAccessEvent({ eventType: 'PLOTTER_EXIT', count: 0 });
      await exit2;
      scene.setPersonVisible(false);

      appendLog('  ADR-014: compute lag');
      await yield_(SLOW(1500));

      // ─── [9/10] single-section scan [1] → s-1 보충 인식 ────────────
      appendLog('[9/10] device /scan-queue sections=[1] (single — s-1 만 보충 확인)');
      setStatus('📷 s-1 재 scan');
      triggerScanQueue([SEC_1]);

      const goSec1Again = scene.animateHeadTo(sec1.x_mm, sec1.y_mm, 0, SLOW(1500));
      await yield_(SLOW(800));
      scene.flashSnap(SLOW(700));
      await goSec1Again;
      appendLog('  → s-1 snap 완료, BE reconcile 중...');
      await yield_(ALERT(700));     // BE reconcile 텀 — 알람 빠르게

      // 새 박스 색 갱신 — 1개 critical, 1개 normal
      scene.setBoxState(SEC_1, 3, 'critical');
      scene.setBoxState(SEC_1, 4, 'normal');
      appendLog('  → BE reconcile: s-1 3→5, 새 batch 등록 (1박스 expiry=오늘+1d)');
      await yield_(ALERT(600));     // batch 등록 → alert 평가 텀 — 알람 빠르게

      // 시각적으로 stock_critical 해소 → expiry_critical 신규 (사용자 narrative 의도).
      // 단 현재 backend 는 stock_critical 수동 close 필요 — 향후 자동 close [[project-alert-auto-resolve]].
      scene.setAlertIndicator(SEC_1, false);
      appendLog('  → (의도) stock_critical 해소 — 현재는 수동 close 필요');
      await yield_(ALERT(400));
      scene.setAlertIndicator(SEC_1, true);
      appendLog('  → ⚠️ expiry_critical (타이레놀 critical 박스)');
      await yield_(SLOW(400));
      await scene.animateHeadTo(0, 0, 0, SLOW(1200));

      appendLog('[10/10] ✓ v3 완료');
      appendLog('  ★ Action 1: multi-section TSP + s-1 stock_critical');
      appendLog('  ★ Action 2: s-1 보충 + expiry_critical 발화');
      appendLog('  주의: 현재 backend 는 보충 후 stock_critical 도 pending 유지 (수동 close 필요)');
      appendLog('        향후 자동 close 기능 별도 작업 (project_alert_auto_resolve)');
      setStatus('✓ v3 완료');
    } catch (err) {
      if (err.message === 'cancelled') {
        appendLog('— 정지됨'); setStatus('정지됨');
      } else {
        appendLog(`error: ${err.message}`); setStatus('에러');
      }
      scene.setPersonVisible(false);
      scene.setPersonHoldingBox(false);
      scene.setHandRaise(0);
    } finally {
      scenarioRunning = false;
      if (playBtnV3) playBtnV3.disabled = false;
      if (playBtnV2) playBtnV2.disabled = false;
    }
  }

  return {
    html: html(),
    mount() {
      const canvas = document.getElementById(CANVAS_ID);
      if (!canvas) {
        console.error('[SimPage] canvas 없음');
        return;
      }
      requestAnimationFrame(() => {
        scene = new PlotterScene(canvas);
        // 초기 마운트 시 silent reset — 로그 ('v2 초기 상태로 리셋') 안 남기게.
        // 사용자가 명시적으로 ↺ 초기 상태 버튼 누를 때만 로그.
        resetScenario({ silent: true });
      });

      wireRange('sim-x', 'sim-x-val', () => setHeadFromRanges());
      wireRange('sim-y', 'sim-y-val', () => setHeadFromRanges());
      wireRange('sim-z', 'sim-z-val', () => setHeadFromRanges());
      for (const sec of PLOTTER_SPEC.sections) {
        wireRange(`sim-qty-${sec.id}`, `sim-qty-${sec.id}-val`, (v) => {
          if (!scenarioRunning) scene?.setSectionQty(sec.id, v);
        });
      }

      const wireBtn = (id, fn) => {
        const el = document.getElementById(id);
        if (!el) return;
        el.addEventListener('click', fn);
        handlers.push(() => el.removeEventListener('click', fn));
      };
      wireBtn('sim-play', () => runScenario());
      wireBtn('sim-reset-scenario', () => resetScenario());
      wireBtn('sim-play-v3', () => runScenarioV3());
      wireBtn('sim-reset-v3', () => resetScenarioV3());
    },
    destroy() {
      scenarioCancel = true;
      handlers.forEach(off => off());
      handlers.length = 0;
      scene?.destroy();
      scene = null;
    },
  };
}
