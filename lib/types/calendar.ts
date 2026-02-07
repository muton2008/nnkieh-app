/** * 私人行事曆事件 (使用者自行編輯)
 * 存於 LocalStorage 並同步至後端 (綁定 device_id)
 */
export interface PrivateCalendarEvent {
  id: string;
  date: string; // YYYY-MM-DD
  title: string;
  description: string;
  color: string;
}

/** * 全校行事曆事件 (由後端提供)
 */
export interface SchoolCalendarEvent {
  id: number;
  date: string; //YYYY-MM-DD
  weekday: string;
  title: string;
  description: string;
  tag: string;
  color: string;
}

/** * 行事曆頁面狀態 (用於 UI 控制)
 */
export interface CalendarState {
  selectedDate: Date | null;
  viewMode: 'month' | 'list';
}

export type PrivateNoteStore = Record<
  string, 
  Record<
    number,
    { 
      text: string; 
      category: "exam" | "swap" | "homework" | "private" 
    }[]
  >
>;