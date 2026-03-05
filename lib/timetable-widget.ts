/**
 * Capacitor 原生插件封裝：課表桌面 Widget
 * 
 * 在 Android 上將課表資料寫入 SharedPreferences，
 * 並觸發桌面 Widget 刷新以顯示最新的今日課表。
 * 
 * 使用方式：
 *   import { syncWidgetData, forceRefreshWidget } from '@/lib/timetable-widget';
 *   await syncWidgetData(schedule, className);
 */
import { Capacitor, registerPlugin } from '@capacitor/core';

interface TimetableWidgetPlugin {
  updateWidget(options: { schedule: string; className: string }): Promise<{ success: boolean }>;
  forceRefresh(): Promise<{ success: boolean }>;
}

const TimetableWidget = registerPlugin<TimetableWidgetPlugin>('TimetableWidget');

/**
 * 將課表資料同步到原生 Widget（僅在 Android 原生環境生效）
 * @param schedule 完整的 WeekSchedule 物件
 * @param className 班級名稱
 */
export async function syncWidgetData(
  schedule: Record<string, any>,
  className: string
): Promise<void> {
  if (!Capacitor.isNativePlatform() || Capacitor.getPlatform() !== 'android') {
    return; // 非 Android 原生環境，靜默跳過
  }

  try {
    await TimetableWidget.updateWidget({
      schedule: JSON.stringify(schedule),
      className,
    });
    console.log('[TimetableWidget] Widget data synced');
  } catch (error) {
    console.warn('[TimetableWidget] Failed to sync widget:', error);
  }
}

/**
 * 強制刷新桌面 Widget（不傳入資料，僅觸發重繪）
 */
export async function forceRefreshWidget(): Promise<void> {
  if (!Capacitor.isNativePlatform() || Capacitor.getPlatform() !== 'android') {
    return;
  }

  try {
    await TimetableWidget.forceRefresh();
    console.log('[TimetableWidget] Widget refreshed');
  } catch (error) {
    console.warn('[TimetableWidget] Failed to refresh widget:', error);
  }
}
