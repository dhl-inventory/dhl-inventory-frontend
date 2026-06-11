/**
 * RefillRequestsModal — 07 Operational Stats "Field Requests" 인박스 (읽기 전용 목록)
 * ─────────────────────────────────────────────────────────────
 * Backend: `GET /inventory/refill-requests` (`backend/app/api/v1/inventory.py:198`)
 *   query: status(콤마 다중), page, limit. site_id 는 JWT 자동 스코프.
 *   응답(toCamel 후): { items:[{requestId, skuId, displayName, requestedQty,
 *     reason, status, requestedBy, requestedAt, handledBy, handledAt}], totalCount }
 *   결정 근거: pending_design_decisions.md §2.15 (backend 구현됨 → 실데이터 연동)
 *
 * 라이프사이클 (AdjustStockModal 패턴 동일):
 *   mountRefillRequestsModal({ onFetch })  — body에 modal 1회 마운트
 *   openRefillRequestsModal()              — 열면서 현재 status로 fetch
 *   closeRefillRequestsModal()
 *   unmountRefillRequestsModal()
 *
 * 정책: 읽기 전용 (MVP). 처리(handle) 액션은 Post-MVP. 기본 status='pending'.
 */

import { Modal as BootstrapModal } from 'bootstrap';
import { t } from '../../core/i18n/index.js';

export const REFILL_REQUESTS_MODAL_ID = 'refill-requests-modal';

let _container    = null;
let _modalEl      = null;
let _bsModal      = null;
let _onFetch      = null;
let _clickHandler = null;
let _state        = initialState();

function initialState() {
  return {
    status:     'pending',   // 'pending' | 'handled' | 'all'
    loading:    false,
    error:      null,
    items:      [],
    totalCount: 0,
  };
}

export function mountRefillRequestsModal({ onFetch }) {
  if (_container) return;
  _onFetch = onFetch;

  _container = document.createElement('div');
  _container.id = `${REFILL_REQUESTS_MODAL_ID}-host`;
  _container.innerHTML = renderShell();
  document.body.appendChild(_container);

  _modalEl = _container.querySelector(`#${REFILL_REQUESTS_MODAL_ID}`);
  paintContent();

  _bsModal = new BootstrapModal(_modalEl);

  _clickHandler = (e) => handleClick(e);
  _container.addEventListener('click', _clickHandler);
}

export function unmountRefillRequestsModal() {
  if (!_container) return;
  if (_clickHandler) _container.removeEventListener('click', _clickHandler);
  _bsModal?.dispose();
  _container.remove();
  _container = _modalEl = _bsModal = _onFetch = null;
  _clickHandler = null;
  _state = initialState();
}

export function openRefillRequestsModal() {
  if (!_modalEl) return;
  _state = initialState();
  paintContent();
  _bsModal?.show();
  load();
}

export function closeRefillRequestsModal() {
  _bsModal?.hide();
}

// ─── 내부 ────────────────────────────────────────────────
function paintContent() {
  if (!_modalEl) return;
  const inner = _modalEl.querySelector(`#${REFILL_REQUESTS_MODAL_ID}-content`);
  if (inner) inner.innerHTML = renderContent(_state);
}

async function load() {
  if (!_onFetch) return;
  _state.loading = true;
  _state.error = null;
  paintContent();

  const params = { page: 1, limit: 100 };
  if (_state.status !== 'all') params.status = _state.status;

  try {
    const res = await _onFetch(params);
    const d = res?.data ?? {};
    _state.items = Array.isArray(d.items) ? d.items : [];
    _state.totalCount = Number(d.totalCount ?? _state.items.length);
    _state.loading = false;
  } catch (err) {
    _state.loading = false;
    _state.error = err?.body?.message || err?.message || t('opStats.refillInbox.error');
  }
  paintContent();
}

function handleClick(e) {
  const chip = e.target.closest('[data-rr-status]');
  if (chip) {
    const next = chip.dataset.rrStatus;
    if (next && next !== _state.status) {
      _state.status = next;
      load();
    }
    return;
  }
}

// ─── render ──────────────────────────────────────────────
function renderShell() {
  return `
    <div class="modal fade" id="${REFILL_REQUESTS_MODAL_ID}" tabindex="-1"
         aria-labelledby="${REFILL_REQUESTS_MODAL_ID}-title" aria-hidden="true">
      <div class="modal-dialog modal-lg modal-dialog-centered modal-dialog-scrollable">
        <div class="modal-content refill-requests-modal" id="${REFILL_REQUESTS_MODAL_ID}-content"></div>
      </div>
    </div>
  `;
}

function renderContent(state) {
  return `
    <div class="modal-header">
      <div>
        <h5 class="modal-title" id="${REFILL_REQUESTS_MODAL_ID}-title">${escapeHtml(t('opStats.refillInbox.title'))}</h5>
        <p class="text-muted small mb-0">${escapeHtml(t('opStats.refillInbox.subtitle'))}</p>
      </div>
      <button type="button" class="btn-close" data-bs-dismiss="modal"
              aria-label="${escapeHtml(t('common.close'))}"></button>
    </div>
    <div class="modal-body">
      ${renderFilter(state)}
      ${renderBody(state)}
    </div>
    <div class="modal-footer">
      <span class="text-muted small me-auto">${escapeHtml(t('opStats.refillInbox.total').replace('{n}', String(state.totalCount)))}</span>
      <button type="button" class="btn btn-outline-secondary" data-bs-dismiss="modal">
        ${escapeHtml(t('opStats.refillInbox.close'))}
      </button>
    </div>
  `;
}

function renderFilter(state) {
  const chip = (key, label) => `
    <button type="button"
            class="btn btn-sm ${state.status === key ? 'btn-warning' : 'btn-outline-secondary'}"
            data-rr-status="${key}" ${state.loading ? 'disabled' : ''}>
      ${escapeHtml(label)}
    </button>`;
  return `
    <div class="refill-requests-filter btn-group btn-group-sm mb-3" role="group">
      ${chip('pending', t('opStats.refillInbox.filter.pending'))}
      ${chip('handled', t('opStats.refillInbox.filter.handled'))}
      ${chip('all',     t('opStats.refillInbox.filter.all'))}
    </div>
  `;
}

function renderBody(state) {
  if (state.loading) {
    return `
      <div class="text-center text-muted py-5">
        <span class="spinner-border spinner-border-sm me-2" role="status" aria-hidden="true"></span>
        ${escapeHtml(t('opStats.refillInbox.loading'))}
      </div>`;
  }
  if (state.error) {
    return `<div class="alert alert-danger py-2 mb-0 small" role="alert">${escapeHtml(state.error)}</div>`;
  }
  if (state.items.length === 0) {
    return `<div class="text-center text-muted py-5">${escapeHtml(t('opStats.refillInbox.empty'))}</div>`;
  }
  return `
    <div class="table-responsive">
      <table class="table table-sm align-middle mb-0">
        <thead>
          <tr>
            <th>${escapeHtml(t('opStats.refillInbox.col.sku'))}</th>
            <th class="text-end">${escapeHtml(t('opStats.refillInbox.col.qty'))}</th>
            <th>${escapeHtml(t('opStats.refillInbox.col.reason'))}</th>
            <th>${escapeHtml(t('opStats.refillInbox.col.requestedBy'))}</th>
            <th>${escapeHtml(t('opStats.refillInbox.col.requestedAt'))}</th>
            <th>${escapeHtml(t('opStats.refillInbox.col.status'))}</th>
          </tr>
        </thead>
        <tbody>
          ${state.items.map(renderRow).join('')}
        </tbody>
      </table>
    </div>
  `;
}

function renderRow(r) {
  return `
    <tr>
      <td>
        <div class="fw-semibold">${escapeHtml(r.displayName ?? '')}</div>
        <code class="small text-muted">${escapeHtml(r.skuId ?? '')}</code>
      </td>
      <td class="text-end">${escapeHtml(String(r.requestedQty ?? ''))}</td>
      <td class="small">${escapeHtml(r.reason ?? '—')}</td>
      <td class="small">${escapeHtml(r.requestedBy ?? '—')}</td>
      <td class="small">${escapeHtml(fmtDate(r.requestedAt))}</td>
      <td>${renderStatusBadge(r.status)}</td>
    </tr>
  `;
}

function renderStatusBadge(status) {
  const label = t(`opStats.refillInbox.status.${status}`);
  const text = label && !label.startsWith('opStats.') ? label : (status ?? '—');
  const cls = status === 'handled' ? 'bg-secondary' : 'bg-warning text-dark';
  return `<span class="badge ${cls}">${escapeHtml(text)}</span>`;
}

// ─── helpers ─────────────────────────────────────────────
function fmtDate(iso) {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return String(iso);
  return d.toLocaleString();
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
