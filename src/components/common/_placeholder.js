/**
 * Placeholder 페이지 헬퍼 (Phase 1.D 한정)
 * ─────────────────────────────────────────────────────────────
 * 22 라우트 + 시스템 페이지가 인프라 검증용으로 같은 모양 placeholder를 사용.
 * Phase 3~4에서 실제 도메인 페이지로 교체될 때 본 헬퍼 import 제거.
 *
 * 사용 예:
 *   import { createPlaceholder } from '../common/_placeholder.js';
 *   export default createPlaceholder({
 *     title: 'Dashboard',
 *     pageCode: '01',
 *     phaseTarget: 'Phase 3',
 *   });
 */

import { appStore } from '../../store/appStore.js';
import { t } from '../../core/i18n/index.js';

function layoutNote() {
  return `
    <p class="text-muted small mb-2">${t('placeholder.note')}</p>
  `;
}

function debugBlock({ params, user, accessScope, pageCode }) {
  const safeUser = user
    ? { id: user.id, name: user.name, role: user.role, email: user.email }
    : null;
  return `
    <div class="card mt-3 border-0 shadow-sm">
      <div class="card-body">
        <h2 class="h6 text-muted mb-2">${t('placeholder.debugTitle')}</h2>
        <pre class="mb-0 small text-body-secondary" style="white-space:pre-wrap;">page    : ${pageCode}
role    : ${safeUser?.role ?? '(unauthenticated)'}
user    : ${JSON.stringify(safeUser, null, 2)}
scope   : ${JSON.stringify(accessScope, null, 2)}
params  : ${JSON.stringify(params, null, 2)}</pre>
      </div>
    </div>
  `;
}

export function createPlaceholder({ title, pageCode, phaseTarget = 'Phase 3' }) {
  return function PlaceholderPage({ params, user, accessScope } = {}) {
    const rootId = `placeholder-root-${pageCode}`;
    let unsubApp = null;
    const buildHtml = () => `
      <section id="${rootId}" class="container py-4">
        <header class="mb-3">
          <span class="badge bg-secondary mb-2">${pageCode}</span>
          <h1 class="h3 fw-bold mb-1">${title}</h1>
          <small class="text-muted">${t('placeholder.implTarget')} ${phaseTarget}</small>
        </header>
        ${layoutNote()}
        ${debugBlock({ params, user, accessScope, pageCode })}
      </section>
    `;
    return {
      html: buildHtml(),
      mount() {
        unsubApp = appStore.subscribe(() => {
          const root = document.getElementById(rootId);
          if (root && root.parentElement) root.outerHTML = buildHtml();
        });
      },
      destroy() {
        unsubApp?.();
        unsubApp = null;
      },
    };
  };
}
