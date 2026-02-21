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
  AddNoteResponse,
  SyncUserProfileRequest,
  SyncUserProfileResponse,
  GetUserProfileRequest,
  GetUserProfileResponse,
  CreateAuthRequest,
  CreateAuthResponse,
  ApproveAuthRequest,
  ApproveAuthResponse,
  CheckAuthStatusResponse,
  SaveSchoolCalendarRequest,
  SaveSchoolCalendarResponse
} from "@/lib/types/api";
import { SchoolCalendarEvent, PrivateCalendarEvent, AdminSession } from "@/lib/types/calendar";
import { APP_VERSION } from "./version";


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

/** 同步使用者個人資料至雲端 */
export async function syncUserProfile(profile: UserProfile): Promise<SyncUserProfileResponse> {
  return request<SyncUserProfileResponse>("/api/user/profile/sync", {
    method: "POST",
    body: JSON.stringify({ ...profile, app_version: APP_VERSION } as SyncUserProfileRequest),
  });
}

/** 從後端取得使用者個人資料 */
export async function fetchUserProfile(device_id: string): Promise<GetUserProfileResponse> {
  return request<GetUserProfileResponse>(`/api/user/profile?device_id=${encodeURIComponent(device_id)}`);
}

// ============================================================
// 2. 課表系統
// ============================================================

/** 取得雲端課表 */
export async function fetchTimetable(req: FetchTimetableRequest): Promise<FetchTimetableResponse> {
  const cached = getCachedData<FetchTimetableResponse>("cache_timetable");
  if (cached?.fresh) return cached.data;

  const data = await request<FetchTimetableResponse>(`/api/timetable?invite_code=${encodeURIComponent(req.invite_code)}`);
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
// 3. 公告 
// ============================================================

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

// ============================================================
// 4. 行事曆 (Calendar)
// ============================================================

/** 取得全校行事曆 (帶快取) */
export async function fetchSchoolCalendar(start?: string, end?: string): Promise<FetchSchoolCalendarResponse> {
  const cacheKey = `cache_calendar_${start}_${end}`;
  const cached = getCachedData<FetchSchoolCalendarResponse>(cacheKey);
  if (cached?.fresh) return cached.data;

  const params = new URLSearchParams();
  if (start) params.append("start_date", start);
  if (end) params.append("end_date", end);

  const data = await request<FetchSchoolCalendarResponse>(`/api/calendar/school?${params.toString()}`);
  setCachedData(cacheKey, data);
  return data;
}

/** [管理員] 儲存學校事件 */
export async function saveSchoolEvent(
  event: SchoolCalendarEvent,
  sessionOverride?: AdminSession | null
): Promise<SaveSchoolCalendarResponse> {
  const session = sessionOverride ?? getAdminSession();
  if (!session) throw new Error("無效的管理員授權");

  return request<SaveSchoolCalendarResponse>("/api/calendar/school/save", {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${session.accessToken}`,
      "X-Device-ID": session.deviceId // 增加 Device ID 綁定校驗
    },
    body: JSON.stringify({ event }),
  });
}

// --- 授權相關 (Auth) ---

/** 取得存放在 SessionStorage 的授權資訊 */
export function getAdminSession(): AdminSession | null {
  if (typeof window === "undefined") return null;
  const raw = sessionStorage.getItem("admin_session");
  if (!raw) return null;
  const session = JSON.parse(raw) as AdminSession;
  
  // 檢查是否過期
  if (Date.now() > session.expiresAt) {
    sessionStorage.removeItem("admin_session");
    return null;
  }
  return session;
}

/** 發起雙人授權請求 */
export async function createPeerAuth(req: CreateAuthRequest): Promise<CreateAuthResponse> {
  return request<CreateAuthResponse>("/api/auth/request", {
    method: "POST",
    body: JSON.stringify(req),
  });
}

/** 審核授權請求 (授權端 Admin 用) */
export async function approvePeerAuth(req: ApproveAuthRequest): Promise<ApproveAuthResponse> {
  return request<ApproveAuthResponse>("/api/auth/approve", {
    method: "POST",
    body: JSON.stringify(req),
  });
}

/** 輪詢或檢查授權狀態 (發起端 Editor 用) */
export async function checkAuthStatus(requestId: string): Promise<CheckAuthStatusResponse> {
  const res = await request<CheckAuthStatusResponse>(`/api/auth/status?request_id=${requestId}`);
  
  // 如果成功拿到 Session (JWT)，直接存入 sessionStorage
  if (res.success && res.session) {
    sessionStorage.setItem("admin_session", JSON.stringify(res.session));
  }
  return res;
}

// --- 私人事件 (LocalStorage) ---

export function getLocalPrivateEvents(): PrivateCalendarEvent[] {
  if (typeof window === "undefined") return [];
  const raw = localStorage.getItem("private_calendar_events");
  return raw ? JSON.parse(raw) : [];
}

export function saveLocalPrivateEvents(events: PrivateCalendarEvent[]): void {
  if (typeof window === "undefined") return;
  localStorage.setItem("private_calendar_events", JSON.stringify(events));
}

// ============================================================
// 5. 交通資訊 (Transport)
// ============================================================

export async function fetchTransportData(): Promise<TransportDataResponse> {
  const cached = getCachedData<TransportDataResponse>("cache_transport");
  if (cached?.fresh) return cached.data;

  const data = await request<TransportDataResponse>("/api/transport");
  setCachedData("cache_transport", data);
  return data;
}