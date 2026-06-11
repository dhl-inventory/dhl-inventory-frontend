/**
 * Users mock 응답 — 10 User Management 페이지군
 * ─────────────────────────────────────────────────────────────
 * Backend snake_case 그대로 mirror. Frontend api 어댑터(N1)에서 camelCase 변환.
 *
 * Schema 참조 (backend_user_management_request.md / admin_repo.py / admin.py):
 *  - GET /admin/users        → { items: [...] }
 *  - GET /admin/users/{id}/permissions → { user_id, zone_permissions: [{zone_id, zone_name}] }
 *  - GET /admin/users/{id}/reset-password-requests → { items: [{request_id, submitted_at, status}] } (옵션 C, ⏳ 신설 예정)
 *  - POST /admin/users       → { user_id, username, temporary_password }
 *  - PATCH /admin/users/{id} → null (성공만)
 *  - POST /admin/users/{id}/reset-password → { user_id, username, temporary_password } (⏳ 신설 예정)
 *
 * 정책:
 *  - super_admin / ai_monitor는 zone_permissions 비움 ([] — backend §4.5 정합)
 *  - mock SKU 패턴과 일관 — site-001 단일 site
 *  - role / status 다양화로 KPI 카드 시연 가능
 *  - hana.lee (user-001)에 pending reset request 1건 — wireframe `10-1_user_list_with_reset_request.png` 시연용
 */

// ─── envelope 헬퍼 ───────────────────────────────────────
const envelope = (data) => ({ success: true, data, message: null });

// ─── user 마스터 데이터 (11명, role / status 다양화) ─────
//   KPI 시연: Active 9 / Disabled 2 / Ops 3 / Field 6 (전체)
const USER_MASTER = [
  // ── super_admin (1) ──
  {
    user_id: 'user-admin', username: 'admin', email: 'admin@aura.logistics',
    role: 'super_admin', is_active: true,
    last_login_at: '2026-05-12T08:30:00Z',
    created_at:    '2025-12-01T00:00:00Z',
  },

  // ── ai_monitor (1) ──
  {
    user_id: 'user-ai-001', username: 'ai.monitor', email: 'ai@aura.logistics',
    role: 'ai_monitor', is_active: true,
    last_login_at: '2026-05-12T09:00:00Z',
    created_at:    '2025-12-15T00:00:00Z',
  },

  // ── ops_manager (3) ──
  {
    user_id: 'user-002', username: 'marcus.chen', email: 'marcus.chen@aura.logistics',
    role: 'ops_manager', is_active: true,
    last_login_at: '2026-05-12T08:00:00Z',
    created_at:    '2025-12-10T00:00:00Z',
  },
  {
    user_id: 'user-003', username: 'industrial.ops', email: 'industrial@aura.logistics',
    role: 'ops_manager', is_active: true,
    last_login_at: '2026-05-12T07:30:00Z',
    created_at:    '2025-12-12T00:00:00Z',
  },
  {
    user_id: 'user-004', username: 'emma.wang', email: 'emma.wang@aura.logistics',
    role: 'ops_manager', is_active: true,
    last_login_at: '2026-05-11T17:00:00Z',
    created_at:    '2026-01-15T00:00:00Z',
  },

  // ── field_manager active (4) ──
  {
    user_id: 'user-001', username: 'hana.lee', email: 'hana.lee@aura.logistics',
    role: 'field_manager', is_active: true,
    last_login_at: '2026-05-12T09:45:00Z',
    created_at:    '2026-03-05T00:00:00Z',
  },
  {
    user_id: 'user-005', username: 'ji.park', email: 'ji.park@aura.logistics',
    role: 'field_manager', is_active: true,
    last_login_at: '2026-05-12T06:30:00Z',
    created_at:    '2026-02-15T00:00:00Z',
  },
  {
    user_id: 'user-006', username: 'min.kim', email: 'min.kim@aura.logistics',
    role: 'field_manager', is_active: true,
    last_login_at: '2026-05-12T07:00:00Z',
    created_at:    '2026-04-01T00:00:00Z',
  },
  {
    user_id: 'user-007', username: 'sara.choi', email: 'sara.choi@aura.logistics',
    role: 'field_manager', is_active: true,
    last_login_at: '2026-05-11T15:30:00Z',
    created_at:    '2026-04-15T00:00:00Z',
  },

  // ── disabled (2, field_manager) ──
  {
    user_id: 'user-008', username: 'ravi.kumar', email: 'ravi.kumar@aura.logistics',
    role: 'field_manager', is_active: false,
    last_login_at: '2026-04-20T12:00:00Z',
    created_at:    '2025-11-30T00:00:00Z',
  },
  {
    user_id: 'user-009', username: 'tom.lee', email: 'tom.lee@aura.logistics',
    role: 'field_manager', is_active: false,
    last_login_at: '2026-03-15T10:00:00Z',
    created_at:    '2025-11-15T00:00:00Z',
  },
];

// ─── zone_permissions (user_id → 배열) ───────────────────
//   super_admin / ai_monitor는 비움 (backend §4.5)
const ZONE_PERMISSIONS = {
  'user-001': [{ zone_id: 'zone-A', zone_name: 'Zone A' }],
  'user-002': [
    { zone_id: 'zone-A', zone_name: 'Zone A' },
    { zone_id: 'zone-B', zone_name: 'Zone B' },
    { zone_id: 'zone-C', zone_name: 'Zone C' },
  ],
  'user-003': [
    { zone_id: 'zone-A', zone_name: 'Zone A' },
    { zone_id: 'zone-B', zone_name: 'Zone B' },
  ],
  'user-004': [
    { zone_id: 'zone-B', zone_name: 'Zone B' },
    { zone_id: 'zone-C', zone_name: 'Zone C' },
  ],
  'user-005': [{ zone_id: 'zone-B', zone_name: 'Zone B' }],
  'user-006': [{ zone_id: 'zone-A', zone_name: 'Zone A' }],
  'user-007': [{ zone_id: 'zone-C', zone_name: 'Zone C' }],
  'user-008': [{ zone_id: 'zone-A', zone_name: 'Zone A' }],   // disabled지만 권한은 남아 있음
  'user-009': [{ zone_id: 'zone-B', zone_name: 'Zone B' }],
  // super_admin / ai_monitor는 미포함 (빈 배열로 응답)
};

// ─── pending password reset requests (옵션 C — 사용자별 lazy load) ───
//   wireframe `10-1_user_list_with_reset_request.png` 시연용 — hana.lee 1건
const PENDING_RESET_REQUESTS = {
  'user-001': [
    {
      request_id: 'reset-001',
      submitted_at: '2026-05-12T07:00:00Z',
      status: 'pending',
    },
  ],
};

// ─── GET /admin/users ───────────────────────────────────
//   현재 backend schema: { items: [...] } — 페이지네이션 없음
//   query: 향후 search / role / status filter 추가 가능 (옵션)
export function mockUsers(params = {}) {
  let items = [...USER_MASTER];

  // search (username / email 부분 일치)
  if (params.search) {
    const q = String(params.search).toLowerCase();
    items = items.filter(
      (u) => u.username.toLowerCase().includes(q) || u.email.toLowerCase().includes(q),
    );
  }
  // role filter
  if (params.role && params.role !== 'all') {
    items = items.filter((u) => u.role === params.role);
  }
  // status filter ('active' | 'disabled' | 'all')
  if (params.status === 'active')   items = items.filter((u) => u.is_active);
  if (params.status === 'disabled') items = items.filter((u) => !u.is_active);

  return envelope({ items });
}

// ─── GET /admin/users/{user_id}/permissions ─────────────
export function mockUserPermissions(userId) {
  const user = USER_MASTER.find((u) => u.user_id === userId);
  if (!user) return { success: false, data: null, message: `User not found: ${userId}` };
  return envelope({
    user_id: userId,
    zone_permissions: ZONE_PERMISSIONS[userId] ?? [],
  });
}

// ─── GET /admin/users/{user_id}/reset-password-requests ─────
//   옵션 C — 사용자별 lazy load. backend 신설 요청 (§3.4 1번 항목)
export function mockUserResetRequests(userId) {
  const user = USER_MASTER.find((u) => u.user_id === userId);
  if (!user) return { success: false, data: null, message: `User not found: ${userId}` };
  return envelope({
    user_id: userId,
    items: PENDING_RESET_REQUESTS[userId] ?? [],
  });
}

// ─── POST /admin/users ──────────────────────────────────
//   payload: { username, email, role, site_id, zone_ids?: [] }
//   응답: { user_id, username, temporary_password }
export function mockCreateUser(payload) {
  const username = String(payload?.username ?? '').trim();
  if (!username) {
    return { success: false, data: null, message: 'username은 필수입니다.' };
  }
  if (USER_MASTER.some((u) => u.username === username)) {
    return { success: false, data: null, message: '이미 존재하는 사용자명입니다.' };
  }
  const userId = 'user-' + Math.random().toString(36).slice(2, 8);
  const tempPassword = randomTempPassword();
  const newUser = {
    user_id:       userId,
    username,
    email:         payload.email ?? '',
    role:          payload.role ?? 'field_manager',
    is_active:     true,
    last_login_at: null,
    created_at:    new Date().toISOString(),
  };
  USER_MASTER.push(newUser);
  if (Array.isArray(payload.zone_ids) && payload.zone_ids.length > 0) {
    ZONE_PERMISSIONS[userId] = payload.zone_ids.map((zid) => ({
      zone_id: zid,
      zone_name: zoneNameOf(zid),
    }));
  }
  return envelope({
    user_id:            userId,
    username,
    temporary_password: tempPassword,
  });
}

// ─── PATCH /admin/users/{user_id} ────────────────────────
//   body: { email?, is_active? }
export function mockUpdateUser(userId, payload = {}) {
  const user = USER_MASTER.find((u) => u.user_id === userId);
  if (!user) return { success: false, data: null, message: `User not found: ${userId}` };
  if (payload.email !== undefined)     user.email     = payload.email;
  if (payload.is_active !== undefined) user.is_active = !!payload.is_active;
  return envelope(null);
}

// ─── POST /admin/users/{user_id}/permissions (zone 권한 부여) ───
//   body: { zone_ids: [...] }
export function mockGrantPermissions(userId, zoneIds) {
  const user = USER_MASTER.find((u) => u.user_id === userId);
  if (!user) return { success: false, data: null, message: `User not found: ${userId}` };
  const existing = ZONE_PERMISSIONS[userId] ?? [];
  const existingIds = new Set(existing.map((p) => p.zone_id));
  const toAdd = (zoneIds ?? []).filter((zid) => !existingIds.has(zid));
  ZONE_PERMISSIONS[userId] = [
    ...existing,
    ...toAdd.map((zid) => ({ zone_id: zid, zone_name: zoneNameOf(zid) })),
  ];
  return envelope(null);
}

// ─── DELETE /admin/users/{user_id}/permissions/{zone_id} (zone 회수) ───
export function mockRevokePermission(userId, zoneId) {
  const user = USER_MASTER.find((u) => u.user_id === userId);
  if (!user) return { success: false, data: null, message: `User not found: ${userId}` };
  ZONE_PERMISSIONS[userId] = (ZONE_PERMISSIONS[userId] ?? [])
    .filter((p) => p.zone_id !== zoneId);
  return envelope(null);
}

// ─── POST /admin/users/{user_id}/reset-password (⏳ 신설 요청) ───
//   backend §3.1 즉시 요청. mock은 임시 비번 발급 시뮬레이션
export function mockResetPassword(userId) {
  const user = USER_MASTER.find((u) => u.user_id === userId);
  if (!user) return { success: false, data: null, message: `User not found: ${userId}` };
  // pending reset request가 있으면 'resolved'로 마킹 (옵션 C — pending §3.4-3번 항목)
  if (PENDING_RESET_REQUESTS[userId]) {
    PENDING_RESET_REQUESTS[userId] = PENDING_RESET_REQUESTS[userId].map((r) =>
      r.status === 'pending' ? { ...r, status: 'resolved' } : r,
    );
  }
  return envelope({
    user_id:            userId,
    username:           user.username,
    temporary_password: randomTempPassword(),
  });
}

// ─── helpers ────────────────────────────────────────────
function randomTempPassword() {
  // backend `secrets.token_urlsafe(8)` 유사 — 영숫자 + 기호 일부
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789!@#';
  let out = '';
  for (let i = 0; i < 10; i += 1) {
    out += chars[Math.floor(Math.random() * chars.length)];
  }
  return out;
}

function zoneNameOf(zoneId) {
  if (zoneId === 'zone-A') return 'Zone A';
  if (zoneId === 'zone-B') return 'Zone B';
  if (zoneId === 'zone-C') return 'Zone C';
  return zoneId;
}
