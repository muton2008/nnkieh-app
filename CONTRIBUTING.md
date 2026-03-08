# 貢獻指南 (Contributing Guide)

感謝你有興趣參與南科實中校園助手的開發！本文件說明參與專案所需的開發守則。

## 目錄

- [開發環境設定](#開發環境設定)
- [Git 工作流程](#git-工作流程)
- [分支命名規範](#分支命名規範)
- [Commit 訊息規範](#commit-訊息規範)
- [程式碼風格](#程式碼風格)
- [專案慣例](#專案慣例)
- [API Route 開發守則](#api-route-開發守則)
- [元件開發守則](#元件開發守則)
- [測試驗證清單](#測試驗證清單)
- [Pull Request 流程](#pull-request-流程)

---

## 開發環境設定

```bash
# 前置需求
node --version   # >= 18
npm --version    # >= 9

# 安裝
npm install

# 複製環境變數模板（向維護者索取實際值）
cp .env.example .env

# 啟動
npm run dev
```

### 推薦 VS Code 擴充套件

- **ESLint** — 自動程式碼檢查
- **Tailwind CSS IntelliSense** — className 自動補完
- **Prettier** — 格式化
- **ES7+ React/Redux/React-Native snippets**

---

## Git 工作流程

本專案採用 **GitHub Flow**（簡化版 Git Flow）：

```
main ─────────────────────────────────────
  │                          │
  ├── feat/timetable-export  │  ← PR & Review
  │                          │
  ├── fix/bus-eta-parsing ───┘
  │
  └── chore/update-deps
```

1. 所有開發基於 `main` 分支
2. 建立功能分支進行開發
3. 完成後發起 Pull Request
4. 經過 Code Review 後合併回 `main`

---

## 分支命名規範

```
<type>/<short-description>
```

| 前綴 | 用途 | 範例 |
|---|---|---|
| `feat/` | 新功能 | `feat/calendar-export` |
| `fix/` | Bug 修復 | `fix/bus-eta-null` |
| `refactor/` | 重構（不改功能） | `refactor/api-client` |
| `chore/` | 工具 / 設定 / 文件 | `chore/update-deps` |
| `hotfix/` | 緊急修復 | `hotfix/jwt-verify` |

---

## Commit 訊息規範

遵循 [Conventional Commits](https://www.conventionalcommits.org/)：

```
<type>(<scope>): <subject>

[optional body]
```

### 範例

```
feat(calendar): 新增事件匯出至系統日曆功能
fix(transport): 修正公車 ETA 為 null 時的顯示錯誤
refactor(api): 統一錯誤回應格式，移除 error.message 外洩
chore(deps): 升級 Next.js 至 15.2
docs: 新增 API 文件
```

### Type 列表

| Type | 說明 |
|---|---|
| `feat` | 新功能 |
| `fix` | Bug 修復 |
| `refactor` | 重構 |
| `style` | 格式調整（不影響邏輯） |
| `docs` | 文件變更 |
| `chore` | 建置 / 工具變更 |
| `perf` | 效能優化 |
| `test` | 測試相關 |

### Scope 參考

`calendar` · `timetable` · `transport` · `news` · `auth` · `admin` · `api` · `ui` · `deps` · `cap`

---

## 程式碼風格

### TypeScript

- 啟用 **Strict Mode**（`tsconfig.json` 已設定）
- 所有 API 請求 / 回應必須定義型別（放在 `lib/types/`）
- 優先使用 `interface` 而非 `type`（除非需要聯合型別）
- 避免使用 `any`，確有需要時加註 `// eslint-disable-next-line`

### 檔案命名

```
元件     → kebab-case.tsx    (home-page.tsx)
API      → route.ts          (Next.js App Router 慣例)
工具     → kebab-case.ts     (api-client.ts)
型別     → kebab-case.ts     (calendar.ts)
```

### Import 順序

```typescript
// 1. React / Next.js
import { useState } from "react";
import { NextResponse } from "next/server";

// 2. 第三方套件
import dayjs from "dayjs";

// 3. 內部模組 (使用 @/ alias)
import { createClient } from "@/lib/supabase/server";
import type { AdminRole } from "@/lib/types/calendar";

// 4. 同層相對引入
import { SkeletonBlock } from "./skeleton-block";
```

### Tailwind CSS

- 使用 Shadcn UI 的 CSS 變數系統（`hsl(var(--primary))`）
- 複雜樣式使用 `cn()` 工具函式合併 class
- 響應式設計以行動裝置優先（max-width: 450px）

---

## 專案慣例

### 平台偵測

針對不同運行環境使用 `lib/platform.ts` 提供的工具函式：

```typescript
import { isNative, isPWA, isWeb, isPluginAvailable } from "@/lib/platform";

// 原生 App 專用邏輯
if (isNative() && isPluginAvailable('PushNotifications')) { ... }

// Web / PWA 專用邏輯
if (!isNative()) { ... }
```

### API 呼叫

前端透過 `lib/api-client.ts` 統一呼叫，不要直接 `fetch`：

```typescript
import { fetchTimetable, saveTimetable } from "@/lib/api-client";
```

該模組會自動處理：
- 平台對應的 Base URL（Web 用相對路徑，Native 用遠端 URL）
- Content-Type header
- LocalStorage 快取（60 秒 TTL）
- 錯誤訊息解析

### 資料庫操作

- **Server-side**：使用 `lib/supabase/server.ts`（SERVICE_ROLE_KEY，繞過 RLS）
- **Client-side**：使用 `lib/supabase/client.ts`（ANON_KEY，受 RLS 限制）
- API Route 一律使用 Server Client

### 型別定義

所有資料結構集中於 `lib/types/` 管理：

```
api.ts           → API 請求 / 回應 DTO
calendar.ts      → 行事曆事件、權限、認證 Session
timetable.ts     → 課表、備註
user.ts          → 使用者設定
announcement.ts  → 公告分類與結構
transport.ts     → 交通資訊（fire車/公車/YouBike）
common.ts        → Tab ID、通用回應
```

新增 API 時，必須同步新增對應型別。

---

## API Route 開發守則

### 安全性原則

1. **永遠不要在回應中暴露內部錯誤**
   ```typescript
   // ✅ 正確
   return NextResponse.json({ success: false, message: "伺服器錯誤" }, { status: 500 });

   // ❌ 錯誤 — 洩漏內部實作
   return NextResponse.json({ success: false, message: error.message }, { status: 500 });
   ```

2. **永遠不要 log 敏感資料**
   ```typescript
   // ❌ 禁止
   console.log("JWT_SECRET:", secret);
   console.log("JWT payload:", payload);
   console.log("Session:", session);
   ```

3. **需要認證的端點必須驗證 JWT**
   ```typescript
   function verifySession(authHeader: string | null) {
     const secret = process.env.JWT_SECRET?.trim();
     if (!secret || !authHeader) return null;
     const token = authHeader.replace("Bearer ", "");
     try {
       return jwt.verify(token, secret, { algorithms: ["HS256"] });
     } catch {
       return null;
     }
   }
   ```

4. **使用者輸入必須清潔**
   ```typescript
   // 搜尋文字：僅保留安全字元
   const query = input.replace(/[^\u4e00-\u9fffA-Za-z0-9\s\-]/g, "").slice(0, 100);
   ```

### 回應格式

所有 API 回應遵循統一格式：

```typescript
// 成功
{ success: true, data: {...} }

// 失敗
{ success: false, message: "使用者可讀的錯誤訊息" }
```

### Runtime 設定

需要使用 Node.js 模組（如 `jsonwebtoken`）的 Route 必須宣告：

```typescript
export const runtime = "nodejs";
```

---

## 元件開發守則

### 頁面元件

每個 Tab 對應一個頁面元件 (`*-page.tsx`)，接收 `deviceId` 作為 prop：

```typescript
interface Props {
  deviceId: string;
  onNavigate?: (tab: TabId) => void;
}

export function ExamplePage({ deviceId }: Props) {
  // ...
}
```

### UI 元件

基礎 UI 元件使用 Shadcn UI，放在 `components/ui/`。
不要直接修改 `ui/` 下的檔案，如需客製化：

1. 使用 `className` prop 覆蓋樣式
2. 必要時透過 `cn()` 合併
3. 封裝為上層業務元件

### 狀態管理

- **全域狀態**：React Context（如 `AdminProvider`）
- **伺服器資料**：`useEffect` + `fetch`（透過 `api-client.ts`）
- **本地持久化**：`localStorage`（使用者設定、快取）
- **會話資料**：`sessionStorage`（管理員 JWT Session）

---

## 測試驗證清單

提交 PR 前請確認：

- [ ] `npm run lint` 無錯誤
- [ ] `npm run build` 建置成功
- [ ] 功能在 Web 環境可正常運作
- [ ] （若涉及原生功能）`npm run cap:build` 成功
- [ ] API 變更已同步更新 `lib/types/api.ts`
- [ ] 未在 API 回應中暴露 `error.message`
- [ ] 未在 log 中輸出敏感資訊（JWT、token、密鑰）
- [ ] 新環境變數已更新 `.env.example` 與 README

---

## Pull Request 流程

### PR 標題格式

```
<type>(<scope>): <subject>
```

範例：`feat(calendar): 新增行事曆匯出功能`

### PR 描述模板

```markdown
## 變更說明
簡述這次 PR 做了什麼。

## 變更類型
- [ ] 新功能
- [ ] Bug 修復
- [ ] 重構
- [ ] 文件更新

## 測試方式
描述如何驗證這次變更。

## 截圖（如有 UI 變更）
附上前後對比截圖。
```

### Review 規則

- 至少 **1 位維護者** 核准後才能合併
- 涉及 API 安全性變更需額外 Review
- 合併方式：**Squash and merge**（保持主線簡潔）
