"use client";

import { useEffect, useState, useCallback } from "react";
import {
  BookOpen,
  Train,
  CalendarDays,
  Megaphone,
  ChevronRight,
  Settings,
  RefreshCw,
} from "lucide-react";
import { SkeletonBlock } from "./skeleton-block";
import type { TabId } from "@/lib/types/common";
import type { UserProfile } from "@/lib/types/user";
import type { SchoolCalendarEvent, EventCategory } from "@/lib/types/calendar";
import { DEFAULT_USER_PROFILE } from "@/lib/types/user";
import { getLocalUserProfile, saveLocalUserProfile, syncUserProfile } from "@/lib/api-client";
import { fetchTimetable, fetchSchoolCalendar } from "@/lib/api-client";
import { syncExamWidgetData } from "@/lib/timetable-widget";
import { getFCMToken } from "@/lib/firebase";

// --- Types ---
import type { NoteCategory } from "@/lib/types/timetable";

interface TodayScheduleItem {
  period: number;
  subject: string;
  time: string;
  note: string;
  noteCategory?: NoteCategory;
}

// --- UI Constants ---
const GREETING_MESSAGES = ["今天也要加油喔", "美好的一天開始了", "保持好心情吧", "專注每一刻"];
const QUICK_LINKS: { id: TabId; label: string; icon: any; bg: string }[] = [
  { id: "timetable", label: "課表", icon: BookOpen, bg: "bg-macaron-pink" },
  { id: "transport", label: "交通", icon: Train, bg: "bg-macaron-green" },
  { id: "calendar", label: "行事曆", icon: CalendarDays, bg: "bg-macaron-yellow" },
  { id: "news", label: "公告", icon: Megaphone, bg: "bg-macaron-blue" },
];
const PERIOD_TIMES = ["08:10", "09:10", "10:10", "11:10", "", "13:10", "14:10", "15:10", "16:10"];

const CATEGORY_BG: Record<EventCategory, string> = {
  考試: "bg-orange-50",
  升學: "bg-red-50",
  活動: "bg-green-50",
  放假: "bg-sky-50",
  社團: "bg-purple-50",
  其他: "bg-gray-50",
};

const CATEGORY_DOT: Record<EventCategory, string> = {
  考試: "bg-orange-400",
  升學: "bg-red-500",
  活動: "bg-green-500",
  放假: "bg-sky-400",
  社團: "bg-purple-500",
  其他: "bg-gray-400",
};

function getGreeting(): string {
  const hour = new Date().getHours();
  if (hour < 12) return "早安";
  if (hour < 17) return "午安";
  return "晚安";
}

function getRandomMessage(): string {
  return GREETING_MESSAGES[Math.floor(Math.random() * GREETING_MESSAGES.length)];
}

function getTargetDateInfo() {
  const now = new Date();
  if (now.getHours() >= 18) {
    return { date: new Date(now.getTime() + 24 * 60 * 60 * 1000), isTomorrow: true };
  }
  return { date: now, isTomorrow: false };
}

function getTodayString(d: Date): string {
  const weekdays = ["日", "一", "二", "三", "四", "五", "六"];
  return `${d.getMonth() + 1}/${d.getDate()} 星期${weekdays[d.getDay()]}`;
}

function getTodayWeekdayKey(d: Date): string {
  const weekdays = ["日", "一", "二", "三", "四", "五", "六"];
  return weekdays[d.getDay()];
}

interface HomePageProps {
  deviceId: string;
  onNavigate: (tab: TabId) => void;
}

export function HomePage({ deviceId, onNavigate }: HomePageProps) {
  const [loading, setLoading] = useState(true);
  const [message] = useState(getRandomMessage);
  const [todaySchedule, setTodaySchedule] = useState<TodayScheduleItem[]>([]);
  const [upcomingEvents, setUpcomingEvents] = useState<SchoolCalendarEvent[]>([]);
  const [profile, setProfile] = useState<UserProfile>({
    ...DEFAULT_USER_PROFILE,
    device_id: deviceId,
  });
  const [profileReady, setProfileReady] = useState(false);
  const [isSyncing, setIsSyncing] = useState(false);
  const [targetDateInfo] = useState(getTargetDateInfo);

  // 輔助函式：將 API 回傳的原始 schedule 轉換成今日首頁顯示格式
  const processScheduleData = useCallback((scheduleObj: any, date: Date) => {
    const dayKey = getTodayWeekdayKey(date);
    if (!["一", "二", "三", "四", "五"].includes(dayKey)) return [];

    const todayDateStr = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
    const dayArr = scheduleObj[dayKey] || [];
    
    return dayArr.map((c: any, idx: number) => {
      if (!c.subject || !PERIOD_TIMES[idx]) return null;
      
      // 過濾當天日期備註
      const validNotes = (c.notes || []).filter((n: any) => !n.date || n.date === todayDateStr);
      
      return {
        period: idx < 4 ? idx + 1 : idx === 4 ? 0 : idx,
        subject: c.subject,
        time: PERIOD_TIMES[idx],
        note: validNotes.length > 0 ? validNotes[0].text : "",
        noteCategory: validNotes.length > 0 ? validNotes[0].category : undefined,
      };
    }).filter(Boolean) as TodayScheduleItem[];
  }, []);

  useEffect(() => {
    let cancelled = false;

    const loadData = async () => {
      setIsSyncing(true);
      try {
        // 0. 優先載入用戶 profile（必須在 setLoading(false) 之前，避免 FCM 刷新拿到 DEFAULT）
        const storedProfile = getLocalUserProfile();
        const initialProfile = storedProfile || {
          device_id: deviceId,
          division: "no disturb" as const,
          notify_all: false,
        };
        setProfile(initialProfile);
        setProfileReady(true);

        // 1. 先獲取 Local 緩存並立即顯示
        const cacheRaw = localStorage.getItem("cache_timetable");
        let initialSchedule: TodayScheduleItem[] = [];
        if (cacheRaw) {
          try {
            const cachedData = JSON.parse(cacheRaw);
            initialSchedule = processScheduleData(cachedData.schedule || {}, targetDateInfo.date);
            if (!cancelled) {
              setTodaySchedule(initialSchedule);
              setLoading(false); // 有快取就先關閉載入狀態，提升體感速度
            }
          } catch (e) {
            console.error("Cache parse error", e);
          }
        }
        
        const cacheRawCalendar = localStorage.getItem("cache_calendar");
        let initialCalendar: SchoolCalendarEvent[] = [];
        if (cacheRawCalendar) {
          try {
            const cachedData = JSON.parse(cacheRawCalendar);
            const today = new Date().toISOString().slice(0, 10);
            initialCalendar = cachedData
              .filter((e: SchoolCalendarEvent) => !e.is_deleted && (e.end_date || e.date) >= today)
              .sort((a: SchoolCalendarEvent, b: SchoolCalendarEvent) => a.date.localeCompare(b.date))
              .slice(0, 3);
            if (!cancelled) {
              setUpcomingEvents(initialCalendar);
              setLoading(false);
            }
          } catch (e) {
            console.error("Calendar cache parse error", e);
          }
        }

        // 3. 獲取遠端資料
        const inviteCode = localStorage.getItem("invite_code");
        if (!inviteCode) return;

        const [remoteData, cData] = await Promise.all([
          fetchTimetable({ invite_code: inviteCode }).catch(e => { console.error(e); return null; }),
          fetchSchoolCalendar().catch(e => { console.error(e); return null; }),
        ]);

        if (cancelled) return;

        if (remoteData && remoteData.schedule) {
          const newSchedule = processScheduleData(remoteData.schedule, targetDateInfo.date);
          
          // 4. 比對差異，相異才更新
          if (JSON.stringify(newSchedule) !== JSON.stringify(initialSchedule)) {
            setTodaySchedule(newSchedule);
            localStorage.setItem("cache_timetable", JSON.stringify(remoteData));
          }
        }

        // 5. 載入行事曆
        if (cData?.events) {
          const today = new Date().toISOString().slice(0, 10);
          const upcoming = cData.events
            .filter((e: SchoolCalendarEvent) => !e.is_deleted && (e.end_date || e.date) >= today)
            .sort((a: SchoolCalendarEvent, b: SchoolCalendarEvent) => a.date.localeCompare(b.date))
            .slice(0, 3);
          
          if (JSON.stringify(upcoming) !== JSON.stringify(initialCalendar)) {
            setUpcomingEvents(upcoming);
            localStorage.setItem("cache_calendar", JSON.stringify(cData.events));
          }

          // 同步考試事件到桌面 Widget
          const examEvents = cData.events
            .filter((e: SchoolCalendarEvent) => !e.is_deleted && e.category === "考試")
            .map((e: SchoolCalendarEvent) => ({
              date: e.date,
              end_date: e.end_date,
              title: e.title,
              description: e.description ?? undefined,
            }));
          syncExamWidgetData(examEvents);
        }

        // 如果是新用戶，同步到伺服器
        if (!storedProfile) {
          try {
            const res = await syncUserProfile(initialProfile);
            if (res.success && res.updated_at) {
              const updated = { ...initialProfile, updated_at: res.updated_at };
              setProfile(updated);
              saveLocalUserProfile(updated);
            }
          } catch (e) {
            console.error("[HomePage] sync profile error:", e);
          }
        }
      } catch (e) {
        console.error("[HomePage] load error:", e);
      } finally {
        if (!cancelled) {
          setLoading(false);
          setIsSyncing(false);
        }
      }
    };

    loadData();
    return () => { cancelled = true; };
  }, [deviceId, processScheduleData, targetDateInfo]);

  // 自動檢查和更新 FCM Token
  useEffect(() => {
    if (loading || !profileReady || !profile.device_id) return;

    const refreshFCMToken = async () => {
      try {
        // 檢查通知權限，若已授予則自動更新 token
        if (Notification.permission === "granted") {
          const latestToken = await getFCMToken();
          if (latestToken && latestToken !== profile.fcm_token) {
            const updated = { ...profile, fcm_token: latestToken };
            await syncUserProfile(updated);
            setProfile(updated);
            saveLocalUserProfile(updated);
          }
        }
      } catch (err) {
        console.error("[HomePage] FCM token refresh failed:", err);
      }
    };

    refreshFCMToken();
  }, [loading, profileReady, profile]);

  if (loading) {
    return (
      <div className="px-5 pt-12 pb-6 space-y-6">
        <SkeletonBlock className="h-8 w-32" />
        <SkeletonBlock className="h-4 w-48" />
        <div className="grid grid-cols-4 gap-3">
          {[...Array(4)].map((_, i) => <SkeletonBlock key={i} className="h-20" />)}
        </div>
        <SkeletonBlock className="h-40" />
      </div>
    );
  }

  return (
    <div className="px-5 pt-12 pb-6 space-y-6 animate-in fade-in duration-500">
      <header className="flex items-start justify-between">
        <div>
          <h1 className="font-serif text-2xl font-semibold text-foreground tracking-wide">
            {getGreeting()}
          </h1>
          <p className="text-sm text-muted-foreground mt-1 font-light">
            {getTodayString(targetDateInfo.date)} &middot; {message}
          </p>
        </div>
        <button onClick={() => onNavigate("settings")} className="p-2 text-muted-foreground/50 hover:text-foreground">
          <Settings size={18} strokeWidth={1.5} />
        </button>
      </header>

      <section>
        <div className="grid grid-cols-4 gap-3">
          {QUICK_LINKS.map((link) => {
            const Icon = link.icon;
            return (
              <button
                key={link.id}
                onClick={() => onNavigate(link.id)}
                className={`${link.bg} flex flex-col items-center justify-center gap-1.5 py-4 rounded-sm border border-border/50 transition-all hover:shadow-sm active:scale-95`}
              >
                <Icon size={20} strokeWidth={1.5} className="text-foreground/70" />
                <span className="text-xs text-foreground/80 font-light">{link.label}</span>
              </button>
            );
          })}
        </div>
      </section>

      <section>
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <h2 className="font-serif text-base font-semibold text-foreground">
              {targetDateInfo.isTomorrow ? "明日課表" : "今日課表"}
            </h2>
            {isSyncing && <RefreshCw size={12} className="animate-spin text-muted-foreground/50" />}
          </div>
          <button onClick={() => onNavigate("timetable")} className="flex items-center gap-0.5 text-xs text-muted-foreground">
            查看完整 <ChevronRight size={14} />
          </button>
        </div>
        {todaySchedule.length === 0 ? (
          <div className="bg-card border border-border rounded-sm px-4 py-6 text-center">
            <p className="text-sm text-muted-foreground/50 font-light">{targetDateInfo.isTomorrow ? "明日沒有課程安排" : "今天沒有課程安排"}</p>
          </div>
        ) : (
          <div className="bg-card border border-border rounded-sm divide-y divide-border">
            {todaySchedule.map((item) => (
              <div key={item.period} className="flex items-center px-4 py-2.5 gap-3">
                <span className="text-xs text-muted-foreground font-light w-10 tabular-nums">
                  {item.time}
                </span>
                <div className="w-px h-4 bg-border" />
                <div className="flex-1 flex items-center justify-between">
                  <span className="text-sm text-foreground">
                    第{item.period}節 &middot; {item.subject}
                  </span>
                  {item.note && (
                    <span className={`text-[9px] px-1.5 py-0.5 rounded-sm border font-light ${
                      item.noteCategory === "exam" ? "bg-red-50 text-red-700 border-red-200" :
                      item.noteCategory === "swap" ? "bg-amber-50 text-amber-700 border-amber-200" :
                      item.noteCategory === "homework" ? "bg-blue-50 text-blue-700 border-blue-200" :
                      item.noteCategory === "private" ? "bg-violet-50 text-violet-700 border-violet-200" :
                      item.noteCategory === "other" ? "bg-green-50 text-green-700 border-green-200" :
                      "bg-amber-50 text-amber-700 border-amber-200"
                    }`}>
                      {item.note}
                    </span>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      <section>
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <h2 className="font-serif text-base font-semibold text-foreground">近期活動</h2>
            {isSyncing && <RefreshCw size={12} className="animate-spin text-muted-foreground/50" />}
          </div>
          <button onClick={() => onNavigate("calendar")} className="flex items-center gap-0.5 text-xs text-muted-foreground">
            查看完整 <ChevronRight size={14} />
          </button>
        </div>
        {upcomingEvents.length === 0 ? (
          <div className="bg-card border border-border rounded-sm px-4 py-6 text-center">
            <p className="text-sm text-muted-foreground/50 font-light">近期沒有活動</p>
          </div>
        ) : (
          <div className="space-y-2">
            {upcomingEvents.map((event) => {
              const bg = CATEGORY_BG[event.category] || "bg-gray-50";
              const dot = CATEGORY_DOT[event.category] || "bg-gray-400";
              const d = new Date(event.date);
              const dateStr = `${d.getMonth() + 1}/${d.getDate()}`;
              return (
                <div
                  key={event.id}
                  className={`${bg} border border-border/50 rounded-sm px-4 py-3 flex items-center gap-3`}
                >
                  <span className={`flex-shrink-0 w-[6px] h-[6px] rounded-full ${dot}`} />
                  <span className="flex-1 text-sm text-foreground truncate">{event.title}</span>
                  <span className="text-xs text-muted-foreground font-light tabular-nums flex-shrink-0">
                    {dateStr}
                  </span>
                </div>
              );
            })}
          </div>
        )}
      </section>

      <footer className="pt-2 border-t border-dashed border-border">
        <p className="text-[10px] text-muted-foreground/60 text-center font-light tracking-wider">
          南科實中 NNKIEH
        </p>
      </footer>
    </div>
  );
}