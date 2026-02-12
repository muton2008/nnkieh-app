export type TabId = "home" | "timetable" | "transport" | "calendar" | "news" | "settings";

export type SchoolDivision = 'no disturb' | 'junior' | 'high' | 'all';

export interface UserProfile {
  device_id: string;        // UUID
  division: SchoolDivision; // 用戶選擇的部別
  notify_all: boolean;      // false: 僅重要公告通知, true: 全部接收
  fcm_token?: string;       // 選填，推播用
  updated_at?: string;      // 由 DB 自動產生，回傳給前端顯示
}

export const DEFAULT_USER_PROFILE: UserProfile = {
  device_id: "",
  division: 'all',
  notify_all: false,
  fcm_token: undefined,
  updated_at: undefined,
};