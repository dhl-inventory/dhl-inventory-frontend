/**
 * PasswordResetModal — 00-2 Password Reset Request (self-contained 모달)
 * ─────────────────────────────────────────────────────────────
 * Wireframe: docs/wireframes/00-2_password_reset_request.png
 *           docs/wireframes/00-2_password_reset_submitted.png
 * Layout:   docs/page_layout_outline.md §4 (00-2 Password Reset)
 *
 * Backend: ✅ POST /auth/password-reset-requests 연결 완료
 *          (api_feedback/agreements/backend_user_management_agreements.md §3.2 / §5.1)
 *          authStore.requestPasswordReset(usernameOrEmail) 위임. mock 분기 포함.
 *
 * 라이프사이클 (RefillRequestModal 패턴):
 *   mountPasswordResetModal()    — body에 modal 1회 마운트
 *   openPasswordResetModal()     — form state로 초기화 + show
 *   closePasswordResetModal()    — hide
 *   unmountPasswordResetModal()  — dispose + cleanup
 *
 * 화면 흐름:
 *   1) Form state — email 입력 + Submit / Cancel
 *   2) Submitted state — 체크 아이콘 + "Password reset request submitted." +
 *      "Back to login" 버튼 (클릭 시 modal 닫고 state reset)
 */

import { Modal as BootstrapModal } from 'bootstrap';
import { authStore } from '../../store/authStore.js';
import { t } from '../../core/i18n/index.js';

export const PASSWORD_RESET_MODAL_ID = 'password-reset-modal';

let _container    = null;
let _modalEl      = null;
let _bsModal      = null;
let _clickHandler = null;
let _submitHandler = null;
let _inputHandler  = null;
let _state        = initialState();

function initialState() {
  return {
    email:      '',
    submitting: false,
    submitted:  false,
    error:      null,
  };
}

// ─── public API ──────────────────────────────────────────
export function mountPasswordResetModal() {
  if (_container) return;

  _container = document.createElement('div');
  _container.id = `${PASSWORD_RESET_MODAL_ID}-host`;
  _container.innerHTML = renderShell();
  document.body.appendChild(_container);

  _modalEl = _container.querySelector(`#${PASSWORD_RESET_MODAL_ID}`);
  paintContent();

  _bsModal = new BootstrapModal(_modalEl);

  _clickHandler  = (e) => handleClick(e);
  _submitHandler = (e) => handleSubmit(e);
  _inputHandler  = (e) => handleInput(e);
  _container.addEventListener('click',  _clickHandler);
  _container.addEventListener('submit', _submitHandler);
  _container.addEventListener('input',  _inputHandler);

  // modal이 닫힐 때 state reset (다음 진입 시 깨끗한 form)
  _modalEl.addEventListener('hidden.bs.modal', () => {
    _state = initialState();
    paintContent();
  });
}

export function unmountPasswordResetModal() {
  if (!_container) return;
  if (_clickHandler)  _container.removeEventListener('click',  _clickHandler);
  if (_submitHandler) _container.removeEventListener('submit', _submitHandler);
  if (_inputHandler)  _container.removeEventListener('input',  _inputHandler);
  _bsModal?.dispose();
  _container.remove();
  _container = _modalEl = _bsModal = null;
  _clickHandler = _submitHandler = _inputHandler = null;
  _state = initialState();
}

export function openPasswordResetModal() {
  if (!_modalEl) return;
  _state = initialState();
  paintContent();
  _bsModal?.show();
}

export function closePasswordResetModal() {
  _bsModal?.hide();
}

// ─── 내부 ────────────────────────────────────────────────
function paintContent() {
  if (!_modalEl) return;
  const inner = _modalEl.querySelector(`#${PASSWORD_RESET_MODAL_ID}-content`);
  if (inner) inner.innerHTML = renderContent(_state);
}

function handleInput(e) {
  const input = e.target.closest('[data-field="reset-email"]');
  if (input) {
    _state.email = input.value;
  }
}

async function handleSubmit(e) {
  if (!e.target.closest('[data-form="password-reset"]')) return;
  e.preventDefault();
  if (_state.submitting || _state.submitted) return;

  const email = _state.email.trim();
  if (!email) {
    _state.error = t('auth.reset.missingEmail');
    paintContent();
    return;
  }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    _state.error = t('auth.reset.invalidEmail');
    paintContent();
    return;
  }

  _state.submitting = true;
  _state.error = null;
  paintContent();

  try {
    // backend 합의 (user_management_agreements §3.2): body는 `{ username_or_email }`.
    // wireframe 정합상 입력은 email만 받지만 backend는 둘 다 허용.
    await authStore.requestPasswordReset(email);
    _state.submitting = false;
    _state.submitted  = true;
    paintContent();
  } catch (err) {
    _state.submitting = false;
    // backend 400 / 404 등 status에 따른 분기 — 현재는 단일 fallback 문구.
    // Post-MVP: status 별 i18n 분기 (예: 404 → '계정을 찾을 수 없습니다.')
    _state.error = err?.message ?? t('auth.reset.submitError');
    paintContent();
  }
}

function handleClick(e) {
  // "Back to login" — submitted 상태에서 modal 닫기 (state reset은 hidden.bs.modal에서)
  const backBtn = e.target.closest('[data-action="back-to-login"]');
  if (backBtn) {
    _bsModal?.hide();
    return;
  }
  // Cancel / X 닫기 버튼은 Bootstrap data-bs-dismiss로 처리됨
}


// ─── HTML 렌더 ────────────────────────────────────────────
function renderShell() {
  return `
    <div class="modal fade" id="${PASSWORD_RESET_MODAL_ID}" tabindex="-1"
         aria-labelledby="${PASSWORD_RESET_MODAL_ID}-title" aria-hidden="true">
      <div class="modal-dialog modal-dialog-centered">
        <div class="modal-content" id="${PASSWORD_RESET_MODAL_ID}-content"></div>
      </div>
    </div>
  `;
}

function renderContent(state) {
  return state.submitted ? renderSubmitted() : renderForm(state);
}

function renderForm(state) {
  return `
    <form data-form="password-reset" novalidate>
      <div class="modal-header">
        <h5 class="modal-title" id="${PASSWORD_RESET_MODAL_ID}-title">${escapeHtml(t('auth.reset.title'))}</h5>
        <button type="button" class="btn-close" data-bs-dismiss="modal" aria-label="${escapeHtml(t('common.close'))}"
                ${state.submitting ? 'disabled' : ''}></button>
      </div>
      <div class="modal-body">
        <p class="text-muted small mb-3">${escapeHtml(t('auth.reset.description'))}</p>
        <div class="mb-2">
          <label for="reset-email" class="form-label small">${escapeHtml(t('auth.reset.emailLabel'))}</label>
          <div class="password-reset-input-wrap">
            <span class="material-symbols-outlined">mail</span>
            <input type="email"
                   id="reset-email"
                   class="form-control"
                   data-field="reset-email"
                   placeholder="${escapeHtml(t('auth.reset.emailPlaceholder'))}"
                   value="${escapeHtml(state.email)}"
                   ${state.submitting ? 'disabled' : ''}
                   required />
          </div>
        </div>
        ${state.error
          ? `<div class="alert alert-danger small py-2 mb-0">${escapeHtml(state.error)}</div>`
          : ''}
      </div>
      <div class="modal-footer flex-column gap-2">
        <button type="submit" class="btn btn-warning w-100"
                ${state.submitting ? 'disabled' : ''}>
          ${state.submitting
            ? `<span class="spinner-border spinner-border-sm me-2" role="status"></span>${escapeHtml(t('auth.reset.submitting'))}`
            : `<span class="material-symbols-outlined me-1">send</span>${escapeHtml(t('auth.reset.submit'))}`}
        </button>
        <button type="button" class="btn btn-link w-100" data-bs-dismiss="modal"
                ${state.submitting ? 'disabled' : ''}>
          ${escapeHtml(t('auth.reset.cancel'))}
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
      <h5 class="mt-2 mb-2 fw-bold">${escapeHtml(t('auth.reset.successTitle'))}</h5>
      <p class="text-muted small mb-0">${escapeHtml(t('auth.reset.successDescription'))}</p>
    </div>
    <div class="modal-footer border-0">
      <button type="button" class="btn btn-warning w-100" data-action="back-to-login">
        <span class="material-symbols-outlined me-1">arrow_back</span>
        ${escapeHtml(t('auth.reset.backToLogin'))}
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
