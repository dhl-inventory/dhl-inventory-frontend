/**
 * Sidebar Menu Tree (role_based_ia §3)
 * ─────────────────────────────────────────────────────────────
 * 4 role별 사이드바 메뉴 트리. Sidebar.js가 이 데이터로 렌더.
 *
 * - type: 'item'  — 단일 라우트 링크
 * - type: 'group' — 부모 라벨 + children
 * - i18nKey: i18n/en.js의 nav.* 키
 * - path:    routes.js의 키와 1:1 매칭
 * - icon:    Material Symbols 키 (https://fonts.google.com/icons)
 * - subPaths: 부모 메뉴 active를 같이 켤 sub-라우트 (drill-down 시)
 *             ※ /alerts와 /alerts/settings는 형제이므로 subPaths 안 씀 — 단독 active 보장
 *
 * 09 Account Profile은 본 메뉴에 포함하지 않음 — 좌측 하단 user profile entry로 진입 (Phase 2.D)
 */

import { ROLE } from './roles.js';

export const MENU_BY_ROLE = Object.freeze({
  [ROLE.FIELD_MANAGER]: [
    { type: 'item',  i18nKey: 'nav.dashboard',        path: '/dashboard',       icon: 'dashboard' },
    { type: 'group', i18nKey: 'nav.inventory',        icon: 'inventory_2', children: [
      { i18nKey: 'nav.skuList',      path: '/inventory/skus',    subPaths: ['/inventory/sku-detail'] },
      { i18nKey: 'nav.zoneDetail',   path: '/zone',              subPaths: ['/zone/detail', '/zone/section'] },
    ]},
    { type: 'item',  i18nKey: 'nav.validity',         path: '/validity',        icon: 'event_busy' },
    { type: 'group', i18nKey: 'nav.alerts',           icon: 'notifications', children: [
      { i18nKey: 'nav.alertList',     path: '/alerts' },
      // nav.alertSettings 제거 (2026-05-20) — `/admin/capacity-settings` 는 BE 가
      //   `require_roles("super_admin","ops_manager")` 라 field_manager 403. 메뉴 사전 차단.
    ]},
  ],

  [ROLE.OPS_MANAGER]: [
    { type: 'item',  i18nKey: 'nav.dashboard',        path: '/dashboard',       icon: 'dashboard' },
    { type: 'group', i18nKey: 'nav.inventory',        icon: 'inventory_2', children: [
      { i18nKey: 'nav.skuList',      path: '/inventory/skus',    subPaths: ['/inventory/sku-detail'] },
      { i18nKey: 'nav.zoneDetail',   path: '/zone',              subPaths: ['/zone/detail', '/zone/section'] },
    ]},
    { type: 'item',  i18nKey: 'nav.validity',         path: '/validity',        icon: 'event_busy' },
    { type: 'item',  i18nKey: 'nav.operationalStats', path: '/operational-stats', icon: 'insights' },
    { type: 'group', i18nKey: 'nav.alerts',           icon: 'notifications', children: [
      { i18nKey: 'nav.alertList',     path: '/alerts' },
      { i18nKey: 'nav.alertSettings', path: '/alerts/settings' },
    ]},
    { type: 'item',  i18nKey: 'nav.users',            path: '/users',           icon: 'group' },
  ],

  // super_admin: 모든 페이지 노출 (2026-05-25). RBAC superuser 패턴 — 라우터/API
  // 가드 모두 super_admin bypass. dev/admin 계정이 전체 화면 접근.
  [ROLE.SUPER_ADMIN]: [
    { type: 'item',  i18nKey: 'nav.dashboard',        path: '/dashboard',       icon: 'dashboard' },
    { type: 'group', i18nKey: 'nav.inventory',        icon: 'inventory_2', children: [
      { i18nKey: 'nav.skuList',      path: '/inventory/skus',    subPaths: ['/inventory/sku-detail'] },
      { i18nKey: 'nav.zoneDetail',   path: '/zone',              subPaths: ['/zone/detail', '/zone/section'] },
    ]},
    { type: 'item',  i18nKey: 'nav.validity',         path: '/validity',        icon: 'event_busy' },
    { type: 'item',  i18nKey: 'nav.operationalStats', path: '/operational-stats', icon: 'insights' },
    { type: 'group', i18nKey: 'nav.alerts',           icon: 'notifications', children: [
      { i18nKey: 'nav.alertList',     path: '/alerts' },
      { i18nKey: 'nav.alertSettings', path: '/alerts/settings' },
    ]},
    { type: 'item',  i18nKey: 'nav.aiConsole',        path: '/ai-console',      icon: 'monitoring' },
    { type: 'item',  i18nKey: 'nav.users',            path: '/users',           icon: 'group' },
    { type: 'item',  i18nKey: 'nav.companies',        path: '/companies',       icon: 'business' },
    { type: 'item',  i18nKey: 'nav.sim',              path: '/sim',             icon: 'precision_manufacturing' },
  ],

  [ROLE.AI_MONITOR]: [
    { type: 'item',  i18nKey: 'nav.aiConsole',        path: '/ai-console',      icon: 'monitoring' },
  ],
});
