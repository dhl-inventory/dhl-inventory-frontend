/**
 * AlertCenter — Phase 6 종형 벨 드롭다운 패널
 * ─────────────────────────────────────────────────────────────
 * TopBar의 종형 벨 클릭 시 펼쳐지는 패널. 최근 N개 미처리 alert + "View all" 링크.
 * 본격 alert 관리는 05 Alert List로 위임. 본 패널은 빠른 미리보기.
 *
 * API:
 *   mountAlertCenter()           — TopBar.mount 시 호출. body에 fixed div 마운트
 *   openAlertCenter()            — show
 *   closeAlertCenter()           — hide
 *   toggleAlertCenter()          — show/hide 토글 (종형 벨 클릭 핸들러)
 *   unmountAlertCenter()         — TopBar.unmount 시 호출
 *
 * 데이터 소스:
 *   alertsStore.summary.items[0..2]   — 최근 3개 (Step C-1에서 slice 추가)
 *   alertsStore.summary.unreadCount   — 미처리 카운트 (TopBar 뱃지에서도 사용)
 *
 * 닫기 조건:
 *   - 패널 외부 클릭 (TopBar 벨 자체 제외 — 토글이 처리)
 *   - "View all" 클릭 → AlertList 라우트 이동
 *   - 항목 클릭 → AlertList?focusId=X 이동
 *   - ESC 키
 *
 * Phase 6 상태:
 *   summary slice 미초기화 시 빈 패널 + "No notifications" 표시.
 *   C-1 단계에서 alertsStore.fetchSummary() 추가 후 데이터 채워짐.
 */

import { alertsStore } from '../../store/alertsStore.js';
import { appStore } from '../../store/appStore.js';
import { alertDisplay, getAlertDrillHref } from '../alerts/alertDisplay.js';
import { t, tf } from '../../core/i18n/index.js';

const PANEL_ID = 'aura-alert-center';
const PREVIEW_COUNT = 3;

let _panel = null;
let _isOpen = false;
let _unsubStore = null;
let _unsubApp = null;
let _docClickHandler = null;
let _keyHandler = null;
let _clickHandler = null;

// ─── public API ──────────────────────────────────────────

export function mountAlertCenter() {
  if (_panel) return;

  _panel = document.createElement('div');
  _panel.id = PANEL_ID;
  _panel.className = 'aura-alert-center';
  _panel.setAttribute('role', 'dialog');
  _panel.setAttribute('aria-label', 'Alert center');
  document.body.appendChild(_panel);

  _clickHandler = (e) => handleClick(e);
  _panel.addEventListener('click', _clickHandler);

  _unsubStore = alertsStore.subscribe(() => { if (_isOpen) render(); });
  _unsubApp   = appStore.subscribe(() => { if (_isOpen) render(); });

  render();   // 초기 1회 (hidden 상태)
}

export function unmountAlertCenter() {
  if (!_panel) return;
  closeAlertCenter();
  _unsubStore?.();
  _unsubApp?.();
  _unsubStore = _unsubApp = null;
  if (_clickHandler) _panel.removeEventListener('click', _clickHandler);
  _clickHandler = null;
  _panel.remove();
  _panel = null;
}

export function openAlertCenter() {
  if (!_panel || _isOpen) return;
  _isOpen = true;
  _panel.classList.add('is-open');
  render();

  // outside click + ESC 키로 닫기
  _docClickHandler = (e) => {
    if (!_panel?.contains(e.target) && !e.target.closest('.topbar-bell')) {
      closeAlertCenter();
    }
  };
  _keyHandler = (e) => { if (e.key === 'Escape') closeAlertCenter(); };

  // mount 직후 자기 자신 click이 outside로 인식되는 것 방지 — 한 tick 늦춰서 바인딩
  setTimeout(() => {
    if (_isOpen) {
      document.addEventListener('click', _docClickHandler);
      document.addEventListener('keydown', _keyHandler);
    }
  }, 0);
}

export function closeAlertCenter() {
  if (!_panel || !_isOpen) return;
  _isOpen = false;
  _panel.classList.remove('is-open');
  if (_docClickHandler) document.removeEventListener('click', _docClickHandler);
  if (_keyHandler) document.removeEventListener('keydown', _keyHandler);
  _docClickHandler = _keyHandler = null;
}

export function toggleAlertCenter() {
  if (_isOpen) closeAlertCenter();
  else openAlertCenter();
}

// ─── render ──────────────────────────────────────────────

function render() {
  if (!_panel) return;
  const state = alertsStore.getState();
  const summary = state.summary ?? { items: [], unreadCount: 0 };
  const items = (summary.items ?? []).slice(0, PREVIEW_COUNT);

  _panel.innerHTML = `
    <div class="aura-alert-center-header">
      <h3 class="aura-alert-center-title">${escapeHtml(t('alertCenter.title'))}</h3>
      <span class="aura-alert-center-count">
        ${summary.unreadCount > 0
          ? escapeHtml(tf('alertCenter.unreadCount', { n: summary.unreadCount }))
          : ''}
      </span>
    </div>
    ${items.length === 0
      ? `<div class="aura-alert-center-empty">${escapeHtml(t('alertCenter.empty'))}</div>`
      : `<ul class="aura-alert-center-list">${items.map(renderItem).join('')}</ul>`}
    <div class="aura-alert-center-footer">
      <button type="button" class="aura-alert-center-view-all" data-action="view-all">
        ${escapeHtml(t('alertCenter.viewAll'))}
      </button>
    </div>
  `;
}

function renderItem(alert) {
  const severity = alert.severity ?? 'info';
  const icon = severity === 'critical' ? 'error'
             : severity === 'warning'  ? 'warning'
             : 'info';
  // #8 / N1-b: backend·mock title/message 무시 → alertType+target i18n 재구성 (List/Detail/Toast 와 동일 경로)
  const disp = alertDisplay(alert);
  return `
    <li class="aura-alert-center-item aura-alert-center-item-${severity}"
        data-action="open-alert"
        data-alert-id="${escapeHtml(alert.alertId ?? '')}">
      <span class="material-symbols-outlined aura-alert-center-item-icon">${icon}</span>
      <div class="aura-alert-center-item-body">
        <div class="aura-alert-center-item-title">${escapeHtml(disp.title || alert.alertType || '')}</div>
        <div class="aura-alert-center-item-message">${escapeHtml(disp.message ?? '')}</div>
      </div>
      <span class="aura-alert-center-item-time">${escapeHtml(formatRelative(alert.createdAt))}</span>
    </li>
  `;
}

// ─── handlers ────────────────────────────────────────────

function handleClick(e) {
  const viewAll = e.target.closest('[data-action="view-all"]');
  if (viewAll) {
    closeAlertCenter();
    window.location.hash = '#/alerts';
    return;
  }
  const item = e.target.closest('[data-action="open-alert"]');
  if (item) {
    const alertId = item.dataset.alertId;
    // alert_type 별 drill 대상으로 직행 (stock→SKU, expiry/fefo→Validity, abnormal→Section, 그 외→AlertList)
    const alert = alertsStore.getState().summary?.items?.find((a) => a.alertId === alertId);
    closeAlertCenter();
    window.location.hash = alert
      ? getAlertDrillHref(alert)
      : (alertId ? `#/alerts?focusId=${encodeURIComponent(alertId)}` : '#/alerts');
    return;
  }
}

// ─── helpers ─────────────────────────────────────────────

function formatRelative(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  const diffSec = Math.max(0, (Date.now() - d.getTime()) / 1000);
  if (diffSec < 60)   return tf('alertCenter.time.sec',  { n: Math.floor(diffSec) });
  if (diffSec < 3600) return tf('alertCenter.time.min',  { n: Math.floor(diffSec / 60) });
  if (diffSec < 86400) return tf('alertCenter.time.hour', { n: Math.floor(diffSec / 3600) });
  return tf('alertCenter.time.day', { n: Math.floor(diffSec / 86400) });
}

function escapeHtml(s) {
  if (s == null) return '';
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}
