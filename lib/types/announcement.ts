import { SchoolDivision } from "./user";

// --- 公告 ---
export interface Announcement {
  id: number;
  title: string;
  content: string | null;
  category: AnnouncementCategory;
  importance: number;
  division: SchoolDivision[];
  publish_date: string;
  link: string | null;
  created_at: string;
  post_id: number;
  author?: string;
  attachments?: Array<{
    name: string;
    url: string;
  }>;
}

export type AnnouncementCategory = 0 | 1 | 2 | 3 | 4 | 5 | 6;

export const CATEGORY_LABELS: Record<AnnouncementCategory, string> = {
  0: '考試與考程',
  1: '學習歷程/自主學習/社團',
  2: '活動與競賽',
  3: '行政與校務',
  4: '升學與招生',
  5: '一般公告',
  6: '教師公告/研習',
};

export const CATEGORY_SHORT: Record<AnnouncementCategory, string> = {
  0: '考試',
  1: '學習',
  2: '活動',
  3: '行政',
  4: '升學',
  5: '一般',
  6: '教師',
};

export const CATEGORY_COLORS: Record<AnnouncementCategory, string> = {
  0: 'border-l-amber-400',
  1: 'border-l-emerald-400',
  2: 'border-l-sky-400',
  3: 'border-l-violet-400',
  4: 'border-l-pink-400',
  5: 'border-l-stone-300',
  6: 'border-l-teal-400',
};

export const CATEGORY_BG_COLORS: Record<AnnouncementCategory, string> = {
  0: 'bg-amber-50 text-amber-700 border-amber-200',
  1: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  2: 'bg-sky-50 text-sky-700 border-sky-200',
  3: 'bg-violet-50 text-violet-700 border-violet-200',
  4: 'bg-pink-50 text-pink-700 border-pink-200',
  5: 'bg-stone-50 text-stone-600 border-stone-200',
  6: 'bg-teal-50 text-teal-700 border-teal-200',
};