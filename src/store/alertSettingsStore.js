/**
 * alertSettingsStore — 06 Alert Settings
 * ─────────────────────────────────────────────────────────────
 * 두 슬라이스:
 *   - thresholds: SKU별 Standard Qty 표
 *   - rules:      alert_type별 Rule (4종)
 *
 * 글로벌 Save / Reset:
 *  - Save: 변경된 항목 추적 (changedThresholds Map, changedRules Map) 후
 *    `saveAll()` 호출 시 backend PATCH 순차 호출.
 *  - Reset: 마지막 fetch 응답으로 state 복원 + changed Map 비움.
 *
 * Actions:
 *   fetchAll(params?)                     — 진입 시 두 슬라이스 동시 fetch
 *   setThresholdDraft(skuId, value)        — 편집 입력 추적
 *   setRuleDraft(alertType, patch)         — 토글 / threshold 편집 추적
 *   saveAll()                              — 변경된 항목만 backend로 PATCH
 *   resetAll()                             — 마지막 fetch 응답으로 state 되돌림
 */

import { createStore } from '../core/createStore.js';
import {
  fetchStockThresholds,
  updateStockThreshold,
  fetchAlertRules,
  updateAlertRule,
} from '../api/alertSettingsApi.js';
import { appStore } from './appStore.js';

const initialState = {
  isLoading:    false,
  error:        null,
  receivedAt:   null,
  thresholds:   [],          // [{ skuId, displayName, currentQty, standardQty, triggerRule }]
  rules:        [],          // [{ alertType, thresholdValue, thresholdUnit, isActive, actionChannels }]
  // draft 추적: 변경된 항목만 PATCH 호출에 사용
  draftThresholds: new Map(), // skuId -> standardQty
  draftRules:      new Map(), // alertType -> { isActive?, thresholdValue? }
  isSaving:     false,
  saveError:    null,
};

const inner = createStore({ ...initialState });

async function fetchAll(params) {
  const startLang = appStore.getState().lang;
  inner.setState({ isLoading: true, error: null });
  try {
    const [thr, rls] = await Promise.all([
      fetchStockThresholds(params),
      fetchAlertRules(),
    ]);
    if (appStore.getState().lang !== startLang) return;   // lang 바뀜 → 응답 폐기(race 차단)
    inner.setState({
      isLoading:       false,
      error:           null,
      receivedAt:      Date.now(),
      thresholds:      thr.data?.items ?? [],
      rules:           rls.data?.items ?? [],
      draftThresholds: new Map(),
      draftRules:      new Map(),
    });
  } catch (err) {
    inner.setState({ isLoading: false, error: err });
  }
}

function setThresholdDraft(skuId, standardQty) {
  // 같은 값으로 되돌리면 Map entry를 지워 dirty 0으로 복귀
  const state = inner.getState();
  const original = state.thresholds.find((t) => t.skuId === skuId);
  const nextVal = Number(standardQty);
  const next = new Map(state.draftThresholds);
  if (original != null && nextVal === Number(original.standardQty)) {
    next.delete(skuId);
  } else {
    next.set(skuId, nextVal);
  }
  inner.setState({ draftThresholds: next });
}

function setRuleDraft(alertType, patch) {
  // patch는 부분 patch — 병합 후 원본과 같은 필드는 떼어내고,
  // 모든 필드가 원본과 같아지면 Map entry 자체를 지움.
  const state = inner.getState();
  const original = state.rules.find((r) => r.alertType === alertType);
  const next = new Map(state.draftRules);
  const merged = { ...(next.get(alertType) ?? {}), ...patch };
  if (original != null) {
    if (merged.isActive != null && merged.isActive === original.isActive) {
      delete merged.isActive;
    }
    if (merged.thresholdValue != null && Number(merged.thresholdValue) === Number(original.thresholdValue)) {
      delete merged.thresholdValue;
    }
  }
  if (Object.keys(merged).length === 0) {
    next.delete(alertType);
  } else {
    next.set(alertType, merged);
  }
  inner.setState({ draftRules: next });
}

async function saveAll() {
  const state = inner.getState();
  inner.setState({ isSaving: true, saveError: null });
  try {
    // Stock Thresholds
    for (const [skuId, standardQty] of state.draftThresholds) {
      await updateStockThreshold(skuId, standardQty);
    }
    // Alert Rules
    for (const [alertType, patch] of state.draftRules) {
      await updateAlertRule(alertType, patch);
    }
    // 성공 → 최신 응답으로 state refetch
    await fetchAll();
    inner.setState({ isSaving: false, saveError: null });
  } catch (err) {
    inner.setState({ isSaving: false, saveError: err });
  }
}

function resetAll() {
  // 마지막 fetch 응답을 그대로 두고, draft 만 비움 → UI 입력값은 fetch 응답값으로 재페인트
  inner.setState({
    draftThresholds: new Map(),
    draftRules:      new Map(),
  });
}

function reset() {
  inner.setState({ ...initialState, draftThresholds: new Map(), draftRules: new Map() });
}

export const alertSettingsStore = {
  subscribe: inner.subscribe,
  getState:  inner.getState,
  fetchAll,
  setThresholdDraft,
  setRuleDraft,
  saveAll,
  resetAll,
  reset,
};
