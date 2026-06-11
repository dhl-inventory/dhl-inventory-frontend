/**
 * Socket.io 클라이언트 — Phase 6 실시간 push
 * ─────────────────────────────────────────────────────────────
 * Backend 가이드: docs/architecture/socket_io_guide.md (2026-05-16 갱신, enum 7종 정합)
 *  - Endpoint: VITE_SOCKET_URL or https://your-domain.example.com
 *  - Auth: { site_id }   ← 사용자 site_id로 자동 room join (site_{site_id})
 *  - 이벤트:
 *      inventory_update  (data.type: 'inventory_event' | 'batches')
 *      alert             (data.type: 'alert', data.data.alert_type 7종)
 *
 * 이벤트 페이로드 정합 (changestream.py):
 *   socket.on('alert',            (payload) => payload.data = alert_doc)
 *   socket.on('inventory_update', (payload) => payload.data = mongo_doc)
 *
 * 모드 분기:
 *   - VITE_USE_MOCK !== 'false' → 실 socket 연결 X. in-memory bus로 핸들러만 wire.
 *                                  Step D socketMock 헬퍼가 _emitMockEvent로 가짜 발사.
 *   - VITE_USE_MOCK === 'false' → 실 socket.io 연결.
 *
 * 사용 패턴 (store):
 *   const unsubscribe = subscribeSocket('alert', (payload) => { ... });
 *   // cleanup 시 unsubscribe();
 *
 * 라이프사이클:
 *   - 로그인 성공 후 authStore가 connectSocket(siteId) 호출
 *   - 로그아웃 시 disconnectSocket() 호출
 *   - subscribe는 connect 전후 어느 시점에 호출해도 안전 (bus가 보관 후 wire-up)
 */

import { io } from 'socket.io-client';

const USE_MOCK = import.meta.env.VITE_USE_MOCK !== 'false';

// SOCKET_URL 우선순위:
//   1. VITE_SOCKET_URL 명시값
//   2. VITE_API_BASE_URL 이 절대 URL (http://...) → origin 추출
//   3. VITE_API_BASE_URL 이 상대 경로 (/api/v1) → same-origin (vite proxy 사용 — 로컬 dev)
//   4. fallback: production EC2
function _resolveSocketUrl() {
  const explicit = import.meta.env.VITE_SOCKET_URL;
  if (explicit) return explicit;
  const apiBase = import.meta.env.VITE_API_BASE_URL || '';
  if (apiBase.startsWith('http')) {
    return apiBase.replace(/\/api\/v1\/?$/, '');
  }
  if (apiBase.startsWith('/')) {
    return '';   // io('') → browser same-origin (vite proxy /socket.io 가 BE 로 forward)
  }
  return 'https://your-domain.example.com';
}
const SOCKET_URL = _resolveSocketUrl();

// ─── 모듈 내부 상태 ──────────────────────────────────────
let socket = null;
let _siteId = null;
const _handlers = new Map();   // eventName → Set<handler>

// ─── public API ──────────────────────────────────────────

/**
 * Socket 연결 시작. 멱등 (같은 siteId 재호출 시 no-op).
 *
 * @param {string} siteId  authStore.accessScope.siteId
 * @returns 실 모드면 socket 인스턴스, mock 모드면 null
 */
export function initSocket(siteId) {
  if (!siteId) {
    console.warn('[socket] site_id missing — skip connect');
    return null;
  }
  if (socket && _siteId === siteId) return socket;
  if (socket) disconnectSocket();
  _siteId = siteId;

  if (USE_MOCK) {
    // mock: 실 socket 미생성. bus는 기존대로 동작.
    console.info('[socket] mock mode — using in-memory bus (no real connection)');
    return null;
  }

  socket = io(SOCKET_URL, {
    auth: { site_id: siteId },
    path: '/socket.io/',
    transports: ['polling', 'websocket'],
  });

  // bus에 등록된 모든 핸들러를 실 socket에 즉시 wire-up
  for (const [eventName, handlerSet] of _handlers) {
    for (const handler of handlerSet) socket.on(eventName, handler);
  }

  socket.on('connect',       () => console.info('[socket] connected:', socket.id));
  socket.on('disconnect',    (reason) => console.info('[socket] disconnected:', reason));
  socket.on('connect_error', (err)    => console.warn('[socket] connect_error:', err.message));

  return socket;
}

export function getSocket() {
  return socket;
}

export function disconnectSocket() {
  socket?.disconnect();
  socket = null;
  _siteId = null;
}

/**
 * 이벤트 구독. connect 전후 어느 시점에 호출해도 안전.
 *
 * @param {string} eventName  'alert' | 'inventory_update'
 * @param {function} handler  (payload) => void
 * @returns {function} unsubscribe
 */
export function subscribeSocket(eventName, handler) {
  if (typeof handler !== 'function') return () => {};

  if (!_handlers.has(eventName)) _handlers.set(eventName, new Set());
  _handlers.get(eventName).add(handler);

  // 이미 실 socket이 떠 있으면 즉시 wire-up
  if (socket) socket.on(eventName, handler);

  return () => {
    const set = _handlers.get(eventName);
    if (!set) return;
    set.delete(handler);
    if (socket) socket.off(eventName, handler);
  };
}

export function isSocketConnected() {
  return Boolean(socket?.connected);
}

/**
 * inventory_update 채널을 debounce된 refetch 콜백에 연결하는 헬퍼.
 *  - 페이지 mount 시 한 줄로 socket 구독 시작
 *  - 페이지 destroy 시 반환된 unsubscribe 호출
 *  - 짧은 시간에 N개 이벤트가 와도 한 번만 refetch (debounceMs)
 *
 * 사용:
 *   const unsub = subscribeInventoryRefetch(() => skuListStore.fetchList(currentQuery));
 *   // destroy()에서 unsub();
 *
 * @param {function} refetchFn  () => void — 호출 시 store refetch
 * @param {object} options
 * @param {number} options.debounceMs  기본 800ms
 * @returns {function} unsubscribe (구독 해제 + 타이머 정리)
 */
export function subscribeInventoryRefetch(refetchFn, { debounceMs = 800 } = {}) {
  if (typeof refetchFn !== 'function') return () => {};

  let timer = null;
  const debounced = () => {
    if (timer) clearTimeout(timer);
    timer = setTimeout(() => {
      timer = null;
      try { refetchFn(); }
      catch (err) { console.error('[socket] inventory refetch error:', err); }
    }, debounceMs);
  };

  const unsub = subscribeSocket('inventory_update', debounced);
  return () => {
    if (timer) { clearTimeout(timer); timer = null; }
    unsub();
  };
}

/**
 * Mock 모드 dev helper용. 등록된 모든 핸들러에 payload를 전달.
 *  - 실 모드에서 호출되면 무해 (no-op + warn)
 *  - Step D mocks/socketMock.js가 가짜 alert / inventory_update 발사 시 사용
 */
export function _emitMockEvent(eventName, payload) {
  if (!USE_MOCK) {
    console.warn('[socket] _emitMockEvent called outside mock mode — ignored');
    return;
  }
  const set = _handlers.get(eventName);
  if (!set) return;
  for (const handler of set) {
    try { handler(payload); }
    catch (err) { console.error('[socket] mock handler error:', err); }
  }
}
