# 📅 NNKIEH All-in-One App 實作任務清單

## 🛠 任務一：身分基礎與 PWA 骨架 (Infrastructure)
**目標**：建立無登入的身分識別系統，並配置離線優先的 Web 環境。

* **1.1 裝置 UUID 識別系統**
    * **實作方法**：App 啟動時檢查本地存儲，若無 ID 則生成一組唯一碼。
    * **實作細節**：優先存入 `Capacitor Preferences` 以確保在 Android/iOS 上具備持久性。
    * **技術**：`crypto.randomUUID()`，`Capacitor Preferences`。
* **1.2 PWA 環境配置**
    * **實作方法**：設定 Web Manifest 與 Service Worker 策略。
    * **實作細節**：採用 Cache-First 策略，確保靜態資源（JS/CSS/Icon）在斷網時能瞬間載入。
    * **技術**：`Serwist` (或 `next-pwa`)。
* **1.3 核心版本檢查機制 (Version Guard)**
    * **實作方法**：前端啟動時比對後端 API 回傳的最小相容版本。
    * **實作細節**：若本地版本 < `min_version`，強制彈窗提示「請重新啟動 App 以更新」。
    * **技術**：Next.js API Route, Semver 邏輯。
* **1.4 Supabase 資料表初始化**
    * **實作方法**：在 Supabase 建立專案並執行 SQL。
    * **實作細節**：設計 `timetables`, `timetable_events`, `calendar_events`, `transport_cache` 四張表。
    * **技術**：PostgreSQL, RLS Policy。

---

## 📅 任務二：課表系統 (Smart Timetable)
**目標**：實作難以猜測的課表 ID、雲端備註同步與本地隱私備註。

* **2.1 隨機課表 ID 生成器**
    * **實作方法**：模仿 Google Classroom 生成隨機、不重複的短代碼。
    * **實作細節**：格式定為 `xxx-yyyy` (7 位混和英數字)，避免連續性與易猜性。
    * **技術**：`nanoid`。
* **2.2 公用備註同步 (Cloud Events)**
    * **實作方法**：建立者與訂閱者可查看「全班性」事件。
    * **實作細節**：事件類別包含：調課、考試、收作業、其他。資料存於 Supabase。
    * **技術**：Supabase Client, React Query (用於 SWR 刷新)。
* **2.3 私人備註離線儲存 (Local-Only)**
    * **實作方法**：實作「僅限本機」的備註功能。
    * **實作細節**：類別設為「私人」，資料存入 LocalStorage，**不執行** API 請求，保證隱私。
    * **技術**：`localStorage` 或 `IndexedDB`。
* **2.4 雙軌資料合併 UI**
    * **實作方法**：開發核心 Render 邏輯。
    * **實作細節**：同一時段若同時存在「公用備註」與「私人備註」，UI 需並列或優先顯示私人提醒。
    * **技術**：JavaScript Array Merging。
* **2.5 每學期自動清空任務 (Cron Job)**
    * **實作方法**：設定定時任務清空課表 ID 與公用備註。
    * **實作細節**：定於 2/1 與 8/1 凌晨執行 `DELETE` 指令。
    * **技術**：`Vercel Cron Jobs`。

---

## 🚌 任務三：統一交通資訊中心 (Unified Transport Hub)
**目標**：整合火車、公車、YouBike，並實作後端快取保護。

* **3.1 統一快取 API 代理 (TDX Proxy)**
    * **實作方法**：建立 `/api/transport` 路由對接 TDX。
    * **實作細節**：後端統一換取 Access Token，並抓取南科站火車、實中周邊公車與 YouBike 資訊。
    * **技術**：Next.js API Route, TDX API V2。
* **3.2 1 分鐘強制緩存策略**
    * **實作方法**：實作 Cache-Aside 邏輯。
    * **實作細節**：每次請求先查 `transport_cache` 表。若 `Now - updated_at < 60s`，則回傳快取，否則更新 TDX。
    * **技術**：PostgreSQL Time Comparison。
* **3.3 交通資訊 UI 渲染**
    * **實作方法**：固定顯示列表。
    * **實作細節**：以卡片形式呈現，火車顯示最近三班，YouBike 顯示剩餘數量。
    * **技術**：Tailwind CSS, `lucide-react` 圖標。

---

## 📖 任務四：行事曆與公告系統
**目標**：建立 AI 輔助的行事曆管理與現有的公告鏡像。

* **4.1 行事曆 AI 轉換器 (Admin Tool)**
    * **實作方法**：建立簡單的管理員後台介面。
    * **實作細節**：串接 Gemini API，將學校官網行事曆文字貼上，自動解析成 JSON 物件存入資料庫。
    * **技術**：`Google Generative AI SDK` (Gemini Flash)。
* **4.2 垂直時間軸 UI**
    * **實作方法**：以時間軸形式呈現學校重要時程（段考、校慶等）。
    * **實作細節**：支援離線下載備份，並提供一鍵加入手機行事曆按鈕。
    * **技術**：`ics` library。
* **4.3 公告列表與「已讀」邏輯**
    * **實作方法**：整合先前實作的公告 API。
    * **實作細節**：點擊公告後將 ID 存入本地 `read_announcements` 陣列，標題顏色自動變淡。
    * **技術**：Next.js + LocalStorage。

---

## 📱 任務五：原生打包與 Android 發佈
**目標**：將 Next.js 專案封裝為 Android APK。

* **5.1 Capacitor 初始化**
    * **實作方法**：將專案轉換為 Capacitor 專案。
    * **技術**：`@capacitor/core`, `@capacitor/cli`。
* **5.2 原生功能映射**
    * **實作方法**：配置 AndroidManifest.xml，設定必要的權限（網路、震動、通知）。
    * **技術**：Android Studio。
* **5.3 APK 編譯與離線測試**
    * **實作方法**：在實機上測試斷網環境下，課表與行事曆是否能正常開啟。