/**
 * EditUserModal — 10 Edit User (self-contained 공통 모듈)
 * ─────────────────────────────────────────────────────────────
 * Backend `PATCH /admin/users/{id}` 허용 필드: email, is_active (UpdateUserRequest)
 * MVP는 email 변경만 본 modal에서 처리. is_active는 Disable User 버튼이 따로 담당.
 *
 * 라이프사이클:
 *   mountEditUserModal({ onSubmit })
 *   openEditUserModal({ user })
 *   unmountEditUserModal()
 *
 * 정책 (backend §4.7·§4.8 / pending §2.32):
 *  - username 수정 불가 (backend UpdateUserRequest에 username 없음)
 *  - role 수정 불가 (UpdateUserRequest에 role 없음)
 *  - is_active 변경은 Disable User 버튼이 별도 처리
 */

import { Modal as BootstrapModal } from 'bootstrap';

export const EDIT_USER_MODAL_ID = 'edit-user-modal';

let _container    = null;
let _modalEl      = null;
let _bsModal      = null;
let _onSubmit     = null;
let _clickHandler = null;
let _state        = initialState();

function initialState() {
  return {
    user:       null,    // { userId, username, email, role }
    submitting: false,
    error:      null,
  };
}

export function mountEditUserModal({ onSubmit } = {}) {
  if (_container) return;
  _onSubmit = onSubmit;

  _container = document.createElement('div');
  _container.id = `${EDIT_USER_MODAL_ID}-host`;
  _container.innerHTML = renderShell();
  document.body.appendChild(_container);

  _modalEl = _container.querySelector(`#${EDIT_USER_MODAL_ID}`);
  paintContent();

  _bsModal = new BootstrapModal(_modalEl);

  _clickHandler = (e) => handleClick(e);
  _container.addEventListener('click', _clickHandler);
}

export function unmountEditUserModal() {
  if (!_container) return;
  if (_clickHandler) _container.removeEventListener('click', _clickHandler);
  _bsModal?.dispose();
  _container.remove();
  _container = _modalEl = _bsModal = _onSubmit = _clickHandler = null;
  _state = initialState();
}

export function openEditUserModal({ user } = {}) {
  if (!_modalEl) return;
  _state = { user: user ?? null, submitting: false, error: null };
  paintContent();
  _bsModal?.show();
}

export function closeEditUserModal() {
  _bsModal?.hide();
}

// ─── 내부 ────────────────────────────────────────────────
function paintContent() {
  if (!_modalEl) return;
  const inner = _modalEl.querySelector(`#${EDIT_USER_MODAL_ID}-content`);
  if (inner) inner.innerHTML = renderContent(_state);
}

async function handleClick(e) {
  const submitBtn = e.target.closest('[data-action="edit-user-submit"]');
  if (submitBtn) {
    await doSubmit();
    return;
  }
}

async function doSubmit() {
  if (_state.submitting || !_onSubmit || !_state.user) return;

  const emailEl = _modalEl.querySelector('[data-field="email"]');
  const email = emailEl?.value?.trim() ?? '';

  if (!email) {
    _state = { ..._state, error: 'Email은 필수입니다.' };
    paintContent();
    return;
  }
  if (email === _state.user.email) {
    // 변경 없음 — 그냥 닫기
    _bsModal?.hide();
    return;
  }

  _state = { ..._state, submitting: true, error: null };
  paintContent();

  try {
    await _onSubmit({ userId: _state.user.userId, email });
    _bsModal?.hide();
    setTimeout(() => {
      _state = initialState();
      paintContent();
    }, 200);
  } catch (err) {
    _state = {
      ..._state,
      submitting: false,
      error:      err?.body?.message || err?.message || '수정에 실패했습니다.',
    };
    paintContent();
  }
}

// ─── HTML 렌더 ────────────────────────────────────────────
function renderShell() {
  return `
    <div class="modal fade" id="${EDIT_USER_MODAL_ID}" tabindex="-1"
         aria-labelledby="${EDIT_USER_MODAL_ID}-title" aria-hidden="true">
      <div class="modal-dialog modal-dialog-centered">
        <div class="modal-content" id="${EDIT_USER_MODAL_ID}-content"></div>
      </div>
    </div>
  `;
}

function renderContent(state) {
  const user = state.user ?? {};
  return `
    <div class="modal-header">
      <div>
        <h5 class="modal-title" id="${EDIT_USER_MODAL_ID}-title">Edit User</h5>
        <p class="text-muted small mb-0 mt-1">${escapeHtml(user.username ?? '')} · ${escapeHtml(roleLabel(user.role))}</p>
      </div>
      <button type="button" class="btn-close"
              data-bs-dismiss="modal" aria-label="Close"
              ${state.submitting ? 'disabled' : ''}></button>
    </div>

    <div class="modal-body">
      <div class="row g-3">
        <div class="col-md-6">
          <label class="form-label small fw-semibold text-uppercase">Username</label>
          <input type="text" class="form-control" value="${escapeHtml(user.username ?? '')}" disabled />
          <small class="text-muted">Username은 변경 불가</small>
        </div>
        <div class="col-md-6">
          <label class="form-label small fw-semibold text-uppercase">Role</label>
          <input type="text" class="form-control" value="${escapeHtml(roleLabel(user.role))}" disabled />
          <small class="text-muted">Role은 변경 불가 (재발급 필요)</small>
        </div>
        <div class="col-12">
          <label class="form-label small fw-semibold text-uppercase">Email</label>
          <input type="email" data-field="email" class="form-control"
                 value="${escapeHtml(user.email ?? '')}"
                 placeholder="user@dhl.com"
                 ${state.submitting ? 'disabled' : ''} />
        </div>
      </div>

      ${state.error ? `
        <div class="alert alert-danger py-2 mt-3 mb-0 small" role="alert">
          ${escapeHtml(state.error)}
        </div>
      ` : ''}
    </div>

    <div class="modal-footer">
      <button type="button" class="btn btn-outline-secondary"
              data-bs-dismiss="modal"
              ${state.submitting ? 'disabled' : ''}>Cancel</button>
      <button type="button" class="btn btn-warning"
              data-action="edit-user-submit"
              ${state.submitting ? 'disabled' : ''}>
        ${state.submitting ? `
          <span class="spinner-border spinner-border-sm me-1" role="status" aria-hidden="true"></span>
          Saving…
        ` : 'Save'}
      </button>
    </div>
  `;
}

function roleLabel(role) {
  const map = {
    field_manager: 'Field Manager',
    ops_manager:   'Ops Manager',
    super_admin:   'Super Admin',
    ai_monitor:    'AI Monitor',
  };
  return map[role] ?? role ?? '';
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
