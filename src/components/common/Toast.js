/**
 * Toast — Phase 6 transient notification
 * ─────────────────────────────────────────────────────────────
 * 우측 상단 fixed 컨테이너에 토스트를 stacking 으로 표시한다.
 * P3 정책 (pending_design_decisions §2.43 후보):
 *   - `severity === 'critical'` alert만 popup으로 띄운다.
 *   - 나머지(warning/info)는 벨 뱃지 카운트만 증가 (toast 미발사)
 *   → 분기 책임은 호출자 (alertsStore subscribe). 본 모듈은 모든 severity를 받을 수 있음.
 *
 * API:
 *   mountToastContainer()           — main.js boot()에서 1회 호출 (body에 fixed div 마운트)
 *   showToast({ ... })              — 토스트 1개 추가
 *   dismissToast(id)                — 토스트 즉시 제거 (자동 dismiss 외 수동 케이스)
 *   unmountToastContainer()         — cleanup (테스트용)
 *
 * showToast options:
 *   title          string  필수 — 한 줄 제목 (alert.title 등)
 *   message        string  필수 — 본문 1~2줄
 *   severity       'critical' | 'warning' | 'info'  기본 'info'
 *   onClick        function?      — 토스트 클릭 시 실행 (예: AlertList 이동)
 *   autoDismissMs  number?        — 기본 5000ms. 0이면 수동 dismiss만
 *
 * 라이프사이클:
 *   - 자동 dismiss (autoDismissMs 후 fade-out 300ms → DOM 제거)
 *   - 수동 dismiss (X 버튼 또는 dismissToast(id))
 *   - 본문 클릭 (onClick + 즉시 dismiss)
 */

import { t } from '../../core/i18n/index.js';

const CONTAINER_ID = 'aura-toast-container';
const DEFAULT_DISMISS_MS = 5000;
const FADE_OUT_MS = 300;

let _container = null;
let _seq = 0;
const _dismissTimers = new Map();   // id → timeoutId

// ─── public API ──────────────────────────────────────────

export function mountToastContainer() {
  if (_container) return;
  _container = document.createElement('div');
  _container.id = CONTAINER_ID;
  _container.className = 'aura-toast-container';
  _container.setAttribute('role', 'region');
  _container.setAttribute('aria-label', 'Notifications');
  document.body.appendChild(_container);
}

export function unmountToastContainer() {
  if (!_container) return;
  for (const timer of _dismissTimers.values()) clearTimeout(timer);
  _dismissTimers.clear();
  _container.remove();
  _container = null;
}

export function showToast({
  title,
  message,
  severity = 'info',
  onClick,
  autoDismissMs = DEFAULT_DISMISS_MS,
} = {}) {
  if (!_container) mountToastContainer();

  _seq += 1;
  const id = `toast-${_seq}`;
  const el = document.createElement('div');
  el.id = id;
  el.className = `aura-toast aura-toast-${severity}`;
  el.setAttribute('role', severity === 'critical' ? 'alert' : 'status');
  el.innerHTML = `
    <span class="material-symbols-outlined aura-toast-icon">${iconFor(severity)}</span>
    <div class="aura-toast-body">
      <div class="aura-toast-title">${escapeHtml(title ?? '')}</div>
      <div class="aura-toast-message">${escapeHtml(message ?? '')}</div>
    </div>
    <button type="button" class="aura-toast-close"
            aria-label="${escapeHtml(t('toast.dismiss'))}"
            data-action="toast-dismiss">
      <span class="material-symbols-outlined">close</span>
    </button>
  `;

  // 본문 클릭 → onClick + dismiss
  el.addEventListener('click', (e) => {
    if (e.target.closest('[data-action="toast-dismiss"]')) {
      dismissToast(id);
      return;
    }
    if (typeof onClick === 'function') {
      try { onClick(); } catch (err) { console.error('[toast] onClick error:', err); }
    }
    dismissToast(id);
  });

  _container.appendChild(el);

  // fade-in (다음 프레임에 .is-visible 추가)
  requestAnimationFrame(() => el.classList.add('is-visible'));

  // 자동 dismiss
  if (autoDismissMs > 0) {
    const timer = setTimeout(() => dismissToast(id), autoDismissMs);
    _dismissTimers.set(id, timer);
  }

  return id;
}

export function dismissToast(id) {
  const el = _container?.querySelector(`#${id}`);
  if (!el) return;

  const timer = _dismissTimers.get(id);
  if (timer) {
    clearTimeout(timer);
    _dismissTimers.delete(id);
  }

  el.classList.remove('is-visible');
  el.classList.add('is-leaving');
  setTimeout(() => el.remove(), FADE_OUT_MS);
}

// ─── helpers ─────────────────────────────────────────────

function iconFor(severity) {
  if (severity === 'critical') return 'error';
  if (severity === 'warning')  return 'warning';
  return 'info';
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
