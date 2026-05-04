import { WeekSchedule } from './timetable';
import { TrainInfo, BusInfo, STSPBusInfo, YouBikeStation, STSP_TARGET_STOPS } from './transport';
import type {
  AuthenticationResponseJSON,
  PublicKeyCredentialCreationOptionsJSON,
  PublicKeyCredentialRequestOptionsJSON,
  RegistrationResponseJSON,
} from '@simplewebauthn/server';
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
  data?: SchoolCalendarEvent;
}

/** 刪除全校行事曆事件 (管理員專用) */
export interface DeleteSchoolCalendarRequest {
  event_id: string;
  session_token: string;
}

/** 建立雙人授權請求 */
export interface CreateAuthRequest {
  device_id: string;
  webauthn_assertion: AuthenticationResponseJSON;
}

export interface CreateAuthResponse {
  success: boolean;
  requestId: string;
  challengeCode: number;
  pollToken: string;
  message?: string;
}

/** 檢查授權請求狀態 */
export interface CheckAuthStatusRequest {
  request_id: string;
  device_id: string;
  poll_token: string;
}

export interface CheckAuthStatusResponse {
  success: boolean;
  status: AuthRequestStatus;
  session?: AdminSession;
  message?: string;
}

/** 審核授權請求 (授權端使用) */
export interface ApproveAuthRequest {
  requestId: string;
  inputCode: string;
  admin_device_id: string;
  webauthn_assertion?: AuthenticationResponseJSON;
}

export interface ApproveAuthResponse {
  success: boolean;
  message?: string;
}

/** 取得待核准的授權請求列表 */
export interface PendingRequestItem {
  id: string;
  requester_name: string;
  created_at: string;
  expires_at: string;
}

export interface FetchPendingRequestsResponse {
  success: boolean;
  requests: PendingRequestItem[];
  message?: string;
}

export interface FetchPendingRequestsRequest {
  admin_device_id: string;
}

/** WebAuthn 註冊／驗證 */
export interface WebAuthnRegistrationOptionsResponse {
  success: boolean;
  message?: string;
  options?: PublicKeyCredentialCreationOptionsJSON;
  alreadyBound?: boolean;
}

export interface WebAuthnRegistrationVerifyRequest {
  admin_device_id: string;
  registration_response: RegistrationResponseJSON;
  bootstrap_token?: string;
}

export interface WebAuthnRegistrationVerifyResponse {
  success: boolean;
  message?: string;
  credentialId?: string;
}

/** WebAuthn 核准前驗證挑戰 */
export interface WebAuthnAuthOptionsResponse {
  success: boolean;
  message?: string;
  options?: PublicKeyCredentialRequestOptionsJSON;
  requestId?: string;
}

export interface WebAuthnPendingOptionsResponse {
  success: boolean;
  message?: string;
  options?: PublicKeyCredentialRequestOptionsJSON;
}

export interface WebAuthnRequestOptionsResponse {
  success: boolean;
  message?: string;
  options?: PublicKeyCredentialRequestOptionsJSON;
}

export interface WebAuthnRegistrationStatusResponse {
  success: boolean;
  message?: string;
  bound: boolean;
  credentialCount?: number;
}

/** 管理員白名單操作 (Super Admin 專用) */
export interface ManageAdminWhitelistRequest {
  action: 'add' | 'remove' | 'update' | 'issue_bind_ticket';
  target_device_id: string;
  target_name?: string;
  target_role?: AdminRole;
}

export interface ManageAdminWhitelistResponse {
  success: boolean;
  message?: string;
  bootstrap_ticket?: string;
  bootstrap_ticket_expires_in?: number;
}

/** 取得管理員白名單 */
export interface FetchAdminWhitelistResponse {
  success: boolean;
  admins: import('./calendar').AdminUser[];
  currentRole: AdminRole;
}

/** 職位移交 (Super Admin 專用) */
export interface HandoverRequest {
  new_super_admin_id: string;
}

export interface HandoverResponse {
  success: boolean;
  message?: string;
  oldRole?: string;
  newSuperAdmin?: string;
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

export interface FetchAnnouncementByIdResponse {
  announcement: Announcement;
}

// ============================================================
// 4. 交通資訊 (Transport)
// ============================================================

export interface TransportDataResponse {
  trains_south: TrainInfo[];
  trains_north: TrainInfo[];
  buses: BusInfo[];
  STSP_buses: Record<typeof STSP_TARGET_STOPS[number], STSPBusInfo[]>;
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

// ============================================================
// 5-1. 裝置註冊 (Device Registration)
// ============================================================

export interface RegisterDeviceRequest {
  device_id: string;
}

export interface RegisterDeviceResponse {
  success: boolean;
  conflict?: boolean;
  message?: string;
}