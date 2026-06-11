/**
 * zoneStore — Zone 도메인 통합 store (03-1 / 03-2 / 03-3 공용)
 * ─────────────────────────────────────────────────────────────
 * 3 화면이 한 도메인이지만 데이터 의존이 분리되어 있어 3 슬라이스로:
 *   - overview     : zone 카드 그리드용 (Zone Overview)
 *   - sections     : 한 zone 안 section 카드 그리드 (Zone Detail)
 *   - sectionDetail: 한 section 단건 (Zone Detail 우측 panel + Section Detail)
 *
 * Actions:
 *   fetchOverview()                       — 03-1 진입 시
 *   fetchSections(zoneId)                 — 03-2 진입 시
 *   selectSection(zoneId, sectionId)      — 03-2 panel / 03-3 진입 시
 *   clearSelectedSection()
 *   reset()
 */

import { createStore } from '../core/createStore.js';
import {
  fetchZoneOverview,
  fetchZoneSections,
  fetchZoneSectionDetail,
  fetchZoneFefo,
  fetchZoneEvents,
} from '../api/zoneApi.js';
import { appStore } from './appStore.js';

const initialState = {
  overview: {
    zones:      [],
    isLoading:  false,
    error:      null,
    receivedAt: null,
  },
  sections: {
    zoneId:     null,
    items:      [],
    isLoading:  false,
    error:      null,
    receivedAt: null,
  },
  sectionDetail: {
    zoneId:     null,
    sectionId:  null,
    data:       null,
    isLoading:  false,
    error:      null,
    receivedAt: null,
  },
  fefo: {
    zoneId:     null,
    data:       null,
    isLoading:  false,
    error:      null,
    receivedAt: null,
  },
  recentEvents: {
    zoneId:     null,
    items:      [],
    isLoading:  false,
    error:      null,
    receivedAt: null,
  },
};

const inner = createStore({
  overview:      { ...initialState.overview },
  sections:      { ...initialState.sections },
  sectionDetail: { ...initialState.sectionDetail },
  fefo:          { ...initialState.fefo },
  recentEvents:  { ...initialState.recentEvents },
});

// ─── 03-1 Zone Overview ───────────────────────────────────
async function fetchOverview() {
  const startLang = appStore.getState().lang;
  inner.setState({
    overview: { ...inner.getState().overview, isLoading: true, error: null },
  });
  try {
    const res = await fetchZoneOverview();
    if (appStore.getState().lang !== startLang) return;   // lang 바뀜 → 응답 폐기(race 차단)
    inner.setState({
      overview: {
        zones:      res.data?.zones ?? [],
        isLoading:  false,
        error:      null,
        receivedAt: res.receivedAt,
      },
    });
  } catch (err) {
    inner.setState({
      overview: { ...inner.getState().overview, isLoading: false, error: err },
    });
  }
}

// ─── 03-2 Zone Detail — Section grid ─────────────────────
async function fetchSections(zoneId) {
  if (!zoneId) return;
  const startLang = appStore.getState().lang;
  inner.setState({
    sections: { ...initialState.sections, zoneId, isLoading: true },
  });
  try {
    const res = await fetchZoneSections(zoneId);
    if (appStore.getState().lang !== startLang) return;   // lang 바뀜 → 응답 폐기(race 차단)
    inner.setState({
      sections: {
        zoneId,
        items:      res.data?.items ?? [],
        isLoading:  false,
        error:      null,
        receivedAt: res.receivedAt,
      },
    });
  } catch (err) {
    inner.setState({
      sections: { ...inner.getState().sections, isLoading: false, error: err },
    });
  }
}

// ─── 03-2 panel / 03-3 Section Detail ────────────────────
async function selectSection(zoneId, sectionId) {
  if (!zoneId || !sectionId) return;
  const startLang = appStore.getState().lang;
  inner.setState({
    sectionDetail: { ...initialState.sectionDetail, zoneId, sectionId, isLoading: true },
  });
  try {
    const res = await fetchZoneSectionDetail(zoneId, sectionId);
    if (appStore.getState().lang !== startLang) return;   // lang 바뀜 → 응답 폐기(race 차단)
    inner.setState({
      sectionDetail: {
        zoneId,
        sectionId,
        data:       res.data,
        isLoading:  false,
        error:      null,
        receivedAt: res.receivedAt,
      },
    });
  } catch (err) {
    inner.setState({
      sectionDetail: { ...inner.getState().sectionDetail, isLoading: false, error: err },
    });
  }
}

function clearSelectedSection() {
  inner.setState({ sectionDetail: { ...initialState.sectionDetail } });
}

// ─── 03-2 Zone Detail — F-008 구역별 FEFO 준수율 ─────────
async function fetchFefo(zoneId) {
  if (!zoneId) return;
  const startLang = appStore.getState().lang;
  inner.setState({
    fefo: { ...initialState.fefo, zoneId, isLoading: true },
  });
  try {
    const res = await fetchZoneFefo(zoneId);
    if (appStore.getState().lang !== startLang) return;   // lang 바뀜 → 응답 폐기(race 차단)
    inner.setState({
      fefo: {
        zoneId,
        data:       res.data,
        isLoading:  false,
        error:      null,
        receivedAt: res.receivedAt,
      },
    });
  } catch (err) {
    inner.setState({
      fefo: { ...inner.getState().fefo, isLoading: false, error: err },
    });
  }
}

// ─── 03-2 Zone Detail — R-1 Recent Zone Events ───────────
async function fetchRecentEvents(zoneId) {
  if (!zoneId) return;
  const startLang = appStore.getState().lang;
  inner.setState({
    recentEvents: { ...initialState.recentEvents, zoneId, isLoading: true },
  });
  try {
    const res = await fetchZoneEvents(zoneId);
    if (appStore.getState().lang !== startLang) return;   // lang 바뀜 → 응답 폐기(race 차단)
    inner.setState({
      recentEvents: {
        zoneId,
        items:      res.data?.items ?? [],
        isLoading:  false,
        error:      null,
        receivedAt: res.receivedAt,
      },
    });
  } catch (err) {
    inner.setState({
      recentEvents: { ...inner.getState().recentEvents, isLoading: false, error: err },
    });
  }
}

function reset() {
  inner.setState({
    overview:      { ...initialState.overview },
    sections:      { ...initialState.sections },
    sectionDetail: { ...initialState.sectionDetail },
    fefo:          { ...initialState.fefo },
    recentEvents:  { ...initialState.recentEvents },
  });
}

export const zoneStore = {
  subscribe: inner.subscribe,
  getState:  inner.getState,
  fetchOverview,
  fetchSections,
  selectSection,
  clearSelectedSection,
  fetchFefo,
  fetchRecentEvents,
  reset,
};
