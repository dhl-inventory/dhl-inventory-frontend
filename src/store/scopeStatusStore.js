/**
 * scopeStatusStore — scope 계층별 숨은 알림 roll-up (Phase 5.7)
 * ─────────────────────────────────────────────────────────────
 * 멘토 핵심 아이디어 구현체 (chart_strategy.md §6-§7).
 *
 * 역할:
 *   alertsApi.fetchAlerts({ status: 'pending' })를 한 번 호출해서
 *   alert.target.{zoneId, sectionId} 기준으로 count roll-up.
 *   Zone Overview / Zone Detail 페이지가 이 store를 구독해서
 *   "숨은 pending alert이 있는 zone/section" 카드에 시각 overlay 적용.
 *
 * 정책 (2026-05-15 사용자 결정):
 *  - 카운트 대상 status: `pending` only (in_process / completed / cancelled 제외)
 *  - 카운트 대상 카테고리: `stock_shortage` / `validity_risk` 2종 only
 *    → `device_issue` / `abnormal_access`는 alert list에서만 노출하고 hierarchy roll-up 제외
 *  - refresh는 페이지 mount 시 명시 호출 (Phase 7 socket fan-out 시점에 자동화 가능)
 *  - alertsStore에 직접 구독하지 않고 자체 fetch — alertsStore는 Alert List 페이지 전용 상태
 *
 * Backend 변동 없음:
 *  - 기존 `GET /alerts?status=pending&limit=1000` 호출.
 *  - 응답 schema 그대로 사용 (target.zoneId / target.sectionId / alertType / status).
 *  - 실 API 모드에서도 동일.
 *
 * 사용 예:
 *   // ZoneOverviewPage mount
 *   unsubScope = scopeStatusStore.subscribe(rerender);
 *   scopeStatusStore.refresh();
 *
 *   // render
 *   const { byZone } = scopeStatusStore.getState();
 *   const hasOverlay = (byZone[zone.zoneId]?.count ?? 0) > 0;
 */

import { createStore } from '../core/createStore.js';
import { fetchAlerts } from '../api/alertsApi.js';
import { ALERT_TYPE_CATEGORY } from '../components/alerts/alertConstants.js';

// hierarchy roll-up surfacing 대상 카테고리 (사용자 결정: stock + validity만)
const SURFACE_CATEGORIES = ['stock_shortage', 'validity_risk'];

const initialState = {
  byZone:     {},     // { [zoneId]: { count } }
  bySection:  {},     // { [sectionId]: { count } }
  isLoading:  false,
  receivedAt: null,
  error:      null,
};

const inner = createStore({ ...initialState });

let inFlight = null;

async function refresh() {
  // 중복 호출 방지 — 진행 중인 호출 있으면 그 promise 반환
  if (inFlight) return inFlight;

  inner.setState({ isLoading: true, error: null });
  inFlight = (async () => {
    try {
      // pending only / limit 충분히 크게 (mock 작아서 OK, 실 API는 backend가 ceiling)
      const res = await fetchAlerts({ status: 'pending', limit: 1000 });
      const items = res?.data?.items ?? [];

      const byZone = {};
      const bySection = {};

      for (const a of items) {
        // 카테고리 필터 — stock_shortage / validity_risk만 roll-up
        const category = ALERT_TYPE_CATEGORY[a.alertType];
        if (!SURFACE_CATEGORIES.includes(category)) continue;

        // status는 query로 이미 pending만 받았지만 방어적으로 한 번 더
        if (a.status !== 'pending') continue;

        const sectionId = a.target?.sectionId;
        if (sectionId) {
          if (!bySection[sectionId]) bySection[sectionId] = { count: 0 };
          bySection[sectionId].count += 1;
        }

        const zoneId = a.target?.zoneId;
        if (zoneId) {
          if (!byZone[zoneId]) byZone[zoneId] = { count: 0 };
          byZone[zoneId].count += 1;
        }
      }

      inner.setState({
        byZone,
        bySection,
        isLoading:  false,
        receivedAt: Date.now(),
        error:      null,
      });
    } catch (err) {
      inner.setState({ isLoading: false, error: err });
    } finally {
      inFlight = null;
    }
  })();

  return inFlight;
}

function reset() {
  inFlight = null;
  inner.setState({ ...initialState });
}

export const scopeStatusStore = {
  subscribe: inner.subscribe,
  getState:  inner.getState,
  refresh,
  reset,
};
