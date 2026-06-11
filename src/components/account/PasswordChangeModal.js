/**
 * PasswordChangeModal — 09 Account Profile 의 비밀번호 변경 모달
 * ─────────────────────────────────────────────────────────────
 * Layout: docs/page_layout_outline.md §14 ("비밀번호 변경 button → modal")
 * Backend: PATCH /auth/password (account agreements §3.1 합의 완료)
 *          body: { current_password, new_password } → 200 OK
 *
 * 라이프사이클 (PasswordResetModal 패턴):
 *   mountPasswordChangeModal()    — body에 modal 1회 마운트
 *   openPasswordChangeModal()     — form state로 초기화 + show
 *   closePasswordChangeModal()    — hide
 *   unmountPasswordChangeModal()  — dispose + cleanup
 *
 * 화면 흐름:
 *   Form state — current / new / confirm 입력 + Submit / Cancel
 *   Submitted state — 성공 안내 + Done (modal 닫기)
 *
 * 검증 규칙 (frontend 단):
 *   - current / new / confirm 모두 필수
 *   - new 길이 ≥ 8 (간단 검증, backend 정책은 별도)
 *   - new !== current
 *   - new === confirm
 */

import { Modal as BootstrapModal } from 'bootstrap';
import { http } from '../../core/http.js';
import { t } from '../../core/i18n/index.js';
import { appStore } from '../../store/appStore.js';

export const PASSWORD_CHANGE_MODAL_ID = 'password-change-modal';

const USE_MOCK = import.meta.env.VITE_USE_MOCK !== 'false';

let _container    = null;
let _modalEl      = null;
let _bsModal      = null;
let _clickHandler = null;
let _submitHandler = null;
let _inputHandler  = null;
let _unsubApp      = null;
let _state        = initialState();

function initialState() {
  return {
    currentPassword: '',
    newPassword:     '',
    confirmPassword: '',
    submitting:      false,
    submitted:       false,
    error:           null,
  };
}

// ─── public API ──────────────────────────────────────────
export function mountPasswordChangeModal() {
  if (_container) return;

  _container = document.createElement('div');
  _container.id = `${PASSWORD_CHANGE_MODAL_ID}-host`;
  _container.innerHTML = renderShell();
  document.body.appendChild(_container);

  _modalEl = _container.querySelector(`#${PASSWORD_CHANGE_MODAL_ID}`);
  paintContent();

  _bsModal = new BootstrapModal(_modalEl);

  _clickHandler  = (e) => handleClick(e);
  _submitHandler = (e) => handleSubmit(e);
  _inputHandler  = (e) => handleInput(e);
  _container.addEventListener('click',  _clickHandler);
  _container.addEventListener('submit', _submitHandler);
  _container.addEventListener('input',  _inputHandler);

  _modalEl.addEventListener('hidden.bs.modal', () => {
    _state = initialState();
    paintContent();
  });

  // lang 변경 시 열려있는 모달 즉시 새 언어로 재페인트
  _unsubApp = appStore.subscribe(paintContent);
}

export function unmountPasswordChangeModal() {
  if (!_container) return;
  if (_clickHandler)  _container.removeEventListener('click',  _clickHandler);
  if (_submitHandler) _container.removeEventListener('submit', _submitHandler);
  if (_inputHandler)  _container.removeEventListener('input',  _inputHandler);
  _unsubApp?.();
  _bsModal?.dispose();
  _container.remove();
  _container = _modalEl = _bsModal = null;
  _clickHandler = _submitHandler = _inputHandler = _unsubApp = null;
  _state = initialState();
}

export function openPasswordChangeModal() {
  if (!_modalEl) return;
  _state = initialState();
  paintContent();
  _bsModal?.show();
}

export function closePasswordChangeModal() {
  _bsModal?.hide();
}

// ─── 내부 ────────────────────────────────────────────────
function paintContent() {
  if (!_modalEl) return;
  const inner = _modalEl.querySelector(`#${PASSWORD_CHANGE_MODAL_ID}-content`);
  if (inner) inner.innerHTML = renderContent(_state);
}

function handleInput(e) {
  const input = e.target.closest('[data-field]');
  if (!input) return;
  const field = input.dataset.field;
  if (field === 'current') _state.currentPassword = input.value;
  if (field === 'new')     _state.newPassword     = input.value;
  if (field === 'confirm') _state.confirmPassword = input.value;
}

function validate() {
  const { currentPassword, newPassword, confirmPassword } = _state;
  if (!currentPassword) return t('account.pwdChange.err.noCurrent');
  if (!newPassword)     return t('account.pwdChange.err.noNew');
  if (!confirmPassword) return t('account.pwdChange.err.noConfirm');
  if (newPassword.length < 8) return t('account.pwdChange.err.tooShort');
  if (newPassword === currentPassword) return t('account.pwdChange.err.sameAsCurrent');
  if (newPassword !== confirmPassword) return t('account.pwdChange.err.mismatch');
  return null;
}

async function handleSubmit(e) {
  if (!e.target.closest('[data-form="password-change"]')) return;
  e.preventDefault();
  if (_state.submitting || _state.submitted) return;

  const err = validate();
  if (err) {
    _state.error = err;
    paintContent();
    return;
  }

  _state.submitting = true;
  _state.error = null;
  paintContent();

  try {
    if (USE_MOCK) {
      await new Promise((resolve) => setTimeout(resolve, 250));
    } else {
      await http.patch('/auth/password', {
        current_password: _state.currentPassword,
        new_password:     _state.newPassword,
      });
    }
    _state.submitting = false;
    _state.submitted  = true;
    paintContent();
  } catch (e2) {
    _state.submitting = false;
    if (e2?.status === 401) {
      _state.error = t('account.pwdChange.err.currentIncorrect');
    } else if (e2?.status === 400) {
      _state.error = e2?.body?.message ?? t('account.pwdChange.err.policy');
    } else {
      _state.error = e2?.body?.message ?? e2?.message ?? t('account.pwdChange.err.generic');
    }
    paintContent();
  }
}

function handleClick(e) {
  const doneBtn = e.target.closest('[data-action="pwd-change-done"]');
  if (doneBtn) {
    _bsModal?.hide();
    return;
  }
}

// ─── HTML 렌더 ────────────────────────────────────────────
function renderShell() {
  return `
    <div class="modal fade" id="${PASSWORD_CHANGE_MODAL_ID}" tabindex="-1"
         aria-labelledby="${PASSWORD_CHANGE_MODAL_ID}-title" aria-hidden="true">
      <div class="modal-dialog modal-dialog-centered">
        <div class="modal-content" id="${PASSWORD_CHANGE_MODAL_ID}-content"></div>
      </div>
    </div>
  `;
}

function renderContent(state) {
  return state.submitted ? renderSubmitted() : renderForm(state);
}

function renderForm(state) {
  return `
    <form data-form="password-change" novalidate>
      <div class="modal-header">
        <h5 class="modal-title" id="${PASSWORD_CHANGE_MODAL_ID}-title">${escapeHtml(t('account.pwdChange.title'))}</h5>
        <button type="button" class="btn-close" data-bs-dismiss="modal" aria-label="${escapeHtml(t('common.close'))}"
                ${state.submitting ? 'disabled' : ''}></button>
      </div>
      <div class="modal-body">
        <div class="mb-3">
          <label for="pwd-change-current" class="form-label small">${escapeHtml(t('account.pwdChange.currentLabel'))}</label>
          <input type="password" id="pwd-change-current" class="form-control"
                 data-field="current" autocomplete="current-password"
                 value="${escapeHtml(state.currentPassword)}"
                 ${state.submitting ? 'disabled' : ''} required />
        </div>
        <div class="mb-3">
          <label for="pwd-change-new" class="form-label small">${escapeHtml(t('account.pwdChange.newLabel'))}</label>
          <input type="password" id="pwd-change-new" class="form-control"
                 data-field="new" autocomplete="new-password"
                 value="${escapeHtml(state.newPassword)}"
                 ${state.submitting ? 'disabled' : ''} required />
          <div class="form-text">${escapeHtml(t('account.pwdChange.hint'))}</div>
        </div>
        <div class="mb-2">
          <label for="pwd-change-confirm" class="form-label small">${escapeHtml(t('account.pwdChange.confirmLabel'))}</label>
          <input type="password" id="pwd-change-confirm" class="form-control"
                 data-field="confirm" autocomplete="new-password"
                 value="${escapeHtml(state.confirmPassword)}"
                 ${state.submitting ? 'disabled' : ''} required />
        </div>
        ${state.error
          ? `<div class="alert alert-danger small py-2 mb-0">${escapeHtml(state.error)}</div>`
          : ''}
      </div>
      <div class="modal-footer">
        <button type="button" class="btn btn-outline-secondary" data-bs-dismiss="modal"
                ${state.submitting ? 'disabled' : ''}>${escapeHtml(t('common.cancel'))}</button>
        <button type="submit" class="btn btn-danger" ${state.submitting ? 'disabled' : ''}>
          ${state.submitting
            ? `<span class="spinner-border spinner-border-sm me-2" role="status"></span>${escapeHtml(t('account.pwdChange.saving'))}`
            : escapeHtml(t('account.pwdChange.submit'))}
        </button>
      </div>
    </form>
  `;
}

function renderSubmitted() {
  return `
    <div class="modal-header border-0 pb-0">
      <button type="button" class="btn-close ms-auto" data-bs-dismiss="modal" aria-label="${escapeHtml(t('common.close'))}"></button>
    </div>
    <div class="modal-body text-center pt-0">
      <div class="password-reset-success-icon">
        <span class="material-symbols-outlined">check_circle</span>
      </div>
      <h5 class="mt-2 mb-2 fw-bold">${escapeHtml(t('account.pwdChange.success'))}</h5>
      <p class="text-muted small mb-0">
        ${escapeHtml(t('account.pwdChange.successDetail'))}
      </p>
    </div>
    <div class="px-4 pb-4">
      <!-- .modal-footer 의 우측 흰영역 회피 패턴 (TempPasswordModal 과 동일) -->
      <button type="button" class="btn btn-warning w-100" data-action="pwd-change-done">
        ${escapeHtml(t('account.pwdChange.done'))}
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
