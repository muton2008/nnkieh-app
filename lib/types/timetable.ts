export type NoteCategory = "exam" | "swap" | "homework" | "other" | "private";

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
  date: string; // YYYY-MM-DD
}

export interface privateNote {
  text: string;
  category: NoteCategory;
  date: string; // YYYY-MM-DD
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
  Record<number, privateNote[]>
>;