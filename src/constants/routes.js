/**
 * Routes — v2 페이지 카탈로그 (22 라우트)
 * ─────────────────────────────────────────────────────────────
 * docs/role_based_ia.md §3·§4 IA와 1:1 매핑.
 * 자세한 설계: docs/architecture/architecture_plan.md §5.7
 *
 * - 동적 import로 lazy load (정적 import 금지)
 * - requiresRoles로 RBAC 가드 ('*' = 4 role 공통)
 * - requiresScope는 Post-MVP plug-in 자리 (MVP 미검사 → null)
 * - path 파라미터는 query string 방식 (#/users/detail?id=...)
 */

import { ROLE } from './roles.js';

const FIELD_OPS = [ROLE.FIELD_MANAGER, ROLE.OPS_MANAGER];
const OPS_SUPER = [ROLE.OPS_MANAGER, ROLE.SUPER_ADMIN];

export const routes = {
  // ─── 00 Auth ──────────────────────────────────────────
  '/login': {
    component: () => import('../components/auth/LoginPage.js'),
    requiresAuth: false, requiresRoles: null, requiresScope: null, layout: 'blank',
  },
  // 00-2 Password Reset Request는 LoginPage 의 PasswordResetModal로 처리합니다.
  //   wireframe 00-2_password_reset_*.png + layout outline §4 정합 (2026-05-13 결정).
  //   별도 라우트 없음.

  // ─── 01 Dashboard ─────────────────────────────────────
  '/dashboard': {
    component: () => import('../components/dashboard/DashboardPage.js'),
    requiresAuth: true, requiresRoles: FIELD_OPS, requiresScope: null, layout: 'app',
  },

  // ─── 02 Inventory - SKU ───────────────────────────────
  '/inventory/skus': {
    component: () => import('../components/inventory/SkuListPage.js'),
    requiresAuth: true, requiresRoles: FIELD_OPS, requiresScope: null, layout: 'app',
  },
  // 사용 형태: #/inventory/sku-detail?id=SKU-001
  '/inventory/sku-detail': {
    component: () => import('../components/inventory/SkuDetailPage.js'),
    requiresAuth: true, requiresRoles: FIELD_OPS, requiresScope: null, layout: 'app',
  },

  // ─── 03 Zone / Section ────────────────────────────────
  '/zone': {
    component: () => import('../components/zone/ZoneOverviewPage.js'),
    requiresAuth: true, requiresRoles: FIELD_OPS, requiresScope: null, layout: 'app',
  },
  // #/zone/detail?id=zone-A
  '/zone/detail': {
    component: () => import('../components/zone/ZoneDetailPage.js'),
    requiresAuth: true, requiresRoles: FIELD_OPS, requiresScope: null, layout: 'app',
  },
  // #/zone/section?zone=zone-A&id=sec-A1
  '/zone/section': {
    component: () => import('../components/zone/SectionDetailPage.js'),
    requiresAuth: true, requiresRoles: FIELD_OPS, requiresScope: null, layout: 'app',
  },

  // ─── 04 Validity / 05 Alerts / 06 Alert Settings ──────
  '/validity': {
    component: () => import('../components/validity/ValidityListPage.js'),
    requiresAuth: true, requiresRoles: FIELD_OPS, requiresScope: null, layout: 'app',
  },
  '/alerts': {
    component: () => import('../components/alerts/AlertListPage.js'),
    requiresAuth: true, requiresRoles: FIELD_OPS, requiresScope: null, layout: 'app',
  },
  '/alerts/settings': {
    component: () => import('../components/alertSettings/AlertSettingsPage.js'),
    requiresAuth: true, requiresRoles: FIELD_OPS, requiresScope: null, layout: 'app',
  },

  // ─── 07 Operational Stats — ops_manager 전용 ────────
  '/operational-stats': {
    component: () => import('../components/operationalStats/OperationalStatsPage.js'),
    requiresAuth: true, requiresRoles: [ROLE.OPS_MANAGER], requiresScope: null, layout: 'app',
  },
  // 07-R 운영 리포트 (P1+P2 결정형 + T3 LLM gated 진입점) — 현재 stub
  // #/operational-stats/report?period=today|7d|30d|month
  '/operational-stats/report': {
    component: () => import('../components/operationalStats/OperationalStatsReportPage.js'),
    requiresAuth: true, requiresRoles: [ROLE.OPS_MANAGER], requiresScope: null, layout: 'app',
  },

  // ─── 08 AI Monitoring Console — ai_monitor 전용 ─────
  '/ai-console': {
    component: () => import('../components/aiMonitoring/AiMonitoringEntry.js'),
    requiresAuth: true, requiresRoles: [ROLE.AI_MONITOR], requiresScope: null, layout: 'app',
  },

  // ─── 09 Account Profile — 4 role 공통 ───────────────
  '/account': {
    component: () => import('../components/account/AccountProfilePage.js'),
    requiresAuth: true, requiresRoles: ['*'], requiresScope: null, layout: 'app',
    scopeLevels: [],   // §2.37 — 개인 프로필은 scope 무의미 → breadcrumb 숨김(All scopes)
  },

  // ─── 10 User Management — ops_manager + super_admin ──
  // scopeLevels: ['customer'] — 회사 내 직원 단위라 TopBar에 customer만 표시
  '/users': {
    component: () => import('../components/users/UserListPage.js'),
    requiresAuth: true, requiresRoles: OPS_SUPER, requiresScope: null, layout: 'app',
    scopeLevels: ['customer'],
  },
  // 10-2 Invite User · 10-3 User Detail · 10-4 Permission Assignment는 모두 UserListPage 안에서
  //   modal + 우측 panel로 처리합니다. 별도 라우트 없음 (2026-05-13 결정).
  //     · 10-2: AddUserModal
  //     · 10-3: UserListPage row select → 우측 panel
  //     · 10-4: EditZoneAccessModal (zone-only; warehouse-level / ai_monitor toggle은 backend 합의 후 modal 안에서 확장)
  //   layout outline §15 + 10-1_user_list_*.png · 10-2_add_user_modal_*.png 정합.

  // ─── 11 Company Management — super_admin 전용 ──────
  // bk_agent §74 결정 B: 11-1/11-2/11-3 을 단일 페이지(헤더 카드 + Scope/Operators 탭)로
  //   통합. 구 /companies/scopes · /companies/operators 라우트는 제거(단일 페이지 흡수).
  // scopeLevels: ['customer'] — 회사 자체를 관리하는 페이지
  '/companies': {
    component: () => import('../components/companies/CompanyListPage.js'),
    requiresAuth: true, requiresRoles: [ROLE.SUPER_ADMIN], requiresScope: null, layout: 'app',
    scopeLevels: ['customer'],
  },

  // ─── 12 Sim — 플로터 디지털 트윈 (super_admin / ops_manager 전용) ────
  // docs/plan/plotter_digital_twin.md · action_recognition/sim/spec.json 정합
  '/sim': {
    component: () => import('../components/sim/SimPage.js'),
    requiresAuth: true, requiresRoles: OPS_SUPER, requiresScope: null, layout: 'app',
  },

  // ─── 시스템 ────────────────────────────────────────
  '/403': {
    component: () => import('../components/common/ForbiddenPage.js'),
    requiresAuth: false, requiresRoles: null, requiresScope: null, layout: 'blank',
  },
  '/404': {
    component: () => import('../components/common/NotFoundPage.js'),
    requiresAuth: false, requiresRoles: null, requiresScope: null, layout: 'blank',
  },
  '/session-expired': {
    component: () => import('../components/common/SessionExpiredPage.js'),
    requiresAuth: false, requiresRoles: null, requiresScope: null, layout: 'blank',
  },
};
