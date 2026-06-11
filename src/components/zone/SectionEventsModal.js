/**
 * SectionEventsModal — 03-3 Section Detail "View all events" 모달
 * ─────────────────────────────────────────────────────────────
 * BE `GET /inventory/events?section_id=&page=&limit=` 그대로 사용 (limit 기본 20, max 100).
 * BE 응답 InventoryEventsResponse: { items, total_count, page, limit } 미러.
 *
 * 라이프사이클 (PasswordChangeModal/TempPasswordModal 패턴):
 *   mountSectionEventsModal()
 *   openSectionEventsModal({ zoneId, sectionId })
 *   closeSectionEventsModal()
 *   unmountSectionEventsModal()
 *
 * 정책:
 *  - 컬럼: 시간(MM-DD HH:MM) / 이벤트 / SKU / 변화 / Snapshot — Section Detail 표와 동일
 *  - Snapshot 버튼은 SectionDetailPage 에서 mount 한 SnapshotModal 을 재호출 (이중 마운트 X)
 *  - lang 토글 시 race-defense (startLang 캡처)
 */

import { Modal as BootstrapModal } from 'bootstrap';
import { fetchSectionEvents } from '../../api/zoneApi.js';
import { t, tf } from '../../core/i18n/index.js';
import { appStore } from '../../store/appStore.js';
import { formatMonthDayHM } from '../../core/format.js';
import { openSnapshotModal } from './SnapshotModal.js';

export const SECTION_EVENTS_MODAL_ID = 'section-events-modal';
const DEFAULT_LIMIT = 10;   // 모달 viewport 스크롤 없이 한 페이지 표시 가능한 행 수

let _container    = null;
let _modalEl      = null;
let _bsModal      = null;
let _clickHandler = null;
let _unsubApp     = null;
let _state        = initialState();

function initialState() {
  return {
    zoneId:      null,
    sectionId:   null,
    page:        1,
    limit:       DEFAULT_LIMIT,
    isLoading:   false,
    error:       null,
    items:       [],
    totalCount:  0,
  };
}

// ─── public API ──────────────────────────────────────────
export function mountSectionEventsModal() {
  if (_container) return;

  _container = document.createElement('div');
  _container.id = `${SECTION_EVENTS_MODAL_ID}-host`;
  _container.innerHTML = renderShell();
  document.body.appendChild(_container);

  _modalEl = _container.querySelector(`#${SECTION_EVENTS_MODAL_ID}`);
  paintContent();

  _bsModal = new BootstrapModal(_modalEl);

  _clickHandler = (e) => handleClick(e);
  _container.addEventListener('click', _clickHandler);

  _modalEl.addEventListener('hidden.bs.modal', () => {
    _state = initialState();
    paintContent();
  });

  // lang 변경 시 모달이 열려 있으면 새 Accept-Language 로 재요청 + repaint
  _unsubApp = appStore.subscribe(() => {
    paintContent();
    if (_state.sectionId != null && _modalEl?.classList.contains('show')) {
      fetchData();
    }
  });
}

export function unmountSectionEventsModal() {
  if (!_container) return;
  if (_clickHandler) _container.removeEventListener('click', _clickHandler);
  _unsubApp?.();
  _bsModal?.dispose();
  _container.remove();
  _container = _modalEl = _bsModal = _clickHandler = _unsubApp = null;
  _state = initialState();
}

export function openSectionEventsModal({ zoneId, sectionId } = {}) {
  if (!_modalEl || sectionId == null) return;
  _state = { ...initialState(), zoneId, sectionId };
  paintContent();
  _bsModal?.show();
  fetchData();
}

export function closeSectionEventsModal() {
  _bsModal?.hide();
}

// ─── 내부 ────────────────────────────────────────────────
function paintContent() {
  if (!_modalEl) return;
  const inner = _modalEl.querySelector(`#${SECTION_EVENTS_MODAL_ID}-content`);
  if (inner) inner.innerHTML = renderContent(_state);
}

async function fetchData() {
  const { sectionId, page, limit } = _state;
  if (sectionId == null) return;

  const startLang = appStore.getState().lang;
  _state.isLoading = true;
  _state.error = null;
  paintContent();

  try {
    const res = await fetchSectionEvents(sectionId, { page, limit });
    if (appStore.getState().lang !== startLang) return;   // lang 바뀜 → 응답 폐기
    const data = res?.data ?? {};
    _state.isLoading  = false;
    _state.items      = data.items ?? [];
    _state.totalCount = data.totalCount ?? data.total_count ?? 0;
  } catch (err) {
    if (appStore.getState().lang !== startLang) return;
    _state.isLoading = false;
    _state.error = err?.body?.message ?? err?.message ?? t('sectionDetail.events.error');
  }
  paintContent();
}

function handleClick(e) {
  const prevBtn = e.target.closest('[data-action="events-page-prev"]');
  if (prevBtn) {
    if (_state.page > 1 && !_state.isLoading) {
      _state.page -= 1;
      fetchData();
    }
    return;
  }
  const nextBtn = e.target.closest('[data-action="events-page-next"]');
  if (nextBtn) {
    const totalPages = Math.max(1, Math.ceil(_state.totalCount / _state.limit));
    if (_state.page < totalPages && !_state.isLoading) {
      _state.page += 1;
      fetchData();
    }
    return;
  }
  const snapBtn = e.target.closest('[data-action="view-snapshot"]');
  if (snapBtn) {
    const eid = snapBtn.dataset.eventId;
    if (eid) openSnapshotModal(eid);
    return;
  }
}

// ─── HTML 렌더 ────────────────────────────────────────────
function renderShell() {
  return `
    <div class="modal fade" id="${SECTION_EVENTS_MODAL_ID}" tabindex="-1"
         aria-labelledby="${SECTION_EVENTS_MODAL_ID}-title" aria-hidden="true">
      <div class="modal-dialog modal-lg modal-dialog-centered">
        <div class="modal-content" id="${SECTION_EVENTS_MODAL_ID}-content"></div>
      </div>
    </div>
  `;
}

function renderContent(state) {
  return `
    <div class="modal-header">
      <h5 class="modal-title" id="${SECTION_EVENTS_MODAL_ID}-title">
        ${escapeHtml(t('sectionDetail.events.modal.title'))}
      </h5>
      <button type="button" class="btn-close" data-bs-dismiss="modal"
              aria-label="${escapeHtml(t('common.close'))}"></button>
    </div>
    <div class="modal-body">
      ${renderBody(state)}
    </div>
    <div class="modal-footer justify-content-between">
      ${renderPagination(state)}
    </div>
  `;
}

function renderBody(state) {
  if (state.isLoading && state.items.length === 0) {
    return `<div class="text-muted py-3 text-center">
      <span class="spinner-border spinner-border-sm me-2" role="status"></span>
      ${escapeHtml(t('sectionDetail.events.loading'))}
    </div>`;
  }
  if (state.error) {
    return `<div class="alert alert-danger small mb-0">${escapeHtml(state.error)}</div>`;
  }
  if (state.items.length === 0) {
    return `<div class="text-muted py-4 text-center">
      <span class="material-symbols-outlined d-block mb-2" style="font-size:2rem;opacity:.4;">history</span>
      ${escapeHtml(t('sectionDetail.events.empty'))}
    </div>`;
  }
  return `
    <table class="section-detail-events-table">
      <thead>
        <tr>
          <th>${escapeHtml(t('sectionDetail.events.col.time'))}</th>
          <th>${escapeHtml(t('sectionDetail.events.col.event'))}</th>
          <th>${escapeHtml(t('sectionDetail.events.col.sku'))}</th>
          <th>${escapeHtml(t('sectionDetail.events.col.change'))}</th>
          <th>${escapeHtml(t('sectionDetail.events.col.action'))}</th>
        </tr>
      </thead>
      <tbody>
        ${state.items.map(renderRow).join('')}
      </tbody>
    </table>
  `;
}

function renderRow(event) {
  const delta = event.qtyDelta ?? event.deltaQty ?? event.qty_delta ?? event.delta_qty ?? 0;
  const occurred = event.occurredAt ?? event.createdAt ?? event.occurred_at ?? event.created_at;
  const sid = event.skuId ?? event.sku_id;
  const label = event.displayName ?? event.display_name ?? sid ?? t('sectionDetail.events.multiple');
  const skuCell = sid
    ? `<a href="#/inventory/sku-detail?id=${encodeURIComponent(sid)}">${escapeHtml(label)}</a>`
    : escapeHtml(label);
  const scanId = event.scanId ?? event.scan_id;
  const eventId = event.eventId ?? event.event_id ?? '';
  return `
    <tr>
      <td>${escapeHtml(formatMonthDayHM(occurred))}</td>
      <td>${escapeHtml(getEventLabel(event.eventType ?? event.event_type))}</td>
      <td>${skuCell}</td>
      <td>${delta > 0 ? '+' : ''}${Number(delta).toLocaleString()}</td>
      <td>
        ${scanId != null ? `
          <button type="button" class="section-detail-icon-btn"
                  data-action="view-snapshot"
                  data-event-id="${escapeHtml(eventId)}"
                  aria-label="${escapeHtml(t('sectionDetail.events.viewSnapshot'))}">
            <span class="material-symbols-outlined" aria-hidden="true">visibility</span>
          </button>
        ` : ''}
      </td>
    </tr>
  `;
}

function getEventLabel(evType) {
  const known = ['picking', 'replenishment'];
  return known.includes(evType) ? t('sectionDetail.events.type.' + evType) : (evType ?? '—');
}

function renderPagination(state) {
  const totalPages = Math.max(1, Math.ceil(state.totalCount / state.limit));
  const atFirst = state.page <= 1;
  const atLast  = state.page >= totalPages;
  return `
    <button type="button" class="btn btn-outline-secondary btn-sm"
            data-action="events-page-prev" ${atFirst || state.isLoading ? 'disabled' : ''}>
      ${escapeHtml(t('common.prev'))}
    </button>
    <span class="small text-muted">
      ${escapeHtml(tf('common.pageOf', { page: state.page, total: totalPages }))}
    </span>
    <button type="button" class="btn btn-outline-secondary btn-sm"
            data-action="events-page-next" ${atLast || state.isLoading ? 'disabled' : ''}>
      ${escapeHtml(t('common.next'))}
    </button>
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
