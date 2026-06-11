# Plotter Digital Twin (FE)

플로터 하드웨어 없이 헤드 위치·박스 qty·v2 시연 흐름을 3D로 시각화.
설계: [`docs/plan/plotter_digital_twin.md`](../../../../docs/plan/plotter_digital_twin.md)

## 라우트

`#/sim` — `super_admin` 또는 `ops_manager` 권한 필요.

## 의존성

```json
"three": "^0.169.0"
```

## 파일

- `spec.js` — `action_recognition/sim/spec.json` FE 사본 (build-time copy 대신 inline). 갱신 시 양쪽 동시 수정.
- `PlotterScene.js` — Three.js scene (frame · sections · 헤드 · 박스 4개 + frustum).
- `SimPage.js` — 라우트 페이지. 우측 패널에서 헤드 위치·박스 qty 조작 + v2 시연 스크립트 버튼.

## 좌표 변환

```
플로터(mm, 좌하단 origin)  →  Three.js(m, center origin)
  x_three =  (x_mm / 1000) - W/2
  y_three =  (y_mm / 1000) - H/2
  z_three = -(z_mm / 1000)        // Z+ = 뒤로 = scene z 음수
```

## 외부 API (PlotterScene 인스턴스)

| 메서드 | 용도 |
|---|---|
| `setHeadPosition(x_mm, y_mm, z_mm)` | 헤드 위치 갱신 |
| `setSectionQty(section_id, count)` | section 박스 qty 변경 (0~4) |
| `setSectionBoxExpired(section_id, box_index, expired=true)` | 박스 한 개를 expired 색상으로 |
| `destroy()` | scene/renderer/geometry 정리 (router 자동 호출) |

## 향후 확장

- `socket.io` 좌표 채널 연결 → ROS `plotter_motor /plotter/state` → MQTT → BE socket bridge → FE
- 실시간 demo v2 진행도 → BE 알림 잡 연동
- 카메라 frustum 시야각 정밀화 (`calibration.md` §5 4K 재측정 후)
- 박스 라벨 텍스트 (sku_id, expiry_date)
