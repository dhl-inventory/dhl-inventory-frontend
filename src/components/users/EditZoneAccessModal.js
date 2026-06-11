/**
 * EditZoneAccessModal — 10 Edit Zone Access (self-contained 공통 모듈)
 * ─────────────────────────────────────────────────────────────
 * Layout: page_layout_outline §15 (User Detail panel의 "Edit Zone Access")
 * Backend: backend_user_management_request.md §4.4 (Company > Warehouse > Zone scope picker)
 *
 * 라이프사이클:
 *   mountEditZoneAccessModal({ onSubmit })
 *   openEditZoneAccessModal({ user, currentZoneIds })
 *   unmountEditZoneAccessModal()
 *
 * 동작:
 *  - 현재 zone 권한을 checkbox 체크된 상태로 표시
 *  - 사용자가 토글 후 Save → added / removed 차이 계산 → onSubmit({ added, removed }) 호출
 *  - onSubmit 외부에서 grantUserPermissions / revokeUserPermission 처리
 *  - super_admin / ai_monitor는 외부에서 button disable 처리 (modal은 무관)
 */

import { Modal as BootstrapModal } from 'bootstrap';

export const EDIT_ZONE_MODAL_ID = 'edit-zone-modal';

// MVP — Company / Warehouse 고정. Zone만 multi-select. AddUserModal과 동일.
const AVAILABLE_ZONES = [
  { zoneId: 'zone-A', zoneName: 'Zone A' },
  { zoneId: 'zone-B', zoneName: 'Zone B' },
  { zoneId: 'zone-C', zoneName: 'Zone C' },
];

// ─── 모듈 내부 상태 ───────────────────────────────────────
let _container    = null;
let _modalEl      = null;
let _bsModal      = null;
let _onSubmit     = null;
let _clickHandler = null;
let _state        = initialState();

function initialState() {
  return {
    user:           null,    // { userId, username, role }
    currentZoneIds: [],
    submitting:     false,
    error:          null,
  };
}

// ─── public API ──────────────────────────────────────────
export function mountEditZoneAccessModal({ onSubmit } = {}) {
  if (_container) return;
  _onSubmit = onSubmit;

  _container = document.createElement('div');
  _container.id = `${EDIT_ZONE_MODAL_ID}-host`;
  _container.innerHTML = renderShell();
  document.body.appendChild(_container);

  _modalEl = _container.querySelector(`#${EDIT_ZONE_MODAL_ID}`);
  paintContent();

  _bsModal = new BootstrapModal(_modalEl);

  _clickHandler = (e) => handleClick(e);
  _container.addEventListener('click', _clickHandler);
}

export function unmountEditZoneAccessModal() {
  if (!_container) return;
  if (_clickHandler) _container.removeEventListener('click', _clickHandler);
  _bsModal?.dispose();
  _container.remove();
  _container = _modalEl = _bsModal = _onSubmit = _clickHandler = null;
  _state = initialState();
}

export function openEditZoneAccessModal({ user, currentZoneIds } = {}) {
  if (!_modalEl) return;
  _state = {
    user:           user ?? null,
    currentZoneIds: Array.isArray(currentZoneIds) ? [...currentZoneIds] : [],
    submitting:     false,
    error:          null,
  };
  paintContent();
  _bsModal?.show();
}

export function closeEditZoneAccessModal() {
  _bsModal?.hide();
}

// ─── 내부 ────────────────────────────────────────────────
function paintContent() {
  if (!_modalEl) return;
  const inner = _modalEl.querySelector(`#${EDIT_ZONE_MODAL_ID}-content`);
  if (inner) inner.innerHTML = renderContent(_state);
}

async function handleClick(e) {
  // Warehouse toggle — 단일 warehouse 환경에서 zone 일괄 토글 (backend §4.4 frontend expand)
  const warehouseInput = e.target.closest('input[data-action="warehouse-toggle"]');
  if (warehouseInput) {
    const checked = warehouseInput.checked;
    _modalEl.querySelectorAll(`#${EDIT_ZONE_MODAL_ID}-zone-list input[type="checkbox"]`)
      .forEach((cb) => { cb.checked = checked; });
    return;
  }

  const submitBtn = e.target.closest('[data-action="edit-zone-submit"]');
  if (submitBtn) {
    await doSubmit();
    return;
  }
}

async function doSubmit() {
  if (_state.submitting || !_onSubmit) return;

  // 체크된 zone 수집
  const checked = Array.from(
    _modalEl.querySelectorAll(`#${EDIT_ZONE_MODAL_ID}-zone-list input[type="checkbox"]:checked`),
  ).map((cb) => cb.value);

  const current = new Set(_state.currentZoneIds);
  const selected = new Set(checked);
  const added   = [...selected].filter((z) => !current.has(z));
  const removed = [...current].filter((z) => !selected.has(z));

  if (added.length === 0 && removed.length === 0) {
    // 변경 없음 — 그냥 닫기
    _bsModal?.hide();
    return;
  }

  _state = { ..._state, submitting: true, error: null };
  paintContent();

  try {
    await _onSubmit({
      userId: _state.user?.userId,
      added,
      removed,
    });
    _bsModal?.hide();
    // hide 애니메이션 후 state reset
    setTimeout(() => {
      _state = initialState();
      paintContent();
    }, 200);
  } catch (err) {
    _state = {
      ..._state,
      submitting: false,
      error:      err?.body?.message || err?.message || '권한 변경에 실패했습니다.',
    };
    paintContent();
  }
}

// ─── HTML 렌더 ────────────────────────────────────────────
function renderShell() {
  return `
    <div class="modal fade" id="${EDIT_ZONE_MODAL_ID}" tabindex="-1"
         aria-labelledby="${EDIT_ZONE_MODAL_ID}-title" aria-hidden="true">
      <div class="modal-dialog modal-lg modal-dialog-centered">
        <div class="modal-content" id="${EDIT_ZONE_MODAL_ID}-content"></div>
      </div>
    </div>
  `;
}

function renderContent(state) {
  const user = state.user;
  const currentSet = new Set(state.currentZoneIds);
  const allZonesChecked = AVAILABLE_ZONES.every((z) => currentSet.has(z.zoneId));
  const isOpsManager = user?.role === 'ops_manager';

  return `
    <div class="modal-header">
      <div>
        <h5 class="modal-title" id="${EDIT_ZONE_MODAL_ID}-title">Edit Zone Access</h5>
        ${user ? `<p class="text-muted small mb-0 mt-1">${escapeHtml(user.username)} · ${escapeHtml(roleLabel(user.role))}</p>` : ''}
      </div>
      <button type="button" class="btn-close"
              data-bs-dismiss="modal" aria-label="Close"
              ${state.submitting ? 'disabled' : ''}></button>
    </div>

    <div class="modal-body">
      ${isOpsManager ? `
        <p class="text-muted small mb-3">
          Warehouse를 체크하면 해당 warehouse의 모든 zone이 일괄 부여됩니다.
        </p>
      ` : ''}

      <div class="add-user-scope">
        <div class="add-user-scope-grid">
          <div class="add-user-scope-col">
            <div class="add-user-scope-col-label">Company</div>
            <div class="add-user-scope-col-value">DHL</div>
          </div>
          <div class="add-user-scope-col">
            <div class="add-user-scope-col-label">Warehouse</div>
            ${isOpsManager ? `
              <label class="add-user-scope-warehouse-row">
                <input type="checkbox"
                       data-action="warehouse-toggle"
                       value="warehouse-1"
                       ${allZonesChecked ? 'checked' : ''}
                       ${state.submitting ? 'disabled' : ''} />
                <span>Warehouse 1</span>
              </label>
            ` : `
              <div class="add-user-scope-col-value">Warehouse 1</div>
            `}
          </div>
          <div class="add-user-scope-col">
            <div class="add-user-scope-col-label">Zone</div>
            <div class="add-user-scope-zone-list" id="${EDIT_ZONE_MODAL_ID}-zone-list">
              ${AVAILABLE_ZONES.map((z) => `
                <label class="add-user-scope-zone-row">
                  <input type="checkbox" value="${z.zoneId}"
                         ${currentSet.has(z.zoneId) ? 'checked' : ''}
                         ${state.submitting ? 'disabled' : ''} />
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
              data-bs-dismiss="modal"
              ${state.submitting ? 'disabled' : ''}>Cancel</button>
      <button type="button" class="btn btn-warning"
              data-action="edit-zone-submit"
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
