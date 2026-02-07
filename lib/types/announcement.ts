// --- 公告 ---
export type AnnouncementCategory = "important" | "exam" | "learning" | "activity" | "admin" | "admission" | "general" | "teacher";

export interface AnnouncementAttachment {
  name: string;
  url: string;
}

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