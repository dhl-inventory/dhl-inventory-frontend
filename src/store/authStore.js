/**
 * authStore — user / accessScope / token
 * ─────────────────────────────────────────────────────────────
 * Phase 7 — backend `/auth/login` + `/auth/me` 실 API 연결.
 * 여전히 dev 보조로 `?role=` URL 쿼리 mock 진입 지원 (hydrateFromUrl).
 *
 * 응답 schema (ADR-004, account_request §3.1 B안):
 *   POST /auth/login  → { accessToken, tokenType, expiresIn, isFirstLogin }
 *   GET  /auth/me     → { user: { userId, name, email, role },
 *                          accessScope: { siteId, zoneIds } }
 *
 * Frontend state schema (camelCase, http.js의 toCamel 통과):
 *   user        : { id, name, email, role }
 *   accessScope : { siteId, zoneIds, ...(MVP는 zone만, 추후 확장) }
 *   token       : JWT string
 *
 * 자세한 설계: docs/architecture/architecture_plan.md §5.8
 */

import { createStore } from '../core/createStore.js';
import { ROLE, isValidRole } from '../constants/roles.js';
import { http } from '../core/http.js';

const TOKEN_STORAGE_KEY = 'aura.auth.token';
const USE_MOCK = import.meta.env.VITE_USE_MOCK !== 'false';
const MOCK_TOKEN_PREFIX = 'mock-token-';

/**
 * Role별 mock accessScope (`?role=` 쿼리 진입 + mock login 시 사용 — dev 보조).
 * 실 로그인 흐름은 `/auth/me` 응답 사용.
 */
const MOCK_SCOPE_BY_ROLE = {
  [ROLE.FIELD_MANAGER]: { customerIds: ['C-1'], regionIds: ['R-1'], warehouseIds: ['W-1'], zoneIds: ['zone-A', 'zone-B'], siteId: 'site-001' },
  // Ops Manager: 현재 backend 운영 가정 (1 site = 1 warehouse). pending §2.26 의 multi-warehouse 는 Post-MVP.
  //   backend `1 site = 1 warehouse` 가정 (auth_service.py:113, inventory_service.py:153) 과 정합 위해
  //   warehouseIds = ['W-1'] 단일. TopBar dropdown 옵션 1개라 자동으로 chevron 비활성.
  //   향후 multi-warehouse 도입 시 backend ADR 갱신 + 본 mock 도 ['W-1', 'W-2'] 로 확장.
  [ROLE.OPS_MANAGER]:   { customerIds: ['C-1'], regionIds: ['R-1'], warehouseIds: ['W-1'], zoneIds: ['zone-A', 'zone-B', 'zone-C'], siteId: 'site-001' },
  [ROLE.SUPER_ADMIN]:   { customerIds: ['C-1', 'C-2', 'C-3'], regionIds: null, warehouseIds: null, zoneIds: null, siteId: 'site-001' },
  [ROLE.AI_MONITOR]:    { customerIds: ['C-1', 'C-2'], regionIds: null, warehouseIds: null, zoneIds: null, siteId: 'site-001' },
};

/**
 * Mock login 계정 (VITE_USE_MOCK !== 'false' 시 활성).
 * username / password 매칭 후 MOCK_SCOPE_BY_ROLE 적용. 실 backend 호출 없음.
 */
const MOCK_ACCOUNTS = {
  field: { password: 'Field1234!', role: ROLE.FIELD_MANAGER, name: 'Field Manager',     email: 'field@mock.aura' },
  ops:   { password: 'Ops1234!',   role: ROLE.OPS_MANAGER,   name: 'Operations Manager', email: 'ops@mock.aura'   },
  admin: { password: 'Admin1234!', role: ROLE.SUPER_ADMIN,   name: 'Super Admin',        email: 'admin@mock.aura' },
  ai:    { password: 'Ai1234!',    role: ROLE.AI_MONITOR,    name: 'AI Monitor',         email: 'ai@mock.aura'    },
};

const inner = createStore({
  user:        null,
  accessScope: null,
  token:       null,
});

function applyMeResponse(token, meData) {
  // /auth/me 응답을 frontend state schema에 매핑
  const u = meData?.user ?? {};
  inner.setState({
    token,
    user: {
      id:    u.userId,
      name:  u.name,
      email: u.email,
      role:  u.role,
    },
    accessScope: meData?.accessScope ?? null,
  });
}

/**
 * URL 쿼리 ?role=ops_manager 등으로 dev 시점 role mock.
 * 예: http://localhost:3000/?role=field_manager#/dashboard
 */
function hydrateFromUrl() {
  const params = new URLSearchParams(window.location.search);
  const role = params.get('role');
  if (!role || !isValidRole(role)) return;

  inner.setState({
    user:        { id: 'mock-1', name: `Mock ${role}`, email: `${role}@mock.aura`, role },
    accessScope: MOCK_SCOPE_BY_ROLE[role],
    token:       'mock-token-' + role,
  });
}

// Mock token에서 role 추출 — 'mock-token-field_manager' → 'field_manager'
function roleFromMockToken(token) {
  if (typeof token !== 'string' || !token.startsWith(MOCK_TOKEN_PREFIX)) return null;
  const role = token.slice(MOCK_TOKEN_PREFIX.length);
  return isValidRole(role) ? role : null;
}

// Mock account → state 주입
function applyMockLogin(username, account) {
  const token = MOCK_TOKEN_PREFIX + account.role;
  inner.setState({
    token,
    user: { id: `mock-${username}`, name: account.name, email: account.email, role: account.role },
    accessScope: MOCK_SCOPE_BY_ROLE[account.role],
  });
  try { localStorage.setItem(TOKEN_STORAGE_KEY, token); } catch {}
}

/**
 * localStorage 토큰 복구 — 새 탭/새로고침 시 호출.
 * Mock token이면 token에서 role 추출해 MOCK_SCOPE_BY_ROLE로 user 복원.
 * 실 token이면 `/auth/me` 호출해서 user/scope 복원. 401이면 토큰 제거.
 */
async function hydrateFromStorage() {
  let token = null;
  try {
    token = localStorage.getItem(TOKEN_STORAGE_KEY);
  } catch {
    return;
  }
  if (!token) return;
  if (inner.getState().token) return;   // 이미 hydrateFromUrl이 채웠으면 skip

  // Mock token 분기 — 네트워크 호출 없이 복원
  const mockRole = roleFromMockToken(token);
  if (mockRole) {
    inner.setState({
      token,
      user: { id: 'mock-restored', name: `Mock ${mockRole}`, email: `${mockRole}@mock.aura`, role: mockRole },
      accessScope: MOCK_SCOPE_BY_ROLE[mockRole],
    });
    return;
  }

  try {
    const res = await http.get('/auth/me');
    applyMeResponse(token, res.data);
  } catch (err) {
    // 토큰 무효 (401 등) → 정리
    console.warn('[authStore] hydrateFromStorage failed, clearing token', err?.status ?? err);
    try { localStorage.removeItem(TOKEN_STORAGE_KEY); } catch {}
  }
}

/**
 * Login — LoginPage submit 핸들러에서 await로 호출.
 *
 * Mock 모드 (VITE_USE_MOCK !== 'false'):
 *   MOCK_ACCOUNTS에서 username/password 매칭 → state 주입. 네트워크 X.
 *
 * 실 API 모드 (VITE_USE_MOCK=false):
 *   1) POST /auth/login → accessToken 받음 → localStorage 저장
 *   2) GET /auth/me     → user / accessScope 받음 → state 갱신
 *
 * 실패 시 throw — LoginPage가 에러 메시지 노출.
 */
async function login(username, password) {
  if (USE_MOCK) {
    const account = MOCK_ACCOUNTS[username];
    if (!account || account.password !== password) {
      const err = new Error('Email or password is incorrect.');
      err.status = 401;
      throw err;
    }
    applyMockLogin(username, account);
    return;
  }

  const loginRes = await http.post('/auth/login', { username, password });
  const token = loginRes?.data?.accessToken;
  if (!token) {
    throw new Error('서버 응답에 토큰이 없습니다.');
  }
  try {
    localStorage.setItem(TOKEN_STORAGE_KEY, token);
  } catch {
    // localStorage 접근 실패 — 다음 fetch에 Authorization이 안 붙음 (세션 한정)
  }

  const meRes = await http.get('/auth/me');
  applyMeResponse(token, meRes.data);
}

function logout() {
  inner.setState({ user: null, accessScope: null, token: null });
  try {
    localStorage.removeItem(TOKEN_STORAGE_KEY);
  } catch {
    // 무시
  }
}

/**
 * 00-2 Password Reset Request — 비로그인 사용자가 username 또는 email로 reset 큐 등록.
 *
 * Backend agreement: user_management_agreements §3.2 (`POST /auth/password-reset-requests`).
 * Request body: { username_or_email }
 * Response:     { requestId, submittedAt }
 *
 * Mock 모드: 250ms 지연 후 dummy request_id 반환 (PasswordResetModal UX 검증).
 * 실 API:    POST /auth/password-reset-requests 직접 호출.
 *
 * 실패 시 throw — PasswordResetModal이 에러 메시지 노출.
 */
async function requestPasswordReset(usernameOrEmail) {
  const value = (usernameOrEmail ?? '').trim();
  if (!value) {
    const err = new Error('Username or email is required.');
    err.status = 400;
    throw err;
  }
  if (USE_MOCK) {
    return new Promise((resolve) => {
      setTimeout(
        () => resolve({ data: { requestId: `mock-req-${Date.now()}`, submittedAt: new Date().toISOString() } }),
        250,
      );
    });
  }
  return http.post('/auth/password-reset-requests', { username_or_email: value });
}

export const authStore = {
  subscribe: inner.subscribe,
  getState:  inner.getState,
  hydrateFromUrl,
  hydrateFromStorage,
  login,
  logout,
  requestPasswordReset,
};
