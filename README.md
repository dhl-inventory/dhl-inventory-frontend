# DHL Inventory — Frontend

AI 비전 기반 지능형 재고 운영 시스템의 운영 대시보드 (SPA).

- **스택**: Vite 6 · Vanilla JS (ESM, ES2022) · Bootstrap 5.3 · Chart.js 4 · Socket.io Client 4
- **포트**: dev `3000`, 운영은 정적 호스팅 (nginx / S3+CloudFront / Vercel)
- **백엔드**: [`dhl-inventory-server`](../dhl-inventory-server) (HTTP `/api/v1` + Socket.io `/socket.io/`)

상위 디렉토리의 [`README.md`](../README.md) 에 전체 시스템 그림이 있습니다.

---

## Quick Start

```bash
npm install
npm run dev           # http://localhost:3000 (mock 모드 기본값, backend 불필요)
```

실 backend 와 연동:

```bash
cat > .env.local <<EOF
VITE_USE_MOCK=false
VITE_API_BASE_URL=/api/v1
EOF
npm run dev           # Vite proxy 가 /api/v1, /socket.io 를 localhost:8000 으로 forward
```

---

## 요구사항

- Node 20+ / npm 10+
- Chromium 계열 브라우저 (개발/시연 권장)

---

## 디렉토리 구조

```
src/
├── main.js                  진입점 (router · auth · socket 와이어링)
├── index.css                전역 CSS (Bootstrap override)
├── api/                     도메인 API 어댑터 (mock ↔ 실 BE 분기)
│   ├── alertsApi.js
│   ├── alertSettingsApi.js
│   ├── companyApi.js
│   ├── dashboardApi.js
│   ├── inventoryApi.js
│   ├── operationalStatsApi.js
│   ├── scanApi.js
│   ├── usersApi.js
│   ├── validityApi.js
│   └── zoneApi.js
├── components/              페이지 · 모달 · 공통 컴포넌트 (역할별 IA)
│   ├── auth/                로그인 / 비밀번호 리셋
│   ├── common/              Layout (Sidebar/TopBar) · AlertCenter
│   ├── dashboard/           01 대시보드
│   ├── inventory/           02 SKU 목록 · 상세 · 입고 · 보충
│   ├── zone/                03 Zone · Section · Snapshot
│   ├── validity/            04 유통기한 추적
│   ├── operationalStats/    05 운영 통계 · PDF 리포트
│   ├── alerts/              06 알림 목록
│   ├── alertSettings/       07 알림 설정
│   ├── users/               08 사용자 관리 (super_admin/ops)
│   └── account/             09 내 계정
├── constants/               라우트 · 메뉴 · 역할 · 색상
├── core/                    router · http · i18n · socket · createStore · format · normalize
├── mocks/                   도메인별 시드 (실 BE envelope 미러)
├── store/                   도메인 store (createStore 패턴, Zustand-like)
└── utils/                   statusDisplay · alertDisplay · forecast
docs/                        architecture · api-mapping · development 가이드
public/                      정적 자산
landing.html / landing/      랜딩 페이지 (별도 SPA)
index.html                   메인 SPA 진입
vite.config.js
package.json
```

---

## 상세 docs

| 문서 | 내용 |
|---|---|
| [docs/architecture.md](docs/architecture.md) | router · store · http · socket · normalize 패턴 |
| [docs/api-mapping.md](docs/api-mapping.md) | 어댑터 함수 → backend 라우트 매핑 |
| [docs/development.md](docs/development.md) | mock vs 실 BE · proxy · 트러블슈팅 |

---

## 환경 변수

`.env.example` 을 복사해 환경별 파일 작성. `.env.*` 는 `.env.example` 제외 모두 git 추적 제외 (Vite 기본).

| 파일 | 자동 로드 시점 |
|---|---|
| `.env.example` | 추적 대상. 변수 목록·기본값 템플릿 |
| `.env.local` | 모든 모드. 개인 로컬 오버라이드 |
| `.env.development` | `npm run dev` |
| `.env.production` | `npm run build` — **운영 빌드 필수** |

| 변수 | 설명 |
|---|---|
| `VITE_USE_MOCK` | `'false'` 가 아니면 mock 모드 (개발 안전 기본값). **운영 빌드는 반드시 `false`** |
| `VITE_API_BASE_URL` | 실 BE base URL (`/api/v1` 포함). mock 모드에서는 무시 |
| `VITE_SOCKET_URL` | (선택) Socket.io origin 명시 override |
| `VITE_BACKEND_PROXY_TARGET` | (dev only) Vite proxy 의 target. 기본 `http://localhost:8000` |

```bash
# .env.development (또는 .env.local)
VITE_USE_MOCK=false
VITE_API_BASE_URL=/api/v1                # Vite proxy 사용

# .env.production
VITE_USE_MOCK=false
VITE_API_BASE_URL=https://<api-host>/api/v1
```

---

## 개발 / 빌드 / 배포

```bash
npm install
npm run dev                  # 개발 서버 (port 3000, host 0.0.0.0, HMR)
npm run build                # dist/ 산출
npm run preview              # dist/ 미리보기
npm run clean                # dist/ 제거
```

### 운영 빌드 전 점검

- [ ] `.env.production` 에 `VITE_USE_MOCK=false`
- [ ] `VITE_API_BASE_URL` 가 운영 API (`/api/v1` 포함)
- [ ] backend `/api/v1/auth/login`, `/auth/me` 가용성
- [ ] backend Socket.io (`/socket.io/`) 동일 origin 또는 CORS 허용
- [ ] 역할별 사용자 계정 사전 발급

### 배포

`dist/` 를 정적 호스팅 (nginx / S3+CloudFront / Vercel).
**SPA fallback**: 모든 path 가 `index.html` 로 fallback (`try_files $uri /index.html`).

---

## 인증

- 로그인: `POST /api/v1/auth/login` (body: `{ username, password }`)
- 응답의 `accessToken` 을 `localStorage['aura.auth.token']` 에 저장 → 모든 요청 `Authorization: Bearer <token>` 자동 부착
- 401/403 시 자동 로그아웃 + 로그인 화면 이동

**계정 정책 (B2B)**
- 공개 회원가입 없음
- 운영 계정은 super_admin / ops_manager 가 `/admin/users` 에서 발급
- 임시 비밀번호는 1회성 노출

Mock 모드 계정은 `src/store/authStore.js::MOCK_ACCOUNTS` 참조 (개발/시연 전용).

---

## 패턴 요약

- **Router**: hash 기반 (`#/path?query`) · RBAC 가드 · 동적 import 코드 분할
- **Store**: `createStore` (Zustand-like) — 도메인별 단일 store, lang race-defense
- **HTTP**: 단일 `core/http.js` 통과 — Bearer 자동, 응답 snake → camel 자동
- **Socket**: `subscribeInventoryRefetch` debounce, lang 토글 시 자동 재요청
- **i18n**: `t(key)` / `tf(key, params)` — ko / en, 미존재 시 영어 fallback
- **모달**: `mount/open/close/unmount` 라이프사이클

자세한 패턴 설명은 [docs/architecture.md](docs/architecture.md).

---

## 라이선스 & 팀

| 파트 | 담당 |
|---|---|
| 프론트엔드 | 김보경 |

라이선스는 루트 프로젝트 정책을 따릅니다.
