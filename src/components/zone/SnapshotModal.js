/**
 * SnapshotModal — 03-3 Section Detail Recent Events snapshot 미리보기 (self-contained)
 * ─────────────────────────────────────────────────────────────
 * 합의: docs/architecture/api_feedback/agreements/backend_snapshot_agreements.md §2
 *
 * 라이프사이클 (RefillRequestModal 패턴 동일):
 *   mountSnapshotModal()        — body에 modal 1회 마운트 + Bootstrap 인스턴스
 *   openSnapshotModal(eventId)  — show + 그 시점 lazy fetch (presigned URL 1h 만료 회피)
 *   closeSnapshotModal()        — hide
 *   unmountSnapshotModal()      — dispose + 제거
 *
 * 정책:
 *  - eye 버튼은 scan_id 있는 event 만 렌더(SectionDetailPage). 본 모달은 그 event 의 snapshot 표시.
 *  - lazy fetch: open 시점에 fetchEventSnapshots 호출 (eager 금지 — presigned URL 1h 만료).
 *  - snapshots:[] (수동 이벤트 / 이미지 미존재) → "이미지 없음" 안전 표시 (backend 안전 빈배열 응답 대응).
 *  - backdrop static (외부 클릭 닫기 비활성), 1장 기준 여러 장이면 세로 나열.
 */

import { Modal as BootstrapModal } from 'bootstrap';
import { t } from '../../core/i18n/index.js';
import { fetchEventSnapshots } from '../../api/zoneApi.js';

export const SNAPSHOT_MODAL_ID = 'snapshot-preview-modal';

let _container    = null;
let _modalEl      = null;
let _bsModal      = null;
let _clickHandler = null;
let _reqSeq       = 0;   // 연속 오픈 시 stale 응답 무시용
let _state        = initialState();

function initialState() {
  return { loading: false, eventId: null, snapshots: [], error: null };
}

// ─── public API ──────────────────────────────────────────
export function mountSnapshotModal() {
  if (_container) return;

  _container = document.createElement('div');
  _container.id = `${SNAPSHOT_MODAL_ID}-host`;
  _container.innerHTML = renderShell();
  document.body.appendChild(_container);

  _modalEl = _container.querySelector(`#${SNAPSHOT_MODAL_ID}`);
  paintContent();
  _bsModal = new BootstrapModal(_modalEl);

  _clickHandler = (e) => handleClick(e);
  _container.addEventListener('click', _clickHandler);

  // 다른 모달 위에 열릴 때 z-index reset (다음 단독 오픈 대비)
  _modalEl.addEventListener('hidden.bs.modal', () => {
    _modalEl.style.zIndex = '';
  });
}

export function unmountSnapshotModal() {
  if (!_container) return;
  if (_clickHandler) _container.removeEventListener('click', _clickHandler);
  _bsModal?.dispose();
  _container.remove();
  _container = _modalEl = _bsModal = _clickHandler = null;
  _state = initialState();
}

export async function openSnapshotModal(eventId) {
  if (!_modalEl || !eventId) return;
  const seq = ++_reqSeq;
  _state = { loading: true, eventId, snapshots: [], error: null };
  paintContent();
  _bsModal?.show();

  // 다른 모달 위에 열린 경우 z-index bump — Bootstrap 5는 stacked modal 자동 처리 안 함
  // (이 모달은 SectionEventsModal 의 snapshot 버튼에서 호출됨)
  requestAnimationFrame(() => {
    const visibleModals = document.querySelectorAll('.modal.show');
    if (visibleModals.length > 1) {
      _modalEl.style.zIndex = '1070';
      const backdrops = document.querySelectorAll('.modal-backdrop.show');
      const last = backdrops[backdrops.length - 1];
      if (last) last.style.zIndex = '1065';
    } else {
      _modalEl.style.zIndex = '';
    }
  });

  try {
    const res = await fetchEventSnapshots(eventId);
    if (seq !== _reqSeq) return;   // 다른 event 로 다시 열렸으면 stale 무시
    _state = {
      loading: false,
      eventId,
      snapshots: res?.data?.snapshots ?? [],
      error: null,
    };
  } catch (err) {
    if (seq !== _reqSeq) return;
    _state = {
      loading: false,
      eventId,
      snapshots: [],
      error: err?.body?.message || err?.message || t('common.error'),
    };
  }
  paintContent();
}

export function closeSnapshotModal() {
  _bsModal?.hide();
}

// ─── 내부 ────────────────────────────────────────────────
function handleClick(e) {
  // 닫기는 data-bs-dismiss="modal" 로 Bootstrap 처리. 별도 핸들 불필요.
  void e;
}

function paintContent() {
  if (!_modalEl) return;
  const inner = _modalEl.querySelector(`#${SNAPSHOT_MODAL_ID}-content`);
  if (inner) inner.innerHTML = renderContent(_state);
}

function renderShell() {
  return `
    <div class="modal fade" id="${SNAPSHOT_MODAL_ID}" tabindex="-1"
         aria-labelledby="${SNAPSHOT_MODAL_ID}-title" aria-hidden="true"
         data-bs-backdrop="static">
      <div class="modal-dialog modal-lg modal-dialog-centered">
        <div class="modal-content" id="${SNAPSHOT_MODAL_ID}-content"></div>
      </div>
    </div>
  `;
}

function renderContent(state) {
  return `
    <div class="modal-header">
      <h5 class="modal-title" id="${SNAPSHOT_MODAL_ID}-title">
        ${escapeHtml(t('sectionDetail.snapshot.title'))}
      </h5>
      <button type="button" class="btn-close"
              data-bs-dismiss="modal"
              aria-label="${escapeHtml(t('common.close'))}"></button>
    </div>
    <div class="modal-body snapshot-modal-body">
      ${renderBody(state)}
    </div>
    <div class="modal-footer">
      <button type="button" class="btn btn-outline-secondary"
              data-bs-dismiss="modal">${escapeHtml(t('common.close'))}</button>
    </div>
  `;
}

function renderBody(state) {
  if (state.loading) {
    return `
      <div class="snapshot-modal-status">
        <div class="spinner-border text-warning" role="status" aria-hidden="true"></div>
        <span class="ms-2 text-muted">${escapeHtml(t('sectionDetail.snapshot.loading'))}</span>
      </div>
    `;
  }
  if (state.error) {
    return `
      <div class="alert alert-danger py-2 mb-0 small" role="alert">
        ${escapeHtml(state.error)}
      </div>
    `;
  }
  if (!state.snapshots.length) {
    return `
      <div class="snapshot-modal-status text-muted">
        <span class="material-symbols-outlined" aria-hidden="true">image_not_supported</span>
        <span class="ms-2">${escapeHtml(t('sectionDetail.snapshot.empty'))}</span>
      </div>
    `;
  }
  return state.snapshots.map(renderSnapshot).join('');
}

function renderSnapshot(snap) {
  const meta = [
    snap.capturedAt ? formatDateTime(snap.capturedAt) : null,
    snap.fileSizeKb != null ? `${snap.fileSizeKb} KB` : null,
  ].filter(Boolean).join(' · ');
  return `
    <figure class="snapshot-modal-figure">
      <img src="${escapeHtml(snap.presignedUrl ?? '')}"
           alt="${escapeHtml(t('sectionDetail.snapshot.title'))}"
           class="snapshot-modal-img" loading="lazy" />
      ${meta ? `<figcaption class="snapshot-modal-caption text-muted small">${escapeHtml(meta)}</figcaption>` : ''}
    </figure>
  `;
}

// ─── helpers ─────────────────────────────────────────────
function formatDateTime(s) {
  if (!s) return '';
  const d = new Date(s);
  if (Number.isNaN(d.getTime())) return '';
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
