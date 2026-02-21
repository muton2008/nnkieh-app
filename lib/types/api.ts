import { WeekSchedule } from './timetable';
import { TrainInfo, BusInfo, STSPBusInfo, YouBikeStation } from './transport';
import { 
  SchoolCalendarEvent, 
  PrivateCalendarEvent,
  AdminRole, 
  AuthRequestStatus, 
  AdminSession,
  PeerAuthRequest 
} from './calendar';
import { Announcement } from './announcement';
import { UserProfile } from './user';

// ============================================================
// 1. 班級與課表 (Class & Timetable)
// ============================================================

/** 備註分類：調課、作業、考試、私人 */
export type NoteType = 'reschedule' | 'assignment' | 'exam' | 'private';

/** 單一備註結構 */
export interface CellNote {
  id: string;
  type: NoteType;
  content: string;
  is_public: boolean; // 調課/作業/考試為 true (存 DB)，私人為 false (存 Local)
  created_at: string;
}

/** 加入班級 */
export interface JoinClassRequest {
  invite_code: string;
}

export interface JoinClassResponse {
  success: boolean;
  class_name?: string;
  message?: string;
}

/** 生成/取得邀請碼 */
export interface GenerateCodeRequest {
  device_id: string;
  schedule?: WeekSchedule;
  class_name?: string;
}

export interface GenerateCodeResponse {
  success: boolean;
  invite_code: string;
  created_at: string;
}

/** 儲存課表 (僅含 class_name, semester_tag 等公共資訊與公共備註) */
export interface SaveTimetableRequest {
  invite_code: string;
  schedule: WeekSchedule; 
  class_name?: string;
}

export interface SaveTimetableResponse {
  success: boolean;
  message?: string;
}

/** 取得課表與班級資訊 */
export interface FetchTimetableRequest {
  invite_code: string;
}

export interface FetchTimetableResponse {
  success: boolean;
  schedule: WeekSchedule;
  class_name: string;
  default_room?: string; // 改為選填，因為 DB 目前無此欄位
  updated_at: string;
  message?: string;
}

/** 新增課表備註 */
export interface AddNoteRequest {
  invite_code: string;
  day: string;
  period_idx: number;
  note: {
    text: string;
    category: string;
    date: string; // YYYY-MM-DD
  };
}

export interface AddNoteResponse {
  success: boolean;
  note_id?: string;
  message?: string;
}

// ============================================================
// 2. 行事曆 (Calendar)
// ============================================================

/** 取得全校行事曆 */
export interface FetchSchoolCalendarRequest {
  start_date: string; // YYYY-MM-DD
  end_date: string;   // YYYY-MM-DD
}

export interface FetchSchoolCalendarResponse {
  success: boolean;
  events: SchoolCalendarEvent[];
  updated_at: string;
}

/** 儲存/更新全校行事曆 (管理員專用) */
export interface SaveSchoolCalendarRequest {
  event: SchoolCalendarEvent;
  session_token: string; // AdminSession.access_token
}

export interface SaveSchoolCalendarResponse {
  success: boolean;
  message?: string;
}

/** 刪除全校行事曆事件 (管理員專用) */
export interface DeleteSchoolCalendarRequest {
  event_id: string;
  session_token: string;
}

/** 建立雙人授權請求 (Editor/Admin/SuperAdmin -> Admin/SuperAdmin/Admin) */
export interface CreateAuthRequest {
  requester_id: string;   // device_id
  requester_name: string; // 顯示名稱
  target_role: AdminRole;
}

export interface CreateAuthResponse {
  success: boolean;
  request_id: string;     // 用於後續查詢狀態
  visual_challenge: number; // 顯示給申請者看的隨機數字
  expires_at: string;
}

/** 檢查授權請求狀態 */
export interface CheckAuthStatusRequest {
  request_id: string;
}

export interface CheckAuthStatusResponse {
  success: boolean;
  status: AuthRequestStatus;
  session?: AdminSession; // 若 status 為 'approved'，則回傳 session
  message?: string;
}

/** 審核授權請求 (授權端使用) */
export interface ApproveAuthRequest {
  request_id: string;
  admin_id: string;       // 審核者的 device_id
  challenge_answer: number; // 審核者輸入的數字 (需與 visual_challenge 一致)
}

export interface ApproveAuthResponse {
  success: boolean;
  message?: string;
}

/** 管理員白名單操作 (Super Admin 專用) */
export interface ManageAdminWhitelistRequest {
  session_token: string;
  action: 'add' | 'remove';
  target_device_id: string;
  target_name?: string;
  target_role?: AdminRole;
}

// ============================================================
// 3. 公告 (Announcements)
// ============================================================

export interface FetchAnnouncementsRequest {
  page?: number;
  category?: string;
  query?: string;
}

export interface FetchAnnouncementsResponse {
  announcements: Announcement[];
  total: number;
  page: number;
  totalPages: number;
  hasMore: boolean;
  updated_at: string;
}

// ============================================================
// 4. 交通資訊 (Transport)
// ============================================================

export interface TransportDataResponse {
  trains_south: TrainInfo[];
  trains_north: TrainInfo[];
  buses: BusInfo[];
  STSP_buses: Record<"南科實中" | "民生水塔", STSPBusInfo[]>;
  youbike: YouBikeStation[];
  updated_at: string;
}

// ============================================================
// 5. 使用者個人資料 (User Profile) - 同步至後端
// ============================================================

export interface GetUserProfileRequest {
  device_id: string;
}

export interface GetUserProfileResponse {
  success: boolean;
  profile: UserProfile;
  message?: string;
}

export interface SyncUserProfileRequest extends UserProfile {
  app_version: string;
}

export interface SyncUserProfileResponse {
  success: boolean;
  updated_at?: string;
  message?: string;
}