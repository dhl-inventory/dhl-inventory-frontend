/**
 * AdjustStockModal — 02-2 SKU Detail 수동 재고 보정 (F-014 보정 부분)
 * ─────────────────────────────────────────────────────────────
 * Layout: docs/page_layout_outline.md §02-2 "수동 보정 입력"
 * Backend: `POST /inventory/manual` (`backend/app/api/v1/inventory.py:203`)
 *   body: { sku_id, section_id, adjusted_qty(보정 후 절대수량), reason }
 *   adjusted_by 는 JWT 토큰에서 backend 자동. 응답 ManualAdjustResponse.
 *   제약: delta>0(증가) 거절 — 증가는 /inventory/inbound (감소 전용).
 *         감소분 batch 차감은 backend FEFO(유통기한 임박순) 책임.
 *   결정 근거: pending_design_decisions.md §2.52
 *
 * 라이프사이클 (NewInboundModal 패턴 동일):
 *   mountAdjustStockModal({ onSubmit })   — body에 modal 1회 마운트
 *   openAdjustStockModal({ skuId, sectionId, displayName, currentQty, uom })
 *   closeAdjustStockModal()
 *   unmountAdjustStockModal()
 *
 * 정책:
 *  - 단일 SKU 보정 (SKU 선택 없음 — SKU Detail 진입 SKU 고정)
 *  - 보정 후 수량 = 절대값 입력. 현재보다 크면 inline 차단(증가는 New Inbound)
 *  - 사유 필수 (backend reason 필수)
 *  - Submit 성공: 성공 패널 → OK 시 닫힘 + 페이지가 detail refetch (onSubmit 측)
 */

import { Modal as BootstrapModal } from 'bootstrap';
import { t } from '../../core/i18n/index.js';

export const ADJUST_STOCK_MODAL_ID = 'adjust-stock-modal';

let _container    = null;
let _modalEl      = null;
let _bsModal      = null;
let _onSubmit     = null;
let _clickHandler = null;
let _inputHandler = null;
let _state        = initialState();

function initialState() {
  return {
    skuId:       '',
    sectionId:   null,
    displayName: '',
    currentQty:  null,
    uom:         '',
    adjustedQty: '',
    reason:      '',
    submitting:  false,
    submitted:   false,
    error:       null,
    response:    null,
    fieldErrors: {},
  };
}

export function mountAdjustStockModal({ onSubmit }) {
  if (_container) return;
  _onSubmit = onSubmit;

  _container = document.createElement('div');
  _container.id = `${ADJUST_STOCK_MODAL_ID}-host`;
  _container.innerHTML = renderShell();
  document.body.appendChild(_container);

  _modalEl = _container.querySelector(`#${ADJUST_STOCK_MODAL_ID}`);
  paintContent();

  _bsModal = new BootstrapModal(_modalEl, { backdrop: 'static' });

  _clickHandler = (e) => handleClick(e);
  _inputHandler = (e) => handleInput(e);
  _container.addEventListener('click', _clickHandler);
  _container.addEventListener('input', _inputHandler);
}

export function unmountAdjustStockModal() {
  if (!_container) return;
  if (_clickHandler) _container.removeEventListener('click', _clickHandler);
  if (_inputHandler) _container.removeEventListener('input', _inputHandler);
  _bsModal?.dispose();
  _container.remove();
  _container = _modalEl = _bsModal = _onSubmit = null;
  _clickHandler = _inputHandler = null;
  _state = initialState();
}

export function openAdjustStockModal({ skuId, sectionId, displayName, currentQty, uom } = {}) {
  if (!_modalEl) return;
  _state = initialState();
  _state.skuId       = skuId ?? '';
  _state.sectionId   = sectionId ?? null;
  _state.displayName = displayName ?? '';
  _state.currentQty  = Number.isFinite(currentQty) ? currentQty : null;
  _state.uom         = uom ?? '';
  paintContent();
  _bsModal?.show();
}

export function closeAdjustStockModal() {
  _bsModal?.hide();
}

// ─── 내부 ────────────────────────────────────────────────
function paintContent() {
  if (!_modalEl) return;
  const inner = _modalEl.querySelector(`#${ADJUST_STOCK_MODAL_ID}-content`);
  if (inner) inner.innerHTML = renderContent(_state);
}

// 입력값 파싱 — 정수 절대 수량. 빈/비정수면 null.
function parsedQty() {
  if (_state.adjustedQty === '' || _state.adjustedQty == null) return null;
  const n = Number(_state.adjustedQty);
  return Number.isFinite(n) && Number.isInteger(n) ? n : NaN;
}

// section_id: backend int 기대. mock SKU_MASTER도 number. 그대로 number 변환.
function parseSectionId(v) {
  if (v == null || v === '') return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : v;
}

function validateForm() {
  const errs = {};
  const q = parsedQty();
  if (q == null || Number.isNaN(q) || q < 0) {
    errs.adjustedQty = t('skuDetail.adjust.errQtyRequired');
  } else if (_state.currentQty != null && q > _state.currentQty) {
    errs.adjustedQty = t('skuDetail.adjust.errIncrease');
  }
  if (!_state.reason.trim()) {
    errs.reason = t('skuDetail.adjust.errReasonRequired');
  }
  return errs;
}

// preview slot — input 시 focus 유지 위해 surgical 갱신 (NewInbound 패턴)
function refreshPreviewInPlace() {
  if (!_modalEl) return;
  const slot = _modalEl.querySelector('[data-as-preview]');
  if (!slot) return;
  slot.innerHTML = renderPreviewInner();
}

function renderPreviewInner() {
  const cur = _state.currentQty;
  const q = parsedQty();
  if (cur == null || q == null || Number.isNaN(q) || q < 0) return '';
  if (q > cur) {
    return `
      <div class="adjust-stock-note adjust-stock-note-warning">
        <span class="material-symbols-outlined">warning</span>
        <span>${escapeHtml(t('skuDetail.adjust.errIncrease'))}</span>
      </div>`;
  }
  const delta = q - cur;
  const deltaStr = delta === 0 ? '±0' : `−${Math.abs(delta)}`;
  return `
    <div class="adjust-stock-note adjust-stock-note-info">
      <span class="material-symbols-outlined">trending_down</span>
      <span>${escapeHtml(cur.toLocaleString())} → <strong>${escapeHtml(q.toLocaleString())}</strong> (${escapeHtml(deltaStr)}) · ${escapeHtml(t('skuDetail.adjust.previewNote'))}</span>
    </div>`;
}

// ─── delegated handlers ──────────────────────────────────
function handleInput(e) {
  const qtyEl = e.target.closest('[data-action="as-qty"]');
  if (qtyEl) {
    _state.adjustedQty = qtyEl.value;
    refreshPreviewInPlace();
    return;
  }
  const reasonEl = e.target.closest('[data-action="as-reason"]');
  if (reasonEl) {
    _state.reason = reasonEl.value;
  }
}

async function handleClick(e) {
  if (e.target.closest('[data-action="as-submit"]')) {
    await doSubmit();
    return;
  }
  if (e.target.closest('[data-action="as-close-success"]')) {
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

  const payload = {
    sku_id:       _state.skuId,
    section_id:   parseSectionId(_state.sectionId),
    adjusted_qty: parsedQty(),
    reason:       _state.reason.trim(),
  };

  try {
    const res = await _onSubmit(payload);
    _state.submitting = false;
    _state.submitted = true;
    _state.response = {
      ...(res?.data ?? {}),
      _displayName: _state.displayName,
    };
  } catch (err) {
    _state.submitting = false;
    const msg = err?.body?.message || err?.message || '';
    if (msg.includes('inbound')) {
      _state.error = t('skuDetail.adjust.errIncrease');
    } else if (msg.includes('배치 정보를 찾을 수 없습니다')) {
      _state.error = t('skuDetail.adjust.errNoDoc');
    } else {
      _state.error = msg || t('skuDetail.adjust.errSubmit');
    }
  }
  paintContent();
}

// ─── render ──────────────────────────────────────────────
function renderShell() {
  return `
    <div class="modal fade" id="${ADJUST_STOCK_MODAL_ID}" tabindex="-1"
         aria-labelledby="${ADJUST_STOCK_MODAL_ID}-title" aria-hidden="true">
      <div class="modal-dialog modal-dialog-centered">
        <div class="modal-content adjust-stock-modal" id="${ADJUST_STOCK_MODAL_ID}-content"></div>
      </div>
    </div>
  `;
}

function renderContent(state) {
  return `
    <div class="modal-header adjust-stock-header">
      <div>
        <h5 class="modal-title" id="${ADJUST_STOCK_MODAL_ID}-title">${escapeHtml(t('skuDetail.adjust.title'))}</h5>
        <p class="adjust-stock-subtitle">${escapeHtml(t('skuDetail.adjust.subtitle'))}</p>
      </div>
      <button type="button" class="btn-close"
              data-bs-dismiss="modal" aria-label="${escapeHtml(t('common.close'))}"
              ${state.submitting ? 'disabled' : ''}></button>
    </div>
    <div class="modal-body">
      ${state.submitted ? renderSuccess(state) : renderForm(state)}
    </div>
    <div class="modal-footer adjust-stock-footer">
      ${state.submitted ? renderSuccessFooter() : renderFormFooter(state)}
    </div>
  `;
}

function renderForm(state) {
  const unit = state.uom || t('skuDetail.adjust.unit');
  return `
    <p class="adjust-stock-sku">
      <code>${escapeHtml(state.skuId)}</code> · ${escapeHtml(state.displayName)}
    </p>
    <div class="adjust-stock-form">
      <div class="adjust-stock-field">
        <label class="adjust-stock-label">${escapeHtml(t('skuDetail.adjust.current'))}</label>
        <div class="adjust-stock-readonly">
          ${state.currentQty == null ? '—' : `<strong>${escapeHtml(state.currentQty.toLocaleString())}</strong> ${escapeHtml(unit)}`}
        </div>
      </div>

      <div class="adjust-stock-field${state.fieldErrors.adjustedQty ? ' has-error' : ''}">
        <label class="adjust-stock-label">${escapeHtml(t('skuDetail.adjust.newQty'))} *</label>
        <input type="number" min="0" step="1" data-action="as-qty"
               class="form-control"
               placeholder="${escapeHtml(t('skuDetail.adjust.newQtyPlaceholder'))}"
               value="${escapeHtml(state.adjustedQty)}"
               ${state.submitting ? 'disabled' : ''} />
        ${state.fieldErrors.adjustedQty ? `<div class="adjust-stock-error">${escapeHtml(state.fieldErrors.adjustedQty)}</div>` : ''}
      </div>

      <div class="adjust-stock-field${state.fieldErrors.reason ? ' has-error' : ''}">
        <label class="adjust-stock-label">${escapeHtml(t('skuDetail.adjust.reason'))} *</label>
        <input type="text" data-action="as-reason"
               class="form-control"
               placeholder="${escapeHtml(t('skuDetail.adjust.reasonPlaceholder'))}"
               value="${escapeHtml(state.reason)}"
               ${state.submitting ? 'disabled' : ''} />
        ${state.fieldErrors.reason ? `<div class="adjust-stock-error">${escapeHtml(state.fieldErrors.reason)}</div>` : ''}
      </div>

      <div data-as-preview>${renderPreviewInner()}</div>

      ${state.error ? `
        <div class="alert alert-danger py-2 mt-2 mb-0 small" role="alert">${escapeHtml(state.error)}</div>
      ` : ''}
    </div>
  `;
}

function renderFormFooter(state) {
  return `
    <button type="button" class="btn btn-outline-secondary"
            data-bs-dismiss="modal" ${state.submitting ? 'disabled' : ''}>
      ${escapeHtml(t('skuDetail.adjust.cancel'))}
    </button>
    <button type="button" class="btn btn-warning" data-action="as-submit"
            ${state.submitting ? 'disabled' : ''}>
      ${state.submitting ? `
        <span class="spinner-border spinner-border-sm me-1" role="status" aria-hidden="true"></span>
        ${escapeHtml(t('skuDetail.adjust.submitting'))}
      ` : escapeHtml(t('skuDetail.adjust.submit'))}
    </button>
  `;
}

function renderSuccess(state) {
  const r = state.response ?? {};
  const unit = state.uom || t('skuDetail.adjust.unit');
  return `
    <div class="adjust-stock-success">
      <span class="material-symbols-outlined adjust-stock-success-icon">check_circle</span>
      <div>
        <h4 class="adjust-stock-success-title">${escapeHtml(t('skuDetail.adjust.successTitle'))}</h4>
        <p class="text-muted small mb-2">${escapeHtml(t('skuDetail.adjust.successBody'))}</p>
        <dl class="adjust-stock-success-meta">
          <dt>${escapeHtml(t('skuDetail.adjust.fldSku'))}</dt>
          <dd>${escapeHtml(r.skuId ?? state.skuId)} · ${escapeHtml(r._displayName ?? state.displayName)}</dd>
          <dt>${escapeHtml(t('skuDetail.adjust.fldChange'))}</dt>
          <dd>${(r.beforeQty ?? 0).toLocaleString()} → <strong>${(r.afterQty ?? 0).toLocaleString()}</strong> ${escapeHtml(unit)}</dd>
        </dl>
      </div>
    </div>
  `;
}

function renderSuccessFooter() {
  return `
    <button type="button" class="btn btn-warning"
            data-action="as-close-success">${escapeHtml(t('skuDetail.adjust.ok'))}</button>
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
