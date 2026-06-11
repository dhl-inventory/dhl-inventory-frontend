/**
 * skuDetailStore — 02-2 SKU Detail 화면 상태
 * ─────────────────────────────────────────────────────────────
 * `GET /inventory/stock/{sku_id}` + `GET /alerts?sku_id=...` 합성.
 * 컴포넌트는 이 store만 subscribe하면 됨 (api/mock 분기는 어댑터가 흡수).
 *
 * State:
 *   isLoading   — fetch 진행 중
 *   error       — 실패 시 Error 객체
 *   data        — { detail, alerts } (camelCase). alerts = { items, totalCount, ... }
 *   skuId       — 마지막 fetch 대상 SKU ID
 *   receivedAt  — Promise.all 완료 시각 (M1)
 *
 * Actions:
 *   fetchDetail(skuId)  — 2개 endpoint 병렬 호출 + state 갱신
 *   reset()              — 초기 상태로 복구
 */

import { createStore } from '../core/createStore.js';
import {
  fetchInventoryStockDetail,
  fetchInventoryStockTrend,
  fetchInventoryEvents,
} from '../api/inventoryApi.js';
import { fetchValidityBatches } from '../api/validityApi.js';
import { fetchAlerts } from '../api/alertsApi.js';
import { appStore } from './appStore.js';

const initialTrend = {
  isLoading:  false,
  error:      null,
  items:      [],    // [{ date, qty, inboundQty, outboundQty }]
  period:     '7d',  // '7d' | '30d'
  skuId:      null,
  receivedAt: null,
};

const initialBatches = {
  isLoading:  false,
  error:      null,
  items:      [],    // [{ batchId, expiryDate, daysRemaining, qty, ... }] (days_remaining asc)
  skuId:      null,
  receivedAt: null,
};

const initialEvents = {
  isLoading:  false,
  error:      null,
  items:      [],    // [{ eventId, eventType('picking'|'replenishment'), deltaQty, afterQty, fefoCompliant, detectedBy, createdAt }]
  skuId:      null,
  receivedAt: null,
};

const initialState = {
  isLoading:  false,
  error:      null,
  data:       null,
  skuId:      null,
  receivedAt: null,
  // Phase 5.4 — Stock Trend chart (on-demand)
  trend:      { ...initialTrend },
  // Phase 4 placeholder fill (2026-05-15) — Validity Summary + Recent Stock Events
  batches:    { ...initialBatches },
  events:     { ...initialEvents },
};

const inner = createStore(initialState);

async function fetchDetail(skuId) {
  if (!skuId) {
    inner.setState({ isLoading: false, error: new Error('SKU ID가 필요합니다.'), data: null, skuId: null });
    return;
  }
  const startLang = appStore.getState().lang;
  inner.setState({ isLoading: true, error: null, skuId });

  // Promise.allSettled — detail은 critical, alerts는 graceful (backend가 sku_id filter에서 500 가능).
  //   alerts 실패 시 화면은 detail만으로도 표시되도록 빈 alerts로 fallback.
  const [detailResult, alertsResult] = await Promise.allSettled([
    fetchInventoryStockDetail(skuId),
    fetchAlerts({ sku_id: skuId, limit: 20 }),
  ]);
  if (appStore.getState().lang !== startLang) return;   // lang 바뀜 → 응답 폐기(race 차단)

  if (detailResult.status === 'rejected') {
    inner.setState({ isLoading: false, error: detailResult.reason });
    return;
  }

  const alertsData = alertsResult.status === 'fulfilled'
    ? alertsResult.value.data
    : { items: [], totalCount: 0, pendingCount: 0, inProcessCount: 0, criticalCount: 0 };
  if (alertsResult.status === 'rejected') {
    console.warn('[skuDetailStore] alerts fetch failed (graceful fallback)', alertsResult.reason);
  }

  inner.setState({
    isLoading:  false,
    error:      null,
    data:       { detail: detailResult.value.data, alerts: alertsData },
    skuId,
    receivedAt: Date.now(),
  });
}

// Validity Summary용 batches — 소스 = /expiry/batches?sku_id=
//   (평면 row + days_remaining 포함. /inventory/batches 는 섹션그룹 중첩이라 부적합. FE↔실BE 정합)
async function fetchBatches(skuId) {
  if (!skuId) return;
  const startLang = appStore.getState().lang;
  inner.setState({
    batches: { ...inner.getState().batches, isLoading: true, error: null, skuId },
  });
  try {
    const res = await fetchValidityBatches({ sku_id: skuId });
    if (appStore.getState().lang !== startLang) return;   // lang 바뀜 → 응답 폐기(race 차단)
    inner.setState({
      batches: {
        isLoading:  false,
        error:      null,
        items:      res.data?.items ?? [],
        skuId,
        receivedAt: Date.now(),
      },
    });
  } catch (err) {
    inner.setState({ batches: { ...inner.getState().batches, isLoading: false, error: err } });
  }
}

// Phase 4 placeholder fill (2026-05-15) — Recent Stock Events용 events
async function fetchEvents(skuId, limit = 10) {
  if (!skuId) return;
  const startLang = appStore.getState().lang;
  inner.setState({
    events: { ...inner.getState().events, isLoading: true, error: null, skuId },
  });
  try {
    const res = await fetchInventoryEvents(skuId, limit);
    if (appStore.getState().lang !== startLang) return;   // lang 바뀜 → 응답 폐기(race 차단)
    inner.setState({
      events: {
        isLoading:  false,
        error:      null,
        items:      res.data?.items ?? [],
        skuId,
        receivedAt: Date.now(),
      },
    });
  } catch (err) {
    inner.setState({ events: { ...inner.getState().events, isLoading: false, error: err } });
  }
}

// Phase 5.4 — Stock Trend chart 데이터. period 토글 시마다 재호출.
async function fetchTrend(skuId, period = '7d') {
  if (!skuId) return;
  const cur = inner.getState().trend;
  inner.setState({
    trend: { ...cur, isLoading: true, error: null, skuId, period },
  });
  try {
    const res = await fetchInventoryStockTrend(skuId, period);
    inner.setState({
      trend: {
        isLoading:  false,
        error:      null,
        items:      res.data?.items ?? [],
        period:     res.data?.period ?? period,
        skuId,
        receivedAt: Date.now(),
      },
    });
  } catch (err) {
    inner.setState({
      trend: { ...inner.getState().trend, isLoading: false, error: err },
    });
  }
}

function reset() {
  inner.setState({
    ...initialState,
    trend:   { ...initialTrend },
    batches: { ...initialBatches },
    events:  { ...initialEvents },
  });
}

export const skuDetailStore = {
  subscribe: inner.subscribe,
  getState:  inner.getState,
  fetchDetail,
  fetchTrend,
  fetchBatches,
  fetchEvents,
  reset,
};
