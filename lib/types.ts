// ============================================================
// 校園生活助手 - 全域型別定義
// ============================================================

// --- 基礎 ---

/** 應用頁面 Tab ID */
export type TabId = "home" | "timetable" | "transport" | "calendar" | "news" | "settings";

/** 裝置識別資訊 */
export interface DeviceIdentity {
  device_id: string;
}

// --- 使用者設定 ---

/** 使用者個人設定 (存於 localStorage，同步至後端) */
export interface UserProfile {
  /** 裝置 UUID */
  device_id: string;
  /** 班級名稱，例如 "高二甲班" */
  class_name: string;
  /** 預設教室，例如 "301" */
  default_room: string;
  /** 學校名稱，例如 "南科實中" */
  school_name: string;
  /** 學年/學期標籤，例如 "113學年度第二學期" */
  semester_label: string;
}

export const DEFAULT_USER_PROFILE: UserProfile = {
  device_id: "",
  class_name: "高二甲班",
  default_room: "301",
  school_name: "南科實中",
  semester_label: "113學年度第二學期",
};

// --- 課表系統 ---

/** 課程備註類別 */
export type NoteCategory = "exam" | "swap" | "homework" | "private";

/** 備註類別 UI 設定 */
export interface NoteCategoryMeta {
  id: NoteCategory;
  label: string;
  color: string;
  bg: string;
}

/** 單一課程備註 */
export interface CourseNote {
  id: string;
  text: string;
  category: NoteCategory;
  /** "public" = 來自 API (班級共用), "private" = 來自 localStorage (個人) */
  source: "public" | "private";
}

/** 單節課程資料 */
export interface CourseItem {
  /** 科目名稱，空字串代表該節無課 */
  subject: string;
  /** 授課教師 */
  teacher: string;
  /** 教室 */
  room: string;
  /** 來自 API 的公用備註 */
  notes: CourseNote[];
}

/** 一天的課表 (陣列長度固定 9: 第1~4節 + 午休 + 第5~8節) */
export type DaySchedule = CourseItem[];

/** 一週課表 (key: "一"|"二"|"三"|"四"|"五") */
export type WeekSchedule = Record<string, DaySchedule>;

/** 課表時段定義 */
export interface PeriodDef {
  label: string;
  time: string;
}

/** 班級代碼相關 */
export interface ClassCodeInfo {
  /** 7 位邀請碼，格式 xxx-xxxx */
  code: string;
  /** 建立時間 */
  created_at: string;
}

/** 私人備註的 localStorage 結構 */
export type PrivateNoteStore = Record<
  string,                // day key: "一"|"二"|...
  Record<
    number,              // period index (0~8)
    { text: string; category: NoteCategory }[]
  >
>;

/** 加入班級請求 */
export interface JoinClassRequest {
  device_id: string;
  invite_code: string;
}

/** 加入班級回應 */
export interface JoinClassResponse {
  success: boolean;
  class_name?: string;
  message?: string;
}

/** 生成/取得班級代碼請求 */
export interface GenerateCodeRequest {
  device_id: string;
}

/** 生成/取得班級代碼回應 */
export interface GenerateCodeResponse {
  success: boolean;
  code: string;
  created_at: string;
}

/** 儲存課表請求 */
export interface SaveTimetableRequest {
  device_id: string;
  schedule: WeekSchedule;
}

/** 儲存課表回應 */
export interface SaveTimetableResponse {
  success: boolean;
  message?: string;
}

/** 取得課表回應 */
export interface FetchTimetableResponse {
  schedule: WeekSchedule;
  class_name: string;
  default_room: string;
  updated_at: string;
}

// --- 交通資訊 ---

/** 台鐵列車 */
export interface TrainInfo {
  id: string;
  type: string;
  destination: string;
  departure: string;
  status: string;
}

/** 公車資訊 */
export interface BusInfo {
  route: string;
  destination: string;
  eta: string;
  status: string;
}

/** YouBike 站點 */
export interface YouBikeStation {
  name: string;
  available: number;
  empty: number;
  total: number;
}

/** 交通資訊聚合回應 */
export interface TransportDataResponse {
  trains_south: TrainInfo[];
  trains_north: TrainInfo[];
  buses: BusInfo[];
  youbike: YouBikeStation[];
  updated_at: string;
}

// --- 行事曆 ---

/** 全校行事曆事件 (由開發者/管理員從後端設定) */
export interface SchoolCalendarEvent {
  id: number;
  date: string;
  weekday: string;
  title: string;
  description: string;
  tag: string;
  color: string;
}

/** 私人行事曆事件 (使用者自行編輯，存 localStorage + 同步後端) */
export interface PrivateCalendarEvent {
  id: string;
  date: string;
  title: string;
  description: string;
  /** 自訂顏色標記 */
  color: "pink" | "green" | "yellow" | "blue";
}

/** 取得全校行事曆回應 */
export interface FetchSchoolCalendarResponse {
  events: SchoolCalendarEvent[];
  semester: string;
  updated_at: string;
}

/** 儲存私人行事曆事件請求 */
export interface SavePrivateEventsRequest {
  device_id: string;
  events: PrivateCalendarEvent[];
}

/** 儲存私人行事曆回應 */
export interface SavePrivateEventsResponse {
  success: boolean;
  message?: string;
}

// --- 公告 ---

/** 公告分類 (對照參考站分類) */
export type AnnouncementCategory =
  | "important"
  | "exam"
  | "learning"
  | "activity"
  | "admin"
  | "admission"
  | "general"
  | "teacher";

/** 公告附件 */
export interface AnnouncementAttachment {
  name: string;
  url: string;
}

/** 單則公告 */
export interface Announcement {
  post_id: number;
  title: string;
  content: string | null;
  publish_date: string;
  category: AnnouncementCategory;
  importance: 0 | 1;
  author: string;
  link?: string;
  attachments?: AnnouncementAttachment[];
}

/** 取得公告列表回應 */
export interface FetchAnnouncementsResponse {
  announcements: Announcement[];
  total: number;
  page: number;
  updated_at: string;
}

// --- 首頁 ---

/** 近期活動快覽 */
export interface UpcomingEvent {
  id: number;
  title: string;
  date: string;
  color: string;
}

/** 今日課表簡覽 */
export interface TodayScheduleItem {
  period: number;
  subject: string;
  time: string;
  note: string;
}
