/**
 * appStore — cross-cutting (theme / lang)
 * ─────────────────────────────────────────────────────────────
 * 모든 페이지에서 공유하는 글로벌 상태.
 *  - theme: 'light' | 'dark' — 2단 토글 (theming_strategy.md §1)
 *           localStorage 영속화. 깜빡임 방지는 index.html <head> inline.
 *  - lang:  i18n 엔진과 양방향 동기화
 */

import { createStore } from '../core/createStore.js';
import {
  initI18n,
  getLang,
  setLang as setI18nLang,
  subscribe as subscribeI18n,
} from '../core/i18n/index.js';

const THEME_STORAGE_KEY = 'aura.theme';   // index.html inline 스크립트와 동일 키

const inner = createStore({
  theme: 'light',
  lang:  'en',
});

function applyThemeToDOM(theme) {
  const root = document.documentElement;
  if (theme === 'dark') {
    root.setAttribute('data-theme', 'dark');
    root.setAttribute('data-bs-theme', 'dark');
  } else {
    root.removeAttribute('data-theme');
    root.removeAttribute('data-bs-theme');
  }
}

function readSavedTheme() {
  try {
    return localStorage.getItem(THEME_STORAGE_KEY) === 'dark' ? 'dark' : 'light';
  } catch {
    return 'light';
  }
}

/**
 * 부팅 시 1회 호출 — i18n localStorage 복원 + theme localStorage 복원 + store 동기화
 */
function init() {
  initI18n();                                    // localStorage에서 lang 복원
  const savedTheme = readSavedTheme();
  inner.setState({ lang: getLang(), theme: savedTheme });
  applyThemeToDOM(savedTheme);                   // index.html inline 과 idempotent

  // i18n setLang 호출 시 store도 동기화 (양방향 sync)
  subscribeI18n((newLang) => {
    if (inner.getState().lang !== newLang) {
      inner.setState({ lang: newLang });
    }
  });
}

/**
 * 언어 변경 — i18n 엔진 갱신 + 모든 i18n 구독자에게 통지
 */
function setLang(lang) {
  setI18nLang(lang);
  // subscribeI18n 콜백이 자동으로 inner.setState 처리
}

/**
 * 테마 변경 — localStorage 저장 + DOM(<html> data-theme/data-bs-theme) 갱신 + store 통지
 */
function setTheme(theme) {
  if (theme !== 'light' && theme !== 'dark') return;
  if (inner.getState().theme === theme) return;
  try {
    localStorage.setItem(THEME_STORAGE_KEY, theme);
  } catch {
    // private mode 등 — 메모리 state만 갱신
  }
  applyThemeToDOM(theme);
  inner.setState({ theme });
}

export const appStore = {
  subscribe: inner.subscribe,
  getState:  inner.getState,
  init,
  setLang,
  setTheme,
};
