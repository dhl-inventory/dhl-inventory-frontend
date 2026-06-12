# Architecture — Frontend

> SPA 의 구조를 어떻게 잡았고 backend 와 어떻게 HTTP 로 연결되는지를 다룹니다.

---

## 1. 한눈 그림

```
                   ┌───────────────────────────────────────┐
                   │             브라우저                   │
                   │  ┌─────────────────────────────────┐  │
                   │  │  index.html → main.js           │  │
                   │  │  - router init (#/path?query)   │  │
                   │  │  - authStore.hydrateFromStorage │  │
                   │  │  - wireSocketToAuth             │  │
                   │  └────────────────┬────────────────┘  │
                   │                   │                   │
                   │  ┌────────────────┴────────────────┐  │
                   │  │     components/<domain>/         │  │
                   │  │     (페이지 + 모달)               │  │
                   │  └────────┬───────────────────┬─────┘  │
                   │           │                   │        │
                   │  ┌────────▼────────┐  ┌───────▼──────┐ │
                   │  │  store/<domain> │  │  api/<domain>│ │
                   │  │  (createStore)  │  │  Api.js      │ │
                   │  └────────┬────────┘  └───────┬──────┘ │
                   │           │                   │        │
                   │  ┌────────▼───────────────────▼──────┐ │
                   │  │  core/http.js  + core/socket.js   │ │
                   │  └────────┬────────────────────┬─────┘ │
                   └───────────┼────────────────────┼───────┘
                               │ HTTP               │ Socket.io
                               ▼                    ▼
                   ┌──────────────────────────────────────┐
                   │ backend (FastAPI :8000)               │
                   └──────────────────────────────────────┘
```

---

## 2. 모듈 책임

### `src/main.js` — 진입점

1. `core/router.js::init()` 호출 (해시 라우터)
2. `authStore.hydrateFromStorage()` — `localStorage` 에서 토큰 복원
3. `wireSocketToAuth()` — 로그인 시 socket 연결, 로그아웃 시 끊김

### `src/core/router.js`

- 해시 기반 (`#/path?query`)
- RBAC 가드: `canAccess(route, userRole)` 가 false 면 redirect
- 동적 import: 각 컴포넌트는 `() => import('./components/...').then(m => m.default)` 형태
- `history.replaceState` 로 hash 외 path 자동 정리

### `src/core/http.js`

```js
const BASE = import.meta.env.VITE_API_BASE_URL || '/api/v1'
const TOKEN_KEY = 'aura.auth.token'
```

- 모든 요청에 `Authorization: Bearer <token>` 자동 부착 (`localStorage[TOKEN_KEY]`)
- 모든 요청에 `Accept-Language` 자동 (i18n 현재 lang)
- 응답 envelope: `{ success, data, message }` → `{ data: toCamel(data), message, receivedAt }`
- 응답 case 변환은 **응답만** (요청 body 는 snake_case 그대로 — backend 가 snake_case 기대)
- 401 → 1회성 자동 로그아웃 + `#/session-expired` (재진입 방지)
- 403 → 토스트 알림 (`showPermissionNotice()`)

### `src/core/socket.js`

```js
const URL = import.meta.env.VITE_SOCKET_URL
       || originOf(VITE_API_BASE_URL)
       || ''                             // 동일 origin (proxy)
```

- connect 시 `{ auth: { site_id: accessScope.siteId } }` 전달 → backend 가 `site_{site_id}` 룸에 자동 입장
- mock 모드 (`VITE_USE_MOCK !== 'false'`) 는 실제 connect 안 함, 인-메모리 bus 사용
- 핵심 헬퍼:
  - `subscribeInventoryRefetch(handler)` — `inventory_update` 이벤트 debounce 후 refetch
  - `subscribeAlerts(handler)`, `subscribeScanState(handler)`
- lang 토글 시 자동 재요청 (Accept-Language 가 바뀌므로)

### `src/core/createStore.js`

Zustand-like 단순 store. `setState`, `subscribe`, `getState`.
도메인 store 가 이 헬퍼로 만들어지고, 컴포넌트는 store 만 구독.

```js
export const inventoryStore = createStore({ items: [], loading: false }, { name: 'inventory' })
```

### `src/core/normalize.js`

- `toCamel(value)` — 재귀적으로 snake_case → camelCase (응답용)
- `toSnake(value)` — 거의 사용 안 함 (요청은 snake_case 그대로)

### `src/core/i18n/`

`ko.js`, `en.js` 사전 + `t(key)` / `tf(key, params)` 헬퍼.
미존재 키는 영어 fallback.

---

## 3. API 어댑터 패턴

`src/api/<domain>Api.js` 가 mock ↔ 실 BE 분기를 흡수합니다.

```js
// 예: src/api/dashboardApi.js
import http from '../core/http.js'
import * as mocks from '../mocks/dashboardMocks.js'

const USE_MOCK = import.meta.env.VITE_USE_MOCK !== 'false'

export async function fetchInbound(params) {
  if (USE_MOCK) return mocks.fetchInbound(params)
  return http.get('/dashboard/inbound', { params })
}
```

컴포넌트는 어댑터를 직접 부르지 않고 store 를 통해서만 부릅니다:

```
component → store action → api/<domain>Api → http or mock
```

도메인별 엔드포인트 매핑은 [api-mapping.md](api-mapping.md).

### `*_BACKEND_READY` 가드

일부 도메인은 backend 미준비 상태에서 강제 mock 유지.

```js
const COMPANY_API_BACKEND_READY = false   // backend ship 후 true 로 토글
```

운영 빌드 전 각 가드를 점검합니다.

---

## 4. Socket.io 와이어링

```
core/socket.js
  └─ connect → site_{site_id} 룸 자동 입장
       ├─ on('inventory_update')  → subscribeInventoryRefetch → 도메인 store refetch
       ├─ on('alert')             → alertsStore handler (인라인 toCamel)
       ├─ on('scan_state')        → scanStore handler (UI 상태 업데이트)
       └─ on('zone_access')       → (현재 구독자 없음 — 손실 가능)
```

backend emit 이벤트 명세는 backend [docs/api.md](../../dhl-inventory-server/docs/api.md) §Socket.io.

---

## 5. 라우트 ↔ 페이지 ↔ store ↔ API

| 라우트 | 컴포넌트 | store | 어댑터 |
|---|---|---|---|
| `#/login` | `auth/LoginPage` | `authStore` | — (직접 http) |
| `#/dashboard` | `dashboard/DashboardPage` | `dashboardStore` | `dashboardApi` |
| `#/inventory` | `inventory/InventoryListPage` | `inventoryStore` | `inventoryApi` |
| `#/inventory/:skuId` | `inventory/InventoryDetailPage` | `inventoryStore` | `inventoryApi` |
| `#/zones` | `zone/ZoneListPage` | `zoneStore` | `zoneApi` |
| `#/zones/:zoneId/sections/:sectionId` | `zone/SectionDetailPage` | `zoneStore` | `zoneApi` |
| `#/validity` | `validity/ValidityPage` | — (사용 시점 fetch) | `validityApi` |
| `#/operational-stats` | `operationalStats/OperationalStatsPage` | `operationalStatsStore` | `operationalStatsApi` |
| `#/alerts` | `alerts/AlertsPage` | `alertsStore` | `alertsApi` |
| `#/alert-settings` | `alertSettings/AlertSettingsPage` | — | `alertSettingsApi` |
| `#/admin/users` | `users/UsersPage` | `usersStore` | `usersApi` |
| `#/account` | `account/AccountPage` | `authStore` | — |

상세 매핑은 [`src/constants/routes.js`](../src/constants/routes.js).

---

## 6. 4-role IA

| 역할 | 메뉴 접근 |
|---|---|
| `super_admin` | 전부 |
| `ops_manager` | dashboard / inventory / zone / validity / operationalStats / alerts / alertSettings / users |
| `field_manager` | dashboard / inventory / zone / validity / alerts (자신 zone 범위) |
| `ai_monitor` | (AI 모니터링 — backend `/monitoring/*`) |

권한 매트릭스는 `src/constants/roles.js` 와 라우터 가드.

---

## 7. 빌드 산출

`npm run build` 는 `dist/` 에 정적 자산을 만듭니다.

- `index.html` — 메인 SPA
- `landing.html` — 별도 랜딩 (Vite multi-entry)
- `assets/*.js`, `assets/*.css` — 코드 분할된 청크 (도메인 별 동적 import)

배포는 정적 호스팅에 `dist/` 통째로 올리고, SPA fallback (`try_files $uri /index.html`) 만 설정하면 동작합니다.

---

## 8. 의존성

- `vite` 6 — 빌드 / dev 서버 / HMR
- `bootstrap` 5.3 — 레이아웃 + 컴포넌트
- `chart.js` 4 — 차트
- `socket.io-client` 4 — 실시간 push
- `html2pdf.js` — 운영 통계 PDF
- `clsx` — 조건부 className
- `@popperjs/core` — 모달/툴팁 positioning
- `three` — (현재 미사용, 향후 3D 뷰)
