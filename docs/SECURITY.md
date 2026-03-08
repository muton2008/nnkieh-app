# 安全指南 (Security Guide)

本文件描述專案的安全模型、已知風險與開發時的安全守則。

---

## 目錄

- [威脅模型](#威脅模型)
- [認證架構](#認證架構)
- [機密資料管理](#機密資料管理)
- [API 安全守則](#api-安全守則)
- [前端安全考量](#前端安全考量)
- [已知風險與緩解](#已知風險與緩解)
- [安全檢查清單](#安全檢查清單)

---

## 威脅模型

本應用的核心資產與對應的保護措施：

| 資產 | 威脅 | 保護措施 |
|---|---|---|
| 行事曆資料 | 未授權修改 | JWT + 雙人授權 + 白名單 |
| 管理員身份 | 冒充 / 越權 | 三級權限模型 + device_id 綁定 |
| 使用者個資 | 資料外洩 | 最小化蒐集（僅 device_id） |
| 環境變數 | 金鑰洩漏 | .gitignore + Vercel Secrets |
| API 端點 | 濫用 / 注入 | 輸入驗證 + 統一錯誤格式 |

---

## 認證架構

### 公開端點 vs 受保護端點

```
公開端點（無需認證）
  GET  /api/announcements
  GET  /api/transport
  GET  /api/timetable
  GET  /api/calendar/school
  POST /api/timetable
  POST /api/class/*
  POST /api/user/profile/sync

白名單保護（device_id 在 admin_users 表中）
  POST /api/auth/request
  POST /api/auth/approve
  GET  /api/auth/pending

JWT 認證（Header: Authorization: Bearer <token>）
  POST /api/calendar/school/save
  POST /api/calendar/school/delete
  GET  /api/admin/whitelist
  POST /api/admin/whitelist
  POST /api/admin/handover
```

### JWT Token 設計

| 屬性 | 值 |
|---|---|
| 演算法 | HS256 |
| 有效期 | 2 小時 |
| Payload | `{ role, deviceId }` |
| 儲存位置 | 前端 `sessionStorage`（非 localStorage） |

**選擇 sessionStorage 的理由：**
- 關閉瀏覽器分頁即失效
- 不會被其他分頁共享
- 減少 XSS 竊取 token 的風險

### 一次性 Token 領取

授權成功後，JWT 存於 `auth_requests.session_token` 欄位。
發起者透過 `GET /api/auth/status` 領取後，DB 立即清空 token：

```sql
UPDATE auth_requests
SET status = 'completed', session_token = NULL
WHERE id = :requestId;
```

防止 Token 被重複領取或從 DB 外洩。

---

## 機密資料管理

### 環境變數分級

| 變數 | 危險等級 | 說明 |
|---|---|---|
| `JWT_SECRET` | 🔴 極高 | 洩漏可偽造任意管理員身份 |
| `SUPABASE_SERVICE_ROLE_KEY` | 🔴 極高 | 繞過 RLS，完整 DB 存取 |
| `FIREBASE_SERVICE_ACCOUNT` | 🔴 極高 | 可向任意裝置發送推播 |
| `TDX_client_secret` | 🟡 中等 | 可濫用交通 API 配額 |
| `NEXT_PUBLIC_SUPABASE_URL` | 🟢 低 | 公開資訊，受 RLS 保護 |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | 🟢 低 | 受 RLS 限制，僅供前端 |

### 嚴格禁止

```typescript
// ❌ 絕對禁止 — 在任何 log 中輸出機密
console.log("JWT_SECRET:", process.env.JWT_SECRET);
console.log("Payload:", jwtPayload);
console.log("Token:", sessionToken);

// ❌ 絕對禁止 — 在 API 回應中回傳內部錯誤
return NextResponse.json({ detail: error.message });

// ❌ 絕對禁止 — 在前端程式碼中使用 Server 金鑰
// SUPABASE_SERVICE_ROLE_KEY 和 FIREBASE_SERVICE_ACCOUNT
// 僅限在 API Route 中使用
```

### Firebase API Key 說明

`lib/firebase.ts` 和 `firebase-messaging-sw.js` 中的 Firebase 配置（apiKey、projectId 等）是**設計上公開的**。Firebase 依靠 Security Rules 和 App Check 保護資源，而非隱藏 API Key。

---

## API 安全守則

### 1. 輸入驗證

所有使用者輸入必須驗證和清潔：

```typescript
// 搜尋文字 — 白名單式 sanitize
const queryText = input
  .replace(/[^\u4e00-\u9fffA-Za-z0-9\s\-]/g, "")  // 僅允許中文、英數、空白、連字號
  .slice(0, 100);                                     // 長度限制

// 數字參數 — 型別驗證
const page = parseInt(searchParams.get('page') || '1');
if (isNaN(page)) return error(400);

// UUID — 格式驗證（建議加入）
const isValidUUID = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
```

### 2. PostgREST Injection 防護

Supabase Client 使用 PostgREST，使用者輸入直接拼接到 `.ilike()` 可能被利用：

```typescript
// ⚠️ 注意：queryText 必須事先 sanitize
query = query.or(`title.ilike.%${queryText}%,content.ilike.%${queryText}%`);
```

目前透過白名單 regex 移除所有特殊字元來防護。

### 3. 錯誤回應

```typescript
// ✅ 正確 — 固定訊息
return NextResponse.json({ success: false, message: "伺服器錯誤" }, { status: 500 });

// ❌ 錯誤 — 洩漏實作細節
return NextResponse.json({ success: false, message: error.message }, { status: 500 });
return NextResponse.json({ success: false, detail: error.stack }, { status: 500 });
```

### 4. JWT 驗證模式

```typescript
function verifySession(authHeader: string | null): SessionPayload | null {
  const secret = process.env.JWT_SECRET?.trim();
  if (!secret || !authHeader) return null;

  const token = authHeader.replace("Bearer ", "");
  try {
    return jwt.verify(token, secret, { algorithms: ["HS256"] }) as SessionPayload;
  } catch {
    return null;  // 不要 log error 細節
  }
}
```

### 5. 權限層級檢查

每個受保護端點必須驗證兩層：

1. **JWT 有效性**：token 存在且未過期
2. **DB 權限確認**：用 JWT 中的 deviceId 查 `admin_users` 確認角色仍存在

```typescript
// 即使 JWT 有效，仍查 DB 確認角色未被撤銷
const { data: operator } = await supabase
  .from("admin_users")
  .select("role")
  .eq("device_id", session.deviceId)
  .single();

if (!operator || operator.role !== "super_admin") {
  return NextResponse.json({ message: "權限不足" }, { status: 403 });
}
```

這確保了「即時撤銷」能力——從白名單移除後，即使 JWT 尚未過期，也無法操作。

---

## 前端安全考量

### localStorage 中的資料

| Key | 內容 | 風險 |
|---|---|---|
| `device_id` | UUID | 若被竊取可冒充裝置身份（中） |
| `user_profile` | 使用者設定 | 不含敏感資訊（低） |
| `private_notes` | 私人備註 | 僅限本機可見（低） |
| `cache_*` | API 快取 | 短期自動失效（低） |

### sessionStorage 中的資料

| Key | 內容 | 風險 |
|---|---|---|
| `admin_session` | JWT + 角色 + 裝置 ID + 過期時間 | XSS 可竊取（中高） |

**緩解措施：**
- JWT 有效期僅 2 小時
- 關閉分頁即失效
- 前端定時檢查過期（AdminContext 每 30 秒）

### XSS 防護

- React 預設 escape 所有文字輸出
- 不使用 `dangerouslySetInnerHTML`
- 公告內容以純文字呈現

---

## 已知風險與緩解

### 🟡 中等風險

| 風險 | 說明 | 緩解措施 |
|---|---|---|
| **device_id 可偽造** | localStorage 值可被修改 | 管理功能額外依賴 JWT + DB 驗證 |
| **無 CSRF Token** | POST 請求未附帶 CSRF Token | API 不使用 Cookie 認證，改用 Bearer Token |

### 🟢 低風險（已接受）

| 風險 | 說明 | 理由 |
|---|---|---|
| **Firebase 配置公開** | apiKey, projectId 可見 | Firebase 設計如此，依靠 Security Rules 保護 |
| **課表無認證** | 任何人知道 invite_code 即可存取 | 設計決策，降低使用門檻 |
| **公告 API 無認證** | 公開查詢 | 資料本身為公開資訊 |

### 未來改善建議

1. **device_id 強化** — 考慮使用 Capacitor Device plugin 取得硬體 ID
2. **Supabase RLS** — 為所有表啟用 Row Level Security
3. **Audit Log** — 記錄所有管理員操作（who/what/when）
4. **App Check** — 啟用 Firebase App Check 防止未授權 API 呼叫

---

## 安全檢查清單

每次 PR 均應確認以下項目：

### API 端點

- [ ] 受保護端點有 JWT 驗證
- [ ] JWT 驗證後有 DB 權限確認
- [ ] 使用者輸入已驗證 / 清潔
- [ ] 錯誤回應不含 `error.message`、`error.stack`
- [ ] `console.log` 不輸出 JWT、Token、密鑰、Payload

### 環境變數

- [ ] 新環境變數已加入 `.env.example`
- [ ] Server-only 變數未以 `NEXT_PUBLIC_` 開頭
- [ ] 未在前端程式碼中引用 `SUPABASE_SERVICE_ROLE_KEY`

### 前端

- [ ] 未使用 `dangerouslySetInnerHTML`
- [ ] 敏感資料存於 `sessionStorage`（非 localStorage）
- [ ] Admin Session 有過期檢查邏輯

### 資料庫

- [ ] 新表有考慮 RLS 政策
- [ ] 軟刪除使用 `is_deleted` 欄位（保留審計軌跡）
- [ ] 敏感欄位（如 session_token）使用後立即清空
