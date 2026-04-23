import { APP_VERSION } from "./version";

export interface ChangelogEntry {
  version: string;
  date: string;
  changes: string[];
}

export const CHANGELOG: ChangelogEntry[] = [
  {
    version: "0.1.2-beta",
    date: "2026-03-05",
    changes: [
      "新增課表與段考 widget",
      "修復 PWA 安裝失敗的問題",
      "新增更新內容顯示區塊",
      "點擊 Device ID 可快速複製",
      "新版本首次開啟自動顯示更新內容",
      "修復主頁課表備註顏色與課表頁不一致",
      "修復交通頁面資料過期問題",
      "新增隱私權政策與開源授權頁面",
    ],
  },
  {
    version: "0.2.0-beta",
    date: "2026-04-13",
    changes: [
      "更新行事曆登入系統",
      "提升主頁面課表與行事曆載入速度",
      "晚上6點後顯示隔日課表",
      "順便寫了2題雙曲線"
    ]
  },
];

const SEEN_VERSION_KEY = "app_seen_version";

export function getSeenVersion(): string | null {
  if (typeof window === "undefined") return null;
  return localStorage.getItem(SEEN_VERSION_KEY);
}

export function markVersionSeen(): void {
  if (typeof window === "undefined") return;
  localStorage.setItem(SEEN_VERSION_KEY, APP_VERSION);
}

export function hasNewVersion(): boolean {
  const seen = getSeenVersion();
  return seen !== APP_VERSION;
}
