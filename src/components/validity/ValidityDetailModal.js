/**
 * ValidityDetailModal — 04 Validity Tracking row 상세 modal (view-only)
 * ─────────────────────────────────────────────────────────────
 * Layout: docs/page_layout_outline.md §9 ("MVP 상세는 view-only modal")
 * 자세한 설계:
 *  - row 기본 정보 + read_method / OCR 근거 / snapshot / scan time / FEFO 신호
 *  - 수정/보정 기능은 Post-MVP (본 modal에 포함 안 함)
 *
 * 라이프사이클 (AlertDetailModal 패턴):
 *   mountValidityDetailModal()       — body에 modal 1회 마운트 + store subscribe
 *   openValidityDetailModal(batchId) — batchId 보관 + show
 *   unmountValidityDetailModal()     — dispose
 */

import { Modal as BootstrapModal } from 'bootstrap';
import { validityStore } from '../../store/validityStore.js';
import { t } from '../../core/i18n/index.js';

export const VALIDITY_DETAIL_MODAL_ID = 'validity-detail-modal';

// status 라벨/설명은 i18n으로 lookup (lang 변경 자동 번역). badge class만 정적.
const STATUS_BADGE = {
  expired:  'bg-danger',
  critical: 'bg-danger',
  warning:  'bg-warning text-dark',
  normal:   'bg-success',
};

let _container = null;
let _modalEl   = null;
let _bsModal   = null;
let _unsub     = null;
let _clickHandler = null;
let _currentBatchId = null;

export function mountValidityDetailModal() {
  if (_container) return;

  _container = document.createElement('div');
  _container.id = `${VALIDITY_DETAIL_MODAL_ID}-host`;
  _container.innerHTML = renderShell();
  document.body.appendChild(_container);

  _modalEl = _container.querySelector(`#${VALIDITY_DETAIL_MODAL_ID}`);
  paintContent();

  _bsModal = new BootstrapModal(_modalEl);

  _unsub = validityStore.subscribe(() => {
    if (_currentBatchId) paintContent();
  });

  // SKU Detail 링크 — modal hide 완료 후 hash 변경 (backdrop 잔존 / router race 방지)
  _clickHandler = (e) => {
    const skuLink = e.target.closest('[data-action="open-sku-detail"]');
    if (skuLink) {
      e.preventDefault();
      const skuId = skuLink.dataset.skuId;
      if (!skuId) return;
      const onHidden = () => {
        window.location.hash = '#/inventory/sku-detail?id=' + encodeURIComponent(skuId);
      };
      _modalEl.addEventListener('hidden.bs.modal', onHidden, { once: true });
      _bsModal?.hide();
    }
  };
  _container.addEventListener('click', _clickHandler);

  _modalEl.addEventListener('hidden.bs.modal', () => {
    _currentBatchId = null;
    validityStore.clearSelected();
  });
}

export function unmountValidityDetailModal() {
  if (!_container) return;
  if (_clickHandler) _container.removeEventListener('click', _clickHandler);
  _unsub?.();
  _bsModal?.dispose();
  _container.remove();
  _container = _modalEl = _bsModal = _unsub = _clickHandler = null;
  _currentBatchId = null;
}

export function openValidityDetailModal(batchId) {
  if (!_modalEl) return;
  _currentBatchId = batchId;
  validityStore.selectBatch(batchId);
  paintContent();
  _bsModal?.show();
}

function paintContent() {
  if (!_modalEl) return;
  const inner = _modalEl.querySelector(`#${VALIDITY_DETAIL_MODAL_ID}-content`);
  if (!inner) return;

  const state = validityStore.getState();
  const batch = _currentBatchId
    ? state.list.items.find((b) => b.batchId === _currentBatchId)
    : null;

  inner.innerHTML = renderContent(batch);
}

function renderShell() {
  return `
    <div class="modal fade" id="${VALIDITY_DETAIL_MODAL_ID}" tabindex="-1"
         aria-labelledby="${VALIDITY_DETAIL_MODAL_ID}-title" aria-hidden="true">
      <div class="modal-dialog modal-lg modal-dialog-centered">
        <div class="modal-content" id="${VALIDITY_DETAIL_MODAL_ID}-content"></div>
      </div>
    </div>
  `;
}

function renderContent(b) {
  if (!b) {
    return `
      <div class="modal-header">
        <h5 class="modal-title">${escapeHtml(t('validityDetail.titleFallback'))}</h5>
        <button type="button" class="btn-close" data-bs-dismiss="modal" aria-label="${escapeHtml(t('common.close'))}"></button>
      </div>
      <div class="modal-body text-muted">${escapeHtml(t('validityDetail.notFound'))}</div>
    `;
  }

  const badge = STATUS_BADGE[b.status] ?? STATUS_BADGE.normal;
  const statusLabel = t('validity.status.' + b.status);
  const statusDesc  = t('validityDetail.statusDesc.' + b.status);
  const dDay = b.daysRemaining > 0
    ? `D-${b.daysRemaining}`
    : b.daysRemaining === 0 ? t('validityDetail.dDay.today') : `D+${Math.abs(b.daysRemaining)} ${t('validityDetail.dDay.expiredSuffix')}`;

  return `
    <div class="modal-header validity-modal-header">
      <div>
        <div class="validity-modal-eyebrow">${escapeHtml(b.skuId ?? '')}</div>
        <h5 class="modal-title mb-0" id="${VALIDITY_DETAIL_MODAL_ID}-title">${escapeHtml(b.displayName ?? '')}</h5>
      </div>
      <button type="button" class="btn-close" data-bs-dismiss="modal" aria-label="${escapeHtml(t('common.close'))}"></button>
    </div>

    <div class="modal-body validity-modal-body">
      <div class="validity-modal-badges">
        <span class="badge ${badge}">${escapeHtml(statusLabel)}</span>
        ${b.fefoViolation ? `<span class="badge validity-fefo-badge">${escapeHtml(t('validityDetail.fefoBadge'))}</span>` : ''}
        <span class="text-muted small ms-2">${escapeHtml(statusDesc)}</span>
      </div>

      <dl class="validity-modal-grid">
        <dt>${escapeHtml(t('validityDetail.field.batch'))}</dt>      <dd>${escapeHtml(b.batchId ?? '—')}</dd>
        <dt>${escapeHtml(t('validityDetail.field.expiry'))}</dt>     <dd>${escapeHtml(b.expiryDate ?? '—')} <span class="text-muted small">(${escapeHtml(dDay)})</span></dd>
        <dt>${escapeHtml(t('validityDetail.field.quantity'))}</dt>   <dd>${b.qty ?? '—'} ${escapeHtml(t('validityDetail.units'))}</dd>
        <dt>${escapeHtml(t('validityDetail.field.location'))}</dt>   <dd>${escapeHtml(b.zoneName ?? '—')} / ${escapeHtml(b.sectionName ?? '—')}</dd>
        <dt>${escapeHtml(t('validityDetail.field.readMethod'))}</dt> <dd>${escapeHtml(b.readMethod ?? '—')}</dd>
        <dt>${escapeHtml(t('validityDetail.field.scanId'))}</dt>     <dd><code>${escapeHtml(b.scanId ?? '—')}</code></dd>
      </dl>

      ${b.fefoViolation
        ? `<div class="alert alert-danger small mt-3 mb-0">${t('validityDetail.fefoViolationAlert')}</div>`
        : ''}

      <div class="validity-modal-links mt-3">
        ${b.skuId
          ? `<a href="#/inventory/sku-detail?id=${encodeURIComponent(b.skuId)}"
                data-action="open-sku-detail" data-sku-id="${escapeHtml(b.skuId)}">${escapeHtml(t('validityDetail.viewSku'))}</a>`
          : ''}
      </div>
    </div>

    <div class="modal-footer">
      <button type="button" class="btn btn-outline-secondary" data-bs-dismiss="modal">${escapeHtml(t('validityDetail.close'))}</button>
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
