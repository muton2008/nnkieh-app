import { UserProfile } from "@/lib/types/user";
import { PrivateNoteStore } from "@/lib/types/timetable";
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
  TransportDataResponse,
  AddNoteRequest,
  AddNoteResponse
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

export function getLocalPrivateNotes(): PrivateNoteStore {
  if (typeof window === "undefined") return {};
  const raw = localStorage.getItem("private_notes");
  return raw ? JSON.parse(raw) : {};
}

export function saveLocalPrivateNotes(notes: PrivateNoteStore): void {
  if (typeof window === "undefined") return;
  localStorage.setItem("private_notes", JSON.stringify(notes));
}

// ============================================================
// 2. 課表系統 (實戰 API)
// ============================================================

/** 取得雲端課表 */
export async function fetchTimetable(req: FetchTimetableRequest): Promise<FetchTimetableResponse> {
  const cached = getCachedData<FetchTimetableResponse>("cache_timetable");
  if (cached?.fresh) return cached.data;

  const data = await request<FetchTimetableResponse>(`/api/timetable?invite_code=${req.invite_code}`);
  setCachedData("cache_timetable", data);
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

/** 新增課表備註 */
export async function addTimetableNote(req: AddNoteRequest): Promise<AddNoteResponse> {
  return request<AddNoteResponse>("/api/timetable/notes", {
    method: "POST",
    body: JSON.stringify(req),
  });
}
// ============================================================
// 3. 行事曆/公告 (目前維持精美 Mock)
// ============================================================

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

// --- 公告 ---

export async function fetchAnnouncements(
  page = 1,
  options?: { tab?: string | number; query?: string }
): Promise<FetchAnnouncementsResponse> {
  const params = new URLSearchParams({ page: page.toString() });
  
  if (options?.tab) {
    params.append('tab', options.tab.toString());
  }
  
  if (options?.query) {
    params.append('q', options.query);
  }
  
  return request<FetchAnnouncementsResponse>(`/api/announcements?${params.toString()}`);
}

/** 取得已讀公告 ID 集合 */
export function getReadAnnouncementIds(): Set<number> {
  if (typeof window === "undefined") return new Set();
  const raw = localStorage.getItem("read_announcements");
  try {
    return new Set(raw ? JSON.parse(raw) : []);
  } catch {
    return new Set();
  }
}

/** 標記公告為已讀 */
export function markAnnouncementAsRead(postId: number): void {
  if (typeof window === "undefined") return;
  const ids = getReadAnnouncementIds();
  ids.add(postId);
  localStorage.setItem("read_announcements", JSON.stringify([...ids]));
}