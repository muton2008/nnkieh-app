export type EventCategory = '考試' | '升學' | '活動' | '放假' | '社團' | '其他';

export type PrivateEventCategory = EventCategory | '讀書' | '運動';

/** * 全校行事曆事件 (由後端提供) 
 */
export interface SchoolCalendarEvent {
  id: string;
  date: string; // YYYY-MM-DD
  end_date?: string; // 支援跨日事件
  start_time?: string; // HH:mm (可選，若為全天事件則不提供)
  end_time?: string; // HH:mm (可選，若為全天事件則不提供)
  title: string;
  description: string | null;
  category: EventCategory;
  target_audience?: '全校' | '高一' | '高二' | '高三';

  updated_at: string; // ISO 字串
  updated_by: string; // device_id
  is_deleted?: boolean;
}

/** * 私人行事曆事件 (使用者自行編輯，存於 LocalStorage / DB) 
 */
export interface PrivateCalendarEvent {
  id: string;
  date: string; // YYYY-MM-DD
  end_date?: string; // 支援跨日事件
  start_time?: string; // HH:mm (可選，若為全天事件則不提供)
  end_time?: string; // HH:mm (可選，若為全天事件則不提供)
  title: string;
  description: string | null;
  category: PrivateEventCategory;
}

/**
 * 用於 UI 顯示的統整型別
 */
export interface CombinedEvent extends Pick<SchoolCalendarEvent, 
  'id' | 'date' | 'end_date' | 'start_time' | 'end_time' | 'title' | 'description' | 'target_audience'
> {
  category: PrivateEventCategory;
  isPrivate: boolean;
  sourceId: string;
}

// 編輯公用行事曆的權限管理

/**
 * 管理員角色與階層
 */
export type AdminRole = 'super_admin' | 'admin' | 'editor';

/**
 * 雙人授權請求狀態
 */
export type AuthRequestStatus = 'pending' | 'approved' | 'rejected' | 'expired' | 'completed';

/**
 * 遠端授權請求單 (儲存於 Supabase 'auth_requests' 表)
 */
export interface PeerAuthRequest {
  id: string;             // UUID
  requester_id: string;   // 申請者的 device_id
  requester_name: string; // 申請者的稱呼 (如：公關組長)
  target_role: AdminRole; // 申請者欲執行的權限等級
  status: AuthRequestStatus;
  
  // 核心安全：隨機挑戰碼 (由後端生成，僅發起端看得到，授權端需選出正確值)
  visual_challenge: number; 
  
  created_at: string;
  expires_at: string;     // 5 分鐘後過期 (防止過期授權)
}

/**
 * 授權成功後核發的 Session (存於 sessionStorage)
 */
export interface AdminSession {
  /** 簽名後的 JWT 字串 (包含 role, deviceId, exp 等資訊) */
  accessToken: string; 
  /** 冗餘欄位：僅給前端使用，不用每次都去解碼 JWT */
  role: AdminRole;
  deviceId: string;
  /** 過期時間點 (Timestamp)，方便前端倒數計時 */
  expiresAt: number; 
}

/**
 * 白名單管理員資訊
 */
export interface AdminUser {
  device_id: string;      // 唯一的硬體識別碼
  name: string;           // 顯示名稱
  role: AdminRole;
  created_at: string;
}