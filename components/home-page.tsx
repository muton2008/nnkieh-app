"use client";

import { useEffect, useState, useCallback } from "react";
import {
  BookOpen,
  Train,
  CalendarDays,
  Megaphone,
  ChevronRight,
  Settings,
} from "lucide-react";
import { SkeletonBlock } from "./skeleton-block";
import type { TabId, TodayScheduleItem, UpcomingEvent, UserProfile } from "@/lib/types";
import { DEFAULT_USER_PROFILE } from "@/lib/types";
import { fetchTimetable, fetchSchoolCalendar, getLocalUserProfile } from "@/lib/api";

// --- UI Constants ---
const GREETING_MESSAGES = [
  "今天也要加油喔",
  "美好的一天開始了",
  "保持好心情吧",
  "專注每一刻",
];

const QUICK_LINKS: { id: TabId; label: string; icon: typeof BookOpen; bg: string }[] = [
  { id: "timetable", label: "課表", icon: BookOpen, bg: "bg-macaron-pink" },
  { id: "transport", label: "交通", icon: Train, bg: "bg-macaron-green" },
  { id: "calendar", label: "行事曆", icon: CalendarDays, bg: "bg-macaron-yellow" },
  { id: "news", label: "公告", icon: Megaphone, bg: "bg-macaron-blue" },
];

const PERIOD_TIMES = ["08:10", "09:10", "10:10", "11:10", "", "13:10", "14:10", "15:10", "16:20"];

function getGreeting(): string {
  const hour = new Date().getHours();
  if (hour < 12) return "早安";
  if (hour < 17) return "午安";
  return "晚安";
}

function getRandomMessage(): string {
  return GREETING_MESSAGES[Math.floor(Math.random() * GREETING_MESSAGES.length)];
}

function getTodayString(): string {
  const d = new Date();
  const weekdays = ["日", "一", "二", "三", "四", "五", "六"];
  return `${d.getMonth() + 1}/${d.getDate()} 星期${weekdays[d.getDay()]}`;
}

function getTodayWeekdayKey(): string {
  const weekdays = ["日", "一", "二", "三", "四", "五", "六"];
  return weekdays[new Date().getDay()];
}

interface HomePageProps {
  deviceId: string;
  onNavigate: (tab: TabId) => void;
}

export function HomePage({ deviceId, onNavigate }: HomePageProps) {
  const [loading, setLoading] = useState(true);
  const [message] = useState(getRandomMessage);
  const [todaySchedule, setTodaySchedule] = useState<TodayScheduleItem[]>([]);
  const [upcomingEvents, setUpcomingEvents] = useState<UpcomingEvent[]>([]);
  const [profile, setProfile] = useState<UserProfile>(DEFAULT_USER_PROFILE);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        // Load profile
        const stored = getLocalUserProfile();
        if (stored && !cancelled) setProfile(stored);

        // Load timetable for today
        const dayKey = getTodayWeekdayKey();
        if (["一", "二", "三", "四", "五"].includes(dayKey)) {
          const tData = await fetchTimetable(deviceId);
          if (cancelled) return;
          const dayArr = tData.schedule[dayKey] || [];
          const schedule: TodayScheduleItem[] = [];
          dayArr.forEach((c, idx) => {
            if (c.subject && PERIOD_TIMES[idx]) {
              const periodNum = idx < 4 ? idx + 1 : idx < 5 ? 0 : idx;
              const noteText = c.notes.length > 0 ? c.notes[0].text : "";
              schedule.push({
                period: idx < 4 ? idx + 1 : idx === 4 ? 0 : idx,
                subject: c.subject,
                time: PERIOD_TIMES[idx],
                note: noteText,
              });
            }
          });
          if (!cancelled) setTodaySchedule(schedule);
        }

        // Load upcoming events
        const cData = await fetchSchoolCalendar();
        if (cancelled) return;
        const events: UpcomingEvent[] = cData.events.slice(0, 3).map((e) => ({
          id: e.id,
          title: e.title,
          date: e.date,
          color: e.color,
        }));
        setUpcomingEvents(events);
      } catch (e) {
        console.error("[HomePage] load error:", e);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [deviceId]);

  if (loading) {
    return (
      <div className="px-5 pt-12 pb-6 space-y-6">
        <SkeletonBlock className="h-8 w-32" />
        <SkeletonBlock className="h-4 w-48" />
        <div className="grid grid-cols-4 gap-3">
          {[...Array(4)].map((_, i) => (
            <SkeletonBlock key={i} className="h-20" />
          ))}
        </div>
        <SkeletonBlock className="h-40" />
        <SkeletonBlock className="h-32" />
      </div>
    );
  }

  return (
    <div className="px-5 pt-12 pb-6 space-y-6">
      {/* Header greeting */}
      <header className="flex items-start justify-between">
        <div>
          <h1 className="font-serif text-2xl font-semibold text-foreground tracking-wide">
            {getGreeting()}
          </h1>
          <p className="text-sm text-muted-foreground mt-1 font-light">
            {getTodayString()} &middot; {message}
          </p>
          {profile.class_name && (
            <p className="text-[10px] text-muted-foreground/40 font-light mt-0.5">{profile.class_name}</p>
          )}
        </div>
        <button
          onClick={() => onNavigate("settings")}
          className="p-2 text-muted-foreground/50 hover:text-foreground transition-colors"
          aria-label="設定"
        >
          <Settings size={18} strokeWidth={1.5} />
        </button>
      </header>

      {/* Quick links grid */}
      <section aria-label="快速功能">
        <div className="grid grid-cols-4 gap-3">
          {QUICK_LINKS.map((link) => {
            const Icon = link.icon;
            return (
              <button
                key={link.id}
                onClick={() => onNavigate(link.id)}
                className={`${link.bg} flex flex-col items-center justify-center gap-1.5 py-4 rounded-sm border border-border/50 transition-all duration-200 hover:shadow-sm active:scale-[0.97]`}
              >
                <Icon size={20} strokeWidth={1.5} className="text-foreground/70" />
                <span className="text-xs text-foreground/80 font-light">{link.label}</span>
              </button>
            );
          })}
        </div>
      </section>

      {/* Today's schedule preview */}
      <section aria-label="今日課表">
        <div className="flex items-center justify-between mb-3">
          <h2 className="font-serif text-base font-semibold text-foreground">今日課表</h2>
          <button
            onClick={() => onNavigate("timetable")}
            className="flex items-center gap-0.5 text-xs text-muted-foreground hover:text-foreground transition-colors"
          >
            查看完整
            <ChevronRight size={14} />
          </button>
        </div>
        {todaySchedule.length === 0 ? (
          <div className="bg-card border border-border rounded-sm px-4 py-6 text-center">
            <p className="text-sm text-muted-foreground/50 font-light">今天沒有課程安排</p>
          </div>
        ) : (
          <div className="bg-card border border-border rounded-sm divide-y divide-border">
            {todaySchedule.map((item) => (
              <div key={item.period} className="flex items-center px-4 py-2.5 gap-3">
                <span className="text-xs text-muted-foreground font-light w-10 flex-shrink-0 tabular-nums">
                  {item.time}
                </span>
                <div className="w-px h-4 bg-border" />
                <div className="flex-1 flex items-center justify-between">
                  <span className="text-sm text-foreground">
                    第{item.period}節 &middot; {item.subject}
                  </span>
                  {item.note && (
                    <span className="text-[9px] px-1.5 py-0.5 rounded-sm border bg-amber-50 text-amber-700 border-amber-200 font-light">
                      {item.note}
                    </span>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* Upcoming events */}
      <section aria-label="近期活動">
        <div className="flex items-center justify-between mb-3">
          <h2 className="font-serif text-base font-semibold text-foreground">近期活動</h2>
          <button
            onClick={() => onNavigate("calendar")}
            className="flex items-center gap-0.5 text-xs text-muted-foreground hover:text-foreground transition-colors"
          >
            查看全部
            <ChevronRight size={14} />
          </button>
        </div>
        <div className="space-y-2">
          {upcomingEvents.map((event) => (
            <div
              key={event.id}
              className={`${event.color} border border-border/50 rounded-sm px-4 py-3 flex items-center justify-between`}
            >
              <span className="text-sm text-foreground">{event.title}</span>
              <span className="text-xs text-muted-foreground font-light">{event.date}</span>
            </div>
          ))}
        </div>
      </section>

      {/* School info */}
      <footer className="pt-2 border-t border-dashed border-border">
        <p className="text-[10px] text-muted-foreground/60 text-center font-light tracking-wider">
          {profile.school_name || "南科實中"} NNKIEH
        </p>
      </footer>
    </div>
  );
}
