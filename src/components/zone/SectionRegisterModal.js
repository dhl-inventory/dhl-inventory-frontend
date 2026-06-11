/**
 * SectionRegisterModal — 03-2 Zone Detail 섹션 등록 (C-2, mock-first)
 * ─────────────────────────────────────────────────────────────
 * 배경: 고객 SSAFY §8 "section 영역 드래그 + 장비좌표 저장" 요청.
 *   단 고객이 카메라-드래그 전제는 본인 오해라며 철회 + backend `image_roi`
 *   = MVP 제외 확정(`06_pending_tasks:517`). → 드래그 캔버스 아닌 **좌표/식별자 폼**.
 *   pending §2.44 / work_plan §C-2.
 *
 * mock-first: 폼·검증·흐름은 실제 동작(가짜 아님), 데이터만 mock.
 *   backend 회신 시 `zoneApi.createSection` mock 분기만 실 endpoint로 교체(UI 변경 0).
 *
 * 라이프사이클 (AdjustStockModal 패턴 동일):
 *   mountSectionRegisterModal({ onSubmit })
 *   openSectionRegisterModal({ zoneId })
 *   closeSectionRegisterModal() / unmountSectionRegisterModal()
 *
 * 권한: Zone Detail 측에서 OPS_MANAGER·SUPER_ADMIN 에게만 진입 버튼 노출(섹션=인프라 셋업).
 */

import { Modal as BootstrapModal } from 'bootstrap';
import { t } from '../../core/i18n/index.js';

export const SECTION_REGISTER_MODAL_ID = 'section-register-modal';

let _container    = null;
let _modalEl      = null;
let _bsModal      = null;
let _onSubmit     = null;
let _clickHandler = null;
let _inputHandler = null;
let _state        = initialState();

function initialState() {
  return {
    zoneId:      '',
    sectionName: '',
    sectionNo:   '',
    sectionCode: '',
    xMm:         '',
    yMm:         '',
    zMm:         '',
    cameraId:    '',
    submitting:  false,
    submitted:   false,
    error:       null,
    response:    null,
    fieldErrors: {},
  };
}

export function mountSectionRegisterModal({ onSubmit }) {
  if (_container) return;
  _onSubmit = onSubmit;

  _container = document.createElement('div');
  _container.id = `${SECTION_REGISTER_MODAL_ID}-host`;
  _container.innerHTML = renderShell();
  document.body.appendChild(_container);

  _modalEl = _container.querySelector(`#${SECTION_REGISTER_MODAL_ID}`);
  paintContent();

  _bsModal = new BootstrapModal(_modalEl, { backdrop: 'static' });

  _clickHandler = (e) => handleClick(e);
  _inputHandler = (e) => handleInput(e);
  _container.addEventListener('click', _clickHandler);
  _container.addEventListener('input', _inputHandler);
}

export function unmountSectionRegisterModal() {
  if (!_container) return;
  if (_clickHandler) _container.removeEventListener('click', _clickHandler);
  if (_inputHandler) _container.removeEventListener('input', _inputHandler);
  _bsModal?.dispose();
  _container.remove();
  _container = _modalEl = _bsModal = _onSubmit = null;
  _clickHandler = _inputHandler = null;
  _state = initialState();
}

export function openSectionRegisterModal({ zoneId } = {}) {
  if (!_modalEl) return;
  _state = initialState();
  _state.zoneId = zoneId ?? '';
  paintContent();
  _bsModal?.show();
}

export function closeSectionRegisterModal() {
  _bsModal?.hide();
}

// ─── 내부 ────────────────────────────────────────────────
function paintContent() {
  if (!_modalEl) return;
  const inner = _modalEl.querySelector(`#${SECTION_REGISTER_MODAL_ID}-content`);
  if (inner) inner.innerHTML = renderContent(_state);
}

function intOrNull(v) {
  if (v == null || String(v).trim() === '') return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : NaN;
}

function validateForm() {
  const errs = {};
  if (!_state.sectionName.trim()) errs.sectionName = t('zoneDetail.registerSection.errNameRequired');
  const no = intOrNull(_state.sectionNo);
  if (no == null || Number.isNaN(no) || no < 0 || !Number.isInteger(no)) {
    errs.sectionNo = t('zoneDetail.registerSection.errNoRequired');
  }
  // 좌표는 선택(HW 실측 전 비움 허용). 입력 시에만 숫자 검증.
  for (const k of ['xMm', 'yMm', 'zMm']) {
    if (String(_state[k]).trim() !== '' && Number.isNaN(Number(_state[k]))) {
      errs[k] = t('zoneDetail.registerSection.errCoordNumber');
    }
  }
  return errs;
}

// ─── delegated handlers ──────────────────────────────────
function handleInput(e) {
  const el = e.target.closest('[data-field]');
  if (!el) return;
  _state[el.dataset.field] = el.value;
}

async function handleClick(e) {
  if (e.target.closest('[data-action="sr-submit"]')) {
    await doSubmit();
    return;
  }
  if (e.target.closest('[data-action="sr-close-success"]')) {
    _bsModal?.hide();
    setTimeout(() => { _state = initialState(); paintContent(); }, 200);
    return;
  }
}

async function doSubmit() {
  if (_state.submitting || !_onSubmit) return;
  const errs = validateForm();
  if (Object.keys(errs).length > 0) {
    _state.fieldErrors = errs;
    paintContent();
    return;
  }
  _state.submitting = true;
  _state.error = null;
  _state.fieldErrors = {};
  paintContent();

  const num = (v) => (String(v).trim() === '' ? null : Number(v));
  const payload = {
    zone_id:      _state.zoneId,
    section_name: _state.sectionName.trim(),
    section_no:   Number(_state.sectionNo),
    section_code: _state.sectionCode.trim() || null,   // null → backend/mock 가 S-{no} 기본
    x_mm:         num(_state.xMm),
    y_mm:         num(_state.yMm),
    z_mm:         num(_state.zMm),
    camera_id:    _state.cameraId.trim() || null,
  };

  try {
    const res = await _onSubmit(payload);
    _state.submitting = false;
    _state.submitted = true;
    _state.response = res?.data ?? {};
  } catch (err) {
    _state.submitting = false;
    _state.error = err?.body?.message || err?.message || t('zoneDetail.registerSection.errSubmit');
  }
  paintContent();
}

// ─── render ──────────────────────────────────────────────
function renderShell() {
  return `
    <div class="modal fade" id="${SECTION_REGISTER_MODAL_ID}" tabindex="-1"
         aria-labelledby="${SECTION_REGISTER_MODAL_ID}-title" aria-hidden="true">
      <div class="modal-dialog modal-dialog-centered">
        <div class="modal-content section-register-modal" id="${SECTION_REGISTER_MODAL_ID}-content"></div>
      </div>
    </div>
  `;
}

function renderContent(state) {
  return `
    <div class="modal-header section-register-header">
      <div>
        <h5 class="modal-title" id="${SECTION_REGISTER_MODAL_ID}-title">${escapeHtml(t('zoneDetail.registerSection.title'))}</h5>
        <p class="section-register-subtitle">${escapeHtml(t('zoneDetail.registerSection.subtitle'))}</p>
      </div>
      <button type="button" class="btn-close" data-bs-dismiss="modal"
              aria-label="${escapeHtml(t('common.close'))}" ${state.submitting ? 'disabled' : ''}></button>
    </div>
    <div class="modal-body">
      ${state.submitted ? renderSuccess(state) : renderForm(state)}
    </div>
    <div class="modal-footer section-register-footer">
      ${state.submitted ? renderSuccessFooter() : renderFormFooter(state)}
    </div>
  `;
}

function field(label, name, opts = {}) {
  const { type = 'text', placeholder = '', required = false } = opts;
  const err = _state.fieldErrors[name];
  return `
    <div class="section-register-field${err ? ' has-error' : ''}">
      <label class="section-register-label">${escapeHtml(label)}${required ? ' *' : ''}</label>
      <input type="${type}" data-field="${name}" class="form-control"
             placeholder="${escapeHtml(placeholder)}"
             value="${escapeHtml(_state[name])}" ${_state.submitting ? 'disabled' : ''} />
      ${err ? `<div class="section-register-error">${escapeHtml(err)}</div>` : ''}
    </div>
  `;
}

function renderForm(state) {
  return `
    <p class="section-register-zone">
      ${escapeHtml(t('zoneDetail.registerSection.zone'))}: <code>${escapeHtml(state.zoneId)}</code>
    </p>
    <div class="section-register-grid">
      ${field(t('zoneDetail.registerSection.name'), 'sectionName', { required: true, placeholder: t('zoneDetail.registerSection.namePlaceholder') })}
      ${field(t('zoneDetail.registerSection.no'),   'sectionNo',   { type: 'number', required: true, placeholder: 'e.g. 1' })}
      ${field(t('zoneDetail.registerSection.code'), 'sectionCode', { placeholder: t('zoneDetail.registerSection.codePlaceholder') })}
      ${field(t('zoneDetail.registerSection.camera'), 'cameraId',  { placeholder: 'cam-001' })}
      ${field(t('zoneDetail.registerSection.xMm'), 'xMm', { type: 'number', placeholder: t('zoneDetail.registerSection.coordPlaceholder') })}
      ${field(t('zoneDetail.registerSection.yMm'), 'yMm', { type: 'number', placeholder: t('zoneDetail.registerSection.coordPlaceholder') })}
      ${field(t('zoneDetail.registerSection.zMm'), 'zMm', { type: 'number', placeholder: t('zoneDetail.registerSection.coordPlaceholder') })}
    </div>
    <p class="section-register-hint">${escapeHtml(t('zoneDetail.registerSection.hint'))}</p>
    ${state.error ? `<div class="alert alert-danger py-2 mt-2 mb-0 small" role="alert">${escapeHtml(state.error)}</div>` : ''}
  `;
}

function renderFormFooter(state) {
  return `
    <button type="button" class="btn btn-outline-secondary" data-bs-dismiss="modal"
            ${state.submitting ? 'disabled' : ''}>${escapeHtml(t('zoneDetail.registerSection.cancel'))}</button>
    <button type="button" class="btn btn-warning" data-action="sr-submit"
            ${state.submitting ? 'disabled' : ''}>
      ${state.submitting ? `
        <span class="spinner-border spinner-border-sm me-1" role="status" aria-hidden="true"></span>
        ${escapeHtml(t('zoneDetail.registerSection.submitting'))}
      ` : escapeHtml(t('zoneDetail.registerSection.submit'))}
    </button>
  `;
}

function renderSuccess(state) {
  const r = state.response ?? {};
  return `
    <div class="section-register-success">
      <span class="material-symbols-outlined section-register-success-icon">check_circle</span>
      <div>
        <h4 class="section-register-success-title">${escapeHtml(t('zoneDetail.registerSection.successTitle'))}</h4>
        <p class="text-muted small mb-2">${escapeHtml(t('zoneDetail.registerSection.successBody'))}</p>
        <dl class="section-register-success-meta">
          <dt>${escapeHtml(t('zoneDetail.registerSection.fldSection'))}</dt>
          <dd>${escapeHtml(r.sectionName ?? state.sectionName)} (${escapeHtml(r.sectionCode ?? ('S-' + state.sectionNo))})</dd>
          <dt>${escapeHtml(t('zoneDetail.registerSection.zone'))}</dt>
          <dd>${escapeHtml(r.zoneId ?? state.zoneId)}</dd>
        </dl>
      </div>
    </div>
  `;
}

function renderSuccessFooter() {
  return `
    <button type="button" class="btn btn-warning"
            data-action="sr-close-success">${escapeHtml(t('zoneDetail.registerSection.ok'))}</button>
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
