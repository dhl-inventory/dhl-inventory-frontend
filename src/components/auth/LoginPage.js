/**
 * LoginPage — 00-1 Login (Phase 7 실 API 연결, wireframe 정합)
 * ─────────────────────────────────────────────────────────────
 * Wireframe: docs/wireframes/00-1_login_default.png · 00-1_login_error.png
 *
 * Flow:
 *   POST /auth/login (body: { username, password })
 *   → access_token 저장
 *   → GET /auth/me
 *   → user/accessScope 저장
 *   → router.navigate('/dashboard')
 *
 * UI 정합 (wireframe 기준):
 *  - 상단 로고 (sidebar와 동일 aura-logo.png)
 *  - 'AURA Inventory' / 'Login to system'
 *  - Username 입력 + 좌측 person icon
 *  - Password 입력 + 좌측 lock icon + 우측 visibility toggle (eye)
 *  - 에러: 'Email or password is incorrect.' (영문, 빨강 + 경고 아이콘)
 *  - Sign In 버튼 (DHL yellow + arrow_forward)
 *  - 'Request password reset' 링크 → modal 띄움 (backend 호출 없음 — Post-MVP)
 *
 * Backend 모델 (ADR-004, auth_service.py):
 *  - username 컬럼 + email 컬럼 별도 (DB). 로그인은 username 매칭만.
 *  - UI 라벨은 'Username' (wireframe 'Email Address'는 기획 초기 가정, 실제 schema는 username).
 *  - is_first_login=true는 MVP 무시 (layout outline §5.184)
 */

import { authStore } from '../../store/authStore.js';
import { appStore } from '../../store/appStore.js';
import { t } from '../../core/i18n/index.js';
import { router } from '../../core/router.js';
import {
  mountPasswordResetModal,
  unmountPasswordResetModal,
  openPasswordResetModal,
} from './PasswordResetModal.js';

const ROOT_ID    = 'login-root';
const LOGO_PATH  = '/aura-logo.png';

export default function LoginPage() {
  let submitting       = false;
  let errorMsg         = '';
  let username         = '';
  let password         = '';
  let passwordVisible  = false;

  let submitHandler = null;
  let inputHandler  = null;
  let clickHandler  = null;
  let unsubApp      = null;

  function rerender() {
    render({ submitting, errorMsg, username, password, passwordVisible });
    // 재렌더 후 포커스 복구 — 입력 중인 필드 유지
    // (현재는 한 번에 작성 후 submit이 일반적이라 별도 처리 안 함)
  }

  async function doSubmit(e) {
    e.preventDefault();
    if (submitting) return;
    if (!username.trim() || !password) {
      errorMsg = t('auth.login.missingFields');
      rerender();
      return;
    }
    submitting = true;
    errorMsg = '';
    rerender();

    try {
      await authStore.login(username.trim(), password);
      // 역할별 착지 (각 role 이 *접근 가능한* 첫 화면으로).
      //   - ai_monitor: 08 AI Console (/dashboard·/users 둘 다 권한 없음)
      //   - super_admin: /dashboard (2026-05-25 모든 권한 부여 후 routes 통과 — 일반 운영 화면)
      //   - field_manager / ops_manager: 01 Dashboard
      const role = authStore.getState().user?.role;
      const landing = role === 'ai_monitor' ? '/ai-console' : '/dashboard';
      router.navigate(landing);
    } catch (err) {
      submitting = false;
      const status = err?.status;
      if (status === 401) {
        errorMsg = t('auth.login.error');
      } else if (status === 0 || !status) {
        errorMsg = t('auth.login.networkError');
      } else {
        errorMsg = err?.body?.message || err?.message || t('auth.login.genericError');
      }
      rerender();
    }
  }

  return {
    html: `<section id="${ROOT_ID}" class="login-page"></section>`,

    mount() {
      mountPasswordResetModal();
      unsubApp = appStore.subscribe(rerender);   // lang 변경 자동 리렌더
      rerender();
      const root = document.getElementById(ROOT_ID);

      submitHandler = (e) => {
        if (e.target.closest('[data-form="login"]')) doSubmit(e);
      };
      root?.addEventListener('submit', submitHandler);

      inputHandler = (e) => {
        const input = e.target.closest('[data-field]');
        if (!input) return;
        if (input.dataset.field === 'username') username = input.value;
        else if (input.dataset.field === 'password') password = input.value;
      };
      root?.addEventListener('input', inputHandler);

      clickHandler = (e) => {
        const toggle = e.target.closest('[data-action="toggle-password"]');
        if (toggle) {
          e.preventDefault();
          passwordVisible = !passwordVisible;
          const pwd = root?.querySelector('[data-field="password"]');
          if (pwd) pwd.type = passwordVisible ? 'text' : 'password';
          const icon = toggle.querySelector('.material-symbols-outlined');
          if (icon) icon.textContent = passwordVisible ? 'visibility_off' : 'visibility';
          return;
        }

        // Password reset link → modal open
        const resetLink = e.target.closest('[data-action="open-password-reset"]');
        if (resetLink) {
          e.preventDefault();
          openPasswordResetModal();
          return;
        }
      };
      root?.addEventListener('click', clickHandler);
    },

    destroy() {
      unsubApp?.();
      unsubApp = null;
      const root = document.getElementById(ROOT_ID);
      if (root && submitHandler) root.removeEventListener('submit', submitHandler);
      if (root && inputHandler)  root.removeEventListener('input',  inputHandler);
      if (root && clickHandler)  root.removeEventListener('click',  clickHandler);
      submitHandler = inputHandler = clickHandler = null;
      unmountPasswordResetModal();
    },
  };
}

function render({ submitting, errorMsg, username, password, passwordVisible }) {
  const root = document.getElementById(ROOT_ID);
  if (!root) return;

  root.innerHTML = `
    <div class="login-card">
      <header class="login-card-header">
        <div class="login-logo">
          <img src="${LOGO_PATH}" alt="AURA"
               onerror="this.parentElement.classList.add('is-fallback'); this.style.display='none';" />
          <span class="login-logo-fallback">A</span>
        </div>
        <h1 class="login-title">${escapeHtml(t('auth.login.title'))}</h1>
        <p class="login-subtitle">${escapeHtml(t('auth.login.subtitle'))}</p>
      </header>

      <form data-form="login" class="login-form" novalidate>
        <div class="login-field">
          <label for="login-username" class="login-label">${escapeHtml(t('auth.login.username'))}</label>
          <div class="login-input-wrap">
            <span class="material-symbols-outlined login-input-icon">person</span>
            <input
              id="login-username"
              type="text"
              data-field="username"
              class="login-input"
              placeholder="${escapeHtml(t('auth.login.usernamePlaceholder'))}"
              value="${escapeHtml(username)}"
              autocomplete="username"
              autocapitalize="off"
              spellcheck="false"
              ${submitting ? 'disabled' : ''}
              required
            />
          </div>
        </div>

        <div class="login-field">
          <label for="login-password" class="login-label">${escapeHtml(t('auth.login.password'))}</label>
          <div class="login-input-wrap">
            <span class="material-symbols-outlined login-input-icon">lock</span>
            <input
              id="login-password"
              type="${passwordVisible ? 'text' : 'password'}"
              data-field="password"
              class="login-input"
              placeholder="${escapeHtml(t('auth.login.passwordPlaceholder'))}"
              value="${escapeHtml(password)}"
              autocomplete="current-password"
              ${submitting ? 'disabled' : ''}
              required
            />
            <button type="button" class="login-input-toggle" data-action="toggle-password"
                    aria-label="${escapeHtml(passwordVisible ? t('auth.login.hidePassword') : t('auth.login.showPassword'))}"
                    ${submitting ? 'disabled' : ''}>
              <span class="material-symbols-outlined">${passwordVisible ? 'visibility_off' : 'visibility'}</span>
            </button>
          </div>
        </div>

        ${errorMsg ? `
          <div class="login-error" role="alert">
            <span class="material-symbols-outlined">error</span>
            <span>${escapeHtml(errorMsg)}</span>
          </div>
        ` : ''}

        <button type="submit" class="login-submit" ${submitting ? 'disabled' : ''}>
          ${submitting ? `
            <span class="spinner-border spinner-border-sm me-2" role="status" aria-hidden="true"></span>
            ${escapeHtml(t('auth.login.signingIn'))}
          ` : `
            <span>${escapeHtml(t('auth.login.submit'))}</span>
            <span class="material-symbols-outlined">arrow_forward</span>
          `}
        </button>

        <button type="button" class="login-reset-link"
                data-action="open-password-reset"
                ${submitting ? 'disabled' : ''}>
          ${escapeHtml(t('auth.login.requestReset'))}
        </button>
      </form>
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
