# 系統架構文件 (Architecture)

本文件描述南科實中校園助手的完整系統架構，供維護者理解資料流與各模組間的依賴關係。

## 目錄

- [系統總覽](#系統總覽)
- [執行環境](#執行環境)
- [前端架構](#前端架構)
- [後端架構](#後端架構)
- [資料庫 Schema](#資料庫-schema)
- [認證與授權流程](#認證與授權流程)
- [交通資料代理](#交通資料代理)
- [推播通知系統](#推播通知系統)
- [Capacitor 建置流程](#capacitor-建置流程)

---

## 系統總覽

```
┌─────────────────────────────────────────────────────────┐
│                       使用者                             │
│    Web Browser  /  PWA  /  Android App  /  iOS App      │
└────────────────────────┬────────────────────────────────┘
                         │
                    ┌────▼────┐
                    │  Vercel  │   Next.js 15 (Node.js Runtime)
                    │  Server  │   API Routes + SSR
                    └────┬────┘
                         │
         ┌───────────────┼───────────────┐
         │               │               │
    ┌────▼────┐    ┌─────▼─────┐   ┌─────▼─────┐
    │ Supabase │    │  Firebase  │   │    TDX     │
    │ Database │    │    FCM     │   │ Transport  │
    │ + Auth   │    │  + Admin   │   │    API     │
    └──────────┘    └───────────┘   └───────────┘
```

### 核心依賴

| 服務 | 用途 |
|---|---|
| **Vercel** | 部署 Next.js、託管 API Routes |
| **Supabase** | PostgreSQL 資料庫、Realtime 訂閱、Edge Functions |
| **Firebase** | Cloud Messaging (FCM) 推播通知 |
| **TDX** | 台灣交通資料開放平台 (OAuth2 Client Credentials) |

---

## 執行環境

本應用同時支援四種執行環境，透過 `lib/platform.ts` 進行偵測：

| 環境 | 說明 | API 行為 |
|---|---|---|
| **Web** | 一般瀏覽器 | 相對路徑 (`/api/...`) |
| **PWA** | 安裝至桌面的網頁應用 | 相對路徑 |
| **Android** | Capacitor 原生殼 | 遠端 URL (`NEXT_PUBLIC_API_BASE_URL`) |
| **iOS** | Capacitor 原生殼 | 遠端 URL |

#### 原生 App 架構模式

```
┌─────────────────────┐
│   Android / iOS     │
│   ┌───────────────┐ │
│   │  WebView      │ │   ← 載入 out/ 靜態 HTML
│   │  (本地檔案)    │ │
│   └───────┬───────┘ │
│           │ fetch    │
│   ┌───────▼───────┐ │
│   │ CapacitorHttp │ │   ← 攔截 fetch，繞過 CORS
│   └───────┬───────┘ │
└───────────┼─────────┘
            │ HTTPS
    ┌───────▼───────┐
    │  Vercel API   │
    └───────────────┘
```

- 前端頁面以 `next build` (static export) 打包進 App 本體
- API 請求透過 CapacitorHttp 插件導向遠端 Vercel 伺服器
- 本地通知、StatusBar 等使用 Capacitor 原生插件

---

## 前端架構

### SPA Tab Router

應用採用 **單頁面 + Tab 路由** 模式（非 Next.js File-based Routing）：

```
app/page.tsx (root)
  ├── HomePage         tab: "home"       首頁（今日課表 + 近期事件）
  ├── TimetablePage    tab: "timetable"  課表管理
  ├── TransportPage    tab: "transport"  即時交通
  ├── CalendarPage     tab: "calendar"   行事曆 + 管理後台
  ├── NewsPage         tab: "news"       公告列表
  └── SettingsPage     tab: "settings"   個人設定
```

這樣設計的原因是 Capacitor 靜態匯出不支援 dynamic routes。

### 狀態管理策略

```
┌───────────────────────────────────────────┐
│              React Context                │
│  AdminProvider → useAdmin()               │  ← 管理員 Session
│  deviceId (page.tsx state)                │  ← 裝置識別碼（首次啟動時向 Server 註冊）
└───────────────────────────────────────────┘

┌───────────────────────────────────────────┐
│            localStorage                   │
│  device_id          → UUID v4 (CSPRNG)    │
│  user_profile       → UserProfile JSON    │
│  private_notes      → PrivateNoteStore    │
│  private_calendar_events → Event[]        │
│  read_announcements → number[]            │
│  cache_timetable    → { data, timestamp } │
│  cache_transport    → { data, timestamp } │
│  cache_calendar_*   → { data, timestamp } │
│  app_version_seen   → string              │
└───────────────────────────────────────────┘

┌───────────────────────────────────────────┐
│           sessionStorage                  │
│  admin_session → AdminSession (JWT)       │  ← 登入後 2 小時有效
└───────────────────────────────────────────┘
```

### 快取機制

前端透過 `lib/api-client.ts` 實作 **LocalStorage TTL 快取**：

- 快取 TTL：**60 秒**
- 適用端點：`timetable`、`transport`、`calendar`
- 機制：每次 API 呼叫先檢查 localStorage 中的 `{ data, timestamp }`

後端 `transport` API 額外有 **記憶體快取**（60 秒），避免短時間重複呼叫 TDX。

---

## 後端架構

### API Route 分類

```
app/api/
├── 公開端點（無需認證）
│   ├── GET  /announcements      公告查詢（分頁 + 搜尋）
│   ├── GET  /calendar/school    行事曆事件查詢
│   ├── GET  /transport          交通即時資訊
│   ├── GET  /timetable          課表查詢
│   ├── POST /timetable          課表儲存
│   ├── POST /timetable/notes    新增備註
│   ├── POST /class/generate     生成班級代碼
│   ├── POST /class/join         加入班級
│   ├── POST /class/leave        退出班級（限建立者）
│   ├── POST /user/device/register 裝置註冊（首次啟動）
│   ├── GET  /user/profile       查詢使用者設定
│   └── POST /user/profile/sync  同步使用者設定
│
├── 白名單限制端點（device_id 必須在 admin_users 中）
│   ├── POST /auth/request       發起授權請求
│   ├── POST /auth/approve       審核授權請求
│   ├── GET  /auth/status        查詢授權狀態
│   └── GET  /auth/pending       查詢待核准請求
│
└── JWT 認證端點（需 Bearer Token）
    ├── POST /calendar/school/save    儲存行事曆事件
    ├── POST /calendar/school/delete  刪除行事曆事件
    ├── GET  /admin/whitelist         取得管理員列表
    ├── POST /admin/whitelist         管理白名單（CRUD）
    └── POST /admin/handover          職位移交
```

### Server-side 依賴

```
API Route
  └─ lib/supabase/server.ts    ← Supabase Client (SERVICE_ROLE_KEY)
  └─ lib/firebase-admin.ts     ← Firebase Admin SDK (推播)
  └─ lib/tdx.ts                ← TDX Token 管理
  └─ jsonwebtoken              ← JWT 簽發 / 驗證
```

---

## 資料庫 Schema

### Supabase 資料表

#### `user_profiles`
| 欄位 | 型別 | 說明 |
|---|---|---|
| `device_id` | text (PK) | 裝置 UUID |
| `division` | text | 學制 (`junior` / `high` / `all` / `no disturb`) |
| `notify_all` | boolean | 是否接收所有通知 |
| `fcm_token` | text | Firebase 推播 Token |
| `updated_at` | timestamptz | 最後更新時間 |

#### `classes`
| 欄位 | 型別 | 說明 |
|---|---|---|
| `id` | uuid (PK) | 自動生成 |
| `invite_code` | text (UNIQUE) | 邀請碼 (`xxx-xxxx`) |
| `creator_device_id` | text | 建立者裝置 ID |
| `semester_tag` | text | 學期標籤 (`113-1`) |
| `class_name` | text | 班級名稱 |
| `schedule` | jsonb | 課表資料 (`WeekSchedule`) |
| `created_at` | timestamptz | 建立時間 |
| `updated_at` | timestamptz | 最後更新 |

#### `school_calendar_events`
| 欄位 | 型別 | 說明 |
|---|---|---|
| `id` | uuid (PK) | 自動生成 |
| `date` | date | 事件日期 |
| `end_date` | date | 結束日期（跨日事件） |
| `start_time` | text | 開始時間 |
| `end_time` | text | 結束時間 |
| `title` | text | 標題 |
| `description` | text | 描述 |
| `category` | text | 分類 (考試/升學/活動/放假/社團/其他) |
| `is_deleted` | boolean | 軟刪除標記 |
| `updated_at` | timestamptz | 最後更新 |
| `updated_by` | text | 更新者裝置 ID |

#### `announcements`
| 欄位 | 型別 | 說明 |
|---|---|---|
| `id` | serial (PK) | 自動遞增 |
| `title` | text | 標題 |
| `content` | text | 內容 |
| `category` | integer | 分類 (0-6) |
| `importance` | integer | 重要性 (0/1) |
| `division` | text[] | 適用學制 |
| `publish_date` | timestamptz | 發布日期 |
| `link` | text | 原始連結 |
| `post_id` | text | 學校網站文章 ID |

#### `admin_users`
| 欄位 | 型別 | 說明 |
|---|---|---|
| `device_id` | text (PK) | 裝置 UUID |
| `name` | text | 顯示名稱 |
| `role` | text | 角色 (`super_admin` / `admin` / `editor`) |
| `created_at` | timestamptz | 加入時間 |

#### `auth_requests`
| 欄位 | 型別 | 說明 |
|---|---|---|
| `id` | uuid (PK) | 自動生成 |
| `requester_id` | text | 發起者裝置 ID |
| `requester_name` | text | 發起者名稱 |
| `visual_challenge` | integer | 4 位數挑戰碼 |
| `target_role` | text | 目標角色 |
| `status` | text | 狀態 (pending/approved/rejected/expired/completed) |
| `session_token` | text | JWT（一次性領取後清空） |
| `admin_id` | text | 核准者裝置 ID |
| `expires_at` | timestamptz | 過期時間（5 分鐘） |
| `created_at` | timestamptz | 建立時間 |

#### `tdx_token`
| 欄位 | 型別 | 說明 |
|---|---|---|
| `id` | integer (PK) | 固定為 1 |
| `access_token` | text | TDX Bearer Token |
| `expires_at` | timestamptz | Token 過期時間 |

---

## 認證與授權流程

### 三級權限模型

```
Super Admin（會長）
  ├── 管理白名單（新增/移除/更新成員）
  ├── 職位移交
  ├── 核准下級授權請求
  └── 完整行事曆 CRUD
Admin（副會長/部長）
  ├── 核准 Editor 的授權請求
  └── 完整行事曆 CRUD
Editor（組員）
  └── 需經授權後才能 CRUD 行事曆
```

### 雙人授權流程

```
   A (Editor/Admin)                    B (Admin/Super Admin)
   ═══════════════                     ═══════════════════════
1. POST /auth/request
   → 生成 4 位數挑戰碼
   → FCM 推播至所有上級                → 收到推播通知
                                       
2. 畫面顯示挑戰碼 ─── 口頭告知數字 ──→ 輸入挑戰碼
                                        POST /auth/approve
                                        → 驗證碼正確
                                        → 簽發 JWT (2hr)

3. 輪詢 GET /auth/status
   → status: approved
   → 領取 session_token               → DB 中 token 清空
   → 存入 sessionStorage                (一次性領取防外洩)
   
4. 後續 POST /calendar/school/save
   Header: Authorization: Bearer <JWT>
   Header: X-Device-ID: <device_id>
```

### JWT 結構

```json
{
  "role": "admin",          // 角色
  "deviceId": "uuid-...",   // 裝置 ID
  "iat": 1234567890,        // 簽發時間
  "exp": 1234575090          // 過期時間 (2 小時後)
}
```

---

## 交通資料代理

### 資料流

```
GET /api/transport
  │
  ├── 檢查記憶體快取 (60 秒 TTL)
  │   └── 命中 → 直接回傳 (X-Cache: HIT)
  │
  ├── getTDXToken()
  │   ├── 查 Supabase tdx_token 表
  │   ├── 未過期 → 使用現有 Token
  │   └── 過期 → OAuth2 Client Credentials 換新 Token
  │
  └── Promise.allSettled([
        getTrain(headers)      → TDX TRA LiveBoard API
        getBus(headers)        → TDX Bus ETA API (台南)
        getSTSPBusData()       → 南科管理局 (目前暫停)
        getYouBike(headers)    → TDX YouBike Availability API
      ])
```

### 外部 API 端點

| 資料 | API 來源 | 備註 |
|---|---|---|
| 台鐵 | `tdx.transportdata.tw/.../TRA/LiveBoard/Station/4180` | 南科站 (4180) |
| 公車 | `tdx.transportdata.tw/.../Bus/EstimatedTimeOfArrival/City/Tainan` | 綠2/綠3/橘12/橘14 |
| YouBike | `tdx.transportdata.tw/.../Bike/Availability/City/Tainan` | 4 個站點 |
| 南科巴士 | `atis.stsp.gov.tw/STSPapi/...` | SSL 過期，暫停服務 |

---

## 推播通知系統

### 雙軌架構

```
┌─────────────────────┐     ┌─────────────────────┐
│   雲端推播 (FCM)     │     │  本地通知 (Capacitor) │
├─────────────────────┤     ├─────────────────────┤
│ 管理員授權請求通知    │     │ 行事曆事件提醒        │
│ 公告推播             │     │ 私人備註提醒          │
├─────────────────────┤     ├─────────────────────┤
│ Web: Service Worker  │     │ 僅限原生 App          │
│ Native: Capacitor    │     │ @capacitor/local-    │
│   Push Notifications │     │   notifications      │
└─────────────────────┘     └─────────────────────┘
```

### 本地通知排程規則

定義於 `lib/reminders.ts`：

- **事件前 1 天** 15:00 提醒
- **週一事件** 額外在前 3 天（週五）提醒
- 通知 ID 由字串 hash 映射為數字 ID

---

## Capacitor 建置流程

```
npm run cap:build
  │
  ├── scripts/build-cap.js
  │   ├── Step 1: 移除 Server-only 檔案
  │   │   ├── app/api/ → _backup/api/
  │   │   ├── app/manifest.ts → _backup/
  │   │   └── lib/firebase-admin.ts → _backup/
  │   │
  │   ├── Step 2: 靜態匯出
  │   │   └── cross-env BUILD_TARGET=capacitor next build
  │   │       → output: 'export' → out/
  │   │
  │   └── Step 3: 還原所有檔案
  │       └── _backup/* → 原位置
  │
  └── npx cap sync
      ├── 複製 out/ → android/app/src/main/assets/public/
      └── 同步 Capacitor 插件設定
```

### 為什麼需要移除 Server-only 檔案？

`next build` 的 `output: 'export'` 模式僅產生靜態 HTML，不支援：
- API Routes（`app/api/`）
- `next/headers`（`cookies()`）
- Node.js 專用模組（`firebase-admin`、`jsonwebtoken`）

因此建置前必須暫時移除這些檔案，完成後立即還原。
