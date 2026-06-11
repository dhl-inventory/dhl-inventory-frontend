/**
 * TopBar — DHL 노란 헤더 (Phase 2.C)
 * ─────────────────────────────────────────────────────────────
 * 와이어프레임 정합:
 *   좌측: DHL > Singapore > Warehouse 1 ▾ > Zone A ▾  (레벨별 드롭다운)
 *   우측: 🌐 EN  /  🌙
 *
 * Scope 선택 동작:
 *  - accessScope.warehouseIds.length > 1 → Warehouse 위치에 chevron + 드롭다운
 *  - accessScope.zoneIds.length > 1      → Zone 위치에 chevron + 드롭다운
 *  - 옵션 1개 또는 null이면 chevron 없음 (단순 텍스트)
 *  - 옵션 클릭 시 모듈 local state(currentSelection) 갱신 + 화면 즉시 갱신
 *
 * 모듈 local state는 Phase 3+에서 scopeStore로 승격 예정.
 */

import { authStore } from '../../../store/authStore.js';
import { appStore } from '../../../store/appStore.js';
import { alertsStore } from '../../../store/alertsStore.js';
import { scopeStore } from '../../../store/scopeStore.js';
import { routes } from '../../../constants/routes.js';
import {
  nameOfCustomer,
  nameOfRegion,
  nameOfWarehouse,
  nameOfZone,
} from '../../../mocks/scopeMock.js';
import {
  mountAlertCenter,
  toggleAlertCenter,
  unmountAlertCenter,
} from '../AlertCenter.js';

const TOPBAR_ID = 'aura-topbar';

let unsubAuth = null;
let unsubApp = null;
let unsubAlerts = null;
let unsubScope = null;
let clickHandler = null;
let docClickHandler = null;

// ─── 모듈 local state ────────────────────────────────────
// currentSelection의 각 레벨 값:
//   number  — 옵션 인덱스
//   null    — "All" 선택 (hasMultiple 레벨에서 사용 가능)
let currentSelection = { customer: 0, region: 0, warehouse: 0, zone: 0 };
let openLevel = null;     // 'customer' | 'region' | 'warehouse' | 'zone' | null
let lastRole = null;

const NAME_FN = {
  customer:  nameOfCustomer,
  region:    nameOfRegion,
  warehouse: nameOfWarehouse,
  zone:      nameOfZone,
};

const ALL_LABEL = {
  customer:  'All companies',
  region:    'All regions',
  warehouse: 'All warehouses',
  zone:      'All zones',
};

function pushLevel(levels, key, ids) {
  // null (전체 권한)은 breadcrumb에 표시하지 않음 — 회사만 보여주면 사용자가 "전체"로 이해
  // ['C-1'] 처럼 명시적 옵션이 있어야만 breadcrumb 박힘
  if (Array.isArray(ids) && ids.length > 0) {
    levels.push({ key, options: ids, hasMultiple: ids.length > 1 });
  }
}

// 현재 hash path → routes 메타 → 허용 scope levels (없으면 모두 허용)
function getAllowedScopeLevels() {
  const raw = window.location.hash.replace(/^#\/?/, '') || 'login';
  const [pathRaw] = raw.split('?');
  const path = '/' + pathRaw.replace(/^\/+/, '');
  const route = routes[path];
  return route?.scopeLevels ?? null;   // null = 모두 허용
}

// ─── breadcrumb 데이터 ───────────────────────────────────
function buildBreadcrumbLevels(accessScope) {
  if (!accessScope) return [];

  // Backend `/auth/me` 실 응답은 `{ site_id, zone_ids }`만 반환 (pending §2.26).
  //   customer/region/warehouse 단계는 backend 미합의 — frontend가 mock 매핑으로
  //   가짜 라벨을 표시하면 사용자가 mock 데이터를 실 데이터로 오인.
  //   → customerIds 부재(실 API 모드 추정) 시 site_id 단일 라벨로 단순화.
  //   → mock 모드 (MOCK_SCOPE_BY_ROLE이 customerIds 포함)에서는 기존 4단계 유지.
  //   backend §2.5 회신(`/auth/me`에 customer/region/warehouse 추가) 받으면
  //   본 분기 제거하고 4단계 정식 표시로 복귀.
  if (accessScope.customerIds == null) {
    return [{
      key:         'site',
      options:     null,
      hasMultiple: false,
      label:       accessScope.siteId ? `Site ${accessScope.siteId}` : 'Site',
    }];
  }

  const allowed = getAllowedScopeLevels();
  const levels = [];
  const tryPush = (key, ids) => {
    if (allowed && !allowed.includes(key)) return;
    pushLevel(levels, key, ids);
  };
  tryPush('customer',  accessScope.customerIds);
  tryPush('region',    accessScope.regionIds);
  tryPush('warehouse', accessScope.warehouseIds);
  tryPush('zone',      accessScope.zoneIds);
  return levels;
}

// zone 단일 진실: scopeStore.zoneId. 다른 레벨은 currentSelection (MVP 미사용).
//   zone 의 selected idx 는 scopeStore.zoneId 를 accessScope.zoneIds 에서 찾아 derive.
function getSelectedIdx(level) {
  if (level.key === 'zone') {
    const zoneId = scopeStore.getState().zoneId;
    if (!zoneId) return null;
    const idx = level.options.indexOf(zoneId);
    return idx >= 0 ? idx : null;
  }
  return currentSelection[level.key];
}

function getDisplayLabel(level) {
  if (level.options === null) return level.label || 'All';
  if (level.options.length === 0) return '—';
  const idx = getSelectedIdx(level);
  // null = "All" 선택
  if (idx === null || idx === undefined) {
    return ALL_LABEL[level.key] || 'All';
  }
  const safe = Math.min(idx, level.options.length - 1);
  const id = level.options[safe];
  const fn = NAME_FN[level.key];
  return fn ? fn(id) : id;
}

// ─── 렌더 ────────────────────────────────────────────────
function renderDropdown(level) {
  if (!level.hasMultiple || openLevel !== level.key) return '';
  const selectedIdx = getSelectedIdx(level);
  const isAllSelected = selectedIdx === null || selectedIdx === undefined;
  return `
    <div class="topbar-bc-dropdown" role="listbox">
      <button type="button"
              class="topbar-bc-option topbar-bc-option-all ${isAllSelected ? 'is-selected' : ''}"
              data-action="select-scope"
              data-level="${level.key}"
              data-index="all"
              role="option">
        ${ALL_LABEL[level.key] || 'All'}
      </button>
      <div class="topbar-bc-divider"></div>
      ${level.options.map((id, i) => `
        <button type="button"
                class="topbar-bc-option ${i === selectedIdx ? 'is-selected' : ''}"
                data-action="select-scope"
                data-level="${level.key}"
                data-index="${i}"
                role="option">
          ${NAME_FN[level.key](id)}
        </button>
      `).join('')}
    </div>
  `;
}

function renderLevel(level, isLast) {
  const label = getDisplayLabel(level);
  const isOpen = openLevel === level.key;
  const clickable = level.hasMultiple;

  return `
    <div class="topbar-bc-level ${clickable ? 'is-clickable' : ''} ${isOpen ? 'is-open' : ''}">
      <button type="button"
              class="topbar-bc-button"
              ${clickable ? `data-action="toggle-scope" data-level="${level.key}"` : 'disabled'}>
        <span class="topbar-bc-name">${label}</span>
        ${clickable ? '<span class="material-symbols-outlined topbar-bc-chev">expand_more</span>' : ''}
      </button>
      ${renderDropdown(level)}
    </div>
    ${!isLast ? '<span class="material-symbols-outlined topbar-bc-sep">chevron_right</span>' : ''}
  `;
}

function renderBreadcrumb(accessScope) {
  const levels = buildBreadcrumbLevels(accessScope);
  if (levels.length === 0) {
    return '<span class="topbar-breadcrumb-empty">All scopes</span>';
  }
  return levels.map((level, i) => renderLevel(level, i === levels.length - 1)).join('');
}

function render() {
  const topbar = document.getElementById(TOPBAR_ID);
  if (!topbar) return;

  const { accessScope, user } = authStore.getState();
  const { lang, theme } = appStore.getState();
  const themeIcon  = theme === 'dark' ? 'light_mode' : 'dark_mode';
  const themeTitle = theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode';

  // role 변경 시 selection / open 상태 reset
  if (user?.role !== lastRole) {
    lastRole = user?.role;
    currentSelection = { customer: 0, region: 0, warehouse: 0, zone: 0 };
    scopeStore.reset();   // zone 단일 진실 reset
    openLevel = null;
  }

  // Phase 6: site-wide unread alert count — alertsStore.summary.unreadCount.
  //   summary slice 미초기화 상태에서는 0. fetchSummary 호출은 alertsStore가 책임.
  const unreadCount = alertsStore.getState().summary?.unreadCount ?? 0;

  topbar.innerHTML = `
    <div class="topbar-left">
      <div class="topbar-breadcrumb">${renderBreadcrumb(accessScope)}</div>
    </div>
    <div class="topbar-right">
      <button type="button"
              class="topbar-util topbar-util-icon topbar-bell ${unreadCount > 0 ? 'has-unread' : ''}"
              data-action="toggle-alert-center"
              title="Alerts"
              aria-label="Alerts">
        <span class="material-symbols-outlined">notifications</span>
        ${unreadCount > 0 ? `<span class="topbar-bell-badge">${unreadCount > 99 ? '99+' : unreadCount}</span>` : ''}
      </button>
      <button type="button" class="topbar-util" data-action="toggle-lang" title="Toggle language">
        <span class="material-symbols-outlined">language</span>
        <span class="topbar-util-text">${lang.toUpperCase()}</span>
      </button>
      <button type="button" class="topbar-util topbar-util-icon" data-action="toggle-theme" title="${themeTitle}" aria-label="${themeTitle}">
        <span class="material-symbols-outlined">${themeIcon}</span>
      </button>
      <button type="button" class="topbar-util topbar-util-icon" data-action="sign-out" title="Sign out" aria-label="Sign out">
        <span class="material-symbols-outlined">logout</span>
      </button>
    </div>
  `;

  if (clickHandler) topbar.removeEventListener('click', clickHandler);
  clickHandler = (e) => {
    const target = e.target.closest('[data-action]');
    if (!target) return;
    e.stopPropagation();   // outside click handler에 누수 방지
    const action = target.dataset.action;

    if (action === 'toggle-scope') {
      const level = target.dataset.level;
      openLevel = openLevel === level ? null : level;
      render();
      return;
    }
    if (action === 'select-scope') {
      const level = target.dataset.level;
      const indexAttr = target.dataset.index;
      if (!level) return;
      // zone 은 scopeStore + URL 양쪽 동기화. 다른 레벨은 currentSelection (MVP 미사용 fallback).
      if (level === 'zone') {
        let nextZoneId = null;
        if (indexAttr !== 'all') {
          const idx = parseInt(indexAttr, 10);
          const zoneIds = authStore.getState().accessScope?.zoneIds ?? [];
          nextZoneId = zoneIds[idx] ?? null;
        }
        scopeStore.setZone(nextZoneId);
        pushZoneToURL(nextZoneId);   // URL 도 갱신 → 다른 페이지가 URL parse 시 정합
      } else {
        currentSelection[level] = indexAttr === 'all' ? null : parseInt(indexAttr, 10);
        // 계층 reset: warehouse / region / customer 변경 시 하위 zone 은 "All zones" 로 reset
        //   (선택 zone 이 다른 warehouse 소속일 수 있어 자동 reset 이 자연스러움)
        if (level === 'customer' || level === 'region' || level === 'warehouse') {
          scopeStore.setZone(null);
          pushZoneToURL(null);
        }
      }
      openLevel = null;
      render();
      return;
    }
    if (action === 'toggle-lang') {
      const next = appStore.getState().lang === 'en' ? 'ko' : 'en';
      appStore.setLang(next);
      return;
    }
    if (action === 'toggle-theme') {
      const next = appStore.getState().theme === 'dark' ? 'light' : 'dark';
      appStore.setTheme(next);
      // appStore.subscribe 로 render() 자동 재호출 → 아이콘/타이틀 갱신
      return;
    }
    if (action === 'sign-out') {
      authStore.logout();
      window.location.hash = '#/login';
      return;
    }
    if (action === 'toggle-alert-center') {
      toggleAlertCenter();
      return;
    }
  };
  topbar.addEventListener('click', clickHandler);
}

// ─── URL ↔ scopeStore 동기화 (L3-3) ───────────────────────
// URL 패턴별 zone 추출 위치:
//   #/zone/detail?id=zone-A          → param 'id'
//   #/zone/section?zone=zone-A&id=1  → param 'zone'
//   #/alerts?...&zone_id=zone-A       → param 'zone_id' (백엔드 필터 규약, backend_alerts_request.md §3.1)
//   그 외 (SkuList 등)                → param 'zone' (TopBar dropdown 으로 push)
function getZoneFromURL() {
  const hash = window.location.hash;
  const [path, queryStr] = hash.split('?');
  if (!queryStr) return null;
  const params = new URLSearchParams(queryStr);
  const candidate = path.includes('/zone/detail')
    ? params.get('id')
    : (params.get('zone') || params.get('zone_id'));
  return candidate && /^zone-/.test(candidate) ? candidate : null;
}

// hashchange 또는 mount 시 호출 — URL → scopeStore 단방향 동기화
function syncScopeFromURL() {
  scopeStore.setZone(getZoneFromURL());
}

// TopBar dropdown 으로 zone 변경 시 호출 — scopeStore → URL 단방향 push
// 현재 URL 의 query 에 zone=... 만 갱신 (path 유지). 같은 값이면 no-op (무한 루프 방지).
function pushZoneToURL(zoneId) {
  const hash = window.location.hash;
  const [path, queryStr] = hash.split('?');
  const params = new URLSearchParams(queryStr || '');
  // /zone/detail 경로는 ?id= 가 zone 의미라 그쪽을 갱신
  const zoneKey = path.includes('/zone/detail') ? 'id' : 'zone';
  if (zoneId) params.set(zoneKey, zoneId);
  else params.delete(zoneKey);
  const newQuery = params.toString();
  const newHash = newQuery ? `${path}?${newQuery}` : path;
  if (newHash !== hash) window.location.hash = newHash;
}

// ─── outside click → 드롭다운 닫기 ───────────────────────
function onDocClick(e) {
  if (openLevel === null) return;
  const topbar = document.getElementById(TOPBAR_ID);
  if (!topbar || topbar.contains(e.target)) return;
  openLevel = null;
  render();
}

// hashchange handler — URL 변경 시 scopeStore 동기화 + 화면 갱신
function onHashChange() {
  syncScopeFromURL();   // URL → scopeStore (페이지 이동 시 자동 갱신)
  render();             // accessScope route 분기 등 갱신
}

export function mountTopBar() {
  syncScopeFromURL();   // 페이지 새로고침 / 첫 진입 시 URL → scopeStore 1회 초기화
  render();
  unsubAuth?.();
  unsubApp?.();
  unsubAlerts?.();
  unsubScope?.();
  unsubAuth   = authStore.subscribe(render);
  // lang 변경 시 TopBar render + 종형 벨 dropdown(alertsStore.summary) 새 Accept-Language 로 재요청
  unsubApp    = appStore.subscribe(() => { render(); alertsStore.fetchSummary(); });
  unsubAlerts = alertsStore.subscribe(render);   // unread 뱃지 카운트 동기화
  unsubScope  = scopeStore.subscribe(render);    // zone 선택 변경 시 breadcrumb 갱신

  mountAlertCenter();   // body에 dropdown 패널 1회 마운트 (열기 전엔 hidden)

  if (docClickHandler) document.removeEventListener('click', docClickHandler);
  docClickHandler = onDocClick;
  document.addEventListener('click', docClickHandler);

  // 라우트 변경 시 URL → scopeStore 동기화 + scopeLevels 분기 갱신
  window.addEventListener('hashchange', onHashChange);
}

export function unmountTopBar() {
  unsubAuth?.();
  unsubApp?.();
  unsubAlerts?.();
  unsubScope?.();
  unsubAuth = unsubApp = unsubAlerts = unsubScope = null;
  unmountAlertCenter();
  if (docClickHandler) document.removeEventListener('click', docClickHandler);
  docClickHandler = null;
  window.removeEventListener('hashchange', onHashChange);
}
