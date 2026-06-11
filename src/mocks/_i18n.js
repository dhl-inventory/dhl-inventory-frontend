/**
 * 목업 i18n 분기 헬퍼 — 백엔드 Accept-Language 동작 미러 (B안, 2026-05-20)
 * ─────────────────────────────────────────────────────────────
 * 백엔드는 `sku_name`(ko) / `sku_name_en`(en) 두 컬럼을 Accept-Language 헤더로 분기
 * (backend `inventory_service.py:657 _resolve_display_name`). 목업도 ko/en 토글에 따라
 * display_name 한·영을 교차하도록 같은 동작을 mock 레이어에서 제공.
 *
 * 사용 패턴:
 *
 *   1) 인라인 (accessor 함수 내부 — 매 호출 평가):
 *      import { dn } from './_i18n.js';
 *      return { display_name: dn('아스피린 500mg', 'Aspirin 500mg') };
 *
 *   2) 모듈 상위 const 데이터 (모듈 로드 시 1회 평가) — sku_id 기반 KO_NAMES lookup 으로
 *      accessor 호출 시점에 분기. 행에 직접 `_name_en` 페어를 두지 않아도 됨:
 *      import { localizeRow } from './_i18n.js';
 *      const items = SOURCE.map(localizeRow);   // 각 row 의 display_name 분기
 *
 *   3) target 중첩 (alerts 패턴) — `localizeTarget` 사용.
 *
 * 분기 대상: 약품명만 (display_name / 같은 의미로 쓰이는 sku_name).
 * 분기 제외: zone_name / section_name / alert title·message — B안 범위에서 손대지 않음.
 */
import { getLang } from '../core/i18n/index.js';

/** 한/영 분기 — en 모드면 영문, 그 외 한국어. en 인자 누락 시 ko 폴백. */
export const dn = (ko, en) => (getLang() === 'en' ? (en ?? ko) : ko);

// ─── SKU 한국어 표시명 레지스트리 ─────────────────────────
//   백엔드 `sku_name`(ko) 컬럼 시드와 정합. mock 전체에서 단일 출처.
//   인라인 dn() 사용처(dashboardMock / operationalStatsMock)는 이 맵을 안 쓰고 직접 리터럴.
const KO_NAMES = {
  'sku-001':            '아스피린 500mg',
  'sku-002':            '타이레놀 500mg',
  'sku-003':            '이부프로펜 200mg',
  'sku-004':            '아목시실린 250mg',
  'sku-005':            '비타민C 1000mg',
  'sku-006':            '세티리진 10mg',
  'sku-007':            '오메프라졸 20mg',
  'sku-008':            '로라타딘 10mg',
  'sku-009':            '메트포르민 500mg',
  'sku-010':            '비타민D 1000IU',
  'sku-011':            '리시노프릴 10mg',
  'sku-012':            '심바스타틴 40mg',
  // 07 Operational Stats 전용 (sku_id 체계 별도)
  'sku-aspirin-81':     '아스피린 81mg',
  'sku-tylenol-es':     '타이레놀 ES',
  'sku-cefixime':       '세픽심 시럽',
  'sku-ibuprofen-400':  '이부프로펜 400mg',
  'sku-amoxicillin':    '아목시실린 250mg',
};

/** sku_id 로 한국어 표시명 조회 (없으면 undefined). */
export const koName = (skuId) => KO_NAMES[skuId];

/**
 * row.display_name 을 lang 에 따라 한·영 분기 (sku_id 기반 lookup).
 * - en 모드 또는 한국어 명칭 미등록 시 원본 display_name 그대로.
 * - sku_id 없거나 display_name 필드 없으면 원본 반환 (no-op).
 */
export function localizeRow(row) {
  if (!row?.sku_id) return row;
  const ko = KO_NAMES[row.sku_id];
  if (!ko || row.display_name === undefined) return row;
  return { ...row, display_name: dn(ko, row.display_name) };
}

/** 중첩 target.display_name 분기 (alerts 패턴 — { target: { sku_id, display_name } }). */
export function localizeTarget(item) {
  if (!item?.target?.sku_id) return item;
  return { ...item, target: localizeRow(item.target) };
}
