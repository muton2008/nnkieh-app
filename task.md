# 📅 NNKIEH All-in-One App 實作任務清單

## 🛠 任務一：身分基礎與 PWA 骨架 (Infrastructure)
* [x] **1.1 裝置 UUID 識別系統**
    * **實作方法**：App 啟動時檢查本地存儲，若無 ID 則生成一組唯一碼。
    * **技術**：`crypto.randomUUID()`，`localStorage`。
* [x] **1.2 PWA 環境配置 (手動模式)**
    * **實作方法**：設定 Web Manifest 與手動註冊 Service Worker (含 firebase-messaging-sw.js)。
    * **現況**：未安裝 Serwist，採輕量化手寫模式。
* [ ] **1.3 核心版本檢查機制 (Version Guard)**
    * **實作方法**：前端啟動時比對後端 API 回傳的最小相容版本。
    * **技術**：Next.js API Route, Semver 邏輯。
* [x] **1.4 Supabase 資料表初始化**
    * **實作細節**：已完成 `timetables`, `announcements`, `fcm_tokens` 等表結構設計。

---

## 📅 任務二：課表系統 (Smart Timetable)
* [x] **2.1 隨機課表 ID 生成器**
    * **實作方法**：模仿 Google Classroom 生成隨機、不重複的短代碼（格式 `xxx-yyyy`）。
    * **技術**：`nanoid`。
* [x] **2.2 公用備註同步 (Cloud Events)**
    * **實作方法**：建立者與訂閱者可透過 Supabase 查看/同步「全班性」事件。
    * **技術**：Supabase Realtime / React Query。
* [x] **2.3 私人備註離線儲存 (Local-Only)**
    * **實作方法**：實作「僅限本機」的備註功能，資料不入庫，保證隱私。
    * **技術**：`localStorage` 或 `IndexedDB`。
* [x] **2.4 雙軌資料合併 UI**
    * **實作方法**：同一時段若同時存在「公用」與「私人」備註，UI 需自動並列渲染。
* [ ] **2.5 每學期自動清空任務 (Cron Job)**
    * **實作方法**：2/1 與 8/1 定時清空公用備註。

---

## 🚌 任務三：統一交通資訊中心 (Unified Transport Hub)
* [x] **3.1 統一快取 API 代理 (TDX Proxy)**
    * **實作方法**：建立 `/api/transport` 對接 TDX，修正全域變數汙染問題。
* [x] **3.2 安全連線與超時策略**
    * **實作細節**：強制忽略南科 API 的 SSL 憑證錯誤，並加入 AbortController 處理請求超時。
    * **技術**：`NODE_TLS_REJECT_UNAUTHORIZED = '0'`。
* [x] **3.3 交通資訊 UI 渲染**
    * **技術**：Tailwind CSS, `lucide-react` 圖標。

---

## 📖 任務四：行事曆與公告系統
* [ ] **4.1 學生會編輯後台 (Admin Portal)**
    * **實作方法**：建立隱藏路徑，透過 URL 密鑰或 `localStorage` 存放的通行碼驗證編輯權限。
    * **技術**：Supabase RLS Policy (檢查自定義 header 或 Token)。
* [ ] **4.2 垂直時間軸 UI**
    * **實作細節**：串接 Supabase `calendar_events` 資料表，提供一鍵加入手機行事曆按鈕。
    * **技術**：`ics` library。
* [x] **4.3 公告列表與「已讀」邏輯**
    * **實作細節**：已完成公告鏡像、分頁邏輯、分類篩選與本地已讀變色功能。

---

## 📱 任務五：原生打包與 Android 發佈
* [ ] **5.1 Capacitor 初始化**
    * **實作方法**：將專案轉換為 Capacitor 專案並加入 Android 平台。
* [ ] **5.2 原生功能映射**
    * **實作細節**：配置 AndroidManifest.xml 設定網路、通知權限。
* [ ] **5.3 APK 編譯與實機測試**

---

## 🔔 任務六：自動化通知系統 (Smart Notification)
**目標**：結合雲端推播與本地排程，確保資訊低延遲且不遺漏。

* [x] **6.1 Device Token 獲取邏輯 (PWA)**
    * **實作方法**：使用 `navigator.serviceWorker.ready` 配合 `Promise.race` 防止卡死。
    * **技術**：Firebase JS SDK, VAPID Key。
* [ ] **6.2 Firebase FCM 推播整合 (Server-side)**
    * **實作細節**：串接 FCM HTTP v1 API。發送失敗時自動清理資料庫內的無效 Token。
* [ ] **6.3 私人備註本地通知 (App 專屬)**
    * **實作方法**：打包後改用本地通知 API，解決 PWA 背景計時失效問題。
    * **技術**：`@capacitor/local-notifications`。
* [ ] **6.4 通知點擊導航邏輯 (Deep Linking)**
    * **實作方法**：解析通知攜帶的 `data` 載荷，自動導向正確頁面。