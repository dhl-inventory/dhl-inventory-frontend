/**
 * createStore — Pub/Sub 스토어 팩토리
 * ─────────────────────────────────────────────────────────────
 * V1의 단일 Store를 도메인별로 인스턴스화 가능하도록 팩토리화.
 * 자세한 사용 패턴: docs/architecture/architecture_plan.md §5.2
 *
 * 사용 예:
 *   const store = createStore({ list: [], isLoading: false });
 *   store.subscribe((state) => render(state));
 *   store.setState({ isLoading: true });
 */

export function createStore(initialState) {
  let state = initialState;
  const listeners = new Set();

  return {
    getState: () => state,

    setState: (patch) => {
      state = { ...state, ...patch };
      listeners.forEach((listener) => listener(state));
    },

    subscribe: (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  };
}
