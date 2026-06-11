# Landing Page 사진 자산 (인벤토리)

발표용 랜딩 페이지의 사진 인벤토리입니다.

## 사용 방법

이 폴더의 파일은 페이지에서 `<img src="/landing/파일명">`으로 직접 참조됩니다. Vite의 `public/` 하위라 빌드 시 `dist/landing/`로 그대로 복사됩니다.

와이어프레임도 본 폴더에 `wireframe-*.png`로 사전 크롭본 보관 — 좌측 메뉴 컬럼 제거본. 원본 `docs/frontend/wireframes/*.png`는 무수정.

## 명명 규칙

`<카테고리>-<설명>.<확장자>` (영문 소문자 + 하이픈)

| 카테고리 prefix | 의미 |
|---|---|
| `plotter-` | 플로터 하드웨어 (CAD 렌더링·실 사진) |
| `ai-` | AI 비전 디텍션 라이브 캡처 |
| `dashboard-` | AURA 대시보드 UI 실 스크린샷 |
| `wireframe-` | 와이어프레임 (좌측 메뉴 사전 크롭본) |
| `team-` | 팀·작업장 사진 |
| `usecase-` | 적용 사례 (병원·창고 등) |

## 인벤토리 (2026-05-24 v4 기준, 29장)

권장 (★★★ > ★★ > ★) / 보조 (·) / 비추 (✗)

### Plotter (하드웨어, 11장)

| 파일 | 내용 | 사용 위치 | 우선 |
|---|---|---|---|
| `plotter-isometric.png` | CAD 아이소메트릭 — 전체 구조 한눈에 | **Hero 슬라이드쇼 1** | ★★★ |
| `plotter-front.png` | CAD 정면 (카메라+가로 레일+선반) | **Hero 슬라이드쇼 2** | ★★ |
| `plotter-side.png` | CAD 좌측 단면 | **Hero 슬라이드쇼 3** | ★★ |
| `plotter-back.png` | CAD 뒷면 (모터·Z레일) | **Hero 슬라이드쇼 4** | ★★ |
| `plotter-axis-mechanism.png` | CAD Z축+X축 가동부 측면 | **Hero 슬라이드쇼 5** · How "이동" | ★★ |
| `plotter-real-mount.png` | 실 카메라·레일 설치 사진 — *실 존재 증명* | How "실 작동" | ★★ |
| `plotter-motor-gear-cad.png` 🆕 | CAD 모터+평기어 클로즈업 — 구동부 디테일 | 보조 (미사용 — BK 판단으로 Team strip 제외) | · |
| `plotter-frame-base-cad.png` 🆕 | CAD X-Y 프레임 베이스플레이트 평면뷰 | **Team strip 5** | ★ |
| `plotter-camera-head.png` | CAD 카메라 헤드 클로즈업 | 보조 (미사용) | · |
| `plotter-camera-module.png` | CAD 카메라 모듈 단독 클로즈업 | 보조 (미사용) | · |
| `plotter-front-dark.png` | CAD 정면 어두운 톤 (중복) | 미사용 | · |

### AI 디텍션 (라이브 캡처, 4장)

| 파일 | 내용 | 사용 위치 | 우선 |
|---|---|---|---|
| `ai-shelf-grab-detection.png` | 사람이 박스 잡는 액션 + YOLO/MediaPipe FPS + S-1/S-2 박스 디텍션 | Features "실시간 감지" · How "감지" | ★★★ |
| `ai-abnormal-access-detection.png` | 사람이 선반 가까이서 dwell·overlap 보이는 디텍션 (Plotter State 표시) | Features "이상 접근 감지" | ★★★ |
| `ai-yolo-pose-livingroom.png` | YOLO+MediaPipe Pose, 사람·plotter-001 동시 디텍션 | 보조 | · |
| `ai-approach-confirmed.png` | Plotter State `APPROACH_CONFIRMED` (이전 후보) | 보조 (`abnormal-access`로 대체됨) | · |

### Dashboard (실 UI 스크린샷, 9장)

| 파일 | 내용 | 사용 위치 | 우선 |
|---|---|---|---|
| `dashboard-main.png` | 메인 화면 (KPI 4카드 + Top 5) | 보조 (v4에서 `wireframe-dashboard`로 교체됨) | · |
| `dashboard-zone-overview.png` | Zone 상태 개요 (A/B/C 카드) | Features "공간 추적" | ★ |
| `dashboard-operational-stats.png` | 운영 통계 (Donut + KPI + Zone 활동) | Features "운영 인사이트" | ★ |
| `dashboard-sku-list.png` | SKU 목록 (정렬·뱃지·재공급) | 보조 | · |
| `dashboard-alerts.png` | 알림 목록 (4분류) | 보조 | · |
| `dashboard-zone-detail.png` | Zone 상세 (Sec + FEFO 준수율) | 보조 | · |
| `dashboard-section-detail.png` | Section 상세 (재스캔/보충) | 보조 | · |
| `dashboard-operational-report.png` | 운영 리포트 (PDF) | 보조 | · |
| `dashboard-sku-list-canva.png` | SKU + Canva 툴팁 (외 요소 노출) | ✗ 비추 | ✗ |

### Wireframe (사전 크롭본, 2장 🆕)

좌측 메뉴 컬럼을 사전 크롭한 발표용 본. 원본은 `docs/frontend/wireframes/`에 무수정 보관.

| 파일 | 원본 | 크롭 | 사용 위치 | 우선 |
|---|---|---|---|---|
| `wireframe-dashboard.png` 🆕 | `docs/wireframes/01_dashboard.png` (1919×911) | 좌 240px 제거 → 1679×911 | **Features "권한별 대시보드"** · How "산출 → 대시보드 반영" | ★★★ |
| `wireframe-fefo.png` 🆕 | `docs/wireframes/04_validity_tracking.png` (1600×1331) | 좌 325px 제거 → 1275×1331 | **Features "FEFO 유통기한 관리"** | ★★★ |

### Use Case (1장)

| 파일 | 내용 | 사용 위치 | 우선 |
|---|---|---|---|
| `usecase-medical-boxes.jpeg` | Medtronic 의료 박스 6개 정렬 (REF/LOT/유통기한) — *병원 도메인 직접 증명* | Use Cases **단일 패널** (병원) | ★★★ |

### Team / 작업장 (5장 — v4 확장)

| 파일 | 내용 | 사용 위치 | 우선 |
|---|---|---|---|
| `team-group.jpg` | 팀 외부 단체 사진 (4–5명) | **Team strip 1** | ★★ |
| `team-fabrication.jpg` | 작업장 부품 가공 (manual lathe) | **Team strip 2** | ★★ |
| `team-outdoor-fabrication.jpg` 🆕 | 야외 작업장(녹색 펜스 배경), 팀원 부품 가공·조립 | **Team strip 3** | ★ |
| `team-equipment-transport.jpg` 🆕 | 우천시 장비 카트 운반 (필드 이동) | **Team strip 4** | ★ |
| `plotter-frame-base-cad.png` 🆕 | CAD 프레임 베이스 — 팀 결과물 | **Team strip 5** | ★ |

## 섹션별 사용 사진 (마크업 진입 시 참조)

| 섹션 | 사진 |
|---|---|
| Hero 슬라이드쇼 (CAD 다각도, 3초 페이드) | `plotter-isometric` → `plotter-front` → `plotter-side` → `plotter-back` → `plotter-axis-mechanism` |
| Problem | (사진 0 — 아이콘 카드) |
| How it works 단계 | `ai-shelf-grab-detection` → `plotter-real-mount` → **`wireframe-dashboard`** |
| Features (6카드) | `ai-shelf-grab-detection` · `ai-abnormal-access-detection` · **`wireframe-fefo`** · **`wireframe-dashboard`** · `dashboard-zone-overview` · `dashboard-operational-stats` |
| Use Cases (단일 패널, 병원) | `usecase-medical-boxes.jpeg` |
| Team strip (5장 가로 나열) | `team-group` · `team-fabrication` · `team-outdoor-fabrication` · `team-equipment-transport` · `plotter-frame-base-cad` |

## 크롭·회전 처리 방침

파일 자체는 원칙적으로 무수정. 와이어프레임만 예외 (좌측 메뉴 제거가 매번 CSS 트릭으로 어려워 사전 크롭본 별도 보관).

| 케이스 | 처리 |
|---|---|
| Hero 슬라이드쇼 (CAD 다각도) | `object-fit: contain` + 컨테이너 어두운 배경(`#2b2d31`)으로 CAD 배경과 자연스럽게 매치 |
| How/Features 카드 이미지 | `object-fit: contain` + `padding` + flex center → 비율 유지하면서 좌우 여백 |
| Use Cases 실 사진 | `object-fit: cover` (사진은 잘려도 자연스러움) |
| Team strip (6장 혼합 비율) | 고정 높이 220px(데스크탑) / 180px(태블릿) / 150px(모바일) + `width: auto` → 각 사진 원래 비율대로 가로 폭 자동, 어두운 BG(`#2b2d31`)로 통일 |
| Wireframe 좌측 메뉴 제거 | PowerShell + System.Drawing 사전 크롭 → `public/landing/wireframe-*.png` 별도 보관 |
| JPG EXIF orientation | 브라우저 자동 처리 (2019+ Chrome/Firefox). 명시 회전 불필요 |

## 와이어프레임 크롭 재생성 방법

원본 와이어프레임이 갱신되면 다음 PowerShell로 좌측 메뉴를 다시 자동 검출·크롭:

```powershell
Add-Type -AssemblyName System.Drawing
function Find-YellowStartX($path, $yProbe) {
    $img = [System.Drawing.Bitmap]::FromFile($path)
    for ($x = 0; $x -lt $img.Width; $x++) {
        $p = $img.GetPixel($x, $yProbe)
        if ($p.R -gt 230 -and $p.G -gt 180 -and $p.B -lt 80) { $img.Dispose(); return $x }
    }
    $img.Dispose(); return -1
}
function Crop-Image($src, $dst, $cropLeft) {
    $i = [System.Drawing.Bitmap]::FromFile($src)
    $w = $i.Width - $cropLeft; $h = $i.Height
    $o = New-Object System.Drawing.Bitmap $w, $h
    $g = [System.Drawing.Graphics]::FromImage($o)
    $g.DrawImage($i, (New-Object System.Drawing.Rectangle 0,0,$w,$h), (New-Object System.Drawing.Rectangle $cropLeft,0,$w,$h), [System.Drawing.GraphicsUnit]::Pixel)
    $g.Dispose(); $o.Save($dst, [System.Drawing.Imaging.ImageFormat]::Png); $o.Dispose(); $i.Dispose()
}
$x1 = Find-YellowStartX 'docs/frontend/wireframes/01_dashboard.png' 30
Crop-Image 'docs/frontend/wireframes/01_dashboard.png' 'frontend/public/landing/wireframe-dashboard.png' $x1
$x2 = Find-YellowStartX 'docs/frontend/wireframes/04_validity_tracking.png' 50
Crop-Image 'docs/frontend/wireframes/04_validity_tracking.png' 'frontend/public/landing/wireframe-fefo.png' $x2
```

## 권장 사양 (향후 추가 자산용)

- 형식: JPG (실사) / PNG (스크린샷·CAD·와이어프레임)
- 해상도: Hero 1600px+, 카드 800px+
- 용량: 1MB 이하 (TinyPNG·Squoosh 압축)
- 파일명: 영문 소문자 + 하이픈
