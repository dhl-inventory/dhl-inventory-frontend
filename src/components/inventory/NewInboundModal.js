/**
 * NewInboundModal — 02-4 New Inbound Modal (self-contained 공통 모듈)
 * ─────────────────────────────────────────────────────────────
 * Layout 정합: docs/page_layout_outline.md §02-4
 * Wireframe: docs/wireframes/02-4_new_inbound_modal.png
 * Backend: `POST /inventory/inbound` (`backend/app/api/v1/inventory.py:222`)
 *   body schema: { sku_id, section_id, expiry_date, qty }
 *   400 on existing batch document missing
 *
 * 라이프사이클 (RefillRequestModal 패턴 동일):
 *   mountNewInboundModal({ onSubmit })  — body에 modal 1회 마운트
 *   openNewInboundModal({ prefill?, skuOptions? }) — state 초기화 + show
 *   closeNewInboundModal()
 *   unmountNewInboundModal()
 *
 * 정책 (layout_outline §02-4):
 *  - 단일 SKU 입고 (다중 SKU 일괄 입고는 Post-MVP)
 *  - SKU row 1개 선택 시 SKU / Zone / Section / currentQty / standardQty prefill
 *  - 다중 선택 또는 미선택 시 prefill 없이 빈 form 시작
 *  - Submit 성공: modal 안에서 성공 패널 표시 → OK 클릭 시 닫힘 + SKU List refetch
 *  - Submit 실패: modal 유지 + inline error (특히 "기존 SKU·섹션 문서 없음" 분기 표시)
 */

import { Modal as BootstrapModal } from 'bootstrap';
import { t, tf } from '../../core/i18n/index.js';

export const NEW_INBOUND_MODAL_ID = 'new-inbound-modal';

// ─── 모듈 내부 상태 ───────────────────────────────────────
let _container    = null;
let _modalEl      = null;
let _bsModal      = null;
let _onSubmit     = null;
let _clickHandler = null;
let _changeHandler = null;
let _inputHandler  = null;
let _state        = initialState();

function initialState() {
  return {
    // SKU options: [{ skuId, displayName, zoneId, zoneName, sectionId, sectionName, currentQty, standardQty, uom }]
    skuOptions: [],
    // 현재 선택값
    skuId:      '',
    zoneId:     '',
    sectionId:  '',
    expiryDate: '',
    qty:        '',
    // submit 상태
    submitting: false,
    submitted:  false,
    error:      null,
    response:   null,
    fieldErrors: {},
  };
}

// ─── public API ──────────────────────────────────────────
export function mountNewInboundModal({ onSubmit }) {
  if (_container) return;

  _onSubmit = onSubmit;

  _container = document.createElement('div');
  _container.id = `${NEW_INBOUND_MODAL_ID}-host`;
  _container.innerHTML = renderShell();
  document.body.appendChild(_container);

  _modalEl = _container.querySelector(`#${NEW_INBOUND_MODAL_ID}`);
  paintContent();

  _bsModal = new BootstrapModal(_modalEl, { backdrop: 'static' });

  _clickHandler  = (e) => handleClick(e);
  _changeHandler = (e) => handleChange(e);
  _inputHandler  = (e) => handleInput(e);
  _container.addEventListener('click',  _clickHandler);
  _container.addEventListener('change', _changeHandler);
  _container.addEventListener('input',  _inputHandler);
}

export function unmountNewInboundModal() {
  if (!_container) return;
  if (_clickHandler)  _container.removeEventListener('click',  _clickHandler);
  if (_changeHandler) _container.removeEventListener('change', _changeHandler);
  if (_inputHandler)  _container.removeEventListener('input',  _inputHandler);
  _bsModal?.dispose();
  _container.remove();
  _container = _modalEl = _bsModal = _onSubmit = null;
  _clickHandler = _changeHandler = _inputHandler = null;
  _state = initialState();
}

export function openNewInboundModal({ prefill, skuOptions } = {}) {
  if (!_modalEl) return;
  _state = initialState();
  _state.skuOptions = Array.isArray(skuOptions) ? skuOptions : [];
  if (prefill && prefill.skuId) {
    const opt = _state.skuOptions.find((o) => o.skuId === prefill.skuId);
    if (opt) {
      _state.skuId     = opt.skuId;
      _state.zoneId    = opt.zoneId    ?? '';
      _state.sectionId = opt.sectionId ?? '';
    }
  }
  paintContent();
  _bsModal?.show();
}

export function closeNewInboundModal() {
  _bsModal?.hide();
}

// ─── 내부 ────────────────────────────────────────────────
function paintContent() {
  if (!_modalEl) return;
  const inner = _modalEl.querySelector(`#${NEW_INBOUND_MODAL_ID}-content`);
  if (inner) inner.innerHTML = renderContent(_state);
}

function currentSelectedSku() {
  return _state.skuOptions.find((o) => o.skuId === _state.skuId) ?? null;
}

function zoneOptions() {
  const seen = new Map();
  for (const opt of _state.skuOptions) {
    if (opt.zoneId && !seen.has(opt.zoneId)) {
      seen.set(opt.zoneId, { zoneId: opt.zoneId, zoneName: opt.zoneName });
    }
  }
  return Array.from(seen.values());
}

function sectionOptionsForZone(zoneId) {
  if (!zoneId) return [];
  const seen = new Map();
  for (const opt of _state.skuOptions) {
    if (opt.zoneId !== zoneId) continue;
    if (!seen.has(opt.sectionId)) {
      seen.set(opt.sectionId, { sectionId: opt.sectionId, sectionName: opt.sectionName });
    }
  }
  return Array.from(seen.values());
}

function previewNumbers() {
  const sel = currentSelectedSku();
  const current  = sel?.currentQty ?? null;
  const standard = sel?.standardQty ?? null;
  const qty = Number(_state.qty);
  const validQty = Number.isFinite(qty) && qty > 0 ? qty : 0;
  const expected = current != null ? current + validQty : null;
  return { current, standard, expected, validQty };
}

function expectedNote(current, standard, expected) {
  if (current == null || standard == null) return null;
  if (expected < standard) return t('newInbound.note.belowStandard');
  if (expected > standard) return t('newInbound.note.overStandard');
  return t('newInbound.note.atStandard');
}

function expectedNoteVariant(current, standard, expected) {
  if (current == null || standard == null) return 'info';
  if (expected > standard) return 'warning';
  return 'success';
}

function validateForm() {
  const errs = {};
  const sel = currentSelectedSku();
  if (!_state.skuId)     errs.skuId     = t('newInbound.error.skuRequired');
  if (!_state.zoneId)    errs.zoneId    = t('newInbound.error.zoneRequired');
  if (!_state.sectionId) errs.sectionId = t('newInbound.error.sectionRequired');
  if (!_state.expiryDate) {
    errs.expiryDate = t('newInbound.error.expiryRequired');
  } else {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const d = new Date(_state.expiryDate);
    if (d < today) errs.expiryDate = t('newInbound.error.expiryPast');
  }
  const qty = Number(_state.qty);
  if (!Number.isFinite(qty) || qty <= 0 || !Number.isInteger(qty)) {
    errs.qty = t('newInbound.error.qtyRequired');
  }
  return { errs, sel };
}

// ─── delegated handlers ──────────────────────────────────
function handleChange(e) {
  const skuSel = e.target.closest('[data-action="ni-sku"]');
  if (skuSel) {
    _state.skuId = skuSel.value;
    // SKU 선택 시 Zone/Section auto-fill (해당 SKU의 기본 위치)
    const opt = currentSelectedSku();
    if (opt) {
      _state.zoneId    = opt.zoneId    ?? '';
      _state.sectionId = opt.sectionId ?? '';
    }
    _state.fieldErrors = {};
    paintContent();
    return;
  }
  const zoneSel = e.target.closest('[data-action="ni-zone"]');
  if (zoneSel) {
    _state.zoneId = zoneSel.value;
    // Zone 변경 시 section 초기화 (해당 Zone에 속한 첫 section 또는 빈값)
    const sections = sectionOptionsForZone(_state.zoneId);
    _state.sectionId = sections.length === 1 ? sections[0].sectionId : '';
    _state.fieldErrors = {};
    paintContent();
    return;
  }
  const secSel = e.target.closest('[data-action="ni-section"]');
  if (secSel) {
    _state.sectionId = secSel.value;
    _state.fieldErrors = {};
    paintContent();
    return;
  }
}

function handleInput(e) {
  // Note: input 이벤트는 매 keystroke 발생. 전체 repaint하면 input focus를 잃으므로
  //       preview 영역과 footer summary, expected note만 surgical 업데이트한다.
  const expiryEl = e.target.closest('[data-action="ni-expiry"]');
  if (expiryEl) {
    _state.expiryDate = expiryEl.value;
    // expiry는 preview와 무관 — 별도 DOM 갱신 불요
    return;
  }
  const qtyEl = e.target.closest('[data-action="ni-qty"]');
  if (qtyEl) {
    _state.qty = qtyEl.value;
    refreshPreviewInPlace();
    return;
  }
}

function refreshPreviewInPlace() {
  if (!_modalEl) return;
  const { current, standard, expected, validQty } = previewNumbers();

  // Expected Qty 값만 surgical 갱신
  const expectedValEl = _modalEl.querySelector('[data-ni-expected]');
  if (expectedValEl) {
    expectedValEl.innerHTML = expected == null
      ? '—'
      : `<strong>${expected.toLocaleString()}</strong> <span class="new-inbound-preview-unit">${escapeHtml(t('newInbound.preview.unit'))}</span>`;
  }

  // Note (below / at / over standard) 영역 갱신
  const noteSlot = _modalEl.querySelector('[data-ni-note]');
  if (noteSlot) {
    const text = expectedNote(current, standard, expected);
    const variant = expectedNoteVariant(current, standard, expected);
    noteSlot.innerHTML = text ? `
      <div class="new-inbound-note new-inbound-note-${variant}">
        <span class="material-symbols-outlined">${variant === 'warning' ? 'warning' : 'check_circle'}</span>
        <span>${escapeHtml(text)}</span>
      </div>
    ` : '';
  }

  // Footer summary 갱신
  const summaryEl = _modalEl.querySelector('[data-ni-summary]');
  if (summaryEl) {
    summaryEl.textContent = tf('newInbound.footer.summary', { n: validQty });
  }
}

async function handleClick(e) {
  const submitBtn = e.target.closest('[data-action="ni-submit"]');
  if (submitBtn) {
    await doSubmit();
    return;
  }
  const closeSuccessBtn = e.target.closest('[data-action="ni-close-success"]');
  if (closeSuccessBtn) {
    _bsModal?.hide();
    setTimeout(() => { _state = initialState(); paintContent(); }, 200);
    return;
  }
}

async function doSubmit() {
  if (_state.submitting || !_onSubmit) return;
  const { errs } = validateForm();
  if (Object.keys(errs).length > 0) {
    _state.fieldErrors = errs;
    paintContent();
    return;
  }
  _state.submitting = true;
  _state.error = null;
  _state.fieldErrors = {};
  paintContent();

  const sel = currentSelectedSku();
  const payload = {
    sku_id:      _state.skuId,
    section_id:  parseSectionId(_state.sectionId),
    expiry_date: _state.expiryDate,
    qty:         Number(_state.qty),
  };

  try {
    const res = await _onSubmit(payload);
    _state.submitting = false;
    _state.submitted = true;
    _state.response = {
      ...(res?.data ?? {}),
      // 표시용 메타
      _displayName:  sel?.displayName,
      _locationLabel: sel ? `${sel.zoneName} / ${sel.sectionName}` : '—',
    };
  } catch (err) {
    _state.submitting = false;
    const msg = err?.body?.message || err?.message || '';
    if (msg.includes('섹션 정보가 등록되어 있지 않습니다')) {
      _state.error = t('newInbound.error.noBatchDoc');
    } else {
      _state.error = msg || t('newInbound.error.submitFailed');
    }
  }
  paintContent();
}

// section_id는 backend가 int 기대. mock SKU_MASTER에서는 'sec-A1' 형태 string.
//   실 API 모드에선 ui_api_mapping 후속 정렬에 따라 변환. 현재는 가능하면 number로,
//   불가하면 raw string 그대로 보낸다 (mock도 그대로 받음).
function parseSectionId(v) {
  if (v == null || v === '') return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : v;
}

// ─── render ──────────────────────────────────────────────
function renderShell() {
  return `
    <div class="modal fade" id="${NEW_INBOUND_MODAL_ID}" tabindex="-1"
         aria-labelledby="${NEW_INBOUND_MODAL_ID}-title" aria-hidden="true">
      <div class="modal-dialog modal-lg modal-dialog-centered">
        <div class="modal-content new-inbound-modal" id="${NEW_INBOUND_MODAL_ID}-content"></div>
      </div>
    </div>
  `;
}

function renderContent(state) {
  return `
    <div class="modal-header new-inbound-header">
      <div>
        <h5 class="modal-title" id="${NEW_INBOUND_MODAL_ID}-title">${escapeHtml(t('newInbound.title'))}</h5>
        <p class="new-inbound-subtitle">${escapeHtml(t('newInbound.subtitle'))}</p>
      </div>
      <button type="button" class="btn-close"
              data-action="ni-close" data-bs-dismiss="modal"
              aria-label="${escapeHtml(t('common.close'))}"
              ${state.submitting ? 'disabled' : ''}></button>
    </div>
    <div class="modal-body">
      ${state.submitted ? renderSuccess(state) : renderForm(state)}
    </div>
    <div class="modal-footer new-inbound-footer">
      ${state.submitted ? renderSuccessFooter() : renderFormFooter(state)}
    </div>
  `;
}

function renderForm(state) {
  const sel = currentSelectedSku();
  const zones = zoneOptions();
  const sections = sectionOptionsForZone(state.zoneId);
  const { current, standard, expected, validQty } = previewNumbers();
  const noteText    = expectedNote(current, standard, expected);
  const noteVariant = expectedNoteVariant(current, standard, expected);

  return `
    <div class="new-inbound-tags">
      <span class="new-inbound-tag is-active">
        <span class="new-inbound-tag-dot"></span>
        ${escapeHtml(t('newInbound.tag.manual'))}
      </span>
      <span class="new-inbound-tag">${escapeHtml(t('newInbound.tag.existingOnly'))}</span>
    </div>

    <div class="new-inbound-form">
      <div class="new-inbound-row new-inbound-row-full">
        ${renderField({
          label: t('newInbound.field.sku'),
          error: state.fieldErrors.skuId,
          input: `
            <div class="new-inbound-sku-input">
              <span class="material-symbols-outlined new-inbound-sku-icon">search</span>
              <select data-action="ni-sku" class="form-select"
                      ${state.submitting ? 'disabled' : ''}>
                <option value="" ${!state.skuId ? 'selected' : ''} disabled>
                  ${escapeHtml(t('newInbound.placeholder.sku'))}
                </option>
                ${state.skuOptions.map((opt) => `
                  <option value="${escapeHtml(opt.skuId)}"
                          ${opt.skuId === state.skuId ? 'selected' : ''}>
                    ${escapeHtml(opt.skuId)} / ${escapeHtml(opt.displayName)}
                  </option>
                `).join('')}
              </select>
            </div>
          `,
        })}
      </div>

      <div class="new-inbound-row new-inbound-row-2col">
        ${renderField({
          label: t('newInbound.field.zone'),
          error: state.fieldErrors.zoneId,
          input: `
            <select data-action="ni-zone" class="form-select"
                    ${state.submitting || zones.length === 0 ? 'disabled' : ''}>
              <option value="" ${!state.zoneId ? 'selected' : ''} disabled>
                ${escapeHtml(t('newInbound.placeholder.zone'))}
              </option>
              ${zones.map((z) => `
                <option value="${escapeHtml(z.zoneId)}"
                        ${z.zoneId === state.zoneId ? 'selected' : ''}>
                  ${escapeHtml(z.zoneName)}
                </option>
              `).join('')}
            </select>
          `,
        })}
        ${renderField({
          label: t('newInbound.field.section'),
          error: state.fieldErrors.sectionId,
          input: `
            <select data-action="ni-section" class="form-select"
                    ${state.submitting || !state.zoneId || sections.length === 0 ? 'disabled' : ''}>
              <option value="" ${!state.sectionId ? 'selected' : ''} disabled>
                ${escapeHtml(t('newInbound.placeholder.section'))}
              </option>
              ${sections.map((s) => `
                <option value="${escapeHtml(s.sectionId)}"
                        ${s.sectionId === state.sectionId ? 'selected' : ''}>
                  ${escapeHtml(s.sectionName)}
                </option>
              `).join('')}
            </select>
          `,
        })}
      </div>

      <div class="new-inbound-row new-inbound-row-2col">
        ${renderField({
          label: t('newInbound.field.expiry'),
          error: state.fieldErrors.expiryDate,
          input: `
            <input type="date" data-action="ni-expiry"
                   class="form-control"
                   value="${escapeHtml(state.expiryDate)}"
                   ${state.submitting ? 'disabled' : ''} />
          `,
        })}
        ${renderField({
          label: t('newInbound.field.qty'),
          error: state.fieldErrors.qty,
          input: `
            <input type="number" min="1" step="1" data-action="ni-qty"
                   class="form-control"
                   placeholder="${escapeHtml(t('newInbound.placeholder.qty'))}"
                   value="${escapeHtml(state.qty)}"
                   ${state.submitting ? 'disabled' : ''} />
          `,
        })}
      </div>

      <div class="new-inbound-preview">
        <div class="new-inbound-preview-card">
          <div class="new-inbound-preview-label">${escapeHtml(t('newInbound.preview.current'))}</div>
          <div class="new-inbound-preview-value">
            ${current == null ? '—' : `<strong>${current.toLocaleString()}</strong> <span class="new-inbound-preview-unit">${escapeHtml(t('newInbound.preview.unit'))}</span>`}
          </div>
        </div>
        <div class="new-inbound-preview-card">
          <div class="new-inbound-preview-label">${escapeHtml(t('newInbound.preview.standard'))}</div>
          <div class="new-inbound-preview-value">
            ${standard == null ? '—' : `<strong>${standard.toLocaleString()}</strong> <span class="new-inbound-preview-unit">${escapeHtml(t('newInbound.preview.unit'))}</span>`}
          </div>
        </div>
        <div class="new-inbound-preview-card new-inbound-preview-expected">
          <div class="new-inbound-preview-label">${escapeHtml(t('newInbound.preview.expected'))}</div>
          <div class="new-inbound-preview-value" data-ni-expected>
            ${expected == null ? '—' : `<strong>${expected.toLocaleString()}</strong> <span class="new-inbound-preview-unit">${escapeHtml(t('newInbound.preview.unit'))}</span>`}
          </div>
        </div>
      </div>

      <div data-ni-note>
        ${noteText ? `
          <div class="new-inbound-note new-inbound-note-${noteVariant}">
            <span class="material-symbols-outlined">${noteVariant === 'warning' ? 'warning' : 'check_circle'}</span>
            <span>${escapeHtml(noteText)}</span>
          </div>
        ` : ''}
      </div>

      <p class="new-inbound-helper">${escapeHtml(t('newInbound.note.helper'))}</p>

      ${state.error ? `
        <div class="alert alert-danger py-2 mt-2 mb-0 small" role="alert">${escapeHtml(state.error)}</div>
      ` : ''}
    </div>
  `;
}

function renderField({ label, error, input }) {
  return `
    <div class="new-inbound-field${error ? ' has-error' : ''}">
      <label class="new-inbound-field-label">${escapeHtml(label)}</label>
      ${input}
      ${error ? `<div class="new-inbound-field-error">${escapeHtml(error)}</div>` : ''}
    </div>
  `;
}

function renderFormFooter(state) {
  const { validQty } = previewNumbers();
  return `
    <span class="new-inbound-footer-summary" data-ni-summary>
      ${escapeHtml(tf('newInbound.footer.summary', { n: validQty }))}
    </span>
    <div class="new-inbound-footer-actions">
      <button type="button" class="btn btn-outline-secondary"
              data-action="ni-close" data-bs-dismiss="modal"
              ${state.submitting ? 'disabled' : ''}>
        ${escapeHtml(t('newInbound.footer.cancel'))}
      </button>
      <button type="button" class="btn btn-danger"
              data-action="ni-submit"
              ${state.submitting ? 'disabled' : ''}>
        ${state.submitting ? `
          <span class="spinner-border spinner-border-sm me-1" role="status" aria-hidden="true"></span>
          ${escapeHtml(t('newInbound.footer.submitting'))}
        ` : escapeHtml(t('newInbound.footer.submit'))}
      </button>
    </div>
  `;
}

function renderSuccess(state) {
  const r = state.response ?? {};
  return `
    <div class="new-inbound-success">
      <span class="material-symbols-outlined new-inbound-success-icon">check_circle</span>
      <div>
        <h4 class="new-inbound-success-title">${escapeHtml(t('newInbound.success.title'))}</h4>
        <p class="text-muted small mb-2">${escapeHtml(t('newInbound.success.body'))}</p>
        <dl class="new-inbound-success-meta">
          ${r.batchId ? `
            <dt>${escapeHtml(t('newInbound.success.batchId'))}</dt>
            <dd><code>${escapeHtml(r.batchId)}</code></dd>
          ` : ''}
          <dt>${escapeHtml(t('newInbound.success.sku'))}</dt>
          <dd>${escapeHtml(r.skuId ?? '')} · ${escapeHtml(r._displayName ?? '')}</dd>
          <dt>${escapeHtml(t('newInbound.success.location'))}</dt>
          <dd>${escapeHtml(r._locationLabel ?? '—')}</dd>
          <dt>${escapeHtml(t('newInbound.success.qty'))}</dt>
          <dd>${(r.qty ?? 0).toLocaleString()} ${escapeHtml(t('newInbound.preview.unit'))}</dd>
        </dl>
      </div>
    </div>
  `;
}

function renderSuccessFooter() {
  return `
    <button type="button" class="btn btn-danger"
            data-action="ni-close-success">${escapeHtml(t('newInbound.success.ok'))}</button>
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
