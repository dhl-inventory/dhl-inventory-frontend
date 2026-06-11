/**
 * AddUserModal — 10-2 Add User Modal (self-contained 공통 모듈)
 * ─────────────────────────────────────────────────────────────
 * Wireframe: docs/wireframes/10-2_add_user_modal_default.png · 10-2_add_user_modal_submitted.png
 * Backend: backend_user_management_request.md
 *
 * 라이프사이클 (RefillRequestModal 패턴 동일):
 *   mountAddUserModal({ onSubmit, onCreated })
 *   openAddUserModal()
 *   closeAddUserModal()
 *   unmountAddUserModal()
 *
 * UI 정책 (wireframe + backend §4.4·§4.5):
 *  - Username / Email Address / User Role 필수
 *  - Scope Assignment: Company DHL (고정) > Warehouse 1 (고정) > Zone checkbox 다중
 *  - role = super_admin / ai_monitor → Scope Assignment 영역 비활성 (zone_ids 비움)
 *  - submit 성공 시 Account Created confirmation → Login Credentials (username + temp password + Copy)
 *  - View User Profile (선택 user로 detail panel 갱신) / Create Another (form 초기화) / Close
 */

import { Modal as BootstrapModal } from 'bootstrap';
import { t } from '../../core/i18n/index.js';

export const ADD_USER_MODAL_ID = 'add-user-modal';

// MVP — Company / Warehouse는 고정. Zone만 multi-select.
const AVAILABLE_ZONES = [
  { zoneId: 'zone-A', zoneName: 'Zone A' },
  { zoneId: 'zone-B', zoneName: 'Zone B' },
  { zoneId: 'zone-C', zoneName: 'Zone C' },
];

const ROLE_VALUES = ['field_manager', 'ops_manager', 'super_admin', 'ai_monitor'];

const ROLE_WITH_ZONE_SCOPE = ['field_manager', 'ops_manager'];

// ─── 모듈 내부 상태 ───────────────────────────────────────
let _container    = null;
let _modalEl      = null;
let _bsModal      = null;
let _onSubmit     = null;
let _onCreated    = null;
let _clickHandler = null;
let _changeHandler = null;
let _state        = initialState();

function initialState() {
  return {
    submitting: false,
    submitted:  false,
    error:      null,
    response:   null,
  };
}

// ─── public API ──────────────────────────────────────────
export function mountAddUserModal({ onSubmit, onCreated } = {}) {
  if (_container) return;
  _onSubmit  = onSubmit;
  _onCreated = onCreated;

  _container = document.createElement('div');
  _container.id = `${ADD_USER_MODAL_ID}-host`;
  _container.innerHTML = renderShell();
  document.body.appendChild(_container);

  _modalEl = _container.querySelector(`#${ADD_USER_MODAL_ID}`);
  paintContent();

  _bsModal = new BootstrapModal(_modalEl);

  _clickHandler  = (e) => handleClick(e);
  _changeHandler = (e) => handleChange(e);
  _container.addEventListener('click',  _clickHandler);
  _container.addEventListener('change', _changeHandler);
}

export function unmountAddUserModal() {
  if (!_container) return;
  if (_clickHandler)  _container.removeEventListener('click',  _clickHandler);
  if (_changeHandler) _container.removeEventListener('change', _changeHandler);
  _bsModal?.dispose();
  _container.remove();
  _container = _modalEl = _bsModal = _onSubmit = _onCreated = _clickHandler = _changeHandler = null;
  _state = initialState();
}

export function openAddUserModal() {
  if (!_modalEl) return;
  _state = initialState();
  paintContent();
  _bsModal?.show();
}

export function closeAddUserModal() {
  _bsModal?.hide();
}

// ─── 내부 ────────────────────────────────────────────────
function paintContent() {
  if (!_modalEl) return;
  const inner = _modalEl.querySelector(`#${ADD_USER_MODAL_ID}-content`);
  if (inner) inner.innerHTML = renderContent(_state);
}

async function handleClick(e) {
  // Warehouse toggle — 단일 warehouse 환경에서 zone 일괄 토글
  const warehouseInput = e.target.closest('input[data-action="warehouse-toggle"]');
  if (warehouseInput) {
    const checked = warehouseInput.checked;
    _modalEl.querySelectorAll(`#${ADD_USER_MODAL_ID}-scope input[name="zone"]`)
      .forEach((cb) => { cb.checked = checked; });
    return;
  }

  const submitBtn = e.target.closest('[data-action="add-user-submit"]');
  if (submitBtn) {
    await doSubmit();
    return;
  }

  const copyBtn = e.target.closest('[data-action="add-user-copy-pwd"]');
  if (copyBtn) {
    const pwd = _state.response?.temporaryPassword ?? '';
    try { await navigator.clipboard.writeText(pwd); } catch {}
    copyBtn.classList.add('is-copied');
    setTimeout(() => copyBtn.classList.remove('is-copied'), 1500);
    return;
  }

  const createAnotherBtn = e.target.closest('[data-action="add-user-create-another"]');
  if (createAnotherBtn) {
    _state = initialState();
    paintContent();
    return;
  }

  const viewProfileBtn = e.target.closest('[data-action="add-user-view-profile"]');
  if (viewProfileBtn) {
    const userId = _state.response?.userId;
    _bsModal?.hide();
    setTimeout(() => {
      _state = initialState();
      paintContent();
    }, 200);
    if (userId && typeof _onCreated === 'function') {
      _onCreated(userId);  // 페이지가 list 새로고침 + user 선택
    }
    return;
  }

  // close / cancel — Bootstrap data-bs-dismiss가 처리. close 후 list 갱신만 트리거
  const closeBtn = e.target.closest('[data-action="add-user-close"]');
  if (closeBtn) {
    setTimeout(() => {
      // submitted 후 close 시 새 user가 list에 반영되도록 갱신만 호출 (선택 X)
      if (_state.submitted && typeof _onCreated === 'function') {
        _onCreated(null);   // userId 없이 호출 → list 새로고침만
      }
      _state = initialState();
      paintContent();
    }, 200);
  }
}

function handleChange(e) {
  // role select 변경 → Scope Assignment 영역 enable/disable 토글 + warehouse 노출 분기
  const roleSel = e.target.closest('[data-action="add-user-role"]');
  if (roleSel) {
    const role = roleSel.value;
    const hasZone = ROLE_WITH_ZONE_SCOPE.includes(role);
    const isOps   = role === 'ops_manager';

    const scopeEl = _modalEl?.querySelector(`#${ADD_USER_MODAL_ID}-scope`);
    if (scopeEl) scopeEl.classList.toggle('is-disabled', !hasZone);

    // 모든 checkbox 비활성 (warehouse + zone)
    _modalEl?.querySelectorAll(`#${ADD_USER_MODAL_ID}-scope input[type="checkbox"]`).forEach((cb) => {
      cb.disabled = !hasZone;
      if (!hasZone) cb.checked = false;
    });

    // warehouse 영역 분기 — ops_manager만 checkbox, 그 외는 label
    const whCheckbox = _modalEl?.querySelector('[data-warehouse-checkbox]');
    const whLabel    = _modalEl?.querySelector('[data-warehouse-label]');
    if (whCheckbox && whLabel) {
      whCheckbox.style.display = isOps ? '' : 'none';
      whLabel.style.display    = isOps ? 'none' : '';
    }
    // ops가 아니면 warehouse checkbox 해제 (잔재 방지)
    if (!isOps) {
      const whInput = _modalEl?.querySelector('[data-action="warehouse-toggle"]');
      if (whInput) whInput.checked = false;
    }

    // role별 안내 문구 — ops_manager만 (warehouse 체크박스 의미 설명용)
    const hintEl = _modalEl?.querySelector(`#${ADD_USER_MODAL_ID}-scope-hint`);
    if (hintEl) {
      hintEl.textContent = isOps ? t('users.add.scope.opsHint') : '';
    }
  }
}

async function doSubmit() {
  if (_state.submitting || !_onSubmit) return;

  const usernameEl = _modalEl.querySelector('[data-field="username"]');
  const emailEl    = _modalEl.querySelector('[data-field="email"]');
  const roleEl     = _modalEl.querySelector('[data-action="add-user-role"]');

  const username = usernameEl?.value?.trim() ?? '';
  const email    = emailEl?.value?.trim() ?? '';
  const role     = roleEl?.value ?? '';

  if (!username || !email || !role) {
    _state = { ..._state, error: t('users.add.missingFields') };
    paintContent();
    return;
  }

  const hasZone = ROLE_WITH_ZONE_SCOPE.includes(role);
  const zoneIds = hasZone
    ? Array.from(
        _modalEl.querySelectorAll(`#${ADD_USER_MODAL_ID}-scope input[name="zone"]:checked`),
      ).map((cb) => cb.value)
    : [];

  _state = { ..._state, submitting: true, error: null };
  paintContent();

  try {
    const res = await _onSubmit({
      username,
      email,
      role,
      site_id: 'site-001',
      zone_ids: zoneIds,
    });
    _state = {
      ..._state,
      submitting: false,
      submitted:  true,
      response:   res?.data ?? null,
    };
  } catch (err) {
    _state = {
      ..._state,
      submitting: false,
      error:      err?.body?.message || err?.message || t('users.add.createFailed'),
    };
  }
  paintContent();
}

// ─── HTML 렌더 ────────────────────────────────────────────
function renderShell() {
  return `
    <div class="modal fade" id="${ADD_USER_MODAL_ID}" tabindex="-1"
         aria-labelledby="${ADD_USER_MODAL_ID}-title" aria-hidden="true">
      <div class="modal-dialog modal-lg modal-dialog-centered">
        <div class="modal-content" id="${ADD_USER_MODAL_ID}-content"></div>
      </div>
    </div>
  `;
}

function renderContent(state) {
  return state.submitted ? renderSubmitted(state) : renderForm(state);
}

function renderForm(state) {
  return `
    <div class="modal-header">
      <div>
        <h5 class="modal-title" id="${ADD_USER_MODAL_ID}-title">${escapeHtml(t('users.add.title'))}</h5>
        <p class="text-muted small mb-0 mt-1">${escapeHtml(t('users.add.subtitle'))}</p>
      </div>
      <button type="button" class="btn-close"
              data-action="add-user-close" data-bs-dismiss="modal"
              aria-label="${escapeHtml(t('common.close'))}"
              ${state.submitting ? 'disabled' : ''}></button>
    </div>

    <div class="modal-body">
      <div class="row g-3 mb-3">
        <div class="col-md-6">
          <label class="form-label small fw-semibold text-uppercase">${escapeHtml(t('users.add.username'))}</label>
          <input type="text" data-field="username" class="form-control"
                 placeholder="${escapeHtml(t('users.add.usernamePlaceholder'))}" autocapitalize="off" spellcheck="false"
                 ${state.submitting ? 'disabled' : ''} />
        </div>
        <div class="col-md-6">
          <label class="form-label small fw-semibold text-uppercase">${escapeHtml(t('users.add.email'))}</label>
          <input type="email" data-field="email" class="form-control"
                 placeholder="${escapeHtml(t('users.add.emailPlaceholder'))}" autocapitalize="off" spellcheck="false"
                 ${state.submitting ? 'disabled' : ''} />
        </div>
      </div>

      <div class="mb-3">
        <label class="form-label small fw-semibold text-uppercase">${escapeHtml(t('users.add.role'))}</label>
        <select class="form-select" data-action="add-user-role"
                ${state.submitting ? 'disabled' : ''}>
          <option value="" disabled selected>${escapeHtml(t('users.add.rolePlaceholder'))}</option>
          ${ROLE_VALUES.map((value) => `
            <option value="${value}">${escapeHtml(t('users.roleFilter.' + value))}</option>
          `).join('')}
        </select>
      </div>

      <div class="add-user-scope is-disabled" id="${ADD_USER_MODAL_ID}-scope">
        <div class="form-label small fw-semibold text-uppercase">${escapeHtml(t('users.add.scope.title'))}</div>
        <p class="text-muted small mb-2" id="${ADD_USER_MODAL_ID}-scope-hint"></p>
        <div class="add-user-scope-grid">
          <div class="add-user-scope-col">
            <div class="add-user-scope-col-label">${escapeHtml(t('users.add.scope.company'))}</div>
            <div class="add-user-scope-col-value">DHL</div>
          </div>
          <div class="add-user-scope-col">
            <div class="add-user-scope-col-label">${escapeHtml(t('users.add.scope.warehouse'))}</div>
            <label class="add-user-scope-warehouse-row" data-warehouse-checkbox style="display:none;">
              <input type="checkbox"
                     data-action="warehouse-toggle"
                     value="warehouse-1"
                     disabled />
              <span>Warehouse 1</span>
            </label>
            <div class="add-user-scope-col-value" data-warehouse-label>Warehouse 1</div>
          </div>
          <div class="add-user-scope-col">
            <div class="add-user-scope-col-label">${escapeHtml(t('users.add.scope.zone'))}</div>
            <div class="add-user-scope-zone-list">
              ${AVAILABLE_ZONES.map((z) => `
                <label class="add-user-scope-zone-row">
                  <input type="checkbox" name="zone" value="${z.zoneId}" disabled />
                  <span>${escapeHtml(z.zoneName)}</span>
                </label>
              `).join('')}
            </div>
          </div>
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
              data-action="add-user-close" data-bs-dismiss="modal"
              ${state.submitting ? 'disabled' : ''}>${escapeHtml(t('users.add.cancel'))}</button>
      <button type="button" class="btn btn-warning"
              data-action="add-user-submit"
              ${state.submitting ? 'disabled' : ''}>
        ${state.submitting ? `
          <span class="spinner-border spinner-border-sm me-1" role="status" aria-hidden="true"></span>
          ${escapeHtml(t('users.add.creating'))}
        ` : escapeHtml(t('users.add.submit'))}
      </button>
    </div>
  `;
}

function renderSubmitted(state) {
  const r = state.response ?? {};
  return `
    <div class="modal-header border-0 pb-0">
      <button type="button" class="btn-close ms-auto"
              data-action="add-user-close" data-bs-dismiss="modal"
              aria-label="${escapeHtml(t('common.close'))}"></button>
    </div>

    <div class="modal-body text-center pt-0">
      <div class="add-user-success-icon">
        <span class="material-symbols-outlined">check</span>
      </div>
      <h4 class="add-user-success-title">${escapeHtml(t('users.add.successTitle'))}</h4>
      <p class="text-muted small mb-3">${escapeHtml(t('users.add.successMsg'))}</p>

      <div class="add-user-credentials text-start">
        <div class="add-user-credentials-label">${escapeHtml(t('users.add.credentialsLabel'))}</div>
        <dl class="add-user-credentials-row">
          <dt>${escapeHtml(t('users.add.username'))}</dt>
          <dd>${escapeHtml(r.username ?? '—')}</dd>
        </dl>
        <dl class="add-user-credentials-row">
          <dt>${escapeHtml(t('users.add.tempPassword'))}</dt>
          <dd>
            <code class="add-user-temp-pwd">${escapeHtml(r.temporaryPassword ?? '—')}</code>
            <button type="button" class="btn btn-sm btn-link p-0 ms-1 align-baseline"
                    data-action="add-user-copy-pwd"
                    aria-label="${escapeHtml(t('users.add.copyPwdAria'))}">
              <span class="material-symbols-outlined" style="font-size:1rem;">content_copy</span>
            </button>
          </dd>
        </dl>
      </div>

      <p class="text-muted small fst-italic mt-3 mb-0">${escapeHtml(t('users.add.firstLoginNote'))}</p>
    </div>

    <div class="modal-footer flex-column gap-2">
      <button type="button" class="btn btn-warning w-100"
              data-action="add-user-view-profile">${escapeHtml(t('users.add.viewProfile'))}</button>
      <div class="d-flex gap-2 w-100">
        <button type="button" class="btn btn-outline-secondary flex-fill"
                data-action="add-user-create-another">${escapeHtml(t('users.add.createAnother'))}</button>
        <button type="button" class="btn btn-outline-secondary flex-fill"
                data-action="add-user-close" data-bs-dismiss="modal">${escapeHtml(t('users.add.close'))}</button>
      </div>
    </div>
  `;
}

// ─── helpers ─────────────────────────────────────────────
function escapeHtml(s) {
  if (s == null) return '';
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}
