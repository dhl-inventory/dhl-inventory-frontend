/**
 * CompanyManagementPage — 11 Company Management (단일 페이지)
 * ─────────────────────────────────────────────────────────────
 * 11은 pending §2.29 Post-MVP. MVP는 mock-first read-only.
 * 설계 경위/결정: bk_agent_working.md §74 (B = 헤더 스위처 단일 페이지).
 *
 * 화면 구조 (1 라우트 /companies, super_admin 전용):
 *   ┌─ 페이지 제목 ───────────────────────────────────────────┐
 *   │  Company 헤더 카드 (DHL · site-001 · Active · +Add)     │ 11-1
 *   ├──────────────────────────────────────────────────────┤
 *   │  [ Scope Structure ] [ Operators ]   ← nav tabs       │
 *   │   · Scope: Warehouse → Zone (read) + Edit Structure   │ 11-2
 *   │   · Operators: Name / Role / Scope (read) + 10 링크   │ 11-3
 *   └──────────────────────────────────────────────────────┘
 *
 * read 전용 — 편집(Add Company / Edit Structure)은 backend scope/company
 *   CRUD 부재로 Post-MVP. 클릭 시 Phase 6 showToast 안내(파괴 동작 0).
 *   운영자 권한 편집의 진실원천은 10 User Management (spec §15) — 링크만.
 */

import { appStore } from '../../store/appStore.js';
import { t } from '../../core/i18n/index.js';
import { fetchCompanyOverview } from '../../api/companyApi.js';
import { showToast } from '../common/Toast.js';

const ROOT_ID = 'company-mgmt-root';

export default function CompanyManagementPage() {
  let unsubApp = null;
  let clickHandler = null;
  const state = { loading: true, error: null, data: null, tab: 'scope' };

  function rerender() { render(state); }

  async function load() {
    state.loading = true;
    state.error = null;
    rerender();
    try {
      const res = await fetchCompanyOverview();
      state.data = res.data;
    } catch (err) {
      state.error = err?.message || t('common.error');
    } finally {
      state.loading = false;
      rerender();
    }
  }

  return {
    html: `<section id="${ROOT_ID}" class="container py-4"></section>`,

    mount() {
      unsubApp = appStore.subscribe(rerender);   // lang 변경 자동 리렌더
      const root = document.getElementById(ROOT_ID);

      clickHandler = (e) => {
        const tabBtn = e.target.closest('[data-action="company-tab"]');
        if (tabBtn) {
          state.tab = tabBtn.dataset.tab === 'operators' ? 'operators' : 'scope';
          rerender();
          return;
        }
        const editBtn = e.target.closest('[data-action="edit-structure"]');
        if (editBtn) {
          showToast({
            title:   t('companies.toast.title'),
            message: t('companies.toast.editStructure'),
            severity: 'info',
          });
          return;
        }
        const addBtn = e.target.closest('[data-action="add-company"]');
        if (addBtn) {
          showToast({
            title:   t('companies.toast.title'),
            message: t('companies.toast.addCompany'),
            severity: 'info',
          });
          return;
        }
      };
      root?.addEventListener('click', clickHandler);

      load();
    },

    destroy() {
      unsubApp?.();
      unsubApp = null;
      const root = document.getElementById(ROOT_ID);
      if (root && clickHandler) root.removeEventListener('click', clickHandler);
      clickHandler = null;
    },
  };
}

// ─── render ──────────────────────────────────────────────
function render(state) {
  const root = document.getElementById(ROOT_ID);
  if (!root) return;

  root.innerHTML = `
    <header class="mb-3">
      <h1 class="h3 fw-bold mb-1">${escapeHtml(t('companies.title'))}</h1>
      <p class="text-muted small mb-0">${escapeHtml(t('companies.subtitle'))}</p>
    </header>
    ${
      state.error
        ? `<div class="alert alert-danger">${escapeHtml(state.error)}</div>`
        : state.loading
          ? `<div class="d-flex align-items-center py-5 justify-content-center text-muted">
               <div class="spinner-border text-warning me-2" role="status"></div>
               ${escapeHtml(t('companies.loading'))}
             </div>`
          : renderBody(state)
    }
  `;
}

function renderBody(state) {
  const d = state.data || {};
  return `
    ${renderCompanyCard(d.company)}
    <ul class="nav nav-tabs mt-3">
      ${tab('scope', t('companies.tab.scope'), state.tab)}
      ${tab('operators', t('companies.tab.operators'), state.tab)}
    </ul>
    <div class="card border-top-0 rounded-0 rounded-bottom">
      <div class="card-body">
        ${state.tab === 'operators' ? renderOperators(d.operators) : renderScope(d.warehouses)}
      </div>
    </div>
  `;
}

function tab(key, label, active) {
  return `
    <li class="nav-item">
      <button type="button"
              class="nav-link ${active === key ? 'active' : ''}"
              data-action="company-tab" data-tab="${key}">
        ${escapeHtml(label)}
      </button>
    </li>
  `;
}

// ─── 11-1 Company 헤더 카드 ──────────────────────────────
function renderCompanyCard(company) {
  const c = company || {};
  const statusKey = `companies.status.${c.status || 'active'}`;
  const statusLabel = t(statusKey) === statusKey ? (c.status || '') : t(statusKey);
  return `
    <div class="card">
      <div class="card-body d-flex align-items-center justify-content-between flex-wrap gap-2">
        <div class="d-flex align-items-center gap-3">
          <span class="material-symbols-outlined fs-2 text-secondary">apartment</span>
          <div>
            <div class="fw-bold fs-5">${escapeHtml(c.companyName || '—')}</div>
            <div class="text-muted small">
              ${escapeHtml(c.siteId || '')}
              <span class="badge bg-success-subtle text-success-emphasis ms-2">${escapeHtml(statusLabel)}</span>
            </div>
          </div>
        </div>
        <button type="button" class="btn btn-outline-secondary btn-sm" data-action="add-company">
          <span class="material-symbols-outlined align-middle me-1">add</span>
          ${escapeHtml(t('companies.addCompany'))}
        </button>
      </div>
    </div>
  `;
}

// ─── 11-2 Scope Structure (Warehouse → Zone, read) ──────
//   warehouses[] 복수 전제. 1개면 1블록(현행과 동일), 복수면 블록 반복.
function renderScope(warehouses) {
  const list = Array.isArray(warehouses) ? warehouses : [];
  return `
    <div class="d-flex justify-content-between align-items-start mb-3">
      <h2 class="h6 fw-bold mb-0">${escapeHtml(t('companies.scope.title'))}</h2>
      <button type="button" class="btn btn-outline-secondary btn-sm" data-action="edit-structure">
        <span class="material-symbols-outlined align-middle me-1">edit</span>
        ${escapeHtml(t('companies.scope.editStructure'))}
      </button>
    </div>
    ${
      list.length === 0
        ? `<span class="text-muted small">—</span>`
        : list.map(warehouseBlock).join('')
    }
    <p class="text-muted small mb-0 mt-3">${escapeHtml(t('companies.scope.note'))}</p>
  `;
}

function warehouseBlock(w) {
  const zoneList = Array.isArray(w.zones) ? w.zones : [];
  return `
    <div class="mb-3">
      <div class="mb-2">
        <span class="material-symbols-outlined align-middle me-1 text-secondary">warehouse</span>
        <span class="fw-semibold">${escapeHtml(w.warehouseName || w.warehouseId || '—')}</span>
        <span class="text-muted small ms-1">(${escapeHtml(w.warehouseId || '')})</span>
      </div>
      <div class="ms-4 d-flex flex-wrap gap-2">
        ${
          zoneList.length === 0
            ? `<span class="text-muted small">—</span>`
            : zoneList.map((z) => `<span class="badge bg-light text-dark border">${escapeHtml(z.zoneName || z.zoneId)}</span>`).join('')
        }
      </div>
    </div>
  `;
}

// ─── 11-3 Operators (Name / Role / Scope, read) ─────────
function renderOperators(operators) {
  const ops = Array.isArray(operators) ? operators : [];
  if (ops.length === 0) {
    return `<div class="text-muted text-center py-4">${escapeHtml(t('companies.operators.empty'))}</div>`;
  }
  return `
    <div class="table-responsive">
      <table class="table table-sm align-middle mb-2">
        <thead>
          <tr>
            <th>${escapeHtml(t('companies.operators.colName'))}</th>
            <th>${escapeHtml(t('companies.operators.colRole'))}</th>
            <th>${escapeHtml(t('companies.operators.colScope'))}</th>
          </tr>
        </thead>
        <tbody>
          ${ops.map(operatorRow).join('')}
        </tbody>
      </table>
    </div>
    <div class="d-flex align-items-center justify-content-between flex-wrap gap-2">
      <span class="text-muted small">
        <span class="material-symbols-outlined align-middle me-1">info</span>
        ${escapeHtml(t('companies.operators.hint'))}
      </span>
      <a class="btn btn-sm btn-link" href="#/users">
        ${escapeHtml(t('companies.operators.openUserMgmt'))}
      </a>
    </div>
  `;
}

function operatorRow(op) {
  const roleKey = `users.roleFilter.${op.role}`;
  const roleLabel = t(roleKey) === roleKey ? (op.role || '') : t(roleKey);
  // scope = warehouse 단위 그룹. 1개면 단일 그룹(현행과 동일 표시), 복수면 창고별.
  const scope = Array.isArray(op.scope) ? op.scope : [];
  const scopeCell = scope.length === 0
    ? '<span class="text-muted">—</span>'
    : scope.map((s) => {
        const wh = `<span class="badge bg-secondary-subtle text-secondary-emphasis border me-1">${escapeHtml(s.warehouseId || '')}</span>`;
        const zs = (Array.isArray(s.zones) ? s.zones : [])
          .map((z) => `<span class="badge bg-light text-dark border me-1">${escapeHtml(z)}</span>`)
          .join('');
        return `<span class="d-inline-flex flex-wrap align-items-center me-3 mb-1">${wh}${zs}</span>`;
      }).join('');
  return `
    <tr>
      <td>${escapeHtml(op.username || '—')}</td>
      <td>${escapeHtml(roleLabel)}</td>
      <td>${scopeCell}</td>
    </tr>
  `;
}

// ─── helper ──────────────────────────────────────────────
function escapeHtml(s) {
  if (s == null) return '';
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}
