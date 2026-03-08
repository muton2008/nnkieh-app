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
  GetUserProfileResponse,
  CreateAuthResponse,
  ApproveAuthRequest,
  ApproveAuthResponse,
  CheckAuthStatusResponse,
  FetchPendingRequestsResponse,
  SaveSchoolCalendarResponse
} from "@/lib/types/api";
import { SchoolCalendarEvent, PrivateCalendarEvent, AdminSession } from "@/lib/types/calendar";
import { APP_VERSION } from "./version";
import { getApiBaseUrl } from "./platform";

// --- 自定義錯誤 ---

/** 攜帶 HTTP 狀態碼的 API 錯誤 */
export class ApiError extends Error {
  constructor(
    message: string,
    public readonly status: number,
    public readonly body?: Record<string, unknown>
  ) {
    super(message);
    this.name = "ApiError";
  }
}

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

/** 統一 Fetch 工具（自動加上平台對應的 base URL） */
async function request<T>(url: string, options?: RequestInit): Promise<T> {
  const baseUrl = getApiBaseUrl();
  const fullUrl = url.startsWith('http') ? url : `${baseUrl}${url}`;
  const res = await fetch(fullUrl, {
    ...options,
    headers: { "Content-Type": "application/json", ...options?.headers },
  });
  if (!res.ok) {
    let body: Record<string, unknown> = {};
    try { body = await res.json(); } catch { /* ignore */ }
    const serverMessage = (body?.message as string) || "";

    // 401：自動清除過期的 admin session
    if (res.status === 401 && typeof window !== "undefined") {
      sessionStorage.removeItem("admin_session");
    }

    throw new ApiError(
      serverMessage || `API Error: ${res.status}`,
      res.status,
      body
    );
  }
  return res.json();
}

/** 低階 Fetch — 回傳原始 Response，讓呼叫端自行處理狀態碼 */
async function rawRequest(url: string, options?: RequestInit): Promise<Response> {
  const baseUrl = getApiBaseUrl();
  const fullUrl = url.startsWith('http') ? url : `${baseUrl}${url}`;
  return fetch(fullUrl, {
    ...options,
    headers: { "Content-Type": "application/json", ...options?.headers },
  });
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

/** 建立者退出班級 — 從資料庫刪除該課表 */
export async function leaveClass(req: { invite_code: string; device_id: string }): Promise<{ success: boolean; message?: string }> {
  return request<{ success: boolean; message?: string }>("/api/class/leave", {
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
  if (!session.accessToken) throw new Error("授權憑證不存在，請重新進行雙人驗證");

  return request<SaveSchoolCalendarResponse>("/api/calendar/school/save", {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${session.accessToken}`,
      "X-Device-ID": session.deviceId // 增加 Device ID 綁定校驗
    },
    body: JSON.stringify({ event }),
  });
}

/** [管理員] 刪除學校事件 */
export async function deleteSchoolEvent(
  eventId: string,
  sessionOverride?: AdminSession | null
): Promise<{ success: boolean }> {
  const session = sessionOverride ?? getAdminSession();
  if (!session) throw new Error("無效的管理員授權");

  return request<{ success: boolean }>("/api/calendar/school/delete", {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${session.accessToken}`,
      "X-Device-ID": session.deviceId,
    },
    body: JSON.stringify({ event_id: eventId }),
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
export async function createPeerAuth(deviceId: string): Promise<CreateAuthResponse> {
  return request<CreateAuthResponse>("/api/auth/request", {
    method: "POST",
    body: JSON.stringify({ device_id: deviceId }),
  });
}

/** 審核授權請求 (授權端 Admin 用)，需要分辨 400/409/423 所以用 rawRequest */
export async function approvePeerAuth(
  requestId: string,
  inputCode: string,
  adminDeviceId: string
): Promise<ApproveAuthResponse & { status: number }> {
  const req: ApproveAuthRequest = { requestId, inputCode, admin_device_id: adminDeviceId };
  const res = await rawRequest("/api/auth/approve", {
    method: "POST",
    body: JSON.stringify(req),
  });
  const data: ApproveAuthResponse = await res.json();
  return { ...data, status: res.status };
}

/** 取得待核准的授權請求列表 */
export async function fetchPendingRequests(deviceId: string): Promise<FetchPendingRequestsResponse> {
  return request<FetchPendingRequestsResponse>(`/api/auth/pending?device_id=${encodeURIComponent(deviceId)}`);
}

/** 輪詢或檢查授權狀態 (發起端 Editor 用) */
export async function checkAuthStatus(requestId: string): Promise<CheckAuthStatusResponse> {
  const res = await request<CheckAuthStatusResponse>(`/api/auth/status?request_id=${encodeURIComponent(requestId)}`);
  
  // 如果成功拿到 Session (JWT)，直接存入 sessionStorage
  if (res.success && res.session) {
    sessionStorage.setItem("admin_session", JSON.stringify(res.session));
  }
  return res;
}

// --- 管理員白名單 (Admin Whitelist) ---

import type {
  ManageAdminWhitelistRequest,
  ManageAdminWhitelistResponse,
  FetchAdminWhitelistResponse,
  HandoverRequest,
  HandoverResponse,
} from "@/lib/types/api";

/** 取得白名單列表 */
export async function fetchAdminWhitelist(session: AdminSession): Promise<FetchAdminWhitelistResponse> {
  return request<FetchAdminWhitelistResponse>("/api/admin/whitelist", {
    headers: {
      Authorization: `Bearer ${session.accessToken}`,
    },
  });
}

/** 新增 / 移除 / 更新白名單成員 */
export async function manageAdminWhitelist(
  session: AdminSession,
  data: ManageAdminWhitelistRequest
): Promise<ManageAdminWhitelistResponse> {
  return request<ManageAdminWhitelistResponse>("/api/admin/whitelist", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${session.accessToken}`,
    },
    body: JSON.stringify(data),
  });
}

/** 職位移交（Super Admin → 新 Super Admin） */
export async function handoverSuperAdmin(
  session: AdminSession,
  newSuperAdminId: string
): Promise<HandoverResponse> {
  return request<HandoverResponse>("/api/admin/handover", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${session.accessToken}`,
    },
    body: JSON.stringify({ new_super_admin_id: newSuperAdminId } as HandoverRequest),
  });
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

export async function fetchTransportData(forceRefresh = false): Promise<TransportDataResponse> {
  if (!forceRefresh) {
    const cached = getCachedData<TransportDataResponse>("cache_transport");
    if (cached?.fresh) return cached.data;
  }

  // 加上時間戳防止 HTTP 層快取（CapacitorHttp / CDN / browser）
  const data = await request<TransportDataResponse>(`/api/transport?_t=${Date.now()}`);
  setCachedData("cache_transport", data);
  return data;
}