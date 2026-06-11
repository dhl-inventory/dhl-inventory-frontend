/**
 * i18n Engine
 * ─────────────────────────────────────────────────────────────
 * 폴더 응집형: index.js (엔진) + en.js, ko.js (사전).
 * Backend의 데이터(SKU 이름 등) 다국어는 별도 — Accept-Language 헤더로 backend 처리.
 * 본 모듈은 UI 텍스트만 다룬다.
 *
 * 사용 예:
 *   import { t, setLang } from '../core/i18n';
 *   t('inventory.col.standardQty');   // → "Standard Qty"
 *   setLang('ko');                    // 모든 구독자 자동 갱신
 */

import en from './en.js';
import ko from './ko.js';

const dictionaries = { en, ko };

const STORAGE_KEY = 'aura.lang';
const DEFAULT_LANG = 'en';

let currentLang = DEFAULT_LANG;
const listeners = new Set();

/**
 * 키에 대응하는 번역 텍스트 반환.
 * 현재 lang 사전에 없으면 영어 사전으로 fallback. 영어에도 없으면 키 자체 반환.
 */
export function t(key) {
  const dict = dictionaries[currentLang] || dictionaries[DEFAULT_LANG];
  return dict[key] ?? dictionaries[DEFAULT_LANG][key] ?? key;
}

/**
 * 템플릿 치환 헬퍼.
 *   tf('alertSettings.footer.thresholdOne', { n: 3 })
 *   → 'threshold 3' (en) / '임계값 3건' (ko)
 * 치환 대상이 없으면 t()와 동일하게 동작.
 */
export function tf(key, params) {
  return Object.entries(params || {}).reduce(
    (s, [k, v]) => s.replace(new RegExp(`\\{${k}\\}`, 'g'), v),
    t(key),
  );
}

export function getLang() {
  return currentLang;
}

export function setLang(lang) {
  if (!dictionaries[lang]) {
    console.warn(`[i18n] Unknown language: ${lang}`);
    return;
  }
  currentLang = lang;
  try {
    localStorage.setItem(STORAGE_KEY, lang);
  } catch {
    // localStorage 접근 실패 (private mode 등) — 무시
  }
  listeners.forEach((listener) => listener(lang));
}

/**
 * 언어 변경 구독. router나 컴포넌트가 호출해서 자동 리렌더 트리거.
 */
export function subscribe(listener) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/**
 * 진입 시 1회 호출 — localStorage에서 저장된 lang 복원.
 * appStore.init()에서 사용.
 */
export function initI18n() {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved && dictionaries[saved]) {
      currentLang = saved;
    }
  } catch {
    // localStorage 접근 실패 — 기본값 유지
  }
}
