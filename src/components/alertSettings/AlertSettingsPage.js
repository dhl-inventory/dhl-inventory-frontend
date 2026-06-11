/**
 * AlertSettingsPage — 06 Alert Settings
 * ─────────────────────────────────────────────────────────────
 * Backend 정합 (2026-05-14):
 *   - GET   /admin/capacity-settings           → SKU별 standard_qty
 *   - PATCH /admin/capacity-settings           → standard_qty 편집
 *   - GET   /alerts/settings                   → alert_type별 rule
 *   - PATCH /alerts/settings/{alert_type}      → is_active / threshold_value 편집
 *
 * Layout (wireframe 06_alert_settings 확정본 — 2026-05-15):
 *   ┌─ Header (title + Updated) ─────────────────────────────┐
 *   ├─ Grid (좌우 2열) ──────────────────────────────────────┤
 *   │  [Stock Thresholds (내부 스크롤 + sticky thead)]       │
 *   │      SKU / Current / STANDARD QTY (edit) / Trigger     │
 *   │  [Alert Rules (4 카드 세로 스택)]                       │
 *   │      severity icon + Title + toggle / threshold / chips │
 *   ├─ Footer (sticky bottom) ───────────────────────────────┤
 *   │  unsaved 상태 + Reset / Save (save icon)               │
 *   └────────────────────────────────────────────────────────┘
 *
 * 정책:
 *  - UI 표기는 "Standard"(영문) / "기준 수량"(한국어). 내부 baseline 혼용 OK.
 *  - Trigger Rule은 read-only trend-down + "Below standard" — Post-MVP.
 *  - Action channels는 disabled chip placeholder — Post-MVP.
 *  - 글로벌 Save: store가 draft Map 순차 PATCH.
 *  - 글로벌 Reset: draft Map만 비움 → 입력값은 마지막 fetch 응답으로 재페인트.
 *  - lang 변경 시 자동 re-render (appStore subscribe).
 */

import { alertSettingsStore } from '../../store/alertSettingsStore.js';
import { appStore } from '../../store/appStore.js';
import { t, tf } from '../../core/i18n/index.js';

const ROOT_ID = 'alert-settings-root';

// 4 rule 메타 — ADR-019 정합. 표시 문구는 i18n 키 기반.
const RULE_META = {
  stock_shortage: {
    icon: 'warning',
    iconStyle: 'active',
    min: 1, max: 100, step: 1,
  },
  validity_risk: {
    icon: 'hourglass_empty',
    iconStyle: 'neutral',
    min: 1, max: 365, step: 1,
  },
  device_issue: {
    icon: 'wifi_off',
    iconStyle: 'active',
    min: 1, max: 120, step: 1,
  },
  abnormal_access: {
    icon: 'lock',
    iconStyle: 'neutral',
    min: 1, max: 50, step: 1,
  },
};

export default function AlertSettingsPage() {
  let unsubStore    = null;
  let unsubApp      = null;
  let inputHandler  = null;
  let changeHandler = null;
  let clickHandler  = null;

  return {
    html: `<section id="${ROOT_ID}" class="alert-settings-page"></section>`,

    mount() {
      const rerender = () => render(alertSettingsStore.getState());
      unsubStore = alertSettingsStore.subscribe(rerender);
      // lang 변경 시 UI 즉시 갱신 + BE 데이터 새 Accept-Language 로 재요청
      unsubApp   = appStore.subscribe(() => { rerender(); alertSettingsStore.fetchAll(); });
      rerender();

      const root = document.getElementById(ROOT_ID);

      inputHandler = (e) => {
        const stdInput = e.target.closest('[data-action="edit-standard"]');
        if (stdInput) {
          const skuId = stdInput.dataset.id;
          if (skuId) alertSettingsStore.setThresholdDraft(skuId, stdInput.value);
          return;
        }
        const ruleInput = e.target.closest('[data-action="edit-rule-threshold"]');
        if (ruleInput) {
          const alertType = ruleInput.dataset.id;
          if (alertType) alertSettingsStore.setRuleDraft(alertType, {
            thresholdValue: Number(ruleInput.value),
          });
        }
      };
      root?.addEventListener('input', inputHandler);

      changeHandler = (e) => {
        const toggle = e.target.closest('[data-action="toggle-rule"]');
        if (toggle) {
          const alertType = toggle.dataset.id;
          if (alertType) alertSettingsStore.setRuleDraft(alertType, {
            isActive: toggle.checked,
          });
        }
      };
      root?.addEventListener('change', changeHandler);

      clickHandler = async (e) => {
        const saveBtn = e.target.closest('[data-action="save-all"]');
        if (saveBtn) {
          await alertSettingsStore.saveAll();
          return;
        }
        const resetBtn = e.target.closest('[data-action="reset-all"]');
        if (resetBtn) {
          alertSettingsStore.resetAll();
          return;
        }
      };
      root?.addEventListener('click', clickHandler);

      alertSettingsStore.fetchAll();
    },

    destroy() {
      unsubStore?.();
      unsubApp?.();
      unsubStore = unsubApp = null;
      const root = document.getElementById(ROOT_ID);
      if (root) {
        if (inputHandler)  root.removeEventListener('input',  inputHandler);
        if (changeHandler) root.removeEventListener('change', changeHandler);
        if (clickHandler)  root.removeEventListener('click',  clickHandler);
      }
      inputHandler = changeHandler = clickHandler = null;
      alertSettingsStore.reset();
    },
  };
}

// ─── render ──────────────────────────────────────────────
function render(state) {
  const root = document.getElementById(ROOT_ID);
  if (!root) return;

  const { isLoading, error, receivedAt, thresholds, rules } = state;
  const hasData = thresholds.length > 0 || rules.length > 0;

  root.innerHTML = `
    <header class="alert-settings-header">
      <div>
        <h1 class="h3 fw-bold mb-0">${escapeHtml(t('alertSettings.title'))}</h1>
        <p class="text-muted small mb-0">${escapeHtml(t('alertSettings.subtitle'))}</p>
      </div>
      <span class="alert-settings-updated text-muted small">
        ${receivedAt ? `${escapeHtml(t('header.updated'))} ${formatHM(receivedAt)}` : ''}
      </span>
    </header>

    ${error
      ? renderError(error)
      : isLoading && !hasData
        ? renderLoading()
        : hasData
          ? renderBody(state)
          : renderEmptyState('inventory_2', 'alertSettings.empty')}
  `;
}

function renderLoading() {
  return `
    <div class="alert-settings-loading">
      <div class="spinner-border text-warning" role="status"></div>
      <span class="ms-2 text-muted">${escapeHtml(t('alertSettings.loading'))}</span>
    </div>
  `;
}

function renderError(err) {
  return `
    <div class="alert alert-danger m-4" role="alert">
      <strong>${escapeHtml(t('alertSettings.errorTitle'))}</strong>
      <div class="small mt-1">${escapeHtml(err?.message ?? t('alertSettings.errorUnknown'))}</div>
    </div>
  `;
}

// 빈 상태 공용 — 다른 페이지(SectionDetail/ZoneDetail/ZoneOverview)와 동일 패턴
function renderEmptyState(icon, i18nKey) {
  return `
    <div class="text-center text-muted py-4">
      <span class="material-symbols-outlined d-block mb-2" style="font-size:2rem;opacity:0.4;">${icon}</span>
      <div class="small">${escapeHtml(t(i18nKey))}</div>
    </div>
  `;
}

function renderBody(state) {
  const { thresholds, rules, draftThresholds, draftRules, isSaving, saveError } = state;

  return `
    <div class="alert-settings-grid">
      <section class="alert-settings-section alert-settings-thresholds-section">
        <header class="alert-settings-section-header">
          <h2 class="h5 fw-bold mb-0">${escapeHtml(t('alertSettings.thresholds.title'))}</h2>
        </header>
        ${renderThresholdsTable(thresholds, draftThresholds)}
      </section>

      <section class="alert-settings-section alert-settings-rules-section">
        <header class="alert-settings-section-header">
          <h2 class="h5 fw-bold mb-0">${escapeHtml(t('alertSettings.rules.title'))}</h2>
        </header>
        ${renderRulesGrid(rules, draftRules)}
      </section>
    </div>

    ${renderFooter(state, isSaving, saveError)}
  `;
}

function renderThresholdsTable(rows, draftThresholds) {
  if (rows.length === 0) {
    return `<div class="text-muted text-center py-4">${escapeHtml(t('alertSettings.thresholds.empty'))}</div>`;
  }
  return `
    <div class="alert-settings-thresholds-scroll">
      <table class="alert-settings-table">
        <thead>
          <tr>
            <th>${escapeHtml(t('alertSettings.thresholds.col.sku'))}</th>
            <th>${escapeHtml(t('alertSettings.thresholds.col.productName'))}</th>
            <th class="text-end">${escapeHtml(t('alertSettings.thresholds.col.currentQty'))}</th>
            <th class="text-end">${escapeHtml(t('alertSettings.thresholds.col.standardQty'))}</th>
            <th>${escapeHtml(t('alertSettings.thresholds.col.triggerRule'))}</th>
          </tr>
        </thead>
        <tbody>
          ${rows.map((r) => renderThresholdRow(r, draftThresholds)).join('')}
        </tbody>
      </table>
    </div>
  `;
}

function renderThresholdRow(r, draftThresholds) {
  const draftVal = draftThresholds.get(r.skuId);
  const val = draftVal != null ? draftVal : r.standardQty;
  const isDirty = draftVal != null && Number(draftVal) !== Number(r.standardQty);
  return `
    <tr data-row-sku="${escapeHtml(r.skuId)}" class="${isDirty ? 'is-dirty' : ''}">
      <td class="text-muted small">${escapeHtml(r.skuId ?? '')}</td>
      <td class="fw-semibold">${escapeHtml(r.displayName ?? r.skuId)}</td>
      <td class="text-end text-muted">${(r.currentQty ?? 0).toLocaleString()}</td>
      <td class="text-end">
        <input type="number"
               class="form-control form-control-sm alert-settings-num"
               data-action="edit-standard"
               data-id="${escapeHtml(r.skuId)}"
               value="${escapeHtml(String(val ?? ''))}"
               min="0">
      </td>
      <td>
        <span class="alert-settings-trigger-readonly" title="${escapeHtml(t('alertSettings.thresholds.triggerHint'))}">
          <span class="material-symbols-outlined">trending_down</span>
          ${escapeHtml(t('alertSettings.thresholds.belowStandard'))}
        </span>
      </td>
    </tr>
  `;
}

function renderRulesGrid(rules, draftRules) {
  if (rules.length === 0) {
    return `<div class="text-muted text-center py-4">${escapeHtml(t('alertSettings.rules.empty'))}</div>`;
  }
  const byType = new Map(rules.map((r) => [r.alertType, r]));
  return `
    <div class="alert-settings-rules-grid">
      ${Object.entries(RULE_META).map(([alertType, meta]) => {
        const rule = byType.get(alertType);
        if (!rule) return '';
        return renderRuleCard(alertType, meta, rule, draftRules.get(alertType));
      }).join('')}
    </div>
  `;
}

function renderRuleCard(alertType, meta, rule, draft) {
  const isActive = draft?.isActive != null ? draft.isActive : rule.isActive;
  const thresholdValue = draft?.thresholdValue != null ? draft.thresholdValue : rule.thresholdValue;
  const isDirty = draft != null && (
    (draft.isActive != null && draft.isActive !== rule.isActive) ||
    (draft.thresholdValue != null && Number(draft.thresholdValue) !== Number(rule.thresholdValue))
  );

  const sevClass = isActive ? 'is-active' : 'is-inactive';

  return `
    <article class="alert-settings-rule-card ${isActive ? 'is-on' : 'is-off'} ${isDirty ? 'is-dirty' : ''}"
             data-rule-card data-id="${escapeHtml(alertType)}">
      <header class="alert-settings-rule-header">
        <div class="alert-settings-rule-title-row">
          <span class="alert-settings-severity ${sevClass}">
            <span class="material-symbols-outlined">${escapeHtml(meta.icon)}</span>
          </span>
          <h3 class="h6 fw-bold mb-0">${escapeHtml(t(`alertSettings.rules.${alertType}.title`))}</h3>
        </div>
        <label class="alert-settings-toggle">
          <input type="checkbox" data-action="toggle-rule" data-id="${escapeHtml(alertType)}"
                 ${isActive ? 'checked' : ''}>
          <span class="alert-settings-toggle-slider"></span>
        </label>
      </header>

      <p class="alert-settings-rule-desc text-muted small mb-0">
        ${escapeHtml(t(`alertSettings.rules.${alertType}.desc`))}
      </p>

      <div class="alert-settings-rule-fields">
        <label class="alert-settings-rule-field">
          <span class="alert-settings-rule-field-label">${escapeHtml(t('alertSettings.rules.threshold'))}</span>
          <div class="alert-settings-rule-field-input">
            <input type="number"
                   class="form-control form-control-sm"
                   data-action="edit-rule-threshold"
                   data-id="${escapeHtml(alertType)}"
                   value="${escapeHtml(String(thresholdValue ?? ''))}"
                   min="${meta.min}" max="${meta.max}" step="${meta.step}">
            <span class="alert-settings-rule-field-unit text-muted small">
              ${escapeHtml(t(`alertSettings.rules.${alertType}.unit`))}
            </span>
          </div>
        </label>
      </div>

      <div class="alert-settings-rule-actions-row">
        <span class="alert-settings-rule-actions-label">${escapeHtml(t('alertSettings.rules.actionLabel'))}</span>
        <div class="alert-settings-action-chips">
          ${(rule.actionChannels ?? []).map((ch) => `
            <span class="alert-settings-action-chip ${isActive ? 'is-on' : 'is-off'}"
                  title="${escapeHtml(t('alertSettings.rules.actionHint'))}">
              ${escapeHtml(t(`alertSettings.action.${ch}`) || ch)}
            </span>
          `).join('') || `<span class="text-muted small">—</span>`}
        </div>
      </div>
    </article>
  `;
}

function renderFooter(state, isSaving, saveError) {
  const dirtyThr = state.draftThresholds.size;
  const dirtyRules = state.draftRules.size;
  const hasDirty = dirtyThr > 0 || dirtyRules > 0;

  let statusHtml;
  if (saveError) {
    statusHtml = `<span class="text-danger small">
      ${escapeHtml(t('alertSettings.footer.saveFailedPrefix'))}${escapeHtml(saveError?.message ?? t('alertSettings.errorUnknown'))}
    </span>`;
  } else if (hasDirty) {
    const thrSeg = tf(dirtyThr === 1 ? 'alertSettings.footer.thresholdOne' : 'alertSettings.footer.thresholdOther', { n: dirtyThr });
    const ruleSeg = tf(dirtyRules === 1 ? 'alertSettings.footer.ruleOne' : 'alertSettings.footer.ruleOther', { n: dirtyRules });
    statusHtml = `<span class="text-warning small">
      <span class="material-symbols-outlined">edit</span>
      ${escapeHtml(t('alertSettings.footer.unsavedPrefix'))}${escapeHtml(thrSeg)}, ${escapeHtml(ruleSeg)}
    </span>`;
  } else {
    statusHtml = `<span class="text-muted small">${escapeHtml(t('alertSettings.footer.allSaved'))}</span>`;
  }

  return `
    <footer class="alert-settings-footer">
      <div class="alert-settings-footer-status">${statusHtml}</div>
      <div class="alert-settings-footer-actions">
        <button type="button" class="btn btn-outline-secondary btn-sm"
                data-action="reset-all" ${!hasDirty || isSaving ? 'disabled' : ''}>
          ${escapeHtml(t('alertSettings.footer.reset'))}
        </button>
        <button type="button" class="btn btn-warning btn-sm alert-settings-save-btn"
                data-action="save-all" ${!hasDirty || isSaving ? 'disabled' : ''}>
          <span class="material-symbols-outlined">save</span>
          ${isSaving ? escapeHtml(t('alertSettings.footer.saving')) : escapeHtml(t('alertSettings.footer.save'))}
        </button>
      </div>
    </footer>
  `;
}

// ─── helpers ────────────────────────────────────────────
function formatHM(ms) {
  if (!ms) return '—';
  const d = new Date(ms);
  return `${pad2(d.getHours())}:${pad2(d.getMinutes())}`;
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
