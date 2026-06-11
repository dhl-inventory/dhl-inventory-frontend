/**
 * dashboardStore — Dashboard 화면 상태
 * ─────────────────────────────────────────────────────────────
 * 6개 endpoint 합성 결과를 단일 store에 보관. Dashboard 컴포넌트는
 * 이 store만 subscribe하면 됨 (api/mock 구분 신경 안 씀).
 *
 * State:
 *   isLoading   — fetch 진행 중
 *   error       — fetch 실패 시 Error 객체, 성공 시 null
 *   data        — { inbound, outbound, validity, capacity, topItems, validityList } (camelCase)
 *   receivedAt  — Promise.all 완료 시각 (Date.now). TopBar Updated 표시용 (M1).
 *
 * Actions:
 *   fetchSummary(params)  — 6개 endpoint 병렬 호출 + state 갱신
 *   reset()                — 초기 상태로 복구 (logout / role 변경 시)
 *
 * 6단계 stockStatus는 backend가 enum으로 직접 제공 (agreements §1) →
 * frontend derive 불필요. metric_definitions §5의 임계값 변경은 backend 책임.
 */

import { createStore } from '../core/createStore.js';
import { fetchDashboardSummary } from '../api/dashboardApi.js';
import { subscribeInventoryRefetch } from '../core/socket.js';
import { appStore } from './appStore.js';

const inner = createStore({
  isLoading:  false,
  error:      null,
  data:       null,
  receivedAt: null,
});

// socket 이벤트로 재호출할 때 동일 period query 유지하기 위한 lastParams 보관
let lastParams = null;
// socket 핸들러 cleanup 함수 (subscribeSocket 호출 시 세팅)
let socketCleanup = null;

async function fetchSummary(params) {
  const startLang = appStore.getState().lang;
  lastParams = params;
  inner.setState({ isLoading: true, error: null });
  try {
    const summary = await fetchDashboardSummary(params);
    if (appStore.getState().lang !== startLang) return;   // lang 바뀜 → 응답 폐기(race 차단)
    const { receivedAt, ...data } = summary;
    inner.setState({
      isLoading:  false,
      error:      null,
      data,
      receivedAt,
    });
  } catch (err) {
    inner.setState({
      isLoading: false,
      error:     err,
    });
  }
}

/**
 * socket.io `inventory_update` 구독 — Dashboard 진입 시 1회 호출.
 * 이벤트 수신 → 300ms debounce 후 lastParams로 fetchSummary 재호출.
 * 이미 구독 중이면 no-op. mock 모드에서도 동작 (socket bus 경유).
 */
function subscribeSocket() {
  if (socketCleanup) return;
  socketCleanup = subscribeInventoryRefetch(() => {
    if (lastParams) fetchSummary(lastParams);
  }, { debounceMs: 300 });
}

function unsubscribeSocket() {
  socketCleanup?.();
  socketCleanup = null;
}

function reset() {
  unsubscribeSocket();
  lastParams = null;
  inner.setState({
    isLoading:  false,
    error:      null,
    data:       null,
    receivedAt: null,
  });
}

export const dashboardStore = {
  subscribe: inner.subscribe,
  getState:  inner.getState,
  fetchSummary,
  subscribeSocket,
  unsubscribeSocket,
  reset,
};
