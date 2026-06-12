# Development — Frontend

로컬에서 frontend 만 (또는 backend 와 함께) 띄우는 가이드.

---

## 1. 사전 설치

```bash
node --version    # 20 이상
npm --version     # 10 이상
```

설치:

```bash
# Node 20 LTS (macOS)
brew install node@20
```

---

## 2. 첫 기동 (mock 모드 — backend 불필요)

```bash
git clone <repo>
cd dhl-inventory-frontend

npm install
npm run dev      # http://localhost:3000
```

기본은 mock 모드 — `src/mocks/*` 시드로 화면 전체가 동작합니다.

mock 계정은 `src/store/authStore.js::MOCK_ACCOUNTS`. 로그인 화면에서 그대로 사용.

---

## 3. 실 backend 와 연동

### 옵션 A — Vite proxy 사용 (권장)

```bash
cat > .env.local <<EOF
VITE_USE_MOCK=false
VITE_API_BASE_URL=/api/v1
EOF
npm run dev
```

Vite dev 서버가 `/api/v1/*` 과 `/socket.io/*` 를 `http://localhost:8000` 으로 forward.
proxy target 을 바꾸려면 `VITE_BACKEND_PROXY_TARGET=http://192.168.0.10:8000` 추가.

장점: CORS 우회. backend 코드를 안 건드림.

### 옵션 B — 직접 호스트 지정

```bash
cat > .env.local <<EOF
VITE_USE_MOCK=false
VITE_API_BASE_URL=http://localhost:8000/api/v1
EOF
npm run dev
```

이 경우 backend 의 CORS 설정이 `http://localhost:3000` 을 허용해야 합니다.

### 둘 다 안 될 때

backend 로 직접 `curl http://localhost:8000/api/v1/docs` 로 backend 가 살아있는지 먼저 확인:

```bash
curl -i http://localhost:8000/
# HTTP/1.1 200 OK
# {"ok": true}
```

---

## 4. 흔한 트러블슈팅

### 화면이 빈 화면 / 흰 화면

→ DevTools Console 에러 확인. 401 이면 토큰 만료 (`localStorage.clear()` 후 재로그인).

### `Failed to fetch` 또는 `Network Error`

→ backend 미기동, 또는 proxy 가 안 돌고 있음. `/api/v1/docs` 직접 열어보고 backend 가능 여부 확인.

### Socket.io 가 reconnect 만 반복

→ login 후 `accessScope.siteId` 가 비어 있으면 `auth.site_id` 가 빠짐 → backend 가 disconnect.
`authStore` 가 `accessScope` 를 잘 받아왔는지 확인 (`/api/v1/auth/me` 응답).

### 실시간 데이터가 안 옴 (alert / inventory_update)

1. Socket.io 가 connect 됐는지 (DevTools Network → WS)
2. backend MongoDB 가 Replica Set 모드인지 (`rs.status().ok === 1`)
3. backend Change Stream watcher 가 시작됐는지 (backend 로그)

### Bootstrap CSS 안 먹음

→ `src/index.css` 가 import 됐는지 (`main.js` 상단). Vite HMR 가 가끔 CSS 를 캐싱 — `Cmd+Shift+R` (강제 새로고침).

### 401 후 무한 redirect

→ `localStorage['aura.auth.token']` 가 만료된 토큰이 박혀 있음. `localStorage.removeItem('aura.auth.token')` 후 새로 로그인.

### i18n 키가 그대로 표시 (`dashboard.title` 같은 식)

→ `src/core/i18n/{ko,en}.js` 에 키 누락. 영어 fallback 도 없으면 키가 그대로 노출.

---

## 5. 개발자 워크플로

### 새 페이지 추가

1. `src/components/<domain>/<Page>.js` — `mount(root)`, `unmount()` 형태 export
2. `src/constants/routes.js` 에 라우트 추가 (`canAccess` role 명시)
3. `src/constants/menu.js` 에 사이드바 메뉴 (해당 역할에 보일지)
4. `src/api/<domain>Api.js` 새로 만들거나 기존 어댑터에 함수 추가
5. `src/store/<domain>Store.js` 만들고 fetch action 추가
6. `src/mocks/<domain>Mocks.js` 에 mock 데이터

### 새 API 어댑터

```js
// src/api/myApi.js
import http from '../core/http.js'
import * as mocks from '../mocks/myMocks.js'

const USE_MOCK = import.meta.env.VITE_USE_MOCK !== 'false'
const BACKEND_READY = true     // backend 미준비면 false

export async function fetchSomething(params) {
  if (USE_MOCK || !BACKEND_READY) return mocks.fetchSomething(params)
  return http.get('/something', { params })
}
```

### 의존성 추가

```bash
npm install <package>
```

`package.json` 과 `package-lock.json` 둘 다 커밋.

### 빌드 출력 확인

```bash
npm run build
npm run preview         # dist/ 미리보기 (http://localhost:4173)
```

---

## 6. backend 와 함께 동작 확인 (통합 시나리오)

1. **backend 기동** (별도 터미널)
   ```bash
   cd ../dhl-inventory-server
   ./run.sh
   ```

2. **MongoDB RS 가 떠 있는지** 확인
   ```bash
   mongosh --eval 'rs.status().ok'
   # 1
   ```

3. **frontend 기동** (이 터미널)
   ```bash
   npm run dev
   ```

4. 브라우저 <http://localhost:3000> → 로그인 → 대시보드

5. **실시간 push 검증**:
   - mongosh 로 `alerts` 컬렉션에 한 건 insert
   - frontend 우상단 알림 배지가 즉시 갱신되면 OK
   ```js
   use dhl_inventory
   db.alerts.insertOne({
     site_id: "site-001",
     alert_type: "low_stock",
     status: "pending",
     created_at: new Date(),
     payload: { sku_id: "TEST-001", quantity: 0 },
   })
   ```

6. **수동 스캔 트리거** (`POST /api/v1/scans`):
   - Zone Detail 페이지에서 "스캔 시작" 버튼 → `scan_state` Socket.io 이벤트로 상태 transition 확인
