/**
 * skuListStore — 02-1 SKU List 화면 상태
 * ─────────────────────────────────────────────────────────────
 * `GET /inventory/stock` 한 endpoint를 감싸는 단일 store.
 * 컴포넌트는 이 store만 subscribe하면 됨 (mock/api 분기는 inventoryApi가 흡수).
 *
 * State:
 *   isLoading   — fetch 진행 중
 *   error       — fetch 실패 시 Error 객체, 성공 시 null
 *   data        — { items, totalCount, page, limit } (camelCase)
 *   params      — 마지막 fetch에 사용한 query (search/status/sort_by/order/zone_id/section_id/page/limit)
 *   receivedAt  — Date.now (M1)
 *
 * Actions:
 *   fetchList(params)  — 호출 + state 갱신. 호출자가 params 병합 책임.
 *   reset()             — 초기 상태로 복구
 */

import { createStore } from '../core/createStore.js';
import { fetchInventoryStock } from '../api/inventoryApi.js';
import { appStore } from './appStore.js';

const initialState = {
  isLoading:  false,
  error:      null,
  data:       null,
  params:     null,
  receivedAt: null,
};

const inner = createStore(initialState);

async function fetchList(params = {}) {
  const startLang = appStore.getState().lang;
  inner.setState({ isLoading: true, error: null, params });
  try {
    const result = await fetchInventoryStock(params);
    if (appStore.getState().lang !== startLang) return;   // lang 바뀜 → 응답 폐기(race 차단)
    inner.setState({
      isLoading:  false,
      error:      null,
      data:       result.data,
      receivedAt: result.receivedAt,
    });
  } catch (err) {
    inner.setState({ isLoading: false, error: err });
  }
}

function reset() {
  inner.setState({ ...initialState });
}

export const skuListStore = {
  subscribe: inner.subscribe,
  getState:  inner.getState,
  fetchList,
  reset,
};
