# Supabase 公告爬蟲邊緣函數部署指南

## 📋 項目概述

此TypeScript邊緣函數整合了以下功能：
- ✅ **RSS 爬蟲** (fetcher)：抓取 NNKIEH 校園公告
- ✅ **Gemini AI 分類**：自動分類公告內容
- ✅ **LINE 通知**：發送重要公告至LINE
- ✅ **資料庫存儲**：將公告存入 Supabase

## 🚀 快速開始

### 1. 初始化 Supabase 專案

```bash
cd d:\allen\side-project\nnkieh-announcement\scraper
supabase init
```

### 2. 設定環境變數

在 `.env.local` 或 Supabase 儀表板中設定：

```env
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key
GEMINI_KEYS=key1,key2,key3
LINE_CHANNEL_ACCESS_TOKEN=your-line-bot-token
LINE_TARGET_IDS=U1234567890abcdef,U0987654321fedcba
```

**環境變數說明：**
| 變數名 | 說明 | 必需 |
|--------|------|------|
| `SUPABASE_URL` | Supabase 專案 URL | ✅ |
| `SUPABASE_SERVICE_ROLE_KEY` | Service Role Key（完整權限） | ✅ |
| `GEMINI_KEYS` | Google Gemini API 金鑰（逗號分隔） | ✅ |
| `LINE_CHANNEL_ACCESS_TOKEN` | LINE Bot Channel Access Token | ❌ |
| `LINE_TARGET_IDS` | 目標 User ID（逗號分隔） | ❌ |

### 3. 建立資料庫表

在 Supabase SQL 編輯器中執行：

```sql
CREATE TABLE announcements (
  id BIGINT PRIMARY KEY GENERATED ALWAYS AS IDENTITY,
  title TEXT NOT NULL,
  content TEXT,
  category INT,
  importance INT,
  reason TEXT,
  publish_date TIMESTAMPTZ,
  link TEXT,
  post_id TEXT UNIQUE,
  division TEXT[],
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 建立索引以加快查詢
CREATE INDEX idx_announcements_post_id ON announcements(post_id);
CREATE INDEX idx_announcements_publish_date ON announcements(publish_date DESC);
```

### 4. 部署邊緣函數

```bash
supabase functions deploy announcements
```

### 5. 驗證部署

測試函數是否正常運作：

```bash
curl -X POST https://your-project.supabase.co/functions/v1/announcements \
  -H "Authorization: Bearer your-anon-key"
```

預期響應：
```json
{
  "success": true,
  "message": "爬蟲任務執行完成"
}
```

## ⏰ 排程執行

### 方式 1：Supabase 原生排程（推薦）

在 Supabase 儀表板設定 Cron：

1. 前往 **Functions** → **announcements**
2. 點擊 **Add a cron job**
3. 設置 cron 表達式（例如：`0 * * * *` = 每小時運行）

### 方式 2：GitHub Actions

在 `.github/workflows/announcements.yml` 新建工作流：

```yaml
name: NNKIEH Announcements Crawler
on:
  schedule:
    - cron: '0 * * * *'  # 每小時執行一次

jobs:
  crawl:
    runs-on: ubuntu-latest
    steps:
      - name: Call announcement scraper
        run: |
          curl -X POST ${{ secrets.SUPABASE_URL }}/functions/v1/announcements \
            -H "Authorization: Bearer ${{ secrets.SUPABASE_ANON_KEY }}" \
            -H "Content-Type: application/json"
```

### 方式 3：外部排程服務

使用 EasyCron、AWS Lambda 或其他服務每小時呼叫函數。

## 📖 公告分類說明

函數根據以下 ID 分類公告：

| ID | 分類 | 例子 |
|----|------|------|
| 0 | 考試與考程 | 段考、模擬考、學測 |
| 1 | 學習發展 | 選課、課程代碼、FRC隊伍 |
| 2 | 活動與競賽 | 成發、音樂祭、科普活動 |
| 3 | 行政校務 | 校慶、處室通知、校車路線 |
| 4 | 升學招生 | 招生簡章、繁星推薦申請 |
| 5 | 一般宣導 | 防疫通知、交通安全 |
| 6 | 教師研習 | 教師工作坊、領域會議 |

## 🔔 重要性判定

- **1 (重要)**：影響全校或整個部別的學生權益，有明確截止日期
- **0 (一般)**：一般周知、轉發文件、例行性公告

只有重要 (importance=1) 的公告才會發送 LINE 通知。

## 📊 監控與調試

### 檢視函數日誌

```bash
supabase functions logs announcements
```

### 查詢資料庫

```sql
-- 檢視最新公告
SELECT title, category, importance, publish_date 
FROM announcements 
ORDER BY publish_date DESC 
LIMIT 10;

-- 檢視重要公告
SELECT title, link, publish_date 
FROM announcements 
WHERE importance = 1 
ORDER BY publish_date DESC;

-- 檢視特定分類
SELECT title, importance 
FROM announcements 
WHERE category = 2  -- 活動與競賽
ORDER BY publish_date DESC;
```

## 🔐 安全性最佳實踐

✅ **記得做的事：**
- 使用 **Service Role Key**（而非 Anon Key）進行資料庫操作
- 把敏感資訊放在環境變數
- 定期更新 API 金鑰
- 限制 LINE Bot 的目標 ID

❌ **不要做的事：**
- ❌ 在程式碼中硬編碼密鑰
- ❌ 使用 Anon Key 進行敏感操作
- ❌ 在公開倉庫提交 `.env.local`

## 🐛 常見問題

### Q: 為什麼發送 LINE 訊息失敗？

**A:** 檢查以下項目：
1. `LINE_CHANNEL_ACCESS_TOKEN` 是否正確
2. `LINE_TARGET_IDS` User ID 格式是否正確
3. LINE Bot 是否有新增為好友

### Q: 公告重複存儲？

**A:** post_id 是 UNIQUE 約束，重複的公告會被忽略。確保 RSS feed URL 正確。

### Q: Gemini API 速率限制？

**A:** 使用多個 API 金鑰輪轉。函數已內建重試機制，遇到 429 錯誤會等待 30 秒後重試。

### Q: 函數執行超時？

**A:** 減少單次爬蟲的公告數量，或提高 Supabase 函數超時時間限制（預設 10 分鐘）。

## 📝 文件結構

```
supabase/
└── functions/
    └── announcements/
        ├── index.ts              # 單一合併的邊緣函數檔案
        ├── deno.json             # Deno 配置
        └── README.md             # 本文件
```

## 💡 進階使用

### 自訂爬蟲URL

編輯 `index.ts` 中的 `fetcherFn()` 函數：

```typescript
const response = await fetch("https://your-rss-feed-url");
```

### 自訂 HTML 選擇器

修改 `getFullContent()` 中的選擇器：

```typescript
const contentDiv = doc.querySelector('div.your-custom-class');
```

### 調整分類提示詞

編輯 `systemPrompt` 變數以改進分類效果。

## 🤝 貢獻與回饋

如有任何問題、建議或改進，歡迎提出 Issue 或 Pull Request。

---

**最後更新**：2026年2月13日  
**完全支援 Deno + Supabase 邊緣函數部署**
