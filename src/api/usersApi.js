/**
 * usersApi — 10 User Management 도메인 API 어댑터
 * ─────────────────────────────────────────────────────────────
 * Backend `/admin/users/*` endpoint 호출 + mock 모드 분기.
 *
 * 자세한 패턴:
 *  - architecture/api_connection_plan.md §3.1 N1 (snake→camel)
 *  - architecture/api_connection_plan.md §3.8 M1 (Date.now receivedAt)
 *  - architecture/api_feedback/backend_user_management_request.md (통합 요청서)
 *
 * 모드 분기:
 *  - VITE_USE_MOCK !== 'false' → mock (dev 기본값)
 *  - VITE_USE_MOCK === 'false' → 실 API (`http.*`)
 *
 * 모든 응답은 `{ data(camel), message, receivedAt }` 모양으로 통일.
 */

import { http } from '../core/http.js';
import { toCamel } from '../core/normalize.js';
import {
  mockUsers,
  mockUserPermissions,
  mockCreateUser,
  mockUpdateUser,
  mockResetPassword,
  mockGrantPermissions,
  mockRevokePermission,
} from '../mocks/usersMock.js';

const USE_MOCK = import.meta.env.VITE_USE_MOCK !== 'false';

// ─── mock helper ─────────────────────────────────────────
function fromMock(envelope) {
  if (!envelope?.success) {
    // mock에서 실패 envelope 시뮬레이션 — HTTP 에러처럼 throw
    const err = new Error(envelope?.message || 'Mock error');
    err.status = 400;
    err.body = envelope;
    return Promise.reject(err);
  }
  return Promise.resolve({
    data:       toCamel(envelope.data),
    message:    envelope.message,
    receivedAt: Date.now(),
  });
}

// ─── GET /admin/users ───────────────────────────────────
//   query: search, role, status, page?, limit?
export function fetchUsers(params) {
  if (USE_MOCK) return fromMock(mockUsers(params));
  return http.get('/admin/users', params);
}

// ─── GET /admin/users/{user_id}/permissions ─────────────
export function fetchUserPermissions(userId) {
  if (USE_MOCK) return fromMock(mockUserPermissions(userId));
  return http.get(`/admin/users/${encodeURIComponent(userId)}/permissions`);
}

// ─── GET /admin/users/password-reset-requests (글로벌 큐) ────
//   Backend는 user별 endpoint를 신설하지 않고 글로벌 큐 endpoint만 운영.
//   selectUser 시 user별 lazy 조회는 제거됨 (usersStore §selectUser).
//   다음 라운드 (pending §2.38 결정 후)에 통합 큐 화면 또는 user 매칭으로 재연결.
//
//   query: status (default 'pending'), page, limit
export function fetchPasswordResetRequestQueue(params = {}) {
  if (USE_MOCK) {
    // §2.38 데모용 — 실제 mock user(user-001/user-005)와 매칭해 dev 에서
    //   List 행 배지 + User Detail 패널이 보이도록 샘플 pending 제공.
    //   (mock은 정적이라 완료 마킹이 영구 반영 안 됨 — 실 API 는 persist)
    const ALL = [
      {
        requestId: 'prr-001', userId: 'user-001',
        usernameOrEmail: 'hana.lee@aura.logistics', displayName: 'Hana Lee',
        status: 'pending', requestedAt: '2026-05-19T01:20:00Z',
        completedAt: null, completedBy: null,
      },
      {
        requestId: 'prr-002', userId: 'user-005',
        usernameOrEmail: 'ji.park@aura.logistics', displayName: 'Ji Park',
        status: 'pending', requestedAt: '2026-05-18T22:05:00Z',
        completedAt: null, completedBy: null,
      },
    ];
    const items = params?.status
      ? ALL.filter((r) => r.status === params.status)
      : ALL;
    return Promise.resolve({ data: { items, totalCount: items.length }, message: null, receivedAt: Date.now() });
  }
  return http.get('/admin/users/password-reset-requests', params);
}

// ─── PATCH /admin/users/password-reset-requests/{request_id} (완료 마킹) ─
//   backend `admin.py:165` — status='completed' + completed_at/by, 404/409 가드.
//   §2.38 결정: ②C 자동 chain + 수동 안전망. body 없음(path param만).
export function completePasswordResetRequest(requestId) {
  if (USE_MOCK) {
    return Promise.resolve({
      data: { requestId, status: 'completed' }, message: null, receivedAt: Date.now(),
    });
  }
  return http.patch(`/admin/users/password-reset-requests/${encodeURIComponent(requestId)}`);
}

// ─── POST /admin/users ──────────────────────────────────
//   payload: { username, email, role, site_id, zone_ids? }
//   응답: { userId, username, temporaryPassword }
//
//   실 API는 2단계 호출 (backend §3.4):
//     1) POST /admin/users  — user 생성 + temp_password 응답
//     2) POST /admin/users/{user_id}/permissions { zone_ids } — zone 권한 부여
//   zone_ids 비어 있거나 super_admin/ai_monitor 면 2단계 호출 skip
export async function createUser(payload) {
  if (USE_MOCK) return fromMock(mockCreateUser(payload));

  const { zone_ids: zoneIds, ...userBody } = payload ?? {};
  const createRes = await http.post('/admin/users', userBody);
  const userId = createRes?.data?.user_id;
  if (Array.isArray(zoneIds) && zoneIds.length > 0 && userId) {
    try {
      await http.post(
        `/admin/users/${encodeURIComponent(userId)}/permissions`,
        { zone_ids: zoneIds },
      );
    } catch (err) {
      // user는 생성됐는데 권한 부여 실패 — log만 (사용자 결정)
      console.warn('[usersApi] permissions grant failed after user create', err);
    }
  }
  return createRes;
}

// ─── PATCH /admin/users/{user_id} ────────────────────────
//   body: { email?, is_active? }
export function updateUser(userId, payload) {
  if (USE_MOCK) return fromMock(mockUpdateUser(userId, payload));
  return http.patch(`/admin/users/${encodeURIComponent(userId)}`, payload);
}

// ─── POST /admin/users/{user_id}/permissions (zone 권한 부여) ─────
//   body: { zone_ids: [...] }
export function grantUserPermissions(userId, zoneIds) {
  if (USE_MOCK) return fromMock(mockGrantPermissions(userId, zoneIds));
  return http.post(`/admin/users/${encodeURIComponent(userId)}/permissions`, { zone_ids: zoneIds });
}

// ─── DELETE /admin/users/{user_id}/permissions/{zone_id} ─────
export function revokeUserPermission(userId, zoneId) {
  if (USE_MOCK) return fromMock(mockRevokePermission(userId, zoneId));
  return http.delete(`/admin/users/${encodeURIComponent(userId)}/permissions/${encodeURIComponent(zoneId)}`);
}

// ─── POST /admin/users/{user_id}/reset-password ─────────
//   backend §3.1 ⏳ 신설 요청 — mock으로 시작
export function resetUserPassword(userId) {
  if (USE_MOCK) return fromMock(mockResetPassword(userId));
  return http.post(`/admin/users/${encodeURIComponent(userId)}/reset-password`);
}
