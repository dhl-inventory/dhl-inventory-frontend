/**
 * DisableConfirmModal — 10 Disable / Enable 확인 (self-contained 공통 모듈)
 * ─────────────────────────────────────────────────────────────
 * Phase 1의 `window.confirm` 임시 dialog를 정식 Bootstrap modal로 대체.
 * Disable / Enable 두 동작 공유 (현재 active 상태에 따라 분기).
 *
 * 라이프사이클:
 *   mountDisableConfirmModal({ onConfirm })
 *   openDisableConfirmModal({ user, action })   // action: 'disable' | 'enable'
 *   unmountDisableConfirmModal()
 */

import { Modal as BootstrapModal } from 'bootstrap';
import { t, tf } from '../../core/i18n/index.js';

export const DISABLE_CONFIRM_MODAL_ID = 'disable-confirm-modal';

let _container    = null;
let _modalEl      = null;
let _bsModal      = null;
let _onConfirm    = null;
let _clickHandler = null;
let _state        = initialState();

function initialState() {
  return {
    user:       null,     // { userId, username }
    action:     'disable', // 'disable' | 'enable'
    submitting: false,
    error:      null,
  };
}

export function mountDisableConfirmModal({ onConfirm } = {}) {
  if (_container) return;
  _onConfirm = onConfirm;

  _container = document.createElement('div');
  _container.id = `${DISABLE_CONFIRM_MODAL_ID}-host`;
  _container.innerHTML = renderShell();
  document.body.appendChild(_container);

  _modalEl = _container.querySelector(`#${DISABLE_CONFIRM_MODAL_ID}`);
  paintContent();

  _bsModal = new BootstrapModal(_modalEl);

  _clickHandler = (e) => handleClick(e);
  _container.addEventListener('click', _clickHandler);
}

export function unmountDisableConfirmModal() {
  if (!_container) return;
  if (_clickHandler) _container.removeEventListener('click', _clickHandler);
  _bsModal?.dispose();
  _container.remove();
  _container = _modalEl = _bsModal = _onConfirm = _clickHandler = null;
  _state = initialState();
}

export function openDisableConfirmModal({ user, action = 'disable' } = {}) {
  if (!_modalEl) return;
  _state = { user: user ?? null, action, submitting: false, error: null };
  paintContent();
  _bsModal?.show();
}

export function closeDisableConfirmModal() {
  _bsModal?.hide();
}

// ─── 내부 ────────────────────────────────────────────────
function paintContent() {
  if (!_modalEl) return;
  const inner = _modalEl.querySelector(`#${DISABLE_CONFIRM_MODAL_ID}-content`);
  if (inner) inner.innerHTML = renderContent(_state);
}

async function handleClick(e) {
  const confirmBtn = e.target.closest('[data-action="disable-confirm-submit"]');
  if (confirmBtn) {
    await doConfirm();
    return;
  }
}

async function doConfirm() {
  if (_state.submitting || !_onConfirm || !_state.user) return;

  _state = { ..._state, submitting: true, error: null };
  paintContent();

  try {
    await _onConfirm({
      userId: _state.user.userId,
      action: _state.action,
    });
    _bsModal?.hide();
    setTimeout(() => {
      _state = initialState();
      paintContent();
    }, 200);
  } catch (err) {
    _state = {
      ..._state,
      submitting: false,
      error:      err?.body?.message || err?.message || t('users.disable.failed'),
    };
    paintContent();
  }
}

// ─── HTML 렌더 ────────────────────────────────────────────
function renderShell() {
  return `
    <div class="modal fade" id="${DISABLE_CONFIRM_MODAL_ID}" tabindex="-1"
         aria-labelledby="${DISABLE_CONFIRM_MODAL_ID}-title" aria-hidden="true">
      <div class="modal-dialog modal-dialog-centered">
        <div class="modal-content" id="${DISABLE_CONFIRM_MODAL_ID}-content"></div>
      </div>
    </div>
  `;
}

function renderContent(state) {
  const user = state.user ?? {};
  const isDisable = state.action === 'disable';
  const title    = isDisable ? t('users.disable.titleDisable') : t('users.disable.titleEnable');
  const iconName = isDisable ? 'block'        : 'check_circle';
  const iconCls  = isDisable ? 'is-danger'    : 'is-success';
  const btnCls   = isDisable ? 'btn-danger'   : 'btn-warning';
  const btnLabel = isDisable ? t('users.disable.btnDisable') : t('users.disable.btnEnable');
  const confirmText = isDisable
    ? tf('users.disable.confirmDisable', { username: escapeHtml(user.username ?? '') })
    : tf('users.disable.confirmEnable',  { username: escapeHtml(user.username ?? '') });
  const msg = isDisable ? t('users.disable.msgDisable') : t('users.disable.msgEnable');

  return `
    <div class="modal-header border-0 pb-0">
      <button type="button" class="btn-close ms-auto"
              data-bs-dismiss="modal" aria-label="${escapeHtml(t('common.close'))}"
              ${state.submitting ? 'disabled' : ''}></button>
    </div>

    <div class="modal-body text-center pt-0">
      <div class="disable-confirm-icon ${iconCls}">
        <span class="material-symbols-outlined">${iconName}</span>
      </div>
      <h4 class="disable-confirm-title" id="${DISABLE_CONFIRM_MODAL_ID}-title">
        ${escapeHtml(title)}
      </h4>
      <p class="text-muted small mb-2">${confirmText}</p>
      <p class="text-muted small mb-0">${escapeHtml(msg)}</p>

      ${state.error ? `
        <div class="alert alert-danger py-2 mt-3 mb-0 small text-start" role="alert">
          ${escapeHtml(state.error)}
        </div>
      ` : ''}
    </div>

    <div class="modal-footer">
      <button type="button" class="btn btn-outline-secondary flex-fill"
              data-bs-dismiss="modal"
              ${state.submitting ? 'disabled' : ''}>${escapeHtml(t('users.disable.cancel'))}</button>
      <button type="button" class="btn ${btnCls} flex-fill"
              data-action="disable-confirm-submit"
              ${state.submitting ? 'disabled' : ''}>
        ${state.submitting ? `
          <span class="spinner-border spinner-border-sm me-1" role="status" aria-hidden="true"></span>
          ${escapeHtml(t('users.disable.processing'))}
        ` : escapeHtml(btnLabel)}
      </button>
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
