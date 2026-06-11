/**
 * sectionLayout — Section grid 좌표 정적 config (MVP)
 * ─────────────────────────────────────────────────────────────
 * Backend §3.5 (Section x/y/width/height) Post-MVP — MVP는 frontend config 우회
 * (backend_zone_request.md §5.4 + pending §2.12 정합).
 *
 * Post-MVP에 backend가 `sections.{x,y,width,height}` 컬럼 추가하면 본 파일 제거하고
 * 응답값 그대로 사용. 그 전까지는 zone_id 기반 정적 매핑.
 *
 * 좌표 단위: 100 x 100 정규화 grid. CSS grid-template로 변환되거나 SVG 배치에 사용.
 */

export const SECTION_LAYOUT = Object.freeze({
  'zone-A': {
    cols: 2,
    sections: [
      { section_id: 1, col: 1, row: 1 },
      { section_id: 2, col: 2, row: 1 },
      { section_id: 3, col: 1, row: 2 },
      { section_id: 4, col: 2, row: 2 },
    ],
  },
  'zone-B': {
    cols: 2,
    sections: [
      { section_id: 5, col: 1, row: 1 },
      { section_id: 6, col: 2, row: 1 },
      { section_id: 7, col: 1, row: 2 },
    ],
  },
  'zone-C': {
    cols: 2,
    sections: [
      { section_id: 8, col: 1, row: 1 },
      { section_id: 9, col: 2, row: 1 },
      { section_id: 10, col: 1, row: 2 },
    ],
  },
});

export function getSectionLayout(zoneId) {
  return SECTION_LAYOUT[zoneId] ?? { cols: 2, sections: [] };
}
