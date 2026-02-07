import { UserProfile } from "@/lib/types/user";
import {
  FetchTimetableRequest,
  FetchTimetableResponse,
  SaveTimetableRequest,
  SaveTimetableResponse,
  GenerateCodeRequest,
  GenerateCodeResponse,
  JoinClassRequest,
  JoinClassResponse,
  FetchSchoolCalendarResponse,
  FetchAnnouncementsResponse,
  TransportDataResponse
} from "@/lib/types/api";


// --- 設定與工具 ---

const CACHE_TTL_MS = 60_000;

function getCachedData<T>(key: string): { data: T; fresh: boolean } | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as { data: T; timestamp: number };
    const isFresh = Date.now() - parsed.timestamp < CACHE_TTL_MS;
    return { data: parsed.data, fresh: isFresh };
  } catch { return null; }
}

function setCachedData<T>(key: string, data: T): void {
  if (typeof window === "undefined") return;
  localStorage.setItem(key, JSON.stringify({ data, timestamp: Date.now() }));
}

/** 統一 Fetch 工具 */
async function request<T>(url: string, options?: RequestInit): Promise<T> {
  const res = await fetch(url, {
    ...options,
    headers: { "Content-Type": "application/json", ...options?.headers },
  });
  if (!res.ok) throw new Error(`API Error: ${res.status}`);
  return res.json();
}

// ============================================================
// 1. 使用者個人設定 (LocalStorage)
// ============================================================

export function getLocalUserProfile(): UserProfile | null {
  if (typeof window === "undefined") return null;
  const raw = localStorage.getItem("user_profile");
  return raw ? JSON.parse(raw) : null;
}

export function saveLocalUserProfile(profile: UserProfile): void {
  if (typeof window === "undefined") return;
  localStorage.setItem("user_profile", JSON.stringify(profile));
}

// ============================================================
// 2. 課表系統 (實戰 API)
// ============================================================

/** 取得雲端課表 */
export async function fetchTimetable(req: FetchTimetableRequest): Promise<FetchTimetableResponse> {
  const cacheKey = `cache_timetable_${req.invite_code}`;
  const cached = getCachedData<FetchTimetableResponse>(cacheKey);
  if (cached?.fresh) return cached.data;

  const data = await request<FetchTimetableResponse>(`/api/timetable?invite_code=${req.invite_code}`);
  setCachedData(cacheKey, data);
  return data;
}

/** 儲存雲端課表 */
export async function saveTimetable(req: SaveTimetableRequest): Promise<SaveTimetableResponse> {
  return request<SaveTimetableResponse>("/api/timetable", {
    method: "POST",
    body: JSON.stringify(req),
  });
}

/** 生成/找回班級代碼 */
export async function generateClassCode(req: GenerateCodeRequest): Promise<GenerateCodeResponse> {
  return request<GenerateCodeResponse>("/api/class/generate", {
    method: "POST",
    body: JSON.stringify(req),
  });
}

export async function joinClass(req: JoinClassRequest): Promise<JoinClassResponse> {
  return request<JoinClassResponse>("/api/class/join", {
    method: "POST",
    body: JSON.stringify(req),
  });
}
// ============================================================
// 3. 交通/行事曆/公告 (目前維持精美 Mock)
// ============================================================


export async function fetchTransportData(): Promise<TransportDataResponse> {
  await new Promise(r => setTimeout(r, 500));
  return {
    trains_south: [{ id: "272", type: "區間", destination: "嘉義", departure: "17:23", status: "準點" }],
    trains_north: [{ id: "171", type: "自強", destination: "台北", departure: "17:15", status: "準點" }],
    buses: [{ route: "綠1", destination: "台南火車站", eta: "3 分鐘", status: "進站中" }],
    youbike: [{ name: "南科實中站", available: 8, empty: 12, total: 20 }],
    updated_at: new Date().toISOString(),
  };
}

export async function fetchSchoolCalendar(): Promise<FetchSchoolCalendarResponse> {
  await new Promise(r => setTimeout(r, 400));
  return {
    events: [
      { id: 1, date: "3/3", weekday: "一", title: "開學典禮", description: "全校集合", tag: "全校", color: "bg-macaron-pink" },
      { id: 3, date: "3/10", weekday: "一", title: "第一次段考", description: "範圍依公告", tag: "考試", color: "bg-macaron-yellow" }
    ],
    semester: "113學年度第二學期",
    updated_at: new Date().toISOString(),
  };
}

export async function fetchAnnouncements(page = 1): Promise<FetchAnnouncementsResponse> {
  await new Promise(r => setTimeout(r, 500));
  return {
    announcements: [
      { post_id: 1, title: "段考考程公告", content: "考試日期...", publish_date: "2026-02-25", category: "exam", importance: 1, author: "教務處" }
    ],
    total: 1,
    page,
    updated_at: new Date().toISOString(),
  };
}