/**
 * Plotter Digital Twin spec — action_recognition/sim/spec.json 사본 (FE inline).
 *
 * 단일 source는 action_recognition/sim/spec.json. 본 파일은 그 사본 (build-time copy 대신 inline).
 * 값 갱신 시 두 곳을 함께 수정. 향후 vite plugin으로 build-time fetch 통합 권장.
 *
 * 검증 상태:
 *   ✅ frame.outer_width/height, strokes.x/y_mm, coordinate_system, sections
 *      → calibration.md §1~§3 + sections.yaml 정합
 *   ⚠️ camera (4K 기준 px/mm 재측정 필요), frame.outer_depth_mm null (STEP CAD 추출 미정)
 */

export const PLOTTER_SPEC = {
  frame: {
    outer_width_mm:  430,
    outer_height_mm: 620,
    outer_depth_mm:  400,  // D₀(calibration §8 ≈ 231mm) lens-박스 거리 + 박스/헤드 분리 위해 400.
  },
  strokes: {
    x_mm:           425,
    y_mm:           610,
    z_mm_back_safe:  55,
  },
  // 운영 매핑: section 1 = 위층 (y=340), section 2 = 아래층 (y=0)
  sections: [
    { id: 1, label: '상단 (section 1)', x_mm: 200, y_mm: 340, z_mm: 0,
      demo_label: '타이레놀 500mg', color: 0x4f8cff },  // blue
    { id: 2, label: '하단 (section 2)', x_mm: 200, y_mm: 0,   z_mm: 0,
      demo_label: '판콜에이',        color: 0xff8060 },  // coral
  ],
  head: {
    // STEP CAD 헤드(중).step 기준 envelope (54×65×81mm). 위/뒤 패널 포함 81×81×65.
    width_mm:  81,
    height_mm: 81,
    depth_mm:  65,
  },
};
