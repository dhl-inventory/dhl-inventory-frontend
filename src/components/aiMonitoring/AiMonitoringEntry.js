/**
 * AiMonitoringEntry — 08 AI Monitoring Console 진입점 (Grafana 위임)
 * ─────────────────────────────────────────────────────────────
 * pending §3.20: 5 패널(Camera/Scan/Plotter/Telemetry/Detection/Logs)은
 *   Grafana 위임. frontend = 진입점만 책임.
 * pending §2.20 결정 (2026-05-19, bk_agent §74): 진입 형태 = **외부 링크(새 탭)**.
 *   iframe(SSO/CORS 인프라 의존 과다)·redirect(미구성 graceful 불가) 비채택.
 *
 * Grafana URL = import.meta.env.VITE_GRAFANA_URL (인프라 주입).
 *   미설정 시 graceful "미구성" 안내 — URL 몰라도 ai_monitor 가 정상 착지.
 *   실 URL/SSO/데이터소스 매핑 = §2.20 둘째·셋째 줄(인프라 followup, 그대로 열림).
 *
 * Post-MVP (pending §2.20): scan_state(followup_queue Q-7) ship 시 본 런처
 *   상단에 "최근 스캔 활동" 카드(B, scanStore 재사용) 삽입 — 페이지 골격은
 *   그릇이라 카드만 추가(재설계 0 · 신규 backend 0).
 */

import { appStore } from '../../store/appStore.js';
import { t } from '../../core/i18n/index.js';

const ROOT_ID = 'ai-console-root';
const GRAFANA_URL = import.meta.env.VITE_GRAFANA_URL || '';

function buildHtml() {
  const configured = !!GRAFANA_URL;
  return `
    <section id="${ROOT_ID}" class="container py-4">
      <header class="mb-3">
        <h1 class="h3 fw-bold mb-1">${escapeHtml(t('aiConsole.title'))}</h1>
        <p class="text-muted small mb-0">${escapeHtml(t('aiConsole.subtitle'))}</p>
      </header>
      <div class="card">
        <div class="card-body text-center py-5">
          <span class="material-symbols-outlined text-secondary" style="font-size:3rem;">monitoring</span>
          <p class="mt-3 mb-4 text-body-secondary">${escapeHtml(t('aiConsole.delegated'))}</p>
          ${
            configured
              ? `<a class="btn btn-warning" href="${escapeHtml(GRAFANA_URL)}"
                    target="_blank" rel="noopener noreferrer">
                   <span class="material-symbols-outlined align-middle me-1">open_in_new</span>
                   ${escapeHtml(t('aiConsole.openGrafana'))}
                 </a>`
              : `<div class="alert alert-secondary d-inline-block mb-0">
                   <span class="material-symbols-outlined align-middle me-1">info</span>
                   ${escapeHtml(t('aiConsole.notConfigured'))}
                 </div>`
          }
        </div>
      </div>
    </section>
  `;
}

export default function AiMonitoringEntry() {
  let unsubApp = null;
  return {
    html: buildHtml(),
    mount() {
      unsubApp = appStore.subscribe(() => {
        const root = document.getElementById(ROOT_ID);
        if (root && root.parentElement) root.outerHTML = buildHtml();
      });
    },
    destroy() {
      unsubApp?.();
      unsubApp = null;
    },
  };
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
