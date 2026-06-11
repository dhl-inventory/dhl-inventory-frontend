/**
 * AlertDetailModal — 05 Alert List 의 alert 상세 모달
 * ─────────────────────────────────────────────────────────────
 * Layout: docs/page_layout_outline.md §10
 * 정책 정합: ADR-019
 *
 * 라이프사이클 (RefillRequestModal 패턴):
 *   mountAlertDetailModal()        — body에 modal 1회 마운트 + store subscribe
 *   openAlertDetailModal(alertId)  — alertId 보관 + show
 *   closeAlertDetailModal()        — hide (선택)
 *   unmountAlertDetailModal()      — dispose + body에서 제거 + unsubscribe
 *
 * 동작:
 *   - modal은 alertsStore를 subscribe해서 표시 중인 alertId의 현재 상태(items 안)와
 *     transitioningId를 자동 반영.
 *   - status 전이 버튼 클릭 → alertsStore.transitionStatus(id, next) → 자동 paint.
 *
 * 표시 정보:
 *   - Type category (4종 + 원본 alert_type subtitle)
 *   - Severity / Status (enum 의미 한 줄 설명)
 *   - title / message (자유 텍스트 — backend 그대로)
 *   - Location: zone / section / slot
 *   - SKU / Batch / 수량 / 만료 등 target dict 전체
 *   - 발생 시각 (절대 + 상대)
 */

import { Modal as BootstrapModal } from 'bootstrap';
import { alertsStore } from '../../store/alertsStore.js';
import { t as i18nT, tf as i18nTf } from '../../core/i18n/index.js';
import { alertDisplay } from './alertDisplay.js';
import {
  ALERT_TYPE_CATEGORY,
  CATEGORY_META,
  SEVERITY_META,
  STATUS_META,
  STATUS_TRANSITIONS,
  ALERT_TYPE_LABEL,
  ALERT_TYPE_DESCRIPTION,
} from './alertConstants.js';

export const ALERT_DETAIL_MODAL_ID = 'alert-detail-modal';

let _container = null;
let _modalEl   = null;
let _bsModal   = null;
let _unsub     = null;
let _clickHandler = null;
let _currentAlertId = null;

export function mountAlertDetailModal() {
  if (_container) return;

  _container = document.createElement('div');
  _container.id = `${ALERT_DETAIL_MODAL_ID}-host`;
  _container.innerHTML = renderShell();
  document.body.appendChild(_container);

  _modalEl = _container.querySelector(`#${ALERT_DETAIL_MODAL_ID}`);
  paintContent();

  _bsModal = new BootstrapModal(_modalEl);

  _clickHandler = (e) => handleClick(e);
  _container.addEventListener('click', _clickHandler);

  _unsub = alertsStore.subscribe(() => {
    if (_currentAlertId) paintContent();
  });
}

export function unmountAlertDetailModal() {
  if (!_container) return;
  if (_clickHandler) _container.removeEventListener('click', _clickHandler);
  _unsub?.();
  _bsModal?.dispose();
  _container.remove();
  _container = _modalEl = _bsModal = _clickHandler = _unsub = null;
  _currentAlertId = null;
}

export function openAlertDetailModal(alertId) {
  if (!_modalEl) return;
  _currentAlertId = alertId;
  paintContent();
  _bsModal?.show();
}

export function closeAlertDetailModal() {
  _bsModal?.hide();
  _currentAlertId = null;
}

function handleClick(e) {
  const transBtn = e.target.closest('[data-action="modal-transition"]');
  if (transBtn) {
    const id   = transBtn.dataset.id;
    const next = transBtn.dataset.status;
    if (id && next) alertsStore.transitionStatus(id, next);
    return;
  }
  // SKU Detail 링크 — modal hide 완료 후 hash 변경 (backdrop 잔존 / router race 방지)
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
    return;
  }
  // 닫기 X 버튼 / Close 버튼은 data-bs-dismiss="modal"로 처리
}

function paintContent() {
  if (!_modalEl) return;
  const inner = _modalEl.querySelector(`#${ALERT_DETAIL_MODAL_ID}-content`);
  if (!inner) return;

  const state = alertsStore.getState();
  const alert = _currentAlertId
    ? state.list.items.find((a) => a.alertId === _currentAlertId)
    : null;
  const isTransitioning = state.transitioningId === _currentAlertId;

  inner.innerHTML = renderContent(alert, isTransitioning);
}

// ─── render ──────────────────────────────────────────────
function renderShell() {
  return `
    <div class="modal fade" id="${ALERT_DETAIL_MODAL_ID}" tabindex="-1"
         aria-labelledby="${ALERT_DETAIL_MODAL_ID}-title" aria-hidden="true">
      <div class="modal-dialog modal-lg modal-dialog-centered">
        <div class="modal-content" id="${ALERT_DETAIL_MODAL_ID}-content"></div>
      </div>
    </div>
  `;
}

function renderContent(a, isTransitioning) {
  if (!a) {
    return `
      <div class="modal-header">
        <h5 class="modal-title">${escapeHtml(i18nT('alertDetail.title'))}</h5>
        <button type="button" class="btn-close" data-bs-dismiss="modal" aria-label="${escapeHtml(i18nT('common.close'))}"></button>
      </div>
      <div class="modal-body text-muted">
        ${escapeHtml(i18nT('alertDetail.notFound'))}
      </div>
    `;
  }

  const disp = alertDisplay(a);
  const categoryId = ALERT_TYPE_CATEGORY[a.alertType] ?? 'stock_shortage';
  const cat = CATEGORY_META[categoryId];
  const sev = SEVERITY_META[a.severity] ?? SEVERITY_META.info;
  const st  = STATUS_META[a.status]    ?? STATUS_META.pending;
  const targ = a.target ?? {};
  const transitions = STATUS_TRANSITIONS[a.status] ?? [];

  // i18n 라벨 사용 (lang 변경 자동 번역)
  const categoryLabel  = i18nT('alertList.category.' + categoryId);
  const statusLabel    = i18nT('alert.status.' + a.status);
  const severityLabel  = i18nT('alert.severity.' + a.severity);
  const alertTypeLabel = ALERT_TYPE_LABEL[a.alertType] ?? a.alertType;
  const alertTypeDesc  = ALERT_TYPE_DESCRIPTION[a.alertType] ?? '';

  return `
    <div class="modal-header alert-modal-header alert-modal-header-${categoryId}">
      <div class="d-flex align-items-center gap-2">
        <span class="material-symbols-outlined alert-modal-icon" aria-hidden="true">${cat.icon}</span>
        <div>
          <div class="alert-modal-eyebrow">${escapeHtml(categoryLabel)}</div>
          <h5 class="modal-title mb-0" id="${ALERT_DETAIL_MODAL_ID}-title">
            ${escapeHtml(disp.title)}
          </h5>
        </div>
      </div>
      <button type="button" class="btn-close" data-bs-dismiss="modal" aria-label="${escapeHtml(i18nT('common.close'))}"></button>
    </div>

    <div class="modal-body alert-modal-body">
      <div class="alert-modal-badges">
        <span class="badge ${st.badge}">${escapeHtml(statusLabel)}</span>
        <span class="badge ${sev.badge}">${escapeHtml(severityLabel)}</span>
      </div>

      <p class="alert-modal-message">${escapeHtml(disp.message)}</p>

      <div class="alert-modal-meta-row">
        <span class="badge bg-light text-dark alert-modal-type-badge">${escapeHtml(alertTypeLabel)}</span>
        <span class="alert-modal-meta-desc text-muted small">${escapeHtml(alertTypeDesc)}</span>
      </div>

      <hr>

      <dl class="alert-modal-grid">
        ${renderField(i18nT('alertDetail.field.location'), [targ.zoneName, targ.sectionName].filter(Boolean).join(' / '))}
        ${renderField(i18nT('alertDetail.field.slot'), targ.slotId)}
        ${targ.displayName
          ? renderField(i18nT('alertDetail.field.sku'), `${escapeHtml(targ.displayName)} <span class="text-muted small">(${escapeHtml(targ.skuId ?? '')})</span>`, { html: true })
          : ''}
        ${targ.currentQty != null || targ.standardQty != null
          ? renderField(i18nT('alertDetail.field.stock'), `${targ.currentQty ?? '—'} / ${targ.standardQty ?? '—'}${
              targ.capacityRate != null ? ` <span class="text-muted small">(${Math.round(targ.capacityRate * 100)}%)</span>` : ''
            }`, { html: true })
          : ''}
        ${renderField(i18nT('alertDetail.field.batch'), targ.batchId)}
        ${targ.daysRemaining != null ? renderField(i18nT('alertDetail.field.daysRemaining'), `${targ.daysRemaining}${i18nT('alertDetail.daysSuffix')}`) : ''}
        ${renderField(i18nT('alertDetail.field.expiry'), targ.expiryDate)}
        ${renderField(i18nT('alertDetail.field.fefoViolated'), targ.violatedBatchId)}
        ${renderField(i18nT('alertDetail.field.fefoPicked'),   targ.pickedBatchId)}
        ${renderField(i18nT('alertDetail.field.created'), `${formatDateTime(a.createdAt)} <span class="text-muted small">(${escapeHtml(formatRelative(a.createdAt))})</span>`, { html: true })}
      </dl>

      ${targ.snapshotUrl
        ? `<figure class="alert-modal-snapshot mt-3">
            <figcaption class="alert-modal-snapshot-cap">${escapeHtml(i18nT('alertDetail.field.snapshot'))}</figcaption>
            <img class="alert-modal-snapshot-img" src="${escapeHtml(targ.snapshotUrl)}"
                 alt="${escapeHtml(i18nT('alertDetail.field.snapshot'))}" loading="lazy">
          </figure>`
        : ''}

      ${targ.skuId
        ? `<div class="alert-modal-links mt-3">
            <a href="#/inventory/sku-detail?id=${encodeURIComponent(targ.skuId)}"
               data-action="open-sku-detail" data-sku-id="${escapeHtml(targ.skuId)}">
              ${escapeHtml(i18nT('alertDetail.viewSku'))}
            </a>
          </div>`
        : ''}
    </div>

    <div class="modal-footer alert-modal-footer">
      ${transitions.length === 0
        ? `<span class="text-muted small me-auto">${escapeHtml(i18nT('alertDetail.noTransitions'))}</span>`
        : `<span class="text-muted small me-auto">${escapeHtml(i18nT('alertDetail.changeStatus'))}</span>`}
      <button type="button" class="btn btn-outline-secondary" data-bs-dismiss="modal" ${isTransitioning ? 'disabled' : ''}>
        ${escapeHtml(i18nT('alertDetail.close'))}
      </button>
      ${transitions.map((next) => {
        const nextLabel = i18nT('alert.status.' + next);
        return `
        <button
          type="button"
          class="btn ${next === 'cancelled' ? 'btn-outline-danger' : next === 'completed' ? 'btn-success' : 'btn-warning'}"
          data-action="modal-transition"
          data-id="${escapeHtml(a.alertId)}"
          data-status="${next}"
          ${isTransitioning ? 'disabled' : ''}
        >
          ${isTransitioning ? escapeHtml(i18nT('alertDetail.saving')) : escapeHtml(i18nTf('alertDetail.markAs', { status: nextLabel }))}
        </button>
      `;
      }).join('')}
    </div>
  `;
}

function renderField(label, value, opts = {}) {
  if (value == null || value === '') return '';
  return `
    <dt>${escapeHtml(label)}</dt>
    <dd>${opts.html ? value : escapeHtml(String(value))}</dd>
  `;
}

// ─── helpers ────────────────────────────────────────────
function formatDateTime(iso) {
  if (!iso) return '—';
  const d = new Date(iso);
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())} ${pad2(d.getHours())}:${pad2(d.getMinutes())}`;
}

function formatRelative(iso) {
  if (!iso) return '—';
  const diff = Date.now() - new Date(iso).getTime();
  const min = Math.floor(diff / 60000);
  if (min < 1)  return i18nT('alertList.relative.justNow');
  if (min < 60) return i18nTf('alertList.relative.minutes', { n: min });
  const hr = Math.floor(min / 60);
  if (hr < 24)  return i18nTf('alertList.relative.hours', { n: hr });
  const day = Math.floor(hr / 24);
  return i18nTf('alertList.relative.days', { n: day });
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
