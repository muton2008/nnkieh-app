# 南科實中校園助手 (NNKIEH Campus App)

> 南科實中學生會開發的跨平台校園生活入口，整合課表、交通、行事曆、公告四大功能。

[![Next.js](https://img.shields.io/badge/Next.js-15-black)](https://nextjs.org/)
[![Capacitor](https://img.shields.io/badge/Capacitor-8-119EFF)](https://capacitorjs.com/)
[![Supabase](https://img.shields.io/badge/Supabase-PostgreSQL-3FCF8E)](https://supabase.com/)
[![License](https://img.shields.io/badge/License-Apache%202.0-blue.svg)](LICENSE)

## 目錄

- [功能總覽](#功能總覽)
- [技術棧](#技術棧)
- [快速開始](#快速開始)
- [環境變數](#環境變數)
- [專案結構](#專案結構)
- [開發指令](#開發指令)
- [建置與部署](#建置與部署)
- [文件目錄](#文件目錄)
- [貢獻指南](#貢獻指南)

## 功能總覽

| 模組 | 說明 |
|---|---|
| **課表系統** | 班級邀請碼制度、公用 / 私人備註雙軌合併、Android Widget 同步 |
| **交通資訊** | 台鐵即時到站、公車 ETA (綠2/綠3/橘12/橘14)、YouBike 車位查詢 |
| **行事曆** | 全校行事曆 CMS、6 大分類、三級權限管理、雙人授權審核 |
| **公告中心** | 學校公告鏡像、分類篩選、全文搜尋、已讀追蹤 |
| **推播通知** | FCM 雲端推播 + Capacitor 本地通知排程 |

## 技術棧

```
前端框架    Next.js 15 + React 19
UI 元件     Shadcn UI (Radix + Tailwind CSS)
動畫        Framer Motion
跨平台      Capacitor 8 (Android / iOS / PWA)
資料庫      Supabase (PostgreSQL + Realtime)
推播        Firebase Cloud Messaging (FCM)
交通 API    TDX 運輸資料平台 (OAuth2)
部署        Vercel (Web) + Android Studio (APK)
```

## 快速開始

### 前置需求

- **Node.js** >= 18
- **pnpm** 或 **npm**
- **Android Studio** (若要編譯 Android App)
- **Xcode** (若要編譯 iOS App，僅限 macOS)

### 安裝

```bash
# 1. 複製專案
git clone <repo-url>
cd nnkieh-app

# 2. 安裝依賴
npm install

# 3. 設定環境變數
cp .env.example .env
# 編輯 .env 填入實際值（參見下方 環境變數 區塊）

# 4. 啟動開發伺服器
npm run dev
```

開發伺服器預設運行在 `http://localhost:3000`。

## 環境變數

在專案根目錄建立 `.env` 檔（已被 `.gitignore` 排除）：

```env
# ── Supabase ──
NEXT_PUBLIC_SUPABASE_URL=https://xxxxx.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJhbG...         # 用於前端 RLS 查詢
SUPABASE_SERVICE_ROLE_KEY=eyJhbG...              # 用於後端繞過 RLS

# ── Firebase ──
FIREBASE_SERVICE_ACCOUNT={"type":"service_account",...}  # JSON 字串（單行）

# ── 授權 ──
JWT_SECRET=your-256-bit-secret                   # HS256 JWT 簽發密鑰

# ── 交通 API (TDX) ──
TDX_client_id=your-client-id
TDX_client_secret=your-client-secret

# ── 應用程式 URL ──
NEXT_PUBLIC_APP_URL=https://your-domain.vercel.app
NEXT_PUBLIC_API_BASE_URL=https://your-domain.vercel.app  # 原生 App 的 API 端點
```

> **重要**：`SUPABASE_SERVICE_ROLE_KEY`、`JWT_SECRET`、`FIREBASE_SERVICE_ACCOUNT` 具有完整後端權限，絕對不可洩漏。

## 專案結構

```
nnkieh-app/
├── app/                          # Next.js App Router
│   ├── layout.tsx                # 根佈局（字體、PWA meta、SW 註冊）
│   ├── page.tsx                  # SPA 主頁面（Tab Router）
│   ├── globals.css               # CSS 變數與全域動畫
│   ├── manifest.ts               # PWA Web Manifest
│   └── api/                      # API Routes（Server-side only）
│       ├── admin/                #   管理員白名單 / 職位移交
│       ├── announcements/        #   公告查詢
│       ├── auth/                 #   雙人授權（request/approve/status/pending）
│       ├── calendar/             #   行事曆 CRUD
│       ├── class/                #   班級代碼（generate/join/leave）
│       ├── timetable/            #   課表 GET/POST + 備註
│       ├── transport/            #   交通即時資訊（TDX 代理）
│       └── user/                 #   使用者 Profile 同步
├── components/                   # React 元件
│   ├── *-page.tsx                #   各分頁頁面元件
│   ├── admin-*.tsx               #   管理員相關元件
│   ├── capacitor-init.tsx        #   原生插件初始化
│   ├── sw-register.tsx           #   Service Worker 註冊
│   └── ui/                       #   Shadcn UI 基礎元件（30+）
├── lib/                          # 共用邏輯
│   ├── api-client.ts             #   前端 API 呼叫封裝（含快取）
│   ├── firebase.ts               #   FCM Token 取得（Web + Native）
│   ├── firebase-admin.ts         #   Firebase Admin SDK（Server-side）
│   ├── platform.ts               #   平台偵測工具
│   ├── reminders.ts              #   本地通知排程引擎
│   ├── tdx.ts                    #   TDX OAuth2 Token 管理
│   ├── timetable-widget.ts       #   Android Widget 橋接
│   ├── supabase/client.ts        #   Supabase 前端 Client
│   ├── supabase/server.ts        #   Supabase 後端 Client
│   └── types/                    #   TypeScript 型別定義
│       ├── api.ts                #     API 請求 / 回應 DTO
│       ├── calendar.ts           #     行事曆、權限、認證
│       ├── timetable.ts          #     課表、備註
│       ├── user.ts               #     使用者設定
│       ├── announcement.ts       #     公告分類與結構
│       ├── transport.ts          #     交通（火車/公車/YouBike）
│       └── common.ts             #     通用型別
├── public/                       # 靜態資源
│   └── firebase-messaging-sw.js  #   FCM Service Worker
├── scripts/
│   └── build-cap.js              #   Capacitor 建置腳本
├── supabase/
│   └── functions/announcements/  #   Edge Function（公告爬蟲）
├── android/                      # Capacitor Android 專案
├── ios/                          # Capacitor iOS 專案
└── docs/                         # 工程文件（詳見下方）
```

## 開發指令

| 指令 | 說明 |
|---|---|
| `npm run dev` | 啟動 Next.js 開發伺服器 |
| `npm run build` | 正式建置（Web 版） |
| `npm run lint` | ESLint 程式碼檢查 |
| `npm run cap:build` | 靜態匯出 + Capacitor 同步 |
| `npm run cap:run:android` | 建置並在 Android 裝置運行 |
| `npm run cap:run:ios` | 建置並在 iOS 裝置運行 |
| `npm run cap:android` | 同步後開啟 Android Studio |
| `npm run cap:ios` | 同步後開啟 Xcode |

## 建置與部署

### Web (Vercel)

```bash
# Vercel 自動偵測 Next.js，直接推送即可
git push origin main
```

在 Vercel Dashboard 設定所有環境變數。

### Android (APK / AAB)

```bash
# 1. 靜態匯出 + 同步原生專案
npm run cap:build

# 2. 開啟 Android Studio
npm run cap:android

# 3. 在 Android Studio 中 Build > Generate Signed Bundle / APK
```

建置流程由 `scripts/build-cap.js` 管理：
1. 暫時移除 `app/api/`、`app/manifest.ts`、`lib/firebase-admin.ts`（不參與靜態匯出）
2. 以 `BUILD_TARGET=capacitor` 執行 `next build`（`output: 'export'` 模式）
3. 還原全部檔案

### iOS

```bash
npm run cap:run:ios
# 需要 macOS + Xcode + Apple Developer 帳號
```

## 文件目錄

| 文件 | 說明 |
|---|---|
| [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) | 系統架構設計、資料流、資料庫 Schema |
| [docs/API.md](docs/API.md) | 所有 API Route 完整規格 |
| [docs/SECURITY.md](docs/SECURITY.md) | 安全模型、權限設計、已知風險 |
| [CONTRIBUTING.md](CONTRIBUTING.md) | 開發守則、Git 流程、程式碼風格 |
| [task.md](task.md) | 產品功能規劃與進度追蹤 |

## 貢獻指南

請參閱 [CONTRIBUTING.md](CONTRIBUTING.md) 了解完整的開發規範。

簡要流程：

1. 從 `main` 分支建立功能分支：`git checkout -b feat/feature-name`
2. 開發並通過本地驗證
3. 提交 PR 並填寫描述模板
4. 至少一位維護者 Code Review 後合併

## 授權

MIT License — 詳見 [LICENSE](LICENSE)
