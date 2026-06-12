# API Mapping — Frontend ↔ Backend

> `src/api/*.js` 어댑터의 각 함수가 backend 의 어느 라우트를 호출하는지 매핑.
> backend 라우트 인벤토리는 [dhl-inventory-server/docs/api.md](../../dhl-inventory-server/docs/api.md).

---

## 1. 어댑터 일반 동작

```
ui component → store action → api/*Api.js 함수
                                      ├─ mock 모드: src/mocks/*Mocks 호출
                                      └─ 실 모드: core/http.js 호출 → backend
```

- 모드 토글: `VITE_USE_MOCK` (`!== 'false'` 면 mock)
- 일부 도메인은 `<DOMAIN>_BACKEND_READY = false` 가드로 강제 mock

---

## 2. 어댑터별 매핑

### `authStore.js`
| 함수 | METHOD | PATH |
|---|---|---|
| `login(username, password)` | POST | `/api/v1/auth/login` → `GET /api/v1/auth/me` |
| `logout()` | POST | `/api/v1/auth/logout` |
| `changePassword(current, next)` | PATCH | `/api/v1/auth/password` |
| `requestPasswordReset(usernameOrEmail)` | POST | `/api/v1/auth/password-reset-requests` |

### `alertsApi.js`
| 함수 | METHOD | PATH |
|---|---|---|
| `fetchAlerts(params)` | GET | `/api/v1/alerts` |
| `fetchAlertsActive(params)` | GET ×2 | `/api/v1/alerts?status=pending` + `?status=in_process` (frontend 가 merge) |
| `updateAlertStatus(alertId, status)` | PATCH | `/api/v1/alerts/{alert_id}` |

### `alertSettingsApi.js`
| 함수 | METHOD | PATH |
|---|---|---|
| `fetchStockThresholds(params)` | GET | `/api/v1/admin/capacity-settings` + `/api/v1/inventory/stock` (합성) |
| `updateStockThreshold(skuId, standardQty)` | PATCH | `/api/v1/admin/capacity-settings` |
| `fetchAlertRules()` | GET | `/api/v1/alerts/settings` |
| `updateAlertRule(alertType, payload)` | PATCH | `/api/v1/alerts/settings/{alert_type}` |

### `companyApi.js`
| 함수 | METHOD | PATH | Backend Ready |
|---|---|---|---|
| `fetchCompanyOverview()` | GET | `/api/v1/companies/overview` | ❌ — 강제 mock |

### `dashboardApi.js`
| 함수 | METHOD | PATH |
|---|---|---|
| `fetchInbound(params)` | GET | `/api/v1/dashboard/inbound` |
| `fetchOutbound(params)` | GET | `/api/v1/dashboard/outbound` |
| `fetchValidity(params)` | GET | `/api/v1/dashboard/validity` |
| `fetchCapacity(params)` | GET | `/api/v1/dashboard/capacity` |
| `fetchTopItems(params)` | GET | `/api/v1/dashboard/top-items` |
| `fetchValidityList(params)` | GET | `/api/v1/dashboard/validity-list` |
| `fetchDashboardSummary(params)` | GET ×6 | 위 6개 병렬 호출 후 합성 |

### `inventoryApi.js`
| 함수 | METHOD | PATH |
|---|---|---|
| `fetchInventoryStock(params)` | GET | `/api/v1/inventory/stock` |
| `fetchInventoryStockDetail(skuId)` | GET | `/api/v1/inventory/stock/{sku_id}` |
| `fetchInventoryStockTrend(skuId, period)` | GET | `/api/v1/inventory/stock/{sku_id}/trend` |
| `fetchInventoryBatches(skuId)` | GET | `/api/v1/inventory/batches?sku_id={sku_id}` |
| `fetchInventoryEvents(skuId, limit)` | GET | `/api/v1/inventory/events?sku_id={sku_id}` |
| `createRefillRequest(payload)` | POST | `/api/v1/inventory/refill-requests` |
| `listRefillRequests(params)` | GET | `/api/v1/inventory/refill-requests` |
| `registerInbound(payload)` | POST | `/api/v1/inventory/inbound` |
| `adjustStock(payload)` | POST | `/api/v1/inventory/manual` |
| `fetchSectionsByZone(zoneId)` | GET | `/api/v1/inventory/zones/{zone_id}/sections` |
| `fetchInventoryZones()` | — | mock 또는 stock 으로부터 derive |

### `operationalStatsApi.js`
| 함수 | METHOD | PATH | 쿼리 |
|---|---|---|---|
| `fetchAnalyticsStats(params)` | GET | `/api/v1/analytics/stats` | `start_date, end_date, period?, zone_id?` |
| `fetchAnalyticsKpi(params)` | GET | `/api/v1/analytics/kpi` | `start_date, end_date, period?` |
| `fetchAnalyticsOutboundFrequency(params)` | GET | `/api/v1/analytics/outbound-frequency` | `start_date, end_date, limit?, zone_id?` |
| `fetchAnalyticsConsumption(params)` | GET | `/api/v1/analytics/consumption` | `year, month?` |
| `fetchAnalyticsZoneAccess(params)` | GET | `/api/v1/analytics/zone-access` | `start_date, end_date, zone_id?` |
| `fetchAnalyticsEvents(params)` | GET | `/api/v1/analytics/events` | `start_date?, end_date?, limit?, zone_id?` |
| `fetchOperationalStatsSummary(params)` | GET ×6 | 위 6개 `Promise.allSettled` (부분 실패 허용) |

period 토글 (`today` / `7d` / `30d` / `month`) 은 frontend 가 ISO date 로 변환 후 전송.

### `scanApi.js`
| 함수 | METHOD | PATH | Backend Ready |
|---|---|---|---|
| `triggerScan(sectionId)` | POST | `/api/v1/scans` | ✅ |

### `usersApi.js`
| 함수 | METHOD | PATH |
|---|---|---|
| `fetchUsers(params)` | GET | `/api/v1/admin/users` |
| `fetchUserPermissions(userId)` | GET | `/api/v1/admin/users/{user_id}/permissions` |
| `fetchPasswordResetRequestQueue(params)` | GET | `/api/v1/admin/users/password-reset-requests` |
| `completePasswordResetRequest(requestId)` | PATCH | `/api/v1/admin/users/password-reset-requests/{request_id}` |
| `createUser(payload)` | POST ×2 | `/api/v1/admin/users` 후 권한 `/admin/users/{user_id}/permissions` |
| `updateUser(userId, payload)` | PATCH | `/api/v1/admin/users/{user_id}` |
| `grantUserPermissions(userId, zoneIds)` | POST | `/api/v1/admin/users/{user_id}/permissions` |
| `revokeUserPermission(userId, zoneId)` | DELETE | `/api/v1/admin/users/{user_id}/permissions/{zone_id}` |
| `resetUserPassword(userId)` | POST | `/api/v1/admin/users/{user_id}/reset-password` |

### `validityApi.js`
| 함수 | METHOD | PATH |
|---|---|---|
| `fetchValidityBatches(params)` | GET | `/api/v1/expiry/batches` |
| `fetchExpiryRiskItems(params)` | GET | `/api/v1/expiry/risk-items` |

### `zoneApi.js`
| 함수 | METHOD | PATH | Backend Ready |
|---|---|---|---|
| `fetchZoneOverview()` | GET | `/api/v1/scope/zones` | — |
| `fetchZoneSections(zoneId)` | GET | `/api/v1/inventory/zones/{zone_id}/sections` | — |
| `fetchZoneSectionDetail(zoneId, sectionId)` | GET ×4 | 4 way 합성: sections list + section detail + events + alerts | — |
| `fetchSectionEvents(sectionId, {page, limit})` | GET | `/api/v1/inventory/events?section_id=` | — |
| `fetchEventSnapshots(eventId)` | GET | `/api/v1/inventory/events/{event_id}/snapshots` | — |
| `createSection(payload)` | POST | `/api/v1/admin/sections` | ✅ |
| `fetchZoneFefo(zoneId)` | GET | `/api/v1/expiry/fefo/by-zone?zone_id={zone_id}` | — |
| `fetchZoneEvents(zoneId)` | GET | `/api/v1/inventory/events?zone_id={zone_id}` | — |

---

## 3. Socket.io 구독

```js
// core/socket.js 가 connect 후
sio.on('inventory_update', payload => subscribeInventoryRefetch.dispatch(payload))
sio.on('alert', payload => alertsStore.handleSocketAlert(payload))
sio.on('scan_state', payload => scanStore.handleScanState(payload))
```

`subscribeInventoryRefetch` 는 debounce(300ms) 후 현재 화면이 구독한 도메인 store 의 refetch 함수를 호출.

backend emit 상세는 [dhl-inventory-server/docs/api.md](../../dhl-inventory-server/docs/api.md) §Socket.io.

---

## 4. snake_case / camelCase 변환

- **응답**: `core/http.js` 가 자동으로 deep `toCamel()`
- **요청 body**: 변환 없음 — backend 는 snake_case 기대
- Socket.io payload: store 핸들러에 인라인 `toCamelLocal()` 적용 (http.js 의 toCamel 와 동일 로직)

---

## 5. 미연결 / 보류 도메인

| 도메인 | 가드 | 사유 |
|---|---|---|
| `companyApi` | `COMPANY_API_BACKEND_READY = false` | backend `/companies/overview` 미구현 |

운영 빌드 전 각 가드를 점검하고, true 토글이 안전한지 backend 라우트와 대조 (Swagger).
