/**
 * operationalStatsStore — 07 Operational Stats 화면 상태
 * ─────────────────────────────────────────────────────────────
 * 6 endpoint 합성 응답을 보관. period / scope 필터는 컴포넌트가 params로 전달.
 *
 * State:
 *   isLoading / error / data / params / receivedAt
 *   data = { stats, kpi, outboundFrequency, consumption, zoneAccess, events }
 *
 * Actions:
 *   fetchSummary(params)  — period / scope 변경 시 호출
 *   reset()
 */

import { createStore } from '../core/createStore.js';
import { fetchOperationalStatsSummary } from '../api/operationalStatsApi.js';
import { appStore } from './appStore.js';

const initialState = {
  isLoading:  false,
  error:      null,
  data:       null,
  params:     null,
  receivedAt: null,
};

const inner = createStore({ ...initialState });

async function fetchSummary(params = {}) {
  const startLang = appStore.getState().lang;
  inner.setState({ isLoading: true, error: null, params });
  try {
    const summary = await fetchOperationalStatsSummary(params);
    if (appStore.getState().lang !== startLang) return;   // lang 바뀜 → 응답 폐기(race 차단)
    inner.setState({
      isLoading:  false,
      error:      null,
      data:       summary,
      receivedAt: summary.receivedAt,
    });
  } catch (err) {
    inner.setState({ isLoading: false, error: err });
  }
}

function reset() {
  inner.setState({ ...initialState });
}

export const operationalStatsStore = {
  subscribe: inner.subscribe,
  getState:  inner.getState,
  fetchSummary,
  reset,
};
