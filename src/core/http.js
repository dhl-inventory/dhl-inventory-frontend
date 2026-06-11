/**
 * HTTP — fetch 래퍼
 * ─────────────────────────────────────────────────────────────
 * 단일 진입점에서 baseURL / Authorization / Accept-Language /
 * 공통 envelope unwrap / 에러 처리 / 응답 시각 자체 기록(M1)을 처리한다.
 *
 * 자세한 패턴: docs/architecture/api_connection_plan.md §3.1 (N1), §3.8 (M1)
 *
 * 사용 예:
 *   const result = await http.get('/dashboard/capacity');
 *   // result = { data, message, receivedAt }   ← receivedAt: Date.now()
 *
 * Phase 7 실 API 전환:
 *   .env에 VITE_API_BASE_URL=https://your-domain.example.com/api/v1 설정.
 *   토큰은 authStore에서 가져옴 (현재는 import 미연결 → Phase 1.C에서 활성).
 */

import { toCamel } from './normalize.js';
import { getLang } from './i18n/index.js';
import { showPermissionNotice } from '../components/common/PermissionNotice.js';

const BASE = import.meta.env.VITE_API_BASE_URL ?? '';
const AUTH_TOKEN_KEY = 'aura.auth.token';

// ─── 글로벌 401/403 인터셉터 (#2, BK 2026-05-19) ─────────
//   순환 import 방지: authStore/router 를 직접 import 안 함 (authStore→http 의존).
//   main.js 가 setUnauthorizedHandler 로 핸들러 주입.
let _onUnauthorized = null;
let _unauthorizedFired = false;
export function setUnauthorizedHandler(fn) { _onUnauthorized = fn; }

class HttpError extends Error {
  constructor(status, body) {
    super(typeof body === 'string' ? body : (body?.message ?? `HTTP ${status}`));
    this.status = status;
    this.body = body;
  }
}

function buildHeaders(extra = {}) {
  const headers = {
    'Content-Type': 'application/json',
    'Accept-Language': getLang(),     // backend 응답 언어 분기 (en / ko)
    ...extra,
  };
  try {
    const token = localStorage.getItem(AUTH_TOKEN_KEY);
    if (token) headers.Authorization = `Bearer ${token}`;
  } catch {
    // localStorage 접근 실패 — 토큰 없이 진행
  }
  return headers;
}

function buildQuery(params) {
  if (!params) return '';
  const usp = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value === null || value === undefined || value === '') continue;
    if (Array.isArray(value)) {
      value.forEach((v) => usp.append(key, v));
    } else {
      usp.append(key, value);
    }
  }
  const qs = usp.toString();
  return qs ? `?${qs}` : '';
}

async function request(path, { method = 'GET', body, params, headers } = {}) {
  const url = `${BASE}${path}${buildQuery(params)}`;

  const res = await fetch(url, {
    method,
    headers: buildHeaders(headers),
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });

  // 응답 받은 시각을 자체 기록 (M1) — envelope meta 거부 합의 대응
  const receivedAt = Date.now();

  let payload = null;
  try {
    payload = await res.json();
  } catch {
    // body가 비었거나 JSON 아님 — payload null로 둠
  }

  if (!res.ok) {
    // #2 글로벌 인터셉터. /auth/* 제외 (로그인 실패 401 = 정상, redirect 루프 방지).
    const isAuthPath = path.startsWith('/auth');
    if (res.status === 401 && !isAuthPath && !_unauthorizedFired) {
      _unauthorizedFired = true;        // 동시 401 다발 → A4 이동 1회만
      _onUnauthorized?.();              // main.js: authStore.logout() + #/session-expired
    } else if (res.status === 403 && !isAuthPath) {
      showPermissionNotice();          // 하단중앙 회색 스낵바 (알림 Toast 와 분리)
    }
    throw new HttpError(res.status, payload);
  }

  _unauthorizedFired = false;          // 정상 응답 → 401 가드 재무장 (재로그인 후)

  // 공통 envelope: { success, data, message }
  // Backend 합의대로 envelope에 meta 없음 — receivedAt은 frontend가 박음
  return {
    data: toCamel(payload?.data ?? null),
    message: payload?.message ?? null,
    receivedAt,
  };
}

export const http = {
  get:    (path, params, headers)     => request(path, { method: 'GET',    params, headers }),
  post:   (path, body, params, headers) => request(path, { method: 'POST',   body, params, headers }),
  patch:  (path, body, params, headers) => request(path, { method: 'PATCH',  body, params, headers }),
  put:    (path, body, params, headers) => request(path, { method: 'PUT',    body, params, headers }),
  delete: (path, params, headers)     => request(path, { method: 'DELETE', params, headers }),
};

export { HttpError };
