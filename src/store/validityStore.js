/**
 * validityStore — 04 Validity Tracking 화면 상태
 * ─────────────────────────────────────────────────────────────
 * 두 endpoint composite:
 *   GET /expiry/batches    — 목록(필터/정렬/페이지마다 호출)
 *   GET /expiry/risk-items — chip 카운트(마운트·scope 변경 시 1회만)
 *
 * State:
 *   list — { items, totalCount, isLoading, error, params, receivedAt }
 *   risk — { summary:{expiredCount, criticalCount, warningCount, normalCount},
 *            isLoading, error, receivedAt }
 *   selectedBatchId — detail modal 표시 중인 batch id
 *
 * Actions:
 *   fetchList(params)
 *   fetchRiskSummary(zoneId)
 *   selectBatch(batchId)
 *   clearSelected()
 *   reset()
 */

import { createStore } from '../core/createStore.js';
import { fetchValidityBatches, fetchExpiryRiskItems } from '../api/validityApi.js';
import { appStore } from './appStore.js';

const initialList = {
  items:      [],
  totalCount: 0,
  isLoading:  false,
  error:      null,
  params:     null,
  receivedAt: null,
};

const initialRisk = {
  summary: {
    expiredCount:  0,
    criticalCount: 0,
    warningCount:  0,
    normalCount:   0,
  },
  isLoading:  false,
  error:      null,
  receivedAt: null,
};

const inner = createStore({
  list: { ...initialList },
  risk: { ...initialRisk },
  selectedBatchId: null,
});

async function fetchList(params = {}) {
  const startLang = appStore.getState().lang;
  const state = inner.getState();
  inner.setState({ list: { ...state.list, isLoading: true, error: null, params } });
  try {
    const res = await fetchValidityBatches(params);
    if (appStore.getState().lang !== startLang) return;   // lang 바뀜 → 응답 폐기(race 차단)
    const d = res.data ?? {};
    inner.setState({
      list: {
        items:      d.items ?? [],
        totalCount: d.totalCount ?? 0,
        isLoading:  false,
        error:      null,
        params,
        receivedAt: res.receivedAt,
      },
    });
  } catch (err) {
    inner.setState({ list: { ...inner.getState().list, isLoading: false, error: err } });
  }
}

async function fetchRiskSummary(zoneId) {
  inner.setState({ risk: { ...inner.getState().risk, isLoading: true, error: null } });
  try {
    const res = await fetchExpiryRiskItems(zoneId ? { zone_id: zoneId } : {});
    const s = res.data?.summary ?? {};
    inner.setState({
      risk: {
        summary: {
          expiredCount:  s.expiredCount  ?? 0,
          criticalCount: s.criticalCount ?? 0,
          warningCount:  s.warningCount  ?? 0,
          normalCount:   s.normalCount   ?? 0,
        },
        isLoading:  false,
        error:      null,
        receivedAt: res.receivedAt,
      },
    });
  } catch (err) {
    inner.setState({ risk: { ...inner.getState().risk, isLoading: false, error: err } });
  }
}

function selectBatch(batchId) {
  inner.setState({ selectedBatchId: batchId });
}

function clearSelected() {
  inner.setState({ selectedBatchId: null });
}

function reset() {
  inner.setState({
    list: { ...initialList },
    risk: { ...initialRisk },
    selectedBatchId: null,
  });
}

export const validityStore = {
  subscribe: inner.subscribe,
  getState:  inner.getState,
  fetchList,
  fetchRiskSummary,
  selectBatch,
  clearSelected,
  reset,
};
