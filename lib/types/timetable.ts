export type NoteCategory = "exam" | "swap" | "homework" | "private";

export interface NoteCategoryMeta {
  id: NoteCategory;
  label: string;
  color: string;
  bg: string;
}

export interface CourseNote {
  id: string;
  text: string;
  category: NoteCategory;
  source: "public" | "private";
}

export interface CourseItem {
  subject: string;
  teacher: string;
  room: string;
  notes: CourseNote[];
}

export type DaySchedule = CourseItem[];
export type WeekSchedule = Record<string, DaySchedule>;

export interface PeriodDef {
  label: string;
  time: string;
}

export type PrivateNoteStore = Record<
  string,
  Record<number, { text: string; category: NoteCategory }[]>
>;