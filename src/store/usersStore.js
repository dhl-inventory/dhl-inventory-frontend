/**
 * usersStore — 10 User Management 화면 상태
 * ─────────────────────────────────────────────────────────────
 * list + 선택된 user의 permissions / reset requests를 lazy load 합성.
 *
 * 흐름:
 *   1) fetchList(params)   — GET /admin/users → state.list
 *   2) selectUser(userId)  — row 클릭 시. 선택된 user의 permissions / reset requests 병렬 호출
 *   3) refreshSelected()   — 작업(예: Reset Password) 후 선택 user 새로고침
 *   4) reset()             — 페이지 destroy 시
 *
 * State:
 *   list       — { items, isLoading, error, params, receivedAt }
 *   selected   — { userId, permissions, resetRequests, isLoading, error }
 *   filters    — { search, role, status }  (UI에서 입력. fetchList 호출 트리거)
 */

import { createStore } from '../core/createStore.js';
import {
  fetchUsers,
  fetchUserPermissions,
  fetchPasswordResetRequestQueue,
  completePasswordResetRequest,
} from '../api/usersApi.js';

const initialState = {
  list: {
    items:      [],
    isLoading:  false,
    error:      null,
    receivedAt: null,
  },
  selected: {
    userId:        null,
    permissions:   null,
    resetRequests: null,
    isLoading:     false,
    error:         null,
  },
  filters: {
    search: '',
    role:   'all',
    status: 'all',
  },
  // 전역 비밀번호 재설정 요청 큐 (§2.38 = backend 글로벌 endpoint, user별 없음)
  resetQueue: {
    items:     [],
    isLoading: false,
    error:     null,
  },
};

const inner = createStore({ ...initialState, list: { ...initialState.list }, selected: { ...initialState.selected }, filters: { ...initialState.filters }, resetQueue: { ...initialState.resetQueue } });

// 전역 resetQueue 에서 특정 user 의 항목만 필터 (selected.resetRequests source)
function selectedResetItems(userId) {
  if (!userId) return [];
  return (inner.getState().resetQueue.items ?? []).filter((r) => r.userId === userId);
}

function syncSelectedResetRequests() {
  const sel = inner.getState().selected;
  if (!sel.userId) return;
  inner.setState({ selected: { ...sel, resetRequests: { items: selectedResetItems(sel.userId) } } });
}

// ─── List ────────────────────────────────────────────────
async function fetchList(params = {}) {
  const state = inner.getState();
  const merged = { ...state.filters, ...params };
  inner.setState({
    list:    { ...state.list, isLoading: true, error: null },
    filters: merged,
  });
  try {
    const res = await fetchUsers(merged);
    inner.setState({
      list: {
        items:      res.data?.items ?? [],
        isLoading:  false,
        error:      null,
        receivedAt: res.receivedAt,
      },
    });
  } catch (err) {
    inner.setState({
      list: { ...inner.getState().list, isLoading: false, error: err },
    });
  }
}

// 필터 변경 — UI에서 setFilter 후 fetchList 재호출 트리거용
function setFilter(patch) {
  const state = inner.getState();
  inner.setState({ filters: { ...state.filters, ...patch } });
}

// ─── 선택된 user의 메타 (permissions + reset requests) ─────
async function selectUser(userId) {
  if (!userId) return;
  inner.setState({
    selected: {
      userId,
      permissions:   null,
      resetRequests: { items: selectedResetItems(userId) },
      isLoading:     true,
      error:         null,
    },
  });
  // resetRequests: backend는 글로벌 큐 endpoint만 운영(§2.38 = ①B).
  //   전역 resetQueue(fetchResetQueue)에서 user_id 로 client-side 필터해 노출.
  const permResult = await fetchUserPermissions(userId).then(
    (value) => ({ status: 'fulfilled', value }),
    (reason) => ({ status: 'rejected', reason }),
  );
  inner.setState({
    selected: {
      userId,
      permissions:   permResult.status === 'fulfilled' ? permResult.value.data : null,
      resetRequests: { items: selectedResetItems(userId) },
      isLoading:     false,
      error:         permResult.status === 'rejected' ? permResult.reason : null,
    },
  });
}

// ─── 비밀번호 재설정 요청 큐 (전역) ───────────────────────
async function fetchResetQueue() {
  const s = inner.getState();
  inner.setState({ resetQueue: { ...s.resetQueue, isLoading: true, error: null } });
  try {
    const res = await fetchPasswordResetRequestQueue({ status: 'pending', limit: 100 });
    inner.setState({ resetQueue: { items: res.data?.items ?? [], isLoading: false, error: null } });
    syncSelectedResetRequests();
  } catch (err) {
    inner.setState({ resetQueue: { ...inner.getState().resetQueue, isLoading: false, error: err } });
  }
}

// 완료 마킹 (§2.38 ②C). 호출측에서 에러 catch.
async function completeResetRequest(requestId) {
  if (!requestId) return;
  await completePasswordResetRequest(requestId);
  await fetchResetQueue();   // 큐 갱신 + selected 동기화
}

// Reset Password 등 작업 후 선택 user 새로고침
async function refreshSelected() {
  const userId = inner.getState().selected.userId;
  if (userId) await selectUser(userId);
}

function clearSelected() {
  inner.setState({
    selected: { ...initialState.selected },
  });
}

function reset() {
  inner.setState({
    list:     { ...initialState.list },
    selected: { ...initialState.selected },
    filters:  { ...initialState.filters },
  });
}

export const usersStore = {
  subscribe: inner.subscribe,
  getState:  inner.getState,
  fetchList,
  setFilter,
  selectUser,
  refreshSelected,
  clearSelected,
  fetchResetQueue,
  completeResetRequest,
  reset,
};
