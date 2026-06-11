/**
 * RefillRequestModal — 02-3 Refill Request Modal (self-contained 공통 모듈)
 * ─────────────────────────────────────────────────────────────
 * Layout 정합: docs/page_layout_outline.md §02-3
 * Backend: backend_inventory_request.md §3.4 (🟢 후순위, mock 시작)
 *
 * 라이프사이클:
 *   mountRefillModal({ onSubmit })  — body에 modal 1회 마운트 + Bootstrap modal 인스턴스 생성
 *   openRefillModal(items)          — items로 state 초기화 + show
 *   closeRefillModal()              — hide (선택, Bootstrap data-bs-dismiss로 대체 가능)
 *   unmountRefillModal()            — dispose + body에서 제거
 *
 * 페이지(SkuListPage / SkuDetailPage) 사용 패턴:
 *   mount() { mountRefillModal({ onSubmit: createRefillRequest }); }
 *   클릭 핸들러: if (refillBtn) openRefillModal(selectedItems());
 *   destroy() { unmountRefillModal(); }
 *
 * 정책 (layout_outline §02-3):
 *  - SKU List 다중 선택 + SKU Detail 단일 진입 같은 modal 공유
 *  - Suggested Qty = max(standardQty - currentQty, 0). 사용자가 수정 가능
 *  - submit 성공 시 toast X — 확인형 overlay (OK 눌러야 닫힘)
 *  - 모달이 열린 동안 backdrop은 static (외부 클릭 닫기 비활성)
 */

import { Modal as BootstrapModal } from 'bootstrap';
import { t, tf } from '../../core/i18n/index.js';

export const REFILL_MODAL_ID = 'refill-request-modal';

// ─── 모듈 내부 상태 ───────────────────────────────────────
let _container    = null;
let _modalEl      = null;
let _bsModal      = null;
let _onSubmit     = null;
let _clickHandler = null;
let _inputHandler = null;
let _state        = initialState([]);

// ─── public API ──────────────────────────────────────────
export function mountRefillModal({ onSubmit }) {
  if (_container) return;   // 이미 mount됨

  _onSubmit = onSubmit;

  _container = document.createElement('div');
  _container.id = `${REFILL_MODAL_ID}-host`;
  _container.innerHTML = renderShell();
  document.body.appendChild(_container);

  _modalEl = _container.querySelector(`#${REFILL_MODAL_ID}`);
  paintContent();

  _bsModal = new BootstrapModal(_modalEl);

  _clickHandler = (e) => handleClick(e);
  _container.addEventListener('click', _clickHandler);

  // C-10: 요청 수량 변경 감지 → 복원 버튼 활성/비활성 토글
  _inputHandler = (e) => handleInput(e);
  _container.addEventListener('input', _inputHandler);
}

export function unmountRefillModal() {
  if (!_container) return;
  if (_clickHandler) _container.removeEventListener('click', _clickHandler);
  if (_inputHandler) _container.removeEventListener('input', _inputHandler);
  _bsModal?.dispose();
  _container.remove();
  _container = _modalEl = _bsModal = _onSubmit = _clickHandler = _inputHandler = null;
  _state = initialState([]);
}

export function openRefillModal(items) {
  if (!_modalEl) return;
  _state = initialState(items);
  paintContent();
  _bsModal?.show();
}

export function closeRefillModal() {
  _bsModal?.hide();
}

// ─── 내부 ────────────────────────────────────────────────
function initialState(items) {
  return {
    items: items ?? [],
    submitting: false,
    submitted: false,
    error: null,
    response: null,
  };
}

function suggestedQty(item) {
  return Math.max((item.standardQty ?? 0) - (item.currentQty ?? 0), 0);
}

// 모든 선택 SKU 가 같은 section(=locationLabel) 이면 그 라벨 반환.
// 다중 section 이면 null — 모달 헤더 부제목 표시 여부 결정용.
function uniqueLocation(items) {
  if (!items || items.length === 0) return null;
  const set = new Set(items.map((i) => i.locationLabel).filter(Boolean));
  return set.size === 1 ? [...set][0] : null;
}

function paintContent() {
  if (!_modalEl) return;
  const inner = _modalEl.querySelector(`#${REFILL_MODAL_ID}-content`);
  if (inner) inner.innerHTML = renderContent(_state);
}

async function handleClick(e) {
  const submitBtn = e.target.closest('[data-action="refill-submit"]');
  if (submitBtn) {
    await doSubmit();
    return;
  }

  // C-10: 추천값 복원 버튼 — 입력값을 data-suggested-qty 로 되돌리고 버튼 비활성화
  const restoreBtn = e.target.closest('[data-action="refill-restore"]');
  if (restoreBtn) {
    const skuId = restoreBtn.dataset.skuId;
    const suggested = restoreBtn.dataset.suggestedQty;
    const input = _modalEl.querySelector(
      `input[data-action="refill-qty"][data-sku-id="${CSS.escape(skuId)}"]`,
    );
    if (input) {
      input.value = suggested;
      restoreBtn.classList.remove('is-active');
      restoreBtn.disabled = true;
    }
    return;
  }

  const closeSuccessBtn = e.target.closest('[data-action="refill-close-success"]');
  if (closeSuccessBtn) {
    _bsModal?.hide();
    // hide 애니메이션 끝난 후 state reset (overlay 깜빡임 방지)
    setTimeout(() => {
      _state = initialState([]);
      paintContent();
    }, 200);
    return;
  }
  // refill-close (Cancel / X) 버튼은 `data-bs-dismiss="modal"`로 Bootstrap 처리
}

// C-10: 입력값이 추천값과 다를 때 복원 버튼 활성화
// P-4: 사유 textarea auto-resize (rows=1 시작, 내용에 따라 늘어남)
function handleInput(e) {
  const input = e.target.closest('[data-action="refill-qty"]');
  if (input) {
    const suggested = input.dataset.suggestedQty;
    const row = input.closest('tr');
    const restoreBtn = row?.querySelector('[data-action="refill-restore"]');
    if (restoreBtn) {
      const isModified = String(input.value) !== String(suggested);
      restoreBtn.classList.toggle('is-active', isModified);
      restoreBtn.disabled = !isModified;
    }
    return;
  }

  const reason = e.target.closest('[data-action="refill-reason"]');
  if (reason) {
    reason.style.height = 'auto';
    reason.style.height = `${Math.min(reason.scrollHeight, 160)}px`;
  }
}

async function doSubmit() {
  if (_state.submitting || !_onSubmit) return;

  // 입력값을 DOM에서 직접 읽기 (state sync 없이도 동작 — 단순화)
  const qtyInputs = _modalEl.querySelectorAll('[data-action="refill-qty"]');
  const items = Array.from(qtyInputs).map((input) => ({
    sku_id:       input.dataset.skuId,
    requested_qty: Number(input.value) || 0,
  }));
  const reasonEl = _modalEl.querySelector('[data-action="refill-reason"]');
  const reason = reasonEl?.value?.trim() || undefined;

  // P-3: 모든 수량이 0이면 거절 (실수 보호)
  const totalQty = items.reduce((sum, it) => sum + it.requested_qty, 0);
  if (totalQty <= 0) {
    _state = { ..._state, error: t('refill.errAllZero') };
    paintContent();
    return;
  }

  _state = { ..._state, submitting: true, error: null };
  paintContent();

  try {
    const res = await _onSubmit({ items, reason });
    _state = {
      ..._state,
      submitting: false,
      submitted: true,
      response: res?.data ?? null,
    };
  } catch (err) {
    _state = {
      ..._state,
      submitting: false,
      error: err?.body?.message || err?.message || t('refill.submitFailed'),
    };
  }
  paintContent();
}

// ─── HTML 렌더 ────────────────────────────────────────────
function renderShell() {
  return `
    <div class="modal fade" id="${REFILL_MODAL_ID}" tabindex="-1"
         aria-labelledby="${REFILL_MODAL_ID}-title" aria-hidden="true">
      <div class="modal-dialog modal-lg modal-dialog-centered">
        <div class="modal-content" id="${REFILL_MODAL_ID}-content"></div>
      </div>
    </div>
  `;
}

function renderContent(state) {
  const { submitted, items } = state;
  const location = uniqueLocation(items);
  return `
    <div class="modal-header">
      <div>
        <h5 class="modal-title mb-0" id="${REFILL_MODAL_ID}-title">
          ${escapeHtml(submitted ? t('refill.titleSubmitted') : t('refill.title'))}
          ${!submitted && items.length > 0
            ? `<span class="badge rounded-pill text-bg-secondary ms-2 align-middle refill-modal-chip">
                  ${escapeHtml(tf('refill.selectedCount', { n: items.length }))}
                </span>`
            : ''}
        </h5>
        ${location && !submitted
          ? `<small class="text-muted">${escapeHtml(location)}</small>`
          : ''}
      </div>
      <button type="button" class="btn-close"
              data-action="refill-close" data-bs-dismiss="modal"
              aria-label="${escapeHtml(t('common.close'))}"
              ${state.submitting ? 'disabled' : ''}></button>
    </div>
    <div class="modal-body">
      ${submitted ? renderSuccess(state) : renderForm(state)}
    </div>
    <div class="modal-footer">
      ${submitted ? renderSuccessFooter() : renderFormFooter(state)}
    </div>
  `;
}

function renderForm(state) {
  const { items, error } = state;

  if (!items.length) {
    return `<div class="text-muted small">${escapeHtml(t('refill.empty'))}</div>`;
  }

  return `
    <p class="text-muted small mb-3">${t('refill.suggestedNote')}</p>

    <div class="refill-modal-items">
      <table class="refill-modal-table">
        <thead>
          <tr>
            <th>${escapeHtml(t('refill.col.sku'))}</th>
            <th>${escapeHtml(t('refill.col.location'))}</th>
            <th class="text-end">${escapeHtml(t('refill.col.current'))}</th>
            <th class="text-end">${escapeHtml(t('refill.col.standard'))}</th>
            <th class="text-end">${escapeHtml(t('refill.col.shortage'))}</th>
            <th class="text-end refill-qty-col">${escapeHtml(t('refill.col.requestQty'))}</th>
          </tr>
        </thead>
        <tbody>
          ${items.map(refillRow).join('')}
        </tbody>
      </table>
    </div>

    <div class="mt-3">
      <label for="refill-reason" class="form-label small fw-semibold">${escapeHtml(t('refill.reason'))}</label>
      <textarea id="refill-reason"
                data-action="refill-reason"
                class="form-control form-control-sm refill-reason-textarea"
                rows="1"
                placeholder="${escapeHtml(t('refill.reasonPlaceholder'))}"
                ${state.submitting ? 'disabled' : ''}></textarea>
    </div>

    ${error ? `
      <div class="alert alert-danger py-2 mt-3 mb-0 small" role="alert">
        ${escapeHtml(error)}
      </div>
    ` : ''}
  `;
}

function refillRow(item) {
  const shortage = suggestedQty(item);
  return `
    <tr>
      <td>
        <div class="refill-modal-sku-name">${escapeHtml(item.displayName)}</div>
        <div class="refill-modal-sku-id">${escapeHtml(item.skuId)}</div>
      </td>
      <td class="text-muted small">${escapeHtml(item.locationLabel ?? '—')}</td>
      <td class="text-end">${(item.currentQty ?? 0).toLocaleString()}</td>
      <td class="text-end">${(item.standardQty ?? 0).toLocaleString()}</td>
      <td class="text-end refill-shortage-cell ${shortage > 0 ? 'is-short' : ''}">
        ${shortage > 0 ? `−${shortage.toLocaleString()}` : '—'}
      </td>
      <td class="text-end refill-qty-col">
        <div class="refill-qty-wrap">
          <button type="button"
                  class="refill-qty-restore"
                  data-action="refill-restore"
                  data-sku-id="${escapeHtml(item.skuId)}"
                  data-suggested-qty="${shortage}"
                  title="${escapeHtml(tf('refill.restore.tooltip', { n: shortage }))}"
                  aria-label="${escapeHtml(t('refill.restore.aria'))}"
                  disabled>
            <span class="material-symbols-outlined">restart_alt</span>
          </button>
          <div class="input-group input-group-sm refill-qty-group">
            <input type="number" min="0" step="1"
                   class="form-control form-control-sm refill-qty-input"
                   data-action="refill-qty"
                   data-sku-id="${escapeHtml(item.skuId)}"
                   data-suggested-qty="${shortage}"
                   value="${shortage}"
                   aria-label="${escapeHtml(tf('refill.reqQtyAria', { skuId: item.skuId }))}" />
            <span class="input-group-text">${escapeHtml(t('refill.unit'))}</span>
          </div>
        </div>
      </td>
    </tr>
  `;
}

function renderFormFooter(state) {
  return `
    <button type="button" class="btn btn-outline-secondary"
            data-action="refill-close" data-bs-dismiss="modal"
            ${state.submitting ? 'disabled' : ''}>${escapeHtml(t('refill.cancel'))}</button>
    <button type="button" class="btn btn-danger"
            data-action="refill-submit"
            ${state.submitting || state.items.length === 0 ? 'disabled' : ''}>
      ${state.submitting ? `
        <span class="spinner-border spinner-border-sm me-1" role="status" aria-hidden="true"></span>
        ${escapeHtml(t('refill.submitting'))}
      ` : escapeHtml(t('refill.submit'))}
    </button>
  `;
}

function renderSuccess(state) {
  const r = state.response ?? {};
  return `
    <div class="refill-modal-success">
      <span class="material-symbols-outlined refill-modal-success-icon">check_circle</span>
      <div>
        <h4 class="refill-modal-success-title">${escapeHtml(t('refill.success.title'))}</h4>
        <p class="text-muted small mb-1">${escapeHtml(t('refill.success.body'))}</p>
        ${r.refillRequestId ? `
          <dl class="refill-modal-success-meta">
            <dt>${escapeHtml(t('refill.success.requestId'))}</dt><dd><code>${escapeHtml(r.refillRequestId)}</code></dd>
            <dt>${escapeHtml(t('refill.success.items'))}</dt>     <dd>${r.itemsCount ?? state.items.length}</dd>
            <dt>${escapeHtml(t('refill.success.submitted'))}</dt> <dd>${formatDateTime(r.submittedAt)}</dd>
          </dl>
        ` : ''}
      </div>
    </div>
  `;
}

function renderSuccessFooter() {
  return `
    <button type="button" class="btn btn-danger"
            data-action="refill-close-success">${escapeHtml(t('refill.success.ok'))}</button>
  `;
}

// ─── helpers ─────────────────────────────────────────────
function formatDateTime(s) {
  if (!s) return '—';
  const d = new Date(s);
  if (Number.isNaN(d.getTime())) return '—';
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())} ${pad2(d.getHours())}:${pad2(d.getMinutes())}`;
}

function pad2(n) { return n < 10 ? `0${n}` : `${n}`; }

function escapeHtml(s) {
  if (s == null) return '';
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}
