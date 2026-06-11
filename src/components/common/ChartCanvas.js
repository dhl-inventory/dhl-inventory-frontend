/**
 * ChartCanvas — Chart.js 공용 래퍼 (Phase 5)
 * ─────────────────────────────────────────────────────────────
 * 기존 페이지 컴포넌트 패턴(`{ html, mount(), destroy() }`)을 따르는 factory.
 * 페이지가 차트를 사용하는 방식:
 *
 *   import { createChartCanvas } from '../common/ChartCanvas.js';
 *
 *   const chart = createChartCanvas({
 *     id: 'dashboard-top-items-chart',
 *     type: 'bar',
 *     data: () => ({ labels: [...], datasets: [...] }),
 *     options: () => ({ ... }),  // i18n / 동적 값은 함수로 전달
 *   });
 *
 *   // 페이지 mount 시:
 *   document.getElementById('chart-host').innerHTML = chart.html;
 *   chart.mount();
 *
 *   // 데이터 변경 시 (예: 토글):
 *   chart.update();
 *
 *   // 페이지 destroy 시:
 *   chart.destroy();
 *
 * 정책 (Phase 5 결정):
 *  - Chart.register(...registerables) 일괄 등록 (MVP 단순화 — chart_strategy.md §4)
 *  - lang 변경은 ChartCanvas 내부에서 appStore.subscribe로 감지 → chart.update('none')
 *    호출. data / options를 함수로 받으면 i18n 콜백이 자동 재실행됨.
 *  - update animation은 데이터 갱신 시 기본 ('default'), lang 변경 시 'none' (깜빡임 방지)
 *  - destroy 시 Chart 인스턴스 .destroy() 호출 (memory leak 방지)
 *  - prefers-reduced-motion 대응은 후속 — 현재는 Chart.js 기본 애니메이션
 *
 * 시그니처:
 *   createChartCanvas({
 *     id,                            — canvas DOM id (필수)
 *     type,                          — 'bar' | 'line' | ... (필수)
 *     data,                          — () => Chart.js data 객체 (함수 필수)
 *     options,                       — () => Chart.js options 객체 (함수, 옵션)
 *     className,                     — wrapper div 추가 클래스 (옵션)
 *     style,                         — wrapper inline style (옵션, height 지정용)
 *   })
 *   → { html, mount(), update(updateMode?), destroy(), getInstance() }
 */

import { Chart, registerables } from 'chart.js';
import { appStore } from '../../store/appStore.js';

// 1회만 register (모듈 로드 시점).
Chart.register(...registerables);

/**
 * 테마별 Chart.defaults 동기화 (theming_strategy.md §6.3).
 * 모든 차트의 라벨/그리드 기본색이 다크 배경 위에서 가독성 확보되도록.
 */
function applyChartDefaults(theme) {
  const isDark = theme === 'dark';
  Chart.defaults.color       = isDark ? '#e6e8eb' : '#191c1e';
  Chart.defaults.borderColor = isDark ? 'rgba(230,232,235,0.12)' : 'rgba(25,28,30,0.15)';
}

export function createChartCanvas({
  id,
  type,
  data,
  options,
  className = '',
  style = '',
}) {
  if (!id) throw new Error('[ChartCanvas] id is required');
  if (!type) throw new Error('[ChartCanvas] type is required');
  if (typeof data !== 'function') {
    throw new Error('[ChartCanvas] data must be a function returning Chart.js data');
  }

  let chart      = null;
  let unsubApp   = null;
  let lastLang   = null;   // lang 변경 감지용 closure
  let lastTheme  = null;   // theme 변경 감지용 closure

  const wrapperClass = `chart-canvas-wrap ${className}`.trim();
  const styleAttr    = style ? ` style="${style}"` : '';

  const html = `
    <div class="${wrapperClass}"${styleAttr}>
      <canvas id="${id}"></canvas>
    </div>
  `;

  function mount() {
    const canvas = document.getElementById(id);
    if (!canvas) {
      console.warn(`[ChartCanvas] canvas#${id} not found at mount time`);
      return;
    }
    const ctx = canvas.getContext('2d');
    if (!ctx) {
      console.warn(`[ChartCanvas] canvas#${id} has no 2d context`);
      return;
    }

    // mount 시점 theme에 맞춰 Chart.defaults 동기화 (첫 차트 mount 시 효과 발생)
    applyChartDefaults(appStore.getState().theme);

    chart = new Chart(ctx, {
      type,
      data:    data(),
      options: typeof options === 'function' ? options() : (options ?? {}),
    });
    lastLang  = appStore.getState().lang;
    lastTheme = appStore.getState().theme;

    // lang 또는 theme 변경 시 차트 재갱신
    unsubApp = appStore.subscribe((state) => {
      if (!chart) return;
      let needsUpdate = false;
      if (state.lang !== lastLang) {
        lastLang = state.lang;
        needsUpdate = true;
      }
      if (state.theme !== lastTheme) {
        lastTheme = state.theme;
        applyChartDefaults(state.theme);   // 전역 default 갱신 → 모든 차트 영향
        needsUpdate = true;
      }
      if (!needsUpdate) return;
      if (typeof options === 'function') {
        chart.options = options();
      }
      chart.data = data();
      chart.update('none');
    });
  }

  /**
   * 데이터 / 옵션 변경 시 호출. updateMode:
   *  - 'default' (기본): 애니메이션 동반
   *  - 'none': 즉시 갱신 (sparkline / 빈번한 갱신 권장)
   *  - 'active' / 'show' / 'hide' / 'resize' / 'reset' 등 Chart.js 표준
   */
  function update(updateMode = 'default') {
    if (!chart) return;
    if (typeof options === 'function') {
      chart.options = options();
    }
    chart.data = data();
    chart.update(updateMode);
  }

  function destroy() {
    unsubApp?.();
    unsubApp = null;
    chart?.destroy();
    chart = null;
  }

  function getInstance() {
    return chart;
  }

  return { html, mount, update, destroy, getInstance };
}
