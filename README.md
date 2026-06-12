# DHL Inventory — Frontend

병원·물류창고 환경의 AI 비전 기반 지능형 재고 자율 운영 시스템의 웹 대시보드.
Vanilla JS SPA — 카메라 스캔 결과를 Socket.io 로 실시간 push 받아 SKU 현황·유통기한(FEFO)·운영 통계를 시각화합니다.

백엔드: [`dhl-inventory-server`](https://github.com/dhl-inventory/dhl-inventory-server) (단일 FastAPI + MongoDB Atlas, 디바이스 API 통합)

---

## Quick Start

```bash
npm install                  # 의존성 설치 (최초 1회)
npm run dev                  # 개발 서버 http://localhost:3000
```

mock 모드 기본값 — BE 없이 화면 동작 확인 가능. 실 BE 연동·운영 빌드·환경 변수 상세는 아래 §환경 변수 ~ §빌드 & 배포 참조.

역할별 사용 매뉴얼은 [`docs/manual/`](docs/manual/) 참조.

---

## 기술 스택

| 분류 | 사용 |
|---|---|
| 빌드 | Vite 6 |
| 코어 | Vanilla JS (ESM), ES2022 |
| UI | Bootstrap 5.3, Material Symbols, Chart.js 4 |
| 실시간 | Socket.io Client 4 |
| 기타 | html2pdf.js, clsx, Popper |

---

## 프로젝트 구조

```text
dhl-inventory-frontend/
├─ src/
│  ├─ main.js                ← 진입점 (router init)
│  ├─ index.css              ← 전역 CSS (Bootstrap override + 컴포넌트 CSS)
│  ├─ api/                   ← 도메인 API 어댑터 (mock ↔ 실 BE 분기)
│  ├─ components/            ← 페이지·모달·공통 컴포넌트
│  │  ├─ auth/               ← 로그인 / 비밀번호 리셋
│  │  ├─ common/             ← Layout (Sidebar/TopBar) · AlertCenter
│  │  ├─ dashboard/          ← 01 대시보드
│  │  ├─ inventory/          ← 02 SKU 목록 / 상세 / 입고 / 보충
│  │  ├─ zone/               ← 03 Zone / Section Detail / SnapshotModal
│  │  ├─ validity/           ← 04 유통기한 추적
│  │  ├─ operationalStats/   ← 05 운영 통계 + 리포트 PDF
│  │  ├─ alerts/             ← 06 알림 목록
│  │  ├─ alertSettings/      ← 07 알림 설정
│  │  ├─ users/              ← 08 사용자 관리 (super_admin/ops)
│  │  └─ account/            ← 09 내 계정 / 비밀번호 변경
│  ├─ constants/             ← 라우트 / 메뉴 / 역할 / 색상
│  ├─ core/                  ← router · http · i18n · socket · createStore · format · normalize
│  ├─ mocks/                 ← 도메인별 mock 데이터 (실 BE 응답 envelope 미러)
│  ├─ store/                 ← 도메인 store (createStore 패턴, Zustand-like)
│  └─ utils/                 ← statusDisplay · alertDisplay · forecast 등
├─ docs/                     ← 설계·명세·아키텍처·와이어프레임 (인덱스: docs/README.md)
├─ .env.example              ← 환경 변수 템플릿
├─ index.html
└─ package.json
```

---

## 요구사항

- Node 20+ / npm 10+
- 모던 브라우저 (Chromium 계열 권장)

---

## 환경 변수

`.env.example` 을 복사해 환경별 파일을 작성합니다. `.env.*` 는 `.env.example` 제외 모두 git 추적 제외입니다 (Vite 기본 규약).

| 파일 | 용도 |
|---|---|
| `.env.example` | 추적 대상. 변수 목록·기본값 템플릿 |
| `.env.local` | 로컬 개발 오버라이드 (개인용) |
| `.env.development` | `npm run dev` 가 자동 로드 |
| `.env.production` | `npm run build` 가 자동 로드 — **운영 빌드 필수** |

| 변수 | 설명 |
|---|---|
| `VITE_USE_MOCK` | `'false'` 가 아니면 mock 모드 (개발 안전 기본값). **운영 빌드는 반드시 `false`** |
| `VITE_API_BASE_URL` | 실 BE base URL. mock 모드에서는 무시 |

### 환경별 예시

`.env.development`
```
VITE_USE_MOCK=true
VITE_API_BASE_URL=http://localhost:8000/api/v1
```

`.env.production`
```
VITE_USE_MOCK=false
VITE_API_BASE_URL=https://<production-api-host>/api/v1
```

---

## 개발

```bash
npm install
cp .env.example .env.local   # 필요 시 값 수정
npm run dev                  # http://localhost:3000 (HMR)
```

| 명령 | 설명 |
|---|---|
| `npm run dev` | 개발 서버 (port 3000, host 0.0.0.0). HMR 지원 |
| `npm run preview` | `dist/` 산출물 로컬 미리보기 |
| `npm run clean` | `dist/` 제거 |

---

## 빌드 & 배포

### 운영 빌드

```bash
npm ci                       # lockfile 기준 deterministic install
npm run build                # dist/ 산출
```

**선행 점검 (실 BE 빌드 시):**

- [ ] `.env.production` 의 `VITE_USE_MOCK=false` 확인
- [ ] `.env.production` 의 `VITE_API_BASE_URL` 이 운영 API 가리키는지 확인
- [ ] BE `/api/v1/auth/login`·`/auth/me` 가용성 확인
- [ ] Socket.io endpoint (`/socket.io/`) 가 동일 origin 또는 CORS 허용 상태 확인
- [ ] 운영 빌드용 사용자 계정 (role 별) 사전 발급

### 배포

`dist/` 산출물을 정적 호스팅에 배포 (nginx / S3+CloudFront / Vercel 등).

**SPA fallback (hash 라우터 사용 중)**: 모든 path 요청은 `index.html` 로 반환되어야 합니다 (nginx `try_files $uri /index.html`).
앱 초기화 시점에 router 가 hash 외 path 부분을 자동 정리하므로 (`history.replaceState`), `/<any>#/<route>` 형태로 들어와도 화면 동작은 무관합니다.

### 롤백

이전 버전 `dist/` 산출물로 정적 호스팅 교체. 백엔드 호환성 확인 후 진행.

---

## 모드 분기 — Mock vs 실 BE

| 모드 | 토글 | 동작 |
|---|---|---|
| **Mock (개발 기본값)** | `VITE_USE_MOCK=true` 또는 미설정 | `src/mocks/*` 의 시드 데이터로 동작. BE 무관 작업 가능. 실 BE 응답 envelope 미러 |
| **실 BE (운영)** | `VITE_USE_MOCK=false` | `VITE_API_BASE_URL` 로 실 호출. Accept-Language 헤더 lang 협상, 401/403 자동 로그아웃 |

일부 도메인은 BE 미준비로 강제 mock 유지 (`*_BACKEND_READY=false` 가드 — scan/section-create/company 등).
운영 빌드 시점에 각 가드가 `true` 인지 점검하세요.

---

## 인증

- 로그인 endpoint: `POST /api/v1/auth/login` (body: `{ username, password }`)
- 응답의 `accessToken` 을 `localStorage` 에 저장 후 모든 요청 `Authorization: Bearer <token>` 자동 부착
- 401/403 응답 시 자동 로그아웃 + 로그인 화면 이동

**계정 발급 정책 (B2B):**

- 공개 회원가입 없음
- 운영 환경 계정은 **Super Admin / Ops Manager** 가 발급 (`/admin/users` 또는 사용자 관리 화면)
- 임시 비밀번호는 1회성 노출 — 발급 직후 사용자에게 안전 채널로 전달

**Mock 모드 계정**은 `src/store/authStore.js` 의 `MOCK_ACCOUNTS` 참조 (개발/시연 전용, 실 배포본과 무관).

---

## 주요 문서

| 문서 | 설명 |
|---|---|
| [docs/README.md](docs/README.md) | docs 인덱스 (3카테고리: progress/specs/architecture) |
| [docs/manual/README.md](docs/manual/README.md) | **역할별 사용 매뉴얼** (field/ops/super_admin/ai_monitor) — 인수받은 기업·운영자 진입점 |
| [docs/architecture/architecture_plan.md](docs/architecture/architecture_plan.md) | 전체 아키텍처 (router·store·socket·http) |
| [docs/architecture/api_connection_plan.md](docs/architecture/api_connection_plan.md) | API 어댑터 패턴 · snake↔camel · mock 분기 |
| [docs/architecture/socket_io_guide.md](docs/architecture/socket_io_guide.md) | inventory_update / alert 실시간 push 흐름 |
| [docs/specs/role_based_ia.md](docs/specs/role_based_ia.md) | 4-role IA, 메뉴/페이지 접근 매트릭스 |
| [docs/specs/page_feature_outline.md](docs/specs/page_feature_outline.md) | 페이지별 기능·흐름 |
| [docs/specs/page_layout_outline.md](docs/specs/page_layout_outline.md) | 페이지별 UI 블록 |
| [docs/wireframes/](docs/wireframes/) | v2 와이어프레임 PNG |
| [docs/presentation/scenarios/](docs/presentation/scenarios/) | 시연 시나리오 (Field/Ops Manager 동선 + 트러블슈팅 fallback) |

---

## 패턴 요약

- **Router**: hash 기반 (`#/path?query`) · RBAC 가드 (`canAccess`) · 동적 import 코드 분할
- **Store**: `createStore` (Zustand-like) — 도메인별 단일 store, lang race-defense 적용
- **API 어댑터**: `src/api/*Api.js` 가 mock/실 BE 분기 흡수 → 컴포넌트는 store 만 구독
- **Socket**: `subscribeInventoryRefetch` debounce, lang 토글 시 자동 재요청
- **i18n**: `t(key)` / `tf(key, params)` — `core/i18n/{ko,en}.js` 사전, 미존재 시 영어 fallback
- **모달**: `mount/open/close/unmount` 라이프사이클 패턴 일관

---

## 라이선스 & 팀

| 파트 | 담당 |
|---|---|
| 프론트엔드 | 김보경 |

상세 분담은 루트 README 의 "참여 파트" 참조. 라이선스는 루트 프로젝트 정책을 따릅니다.
