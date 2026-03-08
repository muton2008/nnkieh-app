# API 參考文件 (API Reference)

所有 API Routes 均位於 `app/api/` 目錄下，由 Next.js App Router 提供。

**Base URL:**
- Web / PWA: 相對路徑 `/api/...`
- Native App: `NEXT_PUBLIC_API_BASE_URL` + `/api/...`

---

## 目錄

- [公告](#公告-announcements)
- [交通資訊](#交通資訊-transport)
- [課表系統](#課表系統-timetable)
- [班級管理](#班級管理-class)
- [使用者設定](#使用者設定-user)
- [行事曆](#行事曆-calendar)
- [授權認證](#授權認證-auth)
- [管理員白名單](#管理員白名單-admin)
- [共用型別](#共用型別)
- [錯誤處理](#錯誤處理)

---

## 公告 (Announcements)

### `GET /api/announcements`

查詢公告列表，支援分頁、分類篩選與全文搜尋。

**Query Parameters:**

| 參數 | 型別 | 必填 | 說明 |
|---|---|---|---|
| `page` | number | 否 | 頁碼，預設 `1` |
| `tab` | string | 否 | 分類篩選：`all`（預設）/ `important` / `0`-`6` |
| `q` | string | 否 | 搜尋關鍵字（最多 100 字元） |

**分類對應:**

| ID | 名稱 |
|---|---|
| 0 | 考試與考程 |
| 1 | 學習歷程/自主學習/社團 |
| 2 | 活動與競賽 |
| 3 | 行政與校務 |
| 4 | 升學與招生 |
| 5 | 一般公告 |
| 6 | 教師公告/研習 |

**Response:**

```json
{
  "announcements": [
    {
      "id": 1,
      "title": "113學年度第二學期段考日程",
      "content": "...",
      "category": 0,
      "importance": 1,
      "division": ["junior", "high"],
      "publish_date": "2025-03-01T00:00:00Z",
      "link": "https://...",
      "post_id": "12345"
    }
  ],
  "total": 150,
  "page": 1,
  "totalPages": 8,
  "hasMore": true,
  "updated_at": "2025-03-07T12:00:00Z"
}
```

---

## 交通資訊 (Transport)

### `GET /api/transport`

取得即時交通資訊（火車、公車、YouBike），伺服器端快取 60 秒。

**Response:**

```json
{
  "trains_south": [
    { "id": "123", "type": "區間", "destination": "台南", "departure": "08:30", "status": "準點" }
  ],
  "trains_north": [
    { "id": "456", "type": "自強", "destination": "台北", "departure": "09:15", "status": "晚 3 分" }
  ],
  "buses": [
    {
      "routeName": "綠2",
      "outbound": [
        { "id": "...", "subRouteName": "綠2", "destination": "台南", "eta": "5 分", "status": 0 }
      ],
      "inbound": []
    }
  ],
  "STSP_buses": {},
  "youbike": [
    { "name": "南科實中國中部", "available": 5, "empty": 10, "total": 15 }
  ],
  "updated_at": "2025-03-07T12:00:00Z"
}
```

**Response Headers:**
- `X-Cache: HIT` — 命中伺服器記憶體快取
- `X-Cache: MISS` — 即時查詢

---

## 課表系統 (Timetable)

### `GET /api/timetable`

根據邀請碼取得班級課表。

**Query Parameters:**

| 參數 | 型別 | 必填 | 說明 |
|---|---|---|---|
| `invite_code` | string | 是 | 班級邀請碼 (`xxx-xxxx`) |

**Response:**

```json
{
  "success": true,
  "schedule": {
    "mon": [
      { "subject": "國文", "teacher": "王老師", "room": "201", "notes": [] },
      { "subject": "數學", "teacher": "李老師", "room": "201", "notes": [] }
    ],
    "tue": [],
    "wed": [],
    "thu": [],
    "fri": []
  },
  "class_name": "高一甲",
  "default_room": "原班",
  "updated_at": "2025-03-07T12:00:00Z"
}
```

### `POST /api/timetable`

儲存 / 更新課表。

**Request Body:**

```json
{
  "invite_code": "abc-defg",
  "schedule": { ... },
  "class_name": "高一甲"
}
```

**Response:**

```json
{ "success": true, "message": "課表已同步至雲端" }
```

### `POST /api/timetable/notes`

新增公用備註至課表。

**Request Body:**

```json
{
  "invite_code": "abc-defg",
  "day": "mon",
  "period_idx": 0,
  "note": {
    "text": "明天考第三章",
    "category": "exam",
    "date": "2025-03-08"
  }
}
```

**Response:**

```json
{ "success": true, "note_id": "note-1741234567890-abc123def", "message": "備註已同步至雲端" }
```

---

## 班級管理 (Class)

### `POST /api/class/generate`

建立班級並生成邀請碼，同一裝置同一學期只會生成一組（冪等性）。

**Request Body:**

```json
{
  "device_id": "uuid-...",
  "schedule": { ... },
  "class_name": "高一甲"
}
```

**Response:**

```json
{
  "success": true,
  "invite_code": "abc-defg",
  "created_at": "2025-03-07T12:00:00Z"
}
```

### `POST /api/class/join`

加入現有班級。

**Request Body:**

```json
{ "invite_code": "abc-defg" }
```

**Response:**

```json
{
  "success": true,
  "class_name": "高一甲",
  "invite_code": "abc-defg",
  "message": "已成功加入 高一甲"
}
```

### `POST /api/class/leave`

退出班級（僅建立者可刪除）。

**Request Body:**

```json
{
  "invite_code": "abc-defg",
  "device_id": "uuid-..."
}
```

**Response:**

```json
{ "success": true, "message": "班級已刪除" }
```

---

## 使用者設定 (User)

### `GET /api/user/profile`

查詢使用者設定。

**Query Parameters:**

| 參數 | 型別 | 必填 |
|---|---|---|
| `device_id` | string | 是 |

**Response:**

```json
{
  "success": true,
  "profile": {
    "device_id": "uuid-...",
    "division": "high",
    "notify_all": true,
    "fcm_token": "...",
    "updated_at": "2025-03-07T12:00:00Z"
  }
}
```

### `POST /api/user/profile/sync`

建立或更新使用者設定（Upsert）。

**Request Body:**

```json
{
  "device_id": "uuid-...",
  "division": "high",
  "notify_all": true,
  "fcm_token": "...",
  "app_version": "0.1.2-beta"
}
```

**Response:**

```json
{ "success": true, "updated_at": "2025-03-07T12:00:00Z" }
```

---

## 行事曆 (Calendar)

### `GET /api/calendar/school`

查詢全校行事曆事件。

**Query Parameters:**

| 參數 | 型別 | 必填 | 說明 |
|---|---|---|---|
| `start_date` | string | 否 | 起始日期 (YYYY-MM-DD)，預設學期起始 |
| `end_date` | string | 否 | 結束日期 (YYYY-MM-DD)，預設學期結束 |

**自動學期判斷：**
- 8月-1月 → 上學期 (08-01 ~ 01-31)
- 2月-7月 → 下學期 (02-01 ~ 07-31)

**Response:**

```json
{
  "success": true,
  "events": [
    {
      "id": "uuid-...",
      "date": "2025-03-15",
      "end_date": null,
      "start_time": "08:00",
      "end_time": "17:00",
      "title": "第一次段考",
      "description": "範圍：L1-L5",
      "category": "考試",
      "is_deleted": false,
      "updated_at": "2025-03-07T12:00:00Z",
      "updated_by": "uuid-..."
    }
  ],
  "updated_at": "2025-03-07T12:00:00Z"
}
```

### `POST /api/calendar/school/save` 🔒

儲存 / 更新行事曆事件。**需要 JWT 認證。**

**Headers:**

```
Authorization: Bearer <jwt_token>
X-Device-ID: <device_id>
```

**Request Body:**

```json
{
  "event": {
    "id": "school_temp_123",
    "date": "2025-03-15",
    "end_date": null,
    "start_time": "08:00",
    "end_time": "17:00",
    "title": "第一次段考",
    "description": "範圍：L1-L5",
    "category": "考試"
  }
}
```

> 若 `id` 以 `school_` 或 `priv_` 開頭，視為新增（DB 自動生成 UUID）；否則視為更新。

**Response:**

```json
{ "success": true, "data": { "id": "uuid-...", ... } }
```

### `POST /api/calendar/school/delete` 🔒

軟刪除行事曆事件。**需要 JWT 認證。**

**Headers:**

```
Authorization: Bearer <jwt_token>
```

**Request Body:**

```json
{ "event_id": "uuid-..." }
```

**Response:**

```json
{ "success": true, "message": "刪除成功" }
```

---

## 授權認證 (Auth)

### `POST /api/auth/request`

發起雙人授權請求，觸發 FCM 推播至其他管理員。

**前置條件：** `device_id` 必須在 `admin_users` 白名單中。

**Request Body:**

```json
{ "device_id": "uuid-..." }
```

**Response:**

```json
{
  "success": true,
  "requestId": "uuid-...",
  "challengeCode": 1234
}
```

### `POST /api/auth/approve`

審核授權請求，驗證挑戰碼後簽發 JWT。

**前置條件：** `admin_device_id` 必須在白名單中，且為 `admin` 或 `super_admin`。

**Request Body:**

```json
{
  "requestId": "uuid-...",
  "inputCode": "1234",
  "admin_device_id": "uuid-..."
}
```

**Response (成功):**

```json
{ "success": true, "message": "核准成功！" }
```

**可能的錯誤狀態碼:**

| 狀態碼 | 說明 |
|---|---|
| 403 | 裝置不在白名單 |
| 404 | 查無授權請求 |
| 409 | 請求已被處理 |
| 410 | 請求已過期 |
| 400 | 挑戰碼錯誤 |

### `GET /api/auth/status`

查詢授權請求狀態，若已核准則領取 JWT Session（一次性）。

**Query Parameters:**

| 參數 | 型別 | 必填 |
|---|---|---|
| `request_id` | string | 是 |

**Response (已核准):**

```json
{
  "success": true,
  "status": "approved",
  "session": {
    "accessToken": "jwt-...",
    "role": "admin",
    "deviceId": "uuid-...",
    "expiresAt": 1741234567890
  }
}
```

> ⚠️ Token 領取後會從 DB 中清除 (`session_token → null`)，防止重複領取或外洩。

### `GET /api/auth/pending`

取得待核准的授權請求列表。

**Query Parameters:**

| 參數 | 型別 | 必填 |
|---|---|---|
| `device_id` | string | 是 |

**前置條件：** `device_id` 必須在白名單中。

**Response:**

```json
{
  "success": true,
  "requests": [
    {
      "id": "uuid-...",
      "requester_name": "小明",
      "created_at": "2025-03-07T12:00:00Z",
      "expires_at": "2025-03-07T12:05:00Z"
    }
  ]
}
```

---

## 管理員白名單 (Admin)

### `GET /api/admin/whitelist` 🔒

取得管理員列表。**需要 JWT 認證**，限 `admin` 或 `super_admin`。

**Headers:**

```
Authorization: Bearer <jwt_token>
```

**Response:**

```json
{
  "success": true,
  "admins": [
    { "device_id": "uuid-...", "name": "會長", "role": "super_admin", "created_at": "..." }
  ],
  "currentRole": "super_admin"
}
```

### `POST /api/admin/whitelist` 🔒

管理白名單（新增 / 移除 / 更新）。**僅限 `super_admin`。**

**Headers:**

```
Authorization: Bearer <jwt_token>
```

**Request Body (新增):**

```json
{
  "action": "add",
  "target_device_id": "uuid-...",
  "target_name": "副會長",
  "target_role": "admin"
}
```

**Request Body (移除):**

```json
{
  "action": "remove",
  "target_device_id": "uuid-..."
}
```

> 移除時會同時撤銷該成員所有進行中的 `auth_requests`。

**Request Body (更新角色):**

```json
{
  "action": "update",
  "target_device_id": "uuid-...",
  "target_role": "editor",
  "target_name": "新名稱"
}
```

**限制：**
- 不可直接 `add` 或 `update` 為 `super_admin`（必須使用 handover）
- 不可移除自己
- 不可移除其他 `super_admin`

### `POST /api/admin/handover` 🔒

職位移交：當前會長將 `super_admin` 角色轉讓給指定成員。

**Headers:**

```
Authorization: Bearer <jwt_token>
```

**Request Body:**

```json
{ "new_super_admin_id": "uuid-..." }
```

**操作流程：**
1. 驗證操作者為 `super_admin`
2. 驗證目標在白名單中
3. 目標升級為 `super_admin`
4. 操作者降級為 `admin`
5. 撤銷操作者所有進行中的 `auth_requests`

> 若降級失敗會自動回滾。

**Response:**

```json
{
  "success": true,
  "message": "職位已移交給 副會長",
  "oldRole": "admin",
  "newSuperAdmin": "副會長"
}
```

---

## 共用型別

### `ApiResponse<T>`

```typescript
interface ApiResponse<T> {
  success: boolean;
  message?: string;
  data?: T;
}
```

### `DeviceIdentity`

```typescript
interface DeviceIdentity {
  device_id: string;
}
```

### `TabId`

```typescript
type TabId = "home" | "timetable" | "transport" | "calendar" | "news" | "settings";
```

---

## 錯誤處理

所有 API 在發生錯誤時回傳統一格式：

```json
{
  "success": false,
  "message": "使用者可讀的錯誤訊息"
}
```

### HTTP 狀態碼慣例

| 狀態碼 | 使用場景 |
|---|---|
| 200 | 成功 |
| 400 | 參數不足 / 格式錯誤 |
| 401 | 未認證（缺少或無效 JWT） |
| 403 | 權限不足（不在白名單 / 角色不符） |
| 404 | 資源不存在 |
| 409 | 狀態衝突（請求已被處理） |
| 410 | 資源已過期 |
| 500 | 伺服器內部錯誤 |

> **重要安全原則：** 500 錯誤一律回傳固定訊息（如「伺服器錯誤」），絕不回傳 `error.message` 以防洩漏內部實作細節。
