/**
 * PermissionNotice — 403(권한 없음) edge 안전망 회색 스낵바.
 * ─────────────────────────────────────────────────────────────
 * #2 결정 ②-2 (BK 2026-05-19):
 *  - 본질적 차단은 역할별 버튼 사전 비활성/숨김(#1). 본 모듈은 그래도 새는
 *    dr=직접호출·stale·race edge 의 *얇은* 안내일 뿐.
 *  - **하단 중앙 fixed 오버레이** (문서 흐름 밖 → 레이아웃 안 밀림).
 *  - Phase 6 알림 `Toast.js`(우상단·빨강/주황 스택) 와 **위치·색 완전 분리**
 *    (회색·중립) → "긴급 알림" 과 혼동 0. Toast.js 재사용 X (BK 명시).
 *  - index.css 안 건드림 — 인라인 style + JS opacity fade (다른 세션 파일 보호).
 *
 * API: mountPermissionNoticeContainer() (main boot 1회) / showPermissionNotice(message?)
 */

import { t } from '../../core/i18n/index.js';

const CONTAINER_ID = 'aura-permission-notice';
const DISMISS_MS = 4000;
const FADE_MS = 250;

let _container = null;
let _timer = null;

export function mountPermissionNoticeContainer() {
  if (_container) return;
  _container = document.createElement('div');
  _container.id = CONTAINER_ID;
  _container.setAttribute('role', 'status');
  _container.setAttribute('aria-live', 'polite');
  _container.style.cssText =
    'position:fixed;left:50%;bottom:24px;transform:translateX(-50%);' +
    'z-index:1080;opacity:0;transition:opacity .25s ease;pointer-events:none;';
  document.body.appendChild(_container);
}

export function showPermissionNotice(message) {
  if (!_container) mountPermissionNoticeContainer();
  const msg = message || t('permission.denied');
  _container.innerHTML = `
    <div style="display:inline-flex;align-items:center;gap:8px;background:#4b5563;
                color:#fff;padding:10px 16px;border-radius:8px;font-size:.9rem;
                box-shadow:0 4px 12px rgba(0,0,0,.2);">
      <span class="material-symbols-outlined" style="font-size:1.1rem;">lock</span>
      <span>${escapeHtml(msg)}</span>
    </div>`;
  requestAnimationFrame(() => { if (_container) _container.style.opacity = '1'; });
  if (_timer) clearTimeout(_timer);
  _timer = setTimeout(hide, DISMISS_MS);
}

function hide() {
  if (!_container) return;
  _container.style.opacity = '0';
  if (_timer) { clearTimeout(_timer); _timer = null; }
  setTimeout(() => { if (_container) _container.innerHTML = ''; }, FADE_MS);
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
