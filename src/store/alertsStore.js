/**
 * alertsStore — 05 Alert List 화면 상태
 * ─────────────────────────────────────────────────────────────
 * `GET /alerts` 단일 endpoint + PATCH 1종.
 * ADR-019: status 4단계(pending / in_process / completed / cancelled),
 *          severity 3단계(info / warning / critical), target denormalize.
 *
 * Inline action 패턴(2026-05-13 결정): row click 비활성, row 마지막 셀의
 * status 전이 버튼만으로 상태를 바꾼다. 따라서 store는 list + 전이 중인
 * alertId 한 개만 추적.
 *
 * State:
 *   list            — { items, totalCount, pendingCount, inProcessCount,
 *                       criticalCount, isLoading, error, params, receivedAt }
 *   transitioningId — 현재 PATCH 중인 alertId (해당 row 버튼 disable 용)
 *
 * Actions:
 *   fetchList(params)         — list 조회
 *   transitionStatus(id, st)  — PATCH /alerts/{id} + in-place 갱신
 *   reset()
 */

import { createStore } from '../core/createStore.js';
import { fetchAlerts, updateAlertStatus } from '../api/alertsApi.js';
import { subscribeSocket } from '../core/socket.js';
import { showToast } from '../components/common/Toast.js';
import { alertDisplay } from '../components/alerts/alertDisplay.js';
import { appStore } from './appStore.js';
import { t } from '../core/i18n/index.js';

const SUMMARY_PREVIEW_LIMIT = 10;   // AlertCenter dropdown은 최근 3개 사용, 여유분 보관

const initialList = {
  items:           [],
  totalCount:      0,
  pendingCount:    0,
  inProcessCount:  0,
  criticalCount:   0,
  isLoading:       false,
  error:           null,
  params:          null,
  receivedAt:      null,
};

// Phase 6: TopBar 종형 벨 / AlertCenter 드롭다운이 참조하는 site-wide slice.
//   list와 분리하는 이유: list는 페이지 filter에 따라 다른 데이터를 들고 있어서
//   페이지 진입/이탈에 따라 변함. summary는 페이지 무관 사이트 전체 미처리 알림.
const initialSummary = {
  items:       [],   // 최근 N개 미처리 alert (pending status, severity desc / created_at desc)
  unreadCount: 0,    // pending alert 총 개수
  isLoading:   false,
  error:       null,
};

const inner = createStore({
  list:            { ...initialList },
  summary:         { ...initialSummary },
  transitioningId: null,
});

// socket subscribe cleanup
let _unsubAlertSocket = null;

async function fetchList(params = {}) {
  const startLang = appStore.getState().lang;
  const state = inner.getState();
  inner.setState({
    list: { ...state.list, isLoading: true, error: null, params },
  });
  try {
    const res = await fetchAlerts(params);
    if (appStore.getState().lang !== startLang) return;   // lang 바뀜 → 응답 폐기(race 차단)
    const d = res.data ?? {};
    inner.setState({
      list: {
        items:          d.items ?? [],
        totalCount:     d.totalCount ?? 0,
        pendingCount:   d.pendingCount ?? 0,
        inProcessCount: d.inProcessCount ?? 0,
        criticalCount:  d.criticalCount ?? 0,
        isLoading:      false,
        error:          null,
        params,
        receivedAt:     res.receivedAt,
      },
    });
  } catch (err) {
    inner.setState({
      list: { ...inner.getState().list, isLoading: false, error: err },
    });
  }
}

async function transitionStatus(alertId, nextStatus) {
  if (!alertId || !nextStatus) return;
  inner.setState({ transitioningId: alertId });
  try {
    await updateAlertStatus(alertId, nextStatus);
    const state = inner.getState();

    // list 측 status 갱신 (또는 status filter 미일치 시 제거 — 페이지 흐름이 어색해질 수 있어 보존)
    const items = state.list.items.map((a) =>
      a.alertId === alertId ? { ...a, status: nextStatus } : a,
    );

    // summary 측 동기 갱신 (TopBar 종형 벨 뱃지 + AlertCenter 드롭다운):
    //   pending → 다른 status로 전이 시 unreadCount -= 1, summary.items에서 제거
    //   다른 status → pending 으로 (드문 케이스, 재오픈 등)도 호환되도록 정합 유지
    const prev = state.list.items.find((a) => a.alertId === alertId);
    const wasPending = prev?.status === 'pending';
    const isPending  = nextStatus === 'pending';
    let nextSummary = state.summary;
    if (wasPending && !isPending) {
      nextSummary = {
        ...state.summary,
        items:       state.summary.items.filter((a) => a.alertId !== alertId),
        unreadCount: Math.max(0, state.summary.unreadCount - 1),
      };
    } else if (!wasPending && isPending) {
      // 재오픈 — summary에 다시 추가 (중복 방지)
      const already = state.summary.items.some((a) => a.alertId === alertId);
      if (!already && prev) {
        nextSummary = {
          ...state.summary,
          items:       [{ ...prev, status: 'pending' }, ...state.summary.items],
          unreadCount: state.summary.unreadCount + 1,
        };
      }
    }

    inner.setState({
      list:            { ...state.list, items },
      summary:         nextSummary,
      transitioningId: null,
    });
  } catch (err) {
    inner.setState({
      transitioningId: null,
      list: { ...inner.getState().list, error: err },
    });
  }
}

function reset() {
  inner.setState({
    list:            { ...initialList },
    summary:         { ...initialSummary },
    transitioningId: null,
  });
}

// ─── Phase 6: Summary slice (site-wide pending) ────────────

/**
 * 사이트 전체 미처리 alert summary fetch.
 *  - TopBar mount 직후 1회 호출 (로그인 직후 또는 page load 시)
 *  - socket alert 수신 시 incremental 갱신만 수행 (재호출 불필요)
 *  - 호출 실패 시 silent (TopBar UI는 unreadCount=0 으로 동작)
 */
async function fetchSummary() {
  const startLang = appStore.getState().lang;
  const state = inner.getState();
  inner.setState({ summary: { ...state.summary, isLoading: true, error: null } });
  try {
    const res = await fetchAlerts({
      status: 'pending',
      page: 1,
      limit: SUMMARY_PREVIEW_LIMIT,
      sort_by: 'created_at',
      order: 'desc',
    });
    if (appStore.getState().lang !== startLang) return;   // lang 바뀜 → 응답 폐기(race 차단)
    const d = res.data ?? {};
    inner.setState({
      summary: {
        items:       d.items ?? [],
        unreadCount: d.pendingCount ?? d.totalCount ?? (d.items?.length ?? 0),
        isLoading:   false,
        error:       null,
      },
    });
  } catch (err) {
    inner.setState({
      summary: { ...inner.getState().summary, isLoading: false, error: err },
    });
  }
}

/**
 * Socket 'alert' 이벤트 수신 핸들러.
 *  - summary.items 머리에 push (중복 alertId 방지)
 *  - unreadCount += 1
 *  - list가 mounted 상태(AlertList 페이지 활성)면 list.items에도 push
 *  - severity === 'critical' 이면 toast popup (P3 정책)
 *
 * Payload schema (changestream.py):
 *   { type: 'alert', data: <alert_doc> }
 *   alert_doc: { alert_id, site_id, alert_type, severity, title, status, target, message, created_at }
 *
 * Note: backend가 camelCase로 normalize하지 않고 snake_case 그대로 emit한다고 가정.
 *       기존 fetchAlerts 응답은 http.js의 toCamel을 통과해 camelCase. 따라서
 *       socket payload는 별도 toCamel 처리 필요.
 */
function handleSocketAlert(payload) {
  const raw = payload?.data ?? payload;
  if (!raw) return;
  const alert = toCamelLocal(raw);
  if (!alert.alertId) return;

  const state = inner.getState();
  const summaryItems = state.summary.items ?? [];

  // 중복 방지 — 이미 같은 alertId가 들어있으면 update만
  const dupIdx = summaryItems.findIndex((a) => a.alertId === alert.alertId);
  const nextSummaryItems = dupIdx >= 0
    ? summaryItems.map((a, i) => (i === dupIdx ? { ...a, ...alert } : a))
    : [alert, ...summaryItems].slice(0, SUMMARY_PREVIEW_LIMIT);

  inner.setState({
    summary: {
      ...state.summary,
      items:       nextSummaryItems,
      unreadCount: dupIdx >= 0 ? state.summary.unreadCount : state.summary.unreadCount + 1,
    },
  });

  // list가 mounted 상태면 list.items 머리에도 push (filter 무관 — 신규는 항상 보이는 게 자연스러움)
  //   다만 status가 pending이 아닌 경우(거의 없지만) push 안 함
  if (state.list.items.length > 0 && alert.status === 'pending') {
    const listDupIdx = state.list.items.findIndex((a) => a.alertId === alert.alertId);
    if (listDupIdx < 0) {
      inner.setState({
        list: {
          ...inner.getState().list,
          items:        [alert, ...state.list.items],
          totalCount:   state.list.totalCount + 1,
          pendingCount: state.list.pendingCount + 1,
          criticalCount: alert.severity === 'critical'
            ? state.list.criticalCount + 1
            : state.list.criticalCount,
        },
      });
    }
  }

  // P3: severity === 'critical' 일 때만 toast popup
  //   #8: backend title/message 무시 → alertType+target i18n 재구성 (List/Detail 과 동일 경로)
  if (alert.severity === 'critical') {
    const disp = alertDisplay(alert);
    showToast({
      title:    disp.title || t('alert.untitled'),
      message:  disp.message || '',
      severity: 'critical',
      onClick:  () => {
        window.location.hash = `#/alerts?focusId=${encodeURIComponent(alert.alertId)}`;
      },
    });
  }
}

/**
 * Socket 'alert' 채널 구독을 시작. main.js의 wireSocketToAuth가 socket을
 * 연결하는 시점과 무관하게 한 번만 호출하면 됨 (core/socket.js의 bus가 wire-up).
 */
function startSocket() {
  if (_unsubAlertSocket) return;
  _unsubAlertSocket = subscribeSocket('alert', handleSocketAlert);
}

function stopSocket() {
  _unsubAlertSocket?.();
  _unsubAlertSocket = null;
}

// snake_case → camelCase 변환 (간단 — http.js의 toCamel과 동일 로직)
//   socket payload만 변환하면 되므로 의존성을 늘리지 않기 위해 inline.
function toCamelLocal(obj) {
  if (Array.isArray(obj)) return obj.map(toCamelLocal);
  if (obj == null || typeof obj !== 'object') return obj;
  const out = {};
  for (const [k, v] of Object.entries(obj)) {
    const camelKey = k.replace(/_([a-z])/g, (_, c) => c.toUpperCase());
    out[camelKey] = toCamelLocal(v);
  }
  return out;
}

export const alertsStore = {
  subscribe: inner.subscribe,
  getState:  inner.getState,
  fetchList,
  transitionStatus,
  fetchSummary,
  startSocket,
  stopSocket,
  reset,
};
