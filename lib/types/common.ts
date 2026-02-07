/** 應用頁面 Tab ID */
export type TabId = "home" | "timetable" | "transport" | "calendar" | "news" | "settings";

/** 裝置識別資訊 */
export interface DeviceIdentity {
  device_id: string;
}

/** 通用 API 回應格式 */
export interface ApiResponse<T = any> {
  success: boolean;
  data?: T;
  message?: string;
}