/**
 * 공용 시각 표시 formatter.
 * ─────────────────────────────────────────────────────────────
 * BK 결정 (2026-05-20): 표/리스트의 시각 표시는 MM-DD HH:MM 로 통일 (C1 안).
 *   - 각 페이지에 정의된 `formatHM`(HH:MM, refetch "Updated" 표시) 은 그대로 유지
 *   - Section Detail "Last Scan" scanAt 도 동일 포맷으로 통일
 *
 * BE 는 `created_at`/`occurred_at` 등을 ISO 8601 풀 datetime 으로 일관 반환.
 * FE 단에서 표시만 짧게 자름.
 */

export function formatMonthDayHM(value) {
  if (!value) return '—';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return '—';
  const p = (n) => (n < 10 ? `0${n}` : `${n}`);
  return `${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`;
}
