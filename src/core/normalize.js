/**
 * normalize — snake_case → camelCase 정규화
 * ─────────────────────────────────────────────────────────────
 * Backend 합의: snake_case 응답 유지 (FastAPI 기본).
 *               Frontend가 camelCase 변환 책임.
 * 자세한 패턴: docs/architecture/api_connection_plan.md §3.1 (N1)
 *
 * 단순 deep 변환만 제공. 의미 변환 (expiry → validity 등)은
 * 도메인 api/*.js에서 별도 처리한다.
 *
 * 사용 예:
 *   const normalized = toCamel({ sku_id: 'A', current_qty: 10 });
 *   // → { skuId: 'A', currentQty: 10 }
 */

const CAMEL_KEY_RE = /_([a-z0-9])/g;

function snakeKeyToCamel(key) {
  return key.replace(CAMEL_KEY_RE, (_, ch) => ch.toUpperCase());
}

export function toCamel(input) {
  if (Array.isArray(input)) {
    return input.map(toCamel);
  }
  if (input !== null && typeof input === 'object' && input.constructor === Object) {
    const out = {};
    for (const [key, value] of Object.entries(input)) {
      out[snakeKeyToCamel(key)] = toCamel(value);
    }
    return out;
  }
  return input;
}

/**
 * camelCase → snake_case (요청 body 보낼 때 사용 — 선택)
 */
const SNAKE_KEY_RE = /([A-Z])/g;

function camelKeyToSnake(key) {
  return key.replace(SNAKE_KEY_RE, '_$1').toLowerCase();
}

export function toSnake(input) {
  if (Array.isArray(input)) {
    return input.map(toSnake);
  }
  if (input !== null && typeof input === 'object' && input.constructor === Object) {
    const out = {};
    for (const [key, value] of Object.entries(input)) {
      out[camelKeyToSnake(key)] = toSnake(value);
    }
    return out;
  }
  return input;
}
