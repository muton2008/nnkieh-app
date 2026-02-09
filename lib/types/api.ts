import { WeekSchedule } from './timetable';
import { TrainInfo, BusInfo, STSPBusInfo, YouBikeStation } from './transport';
import { SchoolCalendarEvent } from './calendar';
import { Announcement } from './announcement';
import { PrivateCalendarEvent, PrivateNoteStore } from './calendar';

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

/** 取得全校公共行事曆 */
export interface FetchSchoolCalendarResponse {
  events: SchoolCalendarEvent[];
  semester: string;
  updated_at: string;
}

// 註：私人行事曆 (PrivateCalendarEvent) 僅存在 LocalStorage，
// 故移除 SavePrivateEventsRequest API 定義，改由前端邏輯處理。

// ============================================================
// 3. 公告 (Announcements)
// ============================================================

export interface FetchAnnouncementsRequest {
  page?: number;
  category?: string;
}

export interface FetchAnnouncementsResponse {
  announcements: Announcement[];
  total: number;
  page: number;
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
// 5. 本地存儲結構 (LocalStorage Only) - 不透過 API
// ============================================================

/** 存放於 LocalStorage 的資料結構範例 */
export interface LocalStorageData {
  private_notes: PrivateNoteStore;     // 私人備註 (含 id, content, type)
  private_events: PrivateCalendarEvent[]; // 私人行事曆 (自動清理邏輯在前端實作)
  last_visited_invite_code: string;
}