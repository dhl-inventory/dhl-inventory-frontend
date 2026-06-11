/**
 * TempPasswordModal — 10-3 Reset Password 결과 (self-contained 공통 모듈)
 * ─────────────────────────────────────────────────────────────
 * Phase 1의 `window.alert` 임시 표시를 정식 modal로 대체.
 *
 * 라이프사이클 (RefillRequestModal / AddUserModal 패턴 동일):
 *   mountTempPasswordModal()
 *   openTempPasswordModal({ username, temporaryPassword })
 *   unmountTempPasswordModal()
 *
 * UI:
 *  - 자물쇠 아이콘 + "Password reset"
 *  - Login Credentials: username + temp password + Copy 버튼
 *  - "사용자에게 직접 전달" 안내
 *  - Close 버튼
 */

import { Modal as BootstrapModal } from 'bootstrap';
import { t } from '../../core/i18n/index.js';
import { appStore } from '../../store/appStore.js';

export const TEMP_PASSWORD_MODAL_ID = 'temp-password-modal';

let _container    = null;
let _modalEl      = null;
let _bsModal      = null;
let _clickHandler = null;
let _unsubApp     = null;
let _state        = initialState();

function initialState() {
  return { username: '', temporaryPassword: '' };
}

export function mountTempPasswordModal() {
  if (_container) return;

  _container = document.createElement('div');
  _container.id = `${TEMP_PASSWORD_MODAL_ID}-host`;
  _container.innerHTML = renderShell();
  document.body.appendChild(_container);

  _modalEl = _container.querySelector(`#${TEMP_PASSWORD_MODAL_ID}`);
  paintContent();

  _bsModal = new BootstrapModal(_modalEl);

  _clickHandler = (e) => handleClick(e);
  _container.addEventListener('click', _clickHandler);

  // lang 변경 시 열려있는 모달 즉시 새 언어로 재페인트
  _unsubApp = appStore.subscribe(paintContent);
}

export function unmountTempPasswordModal() {
  if (!_container) return;
  if (_clickHandler) _container.removeEventListener('click', _clickHandler);
  _unsubApp?.();
  _bsModal?.dispose();
  _container.remove();
  _container = _modalEl = _bsModal = _clickHandler = _unsubApp = null;
  _state = initialState();
}

export function openTempPasswordModal({ username, temporaryPassword } = {}) {
  if (!_modalEl) return;
  _state = { username: username ?? '', temporaryPassword: temporaryPassword ?? '' };
  paintContent();
  _bsModal?.show();
}

export function closeTempPasswordModal() {
  _bsModal?.hide();
}

// ─── 내부 ────────────────────────────────────────────────
function paintContent() {
  if (!_modalEl) return;
  const inner = _modalEl.querySelector(`#${TEMP_PASSWORD_MODAL_ID}-content`);
  if (inner) inner.innerHTML = renderContent(_state);
}

async function handleClick(e) {
  const copyBtn = e.target.closest('[data-action="temp-pwd-copy"]');
  if (copyBtn) {
    try { await navigator.clipboard.writeText(_state.temporaryPassword); } catch {}
    copyBtn.classList.add('is-copied');
    setTimeout(() => copyBtn.classList.remove('is-copied'), 1500);
    return;
  }
  // close (Bootstrap data-bs-dismiss로 처리)
}

function renderShell() {
  return `
    <div class="modal fade" id="${TEMP_PASSWORD_MODAL_ID}" tabindex="-1"
         aria-labelledby="${TEMP_PASSWORD_MODAL_ID}-title" aria-hidden="true">
      <div class="modal-dialog modal-dialog-centered">
        <div class="modal-content" id="${TEMP_PASSWORD_MODAL_ID}-content"></div>
      </div>
    </div>
  `;
}

function renderContent(state) {
  return `
    <div class="modal-header border-0 pb-0">
      <button type="button" class="btn-close ms-auto"
              data-bs-dismiss="modal" aria-label="${escapeHtml(t('users.tempPwd.close'))}"></button>
    </div>

    <div class="modal-body text-center pt-0">
      <div class="temp-pwd-icon">
        <span class="material-symbols-outlined">lock_reset</span>
      </div>
      <h4 class="temp-pwd-title" id="${TEMP_PASSWORD_MODAL_ID}-title">${escapeHtml(t('users.tempPwd.title'))}</h4>
      <p class="text-muted small mb-3">${escapeHtml(t('users.tempPwd.subtitle'))}</p>

      <div class="add-user-credentials text-start">
        <div class="add-user-credentials-label">${escapeHtml(t('users.tempPwd.credentialsLabel'))}</div>
        <dl class="add-user-credentials-row">
          <dt>${escapeHtml(t('users.tempPwd.username'))}</dt>
          <dd>${escapeHtml(state.username) || '—'}</dd>
        </dl>
        <dl class="add-user-credentials-row">
          <dt>${escapeHtml(t('users.tempPwd.tempPassword'))}</dt>
          <dd>
            <code class="add-user-temp-pwd">${escapeHtml(state.temporaryPassword) || '—'}</code>
            <button type="button" class="btn btn-sm btn-link p-0 ms-1 align-baseline"
                    data-action="temp-pwd-copy"
                    aria-label="${escapeHtml(t('users.tempPwd.copyAria'))}">
              <span class="material-symbols-outlined" style="font-size:1rem;">content_copy</span>
            </button>
          </dd>
        </dl>
      </div>

      <p class="text-muted small fst-italic mt-3 mb-0">
        ${escapeHtml(t('users.tempPwd.note'))}
      </p>
    </div>

    <div class="px-4 pb-4">
      <!-- .modal-footer 의 flex+gap 마진 + border-top 조합이 우측 시각 불균형 유발 → 단순 padding div 로 교체 -->
      <button type="button" class="btn btn-warning w-100"
              data-bs-dismiss="modal">${escapeHtml(t('users.tempPwd.close'))}</button>
    </div>
  `;
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
