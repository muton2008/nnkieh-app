export type TabId = "home" | "timetable" | "transport" | "calendar" | "news" | "settings";

export interface UserProfile {
  device_id: string;
  class_name: string;
  default_room: string;
  school_name: string;
  semester_label: string;
}

export const DEFAULT_USER_PROFILE: UserProfile = {
  device_id: "",
  class_name: "高二甲班",
  default_room: "301",
  school_name: "南科實中",
  semester_label: "113學年度第二學期",
};