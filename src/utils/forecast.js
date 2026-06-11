/**
 * forecast — 결정형 선형회귀 예측 헬퍼 (T2)
 * ─────────────────────────────────────────────────────────────
 * 사용처:
 *   - 07-R 운영 리포트 §5 부족 예측 표 (`OperationalStatsReportPage.js`)
 *   - 02-2 SKU Detail trend chart 추세선 오버레이 (`SkuDetailPage.js`)
 *
 * 통일된 결정형 수식(최소제곱)으로 *숫자만* 산출. LLM·외부 의존 0.
 */

/**
 * 최소제곱 선형회귀 — closed form.
 * @param {Array<{x:number, y:number}>} points  데이터 포인트 (2개 이상)
 * @returns {{slope:number, intercept:number, rSquared:number}|null}
 *   포인트 2개 미만이면 null.
 */
export function linearRegression(points) {
  const n = points.length;
  if (n < 2) return null;
  const sumX = points.reduce((s, p) => s + p.x, 0);
  const sumY = points.reduce((s, p) => s + p.y, 0);
  const meanX = sumX / n;
  const meanY = sumY / n;
  let num = 0, den = 0;
  for (const p of points) {
    num += (p.x - meanX) * (p.y - meanY);
    den += (p.x - meanX) ** 2;
  }
  const slope = den === 0 ? 0 : num / den;
  const intercept = meanY - slope * meanX;
  let ssTot = 0, ssRes = 0;
  for (const p of points) {
    ssTot += (p.y - meanY) ** 2;
    const yHat = slope * p.x + intercept;
    ssRes += (p.y - yHat) ** 2;
  }
  const rSquared = ssTot === 0 ? 1 : Math.max(0, 1 - ssRes / ssTot);
  return { slope, intercept, rSquared };
}

/**
 * Trend items(`/inventory/stock/{sku}/trend` 응답) 을 받아 예측 표시 가능 여부 + 길이 산출.
 *
 * 안전장치 (default):
 *   - 데이터 3점 미만                → 표시 안 함
 *   - R² < minRSquared (저신뢰)      → 표시 안 함
 *   - slope ≥ 0 (감소 아님) AND !allowIncreasing → 표시 안 함
 *   - days_to_stockout < projectionDays AND 감소 추세 → stockout 지점(qty=0)에서 끝
 *
 * @param {Array<{date?:string, qty:number}>} items  최근 trend 시계열 (시간 오름차순)
 * @param {number} projectionDays  연장하고 싶은 일수 (예: 7d 차트=1, 30d 차트=3)
 * @param {object} [opts]
 * @param {number} [opts.minRSquared=0.3]  R² 임계값 (낮출수록 더 많이 표시)
 * @param {boolean} [opts.allowIncreasing=false]  증가 추세도 표시할지 (차트 시각화엔 true 권장)
 * @returns {{
 *   visible: boolean,
 *   slope: number, intercept: number, rSquared: number,
 *   current: number, dailyConsumption: number, daysToStockout: number|null,
 *   projection: Array<{xOffset:number, y:number}>|null,
 * }}
 */
export function buildForecastFromTrend(items, projectionDays, opts = {}) {
  const { minRSquared = 0.3, allowIncreasing = false } = opts;
  const empty = {
    visible: false,
    slope: 0, intercept: 0, rSquared: 0,
    current: 0, dailyConsumption: 0, daysToStockout: null,
    projection: null,
  };
  const trend = Array.isArray(items) ? items.filter((r) => r != null) : [];
  if (trend.length < 3) return empty;

  const points = trend.map((p, i) => ({ x: i, y: Number(p.qty) || 0 }));
  const reg = linearRegression(points);
  if (!reg) return empty;

  const current = points[points.length - 1].y;
  const dailyConsumption = Math.max(0, -reg.slope);
  const daysToStockout = dailyConsumption > 0 ? current / dailyConsumption : null;

  // 안전장치
  if (reg.rSquared < minRSquared) return { ...empty, ...reg, current, dailyConsumption, daysToStockout };
  if (!allowIncreasing && reg.slope >= 0) {
    return { ...empty, ...reg, current, dailyConsumption, daysToStockout };
  }

  // 점선 연장 길이 결정 — 감소 추세 & stockout 임박 시에만 stockout 지점에서 끝.
  //   증가 추세는 stockout 무관(daysToStockout=null) → 항상 projectionDays 만큼.
  const effectiveDays =
    reg.slope < 0 && daysToStockout != null && daysToStockout < projectionDays
      ? Math.max(1, Math.ceil(daysToStockout))
      : projectionDays;

  const lastX = points[points.length - 1].x;
  const projection = [];
  for (let i = 1; i <= effectiveDays; i += 1) {
    const x = lastX + i;
    let y = reg.slope * x + reg.intercept;
    if (y < 0) y = 0;   // 음수 방지 (qty ≥ 0)
    projection.push({ xOffset: i, y });
  }

  return {
    visible: true,
    slope: reg.slope,
    intercept: reg.intercept,
    rSquared: reg.rSquared,
    current,
    dailyConsumption,
    daysToStockout,
    projection,
  };
}
