/**
 * scopeStore — TopBar scope 선택 단일 진실
 * ─────────────────────────────────────────────────────────────
 * TopBar dropdown 선택 / URL hashchange 진입을 모두 흡수해서
 * 페이지가 일관된 source(scopeStore)에서 zone 정보를 읽도록 한다.
 *
 * MVP 범위:
 *  - zoneId: 현재 선택된 zone (null = "All zones")
 *  - 향후 customer / region / warehouse / sectionId 까지 확장 가능
 *
 * 사용 패턴:
 *   - TopBar dropdown 선택      → scopeStore.setZone(zoneId)
 *   - URL hashchange (zone 포함) → scopeStore.setZone(zoneId)
 *   - 페이지 buildQuery          → scopeStore.getState().zoneId 읽음
 *   - 로그아웃                   → scopeStore.reset()
 *
 * URL ↔ store 양방향 동기화는 L3-3 단계에서 TopBar 와 main.js 에 wire-up.
 *
 * 비고:
 *  - scopeStatusStore (alerts 카운트 derive) 와 이름 비슷하지만 책임 다름.
 *    scopeStore = scope 선택 (필터 source), scopeStatusStore = alerts 카운트 derive.
 */

import { createStore } from '../core/createStore.js';

const initialState = {
  zoneId: null,     // 'zone-A' | null (null = All)
};

const inner = createStore({ ...initialState });

/**
 * 선택된 zone을 갱신.
 *  - null 전달 시 "All zones" (필터 미적용)
 *  - 같은 값이면 no-op (불필요 리렌더 방지)
 */
function setZone(zoneId) {
  const next = zoneId || null;
  if (inner.getState().zoneId === next) return;
  inner.setState({ zoneId: next });
}

function reset() {
  inner.setState({ ...initialState });
}

export const scopeStore = {
  subscribe: inner.subscribe,
  getState:  inner.getState,
  setZone,
  reset,
};
