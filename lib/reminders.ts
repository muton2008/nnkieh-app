/**
 * 原生系統提醒管理模組
 * 
 * 使用 @capacitor/local-notifications 實現原生提醒通知。
 * 
 * 提醒時間規則：
 * - 事件前一天下午 3:00
 * - 若事件為星期一，額外在上週五下午 3:00 提醒一次
 * 
 * 提醒 ID 格式：
 * - 課表備註: timetable_{day}_{periodIdx}_{noteId}
 * - 行事曆事件: calendar_{eventId}
 * 
 * 數字 ID 映射：
 * LocalNotifications 需要數字 ID，使用 hashCode 將字串 ID 轉為數字，
 * 並以 localStorage 存儲映射表方便管理。
 */

import { isNative, isPluginAvailable } from "@/lib/platform";
import type { CourseNote, WeekSchedule } from "@/lib/types/timetable";
import type { PrivateCalendarEvent, SchoolCalendarEvent } from "@/lib/types/calendar";

// --- Types ---

export interface ReminderRecord {
  /** 可讀的字串 ID，如 timetable_一_2_note-abc 或 calendar_priv_123 */
  stringId: string;
  /** 用於 LocalNotifications 的數字 ID */
  numericId: number;
  /** 通知標題 */
  title: string;
  /** 通知內容 */
  body: string;
  /** 提醒觸發時間 ISO 字串 */
  scheduledAt: string;
  /** 事件實際日期 YYYY-MM-DD */
  eventDate: string;
}

/** localStorage key */
const REMINDERS_STORE_KEY = "scheduled_reminders";

/** Android 通知頻道 ID */
const CHANNEL_ID = "event_reminders";

// --- Utility ---

/** 
 * 將字串轉為穩定的正整數 (用作 notification ID)
 * 使用簡單 hash，確保同字串永遠產出同數字
 */
function stringToNumericId(str: string): number {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash; // Convert to 32bit integer
  }
  // 確保為正整數 (LocalNotifications 需要正數 ID)
  return Math.abs(hash) || 1;
}

/** 取得已排程的提醒記錄 */
function getStoredReminders(): ReminderRecord[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(REMINDERS_STORE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

/** 儲存提醒記錄 */
function setStoredReminders(records: ReminderRecord[]): void {
  if (typeof window === "undefined") return;
  localStorage.setItem(REMINDERS_STORE_KEY, JSON.stringify(records));
}

/**
 * 計算提醒時間：前一天下午 3:00
 * 若事件為星期一 → 額外回傳上週五下午 3:00
 */
function getReminderDates(eventDateStr: string): Date[] {
  const eventDate = new Date(eventDateStr + "T00:00:00");
  const dayOfWeek = eventDate.getDay(); // 0=Sun, 1=Mon, ...

  const results: Date[] = [];

  // 前一天下午 3:00
  const prevDay = new Date(eventDate);
  prevDay.setDate(prevDay.getDate() - 1);
  prevDay.setHours(15, 0, 0, 0);
  results.push(prevDay);

  // 如果是星期一(1)，額外加上上週五(差3天)下午 3:00
  if (dayOfWeek === 1) {
    const friday = new Date(eventDate);
    friday.setDate(friday.getDate() - 3);
    friday.setHours(15, 0, 0, 0);
    results.push(friday);
  }

  return results;
}

/** 檢查時間是否在未來（只排程未來的提醒） */
function isFuture(date: Date): boolean {
  return date.getTime() > Date.now();
}

// --- Core API ---

/** 
 * 初始化提醒權限（在 app 啟動時呼叫）
 * - 請求通知權限
 * - 建立 Android 通知頻道
 * @returns 是否成功取得權限
 */
export async function initReminders(): Promise<boolean> {
  if (!isNative() || !isPluginAvailable("LocalNotifications")) {
    console.log("[Reminders] Not native or plugin unavailable, skipping init");
    return false;
  }

  try {
    const { LocalNotifications } = await import("@capacitor/local-notifications");

    // 先檢查目前權限狀態
    const currentPerm = await LocalNotifications.checkPermissions();
    console.log("[Reminders] Current permission:", currentPerm.display);

    // 若尚未授權，請求權限
    if (currentPerm.display !== "granted") {
      const permResult = await LocalNotifications.requestPermissions();
      console.log("[Reminders] Permission request result:", permResult.display);
      if (permResult.display !== "granted") {
        console.warn("[Reminders] Permission not granted");
        return false;
      }
    }

    // 建立 Android 通知頻道 (Android 8+ 必要，iOS 會忽略)
    try {
      await LocalNotifications.createChannel({
        id: CHANNEL_ID,
        name: "事件提醒",
        description: "課表備註與行事曆事件的提前提醒",
        importance: 4, // HIGH — 會彈出 heads-up 通知
        visibility: 1, // PUBLIC
        sound: "default",
        vibration: true,
      });
      console.log("[Reminders] Notification channel created:", CHANNEL_ID);
    } catch (channelErr) {
      // iOS 不支援 createChannel，忽略錯誤
      console.log("[Reminders] createChannel skipped (iOS or already exists):", channelErr);
    }

    console.log("[Reminders] Init complete, ready to schedule");
    return true;
  } catch (err) {
    console.error("[Reminders] Init error:", err);
    return false;
  }
}

/**
 * 發送一個即時測試通知（用於驗證通知系統是否正常運作）
 */
export async function sendTestNotification(): Promise<boolean> {
  if (!isNative() || !isPluginAvailable("LocalNotifications")) {
    console.warn("[Reminders] sendTestNotification: not native");
    return false;
  }

  try {
    const { LocalNotifications } = await import("@capacitor/local-notifications");

    // 先確認權限
    const perm = await LocalNotifications.checkPermissions();
    if (perm.display !== "granted") {
      console.warn("[Reminders] sendTestNotification: no permission, display =", perm.display);
      return false;
    }

    // 排程 3 秒後的通知
    const testDate = new Date(Date.now() + 3000);
    await LocalNotifications.schedule({
      notifications: [
        {
          id: 999999,
          title: "通知測試成功",
          body: `提醒功能正常運作中 — ${new Date().toLocaleTimeString("zh-TW")}`,
          schedule: { at: testDate, allowWhileIdle: true },
          channelId: CHANNEL_ID,
          sound: "default",
        },
      ],
    });
    console.log("[Reminders] Test notification scheduled for:", testDate.toISOString());
    return true;
  } catch (err) {
    console.error("[Reminders] sendTestNotification error:", err);
    return false;
  }
}

/**
 * 取得目前系統中 pending 的通知列表（用於除錯）
 */
export async function debugGetPendingNotifications(): Promise<{ id: number; title?: string; body?: string; schedule?: any }[]> {
  if (!isNative() || !isPluginAvailable("LocalNotifications")) return [];
  try {
    const { LocalNotifications } = await import("@capacitor/local-notifications");
    const result = await LocalNotifications.getPending();
    console.log("[Reminders] Pending notifications:", JSON.stringify(result.notifications, null, 2));
    return result.notifications;
  } catch (err) {
    console.error("[Reminders] debugGetPendingNotifications error:", err);
    return [];
  }
}

/**
 * 排程一組提醒通知
 * @param reminders 要排程的提醒清單
 */
async function scheduleNotifications(reminders: ReminderRecord[]): Promise<void> {
  if (!isNative() || !isPluginAvailable("LocalNotifications")) return;
  if (reminders.length === 0) return;

  try {
    const { LocalNotifications } = await import("@capacitor/local-notifications");

    const notifications = reminders
      .filter((r) => isFuture(new Date(r.scheduledAt)))
      .map((r) => ({
        id: r.numericId,
        title: r.title,
        body: r.body,
        schedule: {
          at: new Date(r.scheduledAt),
          allowWhileIdle: true, // 確保 Android Doze 模式下也能觸發
        },
        channelId: CHANNEL_ID, // Android 8+ 必要
        sound: "default" as string,
        smallIcon: "ic_stat_notification",
        // extra data 供點擊時辨識
        extra: {
          stringId: r.stringId,
          eventDate: r.eventDate,
        },
      }));

    if (notifications.length > 0) {
      await LocalNotifications.schedule({ notifications });
      console.log(`[Reminders] Scheduled ${notifications.length} notifications`);
    }
  } catch (err) {
    console.error("[Reminders] Schedule error:", err);
  }
}

/**
 * 取消指定的提醒通知
 * @param numericIds 要取消的數字 ID 陣列
 */
async function cancelNotifications(numericIds: number[]): Promise<void> {
  if (!isNative() || !isPluginAvailable("LocalNotifications")) return;
  if (numericIds.length === 0) return;

  try {
    const { LocalNotifications } = await import("@capacitor/local-notifications");
    await LocalNotifications.cancel({
      notifications: numericIds.map((id) => ({ id })),
    });
    console.log(`[Reminders] Cancelled ${numericIds.length} notifications`);
  } catch (err) {
    console.error("[Reminders] Cancel error:", err);
  }
}

// --- 課表備註提醒同步 ---

/** 課表備註的 NOTE_CATEGORY 中文對照 */
const TIMETABLE_NOTE_LABEL: Record<string, string> = {
  exam: "考試",
  swap: "調課",
  homework: "作業截止",
  other: "其他",
  private: "私人",
};

const WEEKDAY_LABELS = ["一", "二", "三", "四", "五"] as const;

/**
 * 從課表備註中提取所有需要提醒的項目
 * 只提取有 date 欄位的備註
 */
function extractTimetableReminders(
  schedule: WeekSchedule,
  privateNotes: Record<string, Record<number, { text: string; category: string; date: string }[]>>
): ReminderRecord[] {
  const records: ReminderRecord[] = [];

  const PERIODS_LABEL = ["1", "2", "3", "4", "午", "5", "6", "7", "8"];

  // 公開備註
  for (const day of WEEKDAY_LABELS) {
    const daySchedule = schedule[day];
    if (!daySchedule) continue;

    daySchedule.forEach((course, periodIdx) => {
      if (!course.notes) return;
      course.notes.forEach((note) => {
        if (!note.date || !note.text?.trim()) return;

        const stringId = `timetable_${day}_${periodIdx}_${note.id}`;
        const periodLabel = PERIODS_LABEL[periodIdx] || String(periodIdx + 1);
        const categoryLabel = TIMETABLE_NOTE_LABEL[note.category] || note.category;
        const subjectName = course.subject || "未命名";

        const reminderDates = getReminderDates(note.date);
        reminderDates.forEach((reminderDate, idx) => {
          if (!isFuture(reminderDate)) return;

          const suffix = idx === 0 ? "" : "_fri"; // 星期五額外提醒
          const fullStringId = `${stringId}${suffix}`;
          records.push({
            stringId: fullStringId,
            numericId: stringToNumericId(fullStringId),
            title: `${categoryLabel}提醒：${subjectName}`,
            body: `週${day} 第${periodLabel}節 — ${note.text}`,
            scheduledAt: reminderDate.toISOString(),
            eventDate: note.date,
          });
        });
      });
    });
  }

  // 私人備註
  for (const day of WEEKDAY_LABELS) {
    const dayNotes = privateNotes[day];
    if (!dayNotes) continue;

    for (const [periodIdxStr, notes] of Object.entries(dayNotes)) {
      const periodIdx = parseInt(periodIdxStr, 10);
      const periodLabel = PERIODS_LABEL[periodIdx] || String(periodIdx + 1);

      notes.forEach((note, noteIdx) => {
        if (!note.date || !note.text?.trim()) return;

        const stringId = `timetable_priv_${day}_${periodIdx}_${noteIdx}_${note.date}`;
        const categoryLabel = TIMETABLE_NOTE_LABEL[note.category] || note.category;

        const reminderDates = getReminderDates(note.date);
        reminderDates.forEach((reminderDate, idx) => {
          if (!isFuture(reminderDate)) return;

          const suffix = idx === 0 ? "" : "_fri";
          const fullStringId = `${stringId}${suffix}`;
          records.push({
            stringId: fullStringId,
            numericId: stringToNumericId(fullStringId),
            title: `${categoryLabel}提醒`,
            body: `週${day} 第${periodLabel}節 — ${note.text}`,
            scheduledAt: reminderDate.toISOString(),
            eventDate: note.date,
          });
        });
      });
    }
  }

  return records;
}

// --- 行事曆事件提醒同步 ---

/**
 * 從行事曆事件提取所有需要提醒的項目
 */
function extractCalendarReminders(
  schoolEvents: SchoolCalendarEvent[],
  privateEvents: PrivateCalendarEvent[]
): ReminderRecord[] {
  const records: ReminderRecord[] = [];

  // 學校事件
  schoolEvents.forEach((evt) => {
    if (!evt.date || evt.is_deleted) return;

    const stringId = `calendar_school_${evt.id}`;
    const audience = evt.target_audience ? `(${evt.target_audience})` : "";

    const reminderDates = getReminderDates(evt.date);
    reminderDates.forEach((reminderDate, idx) => {
      if (!isFuture(reminderDate)) return;

      const suffix = idx === 0 ? "" : "_fri";
      const fullStringId = `${stringId}${suffix}`;
      records.push({
        stringId: fullStringId,
        numericId: stringToNumericId(fullStringId),
        title: `${evt.category}${audience}`,
        body: evt.title + (evt.description ? `\n${evt.description}` : ""),
        scheduledAt: reminderDate.toISOString(),
        eventDate: evt.date,
      });
    });

    // 如果是跨日事件，也為最後一天設提醒
    if (evt.end_date && evt.end_date !== evt.date) {
      const endStringId = `calendar_school_${evt.id}_end`;
      const endReminderDates = getReminderDates(evt.end_date);
      endReminderDates.forEach((reminderDate, idx) => {
        if (!isFuture(reminderDate)) return;

        const suffix = idx === 0 ? "" : "_fri";
        const fullStringId = `${endStringId}${suffix}`;
        records.push({
          stringId: fullStringId,
          numericId: stringToNumericId(fullStringId),
          title: `${evt.category} 最後一天${audience}`,
          body: evt.title,
          scheduledAt: reminderDate.toISOString(),
          eventDate: evt.end_date!,
        });
      });
    }
  });

  // 私人事件
  privateEvents.forEach((evt) => {
    if (!evt.date) return;

    const stringId = `calendar_private_${evt.id}`;

    const reminderDates = getReminderDates(evt.date);
    reminderDates.forEach((reminderDate, idx) => {
      if (!isFuture(reminderDate)) return;

      const suffix = idx === 0 ? "" : "_fri";
      const fullStringId = `${stringId}${suffix}`;
      records.push({
        stringId: fullStringId,
        numericId: stringToNumericId(fullStringId),
        title: `${evt.category}`,
        body: evt.title + (evt.description ? `\n${evt.description}` : ""),
        scheduledAt: reminderDate.toISOString(),
        eventDate: evt.date,
      });
    });

    // 跨日事件
    if (evt.end_date && evt.end_date !== evt.date) {
      const endStringId = `calendar_private_${evt.id}_end`;
      const endReminderDates = getReminderDates(evt.end_date);
      endReminderDates.forEach((reminderDate, idx) => {
        if (!isFuture(reminderDate)) return;

        const suffix = idx === 0 ? "" : "_fri";
        const fullStringId = `${endStringId}${suffix}`;
        records.push({
          stringId: fullStringId,
          numericId: stringToNumericId(fullStringId),
          title: `${evt.category} 最後一天`,
          body: evt.title,
          scheduledAt: reminderDate.toISOString(),
          eventDate: evt.end_date!,
        });
      });
    }
  });

  return records;
}

// --- 統一同步入口 ---

/**
 * 同步課表備註的提醒
 * 比對目前 schedule 與已排程的提醒，新增/取消變更的項目。
 */
export async function syncTimetableReminders(
  schedule: WeekSchedule,
  privateNotes: Record<string, Record<number, { text: string; category: string; date: string }[]>>
): Promise<void> {
  if (!isNative() || !isPluginAvailable("LocalNotifications")) return;

  const desired = extractTimetableReminders(schedule, privateNotes);
  await syncReminders(desired, "timetable");
}

/**
 * 同步行事曆事件的提醒
 * 比對目前事件與已排程的提醒，新增/取消變更的項目。
 */
export async function syncCalendarReminders(
  schoolEvents: SchoolCalendarEvent[],
  privateEvents: PrivateCalendarEvent[]
): Promise<void> {
  if (!isNative() || !isPluginAvailable("LocalNotifications")) return;

  const desired = extractCalendarReminders(schoolEvents, privateEvents);
  await syncReminders(desired, "calendar");
}

/**
 * 核心同步邏輯：比對 desired 與 stored，差集新增、多餘取消
 * @param desired 目前應該存在的提醒清單
 * @param prefix 用來過濾 stored 中同類型提醒的前綴 ("timetable" | "calendar")
 */
async function syncReminders(desired: ReminderRecord[], prefix: string): Promise<void> {
  const stored = getStoredReminders();

  // 取出同類型的已排程提醒
  const existingOfType = stored.filter((r) => r.stringId.startsWith(prefix));
  const otherTypes = stored.filter((r) => !r.stringId.startsWith(prefix));

  // 建立 Set 便於比對
  const desiredIds = new Set(desired.map((r) => r.stringId));
  const existingIds = new Set(existingOfType.map((r) => r.stringId));

  // 需要新增的（desired 中有，existing 中沒有）
  const toAdd = desired.filter((r) => !existingIds.has(r.stringId));
  // 需要取消的（existing 中有，desired 中沒有，或已過期）
  const toCancel = existingOfType.filter(
    (r) => !desiredIds.has(r.stringId) || !isFuture(new Date(r.scheduledAt))
  );

  console.log(`[Reminders][${prefix}] Sync: desired=${desired.length}, existing=${existingOfType.length}, toAdd=${toAdd.length}, toCancel=${toCancel.length}`);
  
  // 列出即將排程的提醒以便除錯
  if (toAdd.length > 0) {
    toAdd.forEach((r) => {
      console.log(`[Reminders][${prefix}] + Schedule: "${r.title}" at ${r.scheduledAt} (id: ${r.stringId})`);
    });
  }

  // 執行取消
  if (toCancel.length > 0) {
    await cancelNotifications(toCancel.map((r) => r.numericId));
  }

  // 執行新增
  if (toAdd.length > 0) {
    await scheduleNotifications(toAdd);
  }

  // 更新 store：保留其他類型 + 新的 desired（過濾已過期的）
  const newStore = [
    ...otherTypes,
    ...desired.filter((r) => isFuture(new Date(r.scheduledAt))),
  ];
  setStoredReminders(newStore);
}

/**
 * 清除所有提醒（用於登出/重置等場景）
 */
export async function clearAllReminders(): Promise<void> {
  if (!isNative() || !isPluginAvailable("LocalNotifications")) return;

  try {
    const { LocalNotifications } = await import("@capacitor/local-notifications");
    const pending = await LocalNotifications.getPending();
    if (pending.notifications.length > 0) {
      await LocalNotifications.cancel({
        notifications: pending.notifications.map((n) => ({ id: n.id })),
      });
    }
    setStoredReminders([]);
    console.log("[Reminders] All reminders cleared");
  } catch (err) {
    console.error("[Reminders] Clear error:", err);
  }
}

/**
 * 取得目前已排程的提醒數量（用於 UI 顯示）
 */
export function getScheduledReminderCount(): number {
  return getStoredReminders().filter((r) => isFuture(new Date(r.scheduledAt))).length;
}

/**
 * 取得指定事件的已排程提醒
 * @param eventType "timetable" | "calendar"  
 * @param eventId 事件 ID
 */
export function getRemindersForEvent(eventType: string, eventId: string): ReminderRecord[] {
  const prefix = `${eventType}_`;
  return getStoredReminders().filter(
    (r) => r.stringId.startsWith(prefix) && r.stringId.includes(eventId)
  );
}
