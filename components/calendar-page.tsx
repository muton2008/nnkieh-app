"use client";

import { useState, useEffect, useMemo, useCallback, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import dayjs from "dayjs";
import isBetween from "dayjs/plugin/isBetween";
import "dayjs/locale/zh-tw";
import {
  ChevronLeft,
  ChevronRight,
  Plus,
  Shield,
  ShieldOff,
  Clock,
  CalendarDays,
  X,
  Pencil,
  Trash2,
  KeyRound,
  Send,
  Users,
  LogOut,
} from "lucide-react";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Drawer,
  DrawerContent,
  DrawerHeader,
  DrawerTitle,
  DrawerDescription,
  DrawerFooter,
} from "@/components/ui/drawer";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { SkeletonBlock } from "./skeleton-block";
import { useAdmin } from "./admin-context";
import { AdminAuthModal } from "./admin-auth-modal";
import { AdminWhitelistDrawer } from "./admin-whitelist-drawer";
import { useIsMobile } from "@/hooks/use-mobile";

import type {
  SchoolCalendarEvent,
  PrivateCalendarEvent,
  CombinedEvent,
  EventCategory,
  PrivateEventCategory,
} from "@/lib/types/calendar";
import {
  fetchSchoolCalendar,
  getLocalPrivateEvents,
  saveLocalPrivateEvents,
  saveSchoolEvent,
  deleteSchoolEvent,
} from "@/lib/api-client";
import { syncCalendarReminders } from "@/lib/reminders";
import { syncExamWidgetData } from "@/lib/timetable-widget";

dayjs.extend(isBetween);
dayjs.locale("zh-tw");

// --- UI Constants ---

const WEEKDAYS = ["一", "二", "三", "四", "五", "六", "日"] as const;

const ALL_CATEGORIES: PrivateEventCategory[] = [
  "考試", "升學", "活動", "放假", "社團", "其他", "讀書", "運動",
];

const CATEGORY_DOT: Record<PrivateEventCategory, string> = {
  考試: "bg-orange-400",
  升學: "bg-red-500",
  活動: "bg-green-500",
  放假: "bg-sky-400",
  社團: "bg-purple-500",
  其他: "bg-gray-400",
  讀書: "bg-amber-500",
  運動: "bg-teal-500",
};

const CATEGORY_BADGE: Record<PrivateEventCategory, string> = {
  考試: "bg-orange-50 text-orange-600 border-orange-200",
  升學: "bg-red-50 text-red-600 border-red-200",
  活動: "bg-green-50 text-green-600 border-green-200",
  放假: "bg-sky-50 text-sky-600 border-sky-200",
  社團: "bg-purple-50 text-purple-600 border-purple-200",
  其他: "bg-gray-50 text-gray-600 border-gray-200",
  讀書: "bg-amber-50 text-amber-600 border-amber-200",
  運動: "bg-teal-50 text-teal-600 border-teal-200",
};

// --- Helpers ---

/** 將 SchoolCalendarEvent + PrivateCalendarEvent 合併成統一的 CombinedEvent */
function mergeEvents(
  school: SchoolCalendarEvent[],
  priv: PrivateCalendarEvent[]
): CombinedEvent[] {
  const fromSchool: CombinedEvent[] = school.map((e) => ({
    id: e.id,
    date: e.date,
    end_date: e.end_date,
    start_time: e.start_time,
    end_time: e.end_time,
    title: e.title,
    description: e.description,
    category: e.category as PrivateEventCategory,
    target_audience: e.target_audience,
    isPrivate: false,
    sourceId: e.id,
  }));

  const fromPrivate: CombinedEvent[] = priv.map((e) => ({
    id: e.id,
    date: e.date,
    end_date: e.end_date,
    start_time: e.start_time,
    end_time: e.end_time,
    title: e.title,
    description: e.description,
    category: e.category as PrivateEventCategory,
    isPrivate: true,
    sourceId: e.id,
  }));

  return [...fromSchool, ...fromPrivate];
}

/** 取得指定日期的事件 */
function getEventsForDay(events: CombinedEvent[], date: dayjs.Dayjs): CombinedEvent[] {
  return events
    .filter((e) => {
      const start = dayjs(e.date).startOf("day");
      const end = e.end_date ? dayjs(e.end_date).endOf("day") : start.endOf("day");
      return date.isBetween(start, end, "day", "[]");
    })
    .sort((a, b) => {
      // 全天事件排前面
      const aAllDay = !a.start_time;
      const bAllDay = !b.start_time;
      if (aAllDay && !bAllDay) return -1;
      if (!aAllDay && bAllDay) return 1;
      if (a.start_time && b.start_time) return a.start_time.localeCompare(b.start_time);
      return 0;
    });
}

function generateId(): string {
  return `priv_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

// --- Shared Form Fields (used in both Drawer & Dialog) ---

interface EventFormFieldsProps {
  isAdminMode: boolean;
  editingEvent: CombinedEvent | null;
  newTitle: string;
  setNewTitle: (v: string) => void;
  newCategory: PrivateEventCategory;
  setNewCategory: (v: PrivateEventCategory) => void;
  newTargetAudience: string;
  setNewTargetAudience: (v: string) => void;
  newDate: string;
  setNewDate: (v: string) => void;
  newEndDate: string;
  setNewEndDate: (v: string) => void;
  newStartTime: string;
  setNewStartTime: (v: string) => void;
  newEndTime: string;
  setNewEndTime: (v: string) => void;
  newDescription: string;
  setNewDescription: (v: string) => void;
}

function EventFormFields({
  isAdminMode, editingEvent,
  newTitle, setNewTitle,
  newCategory, setNewCategory,
  newTargetAudience, setNewTargetAudience,
  newDate, setNewDate,
  newEndDate, setNewEndDate,
  newStartTime, setNewStartTime,
  newEndTime, setNewEndTime,
  newDescription, setNewDescription,
}: EventFormFieldsProps) {
  return (
    <>
      {/* 標題 */}
      <div>
        <label className="text-xs text-muted-foreground font-light mb-1 block">標題 *</label>
        <input
          type="text"
          value={newTitle}
          onChange={(e) => setNewTitle(e.target.value)}
          placeholder="輸入事件標題"
          className="w-full border border-border rounded-sm px-3 py-2.5 text-sm text-foreground bg-card placeholder:text-muted-foreground/30 focus:outline-none focus:ring-1 focus:ring-ring"
        />
      </div>

      {/* 分類 */}
      <div>
        <label className="text-xs text-muted-foreground font-light mb-1.5 block">分類</label>
        <div className="flex flex-wrap gap-1.5">
          {(isAdminMode && !editingEvent?.isPrivate
            ? (["考試", "升學", "活動", "放假", "社團", "其他"] as PrivateEventCategory[])
            : ALL_CATEGORIES
          ).map((cat) => (
            <button
              key={cat}
              onClick={() => setNewCategory(cat)}
              className={`px-3 py-1.5 text-[11px] rounded-sm border transition-all min-h-[32px] ${
                newCategory === cat
                  ? "bg-foreground text-background border-foreground font-medium"
                  : "bg-card text-muted-foreground border-border font-light hover:border-foreground/20 active:bg-foreground/5"
              }`}
            >
              {cat}
            </button>
          ))}
        </div>
      </div>

      {/* 管理模式：對象人群 */}
      {isAdminMode && !editingEvent?.isPrivate && (
        <div>
          <label className="text-xs text-muted-foreground font-light mb-1.5 block">對象</label>
          <div className="flex gap-1.5">
            {["全校", "高一", "高二", "高三"].map((aud) => (
              <button
                key={aud}
                onClick={() => setNewTargetAudience(aud)}
                className={`px-3 py-1.5 text-[11px] rounded-sm border transition-all min-h-[32px] ${
                  newTargetAudience === aud
                    ? "bg-foreground text-background border-foreground font-medium"
                    : "bg-card text-muted-foreground border-border font-light hover:border-foreground/20 active:bg-foreground/5"
                }`}
              >
                {aud}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* 日期 */}
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="text-xs text-muted-foreground font-light mb-1 block">開始日期 *</label>
          <input
            type="date"
            value={newDate}
            onChange={(e) => setNewDate(e.target.value)}
            className="w-full border border-border rounded-sm px-3 py-2.5 text-sm text-foreground bg-card focus:outline-none focus:ring-1 focus:ring-ring"
          />
        </div>
        <div>
          <label className="text-xs text-muted-foreground font-light mb-1 block">結束日期</label>
          <input
            type="date"
            value={newEndDate}
            onChange={(e) => setNewEndDate(e.target.value)}
            className="w-full border border-border rounded-sm px-3 py-2.5 text-sm text-foreground bg-card focus:outline-none focus:ring-1 focus:ring-ring"
          />
        </div>
      </div>

      {/* 時間 */}
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="text-xs text-muted-foreground font-light mb-1 block">開始時間</label>
          <input
            type="time"
            value={newStartTime}
            onChange={(e) => setNewStartTime(e.target.value)}
            className="w-full border border-border rounded-sm px-3 py-2.5 text-sm text-foreground bg-card focus:outline-none focus:ring-1 focus:ring-ring"
          />
        </div>
        <div>
          <label className="text-xs text-muted-foreground font-light mb-1 block">結束時間</label>
          <input
            type="time"
            value={newEndTime}
            onChange={(e) => setNewEndTime(e.target.value)}
            className="w-full border border-border rounded-sm px-3 py-2.5 text-sm text-foreground bg-card focus:outline-none focus:ring-1 focus:ring-ring"
          />
        </div>
      </div>

      {/* 描述 */}
      <div>
        <label className="text-xs text-muted-foreground font-light mb-1 block">備註</label>
        <textarea
          value={newDescription}
          onChange={(e) => setNewDescription(e.target.value)}
          placeholder="選填"
          rows={2}
          className="w-full border border-border rounded-sm px-3 py-2.5 text-sm text-foreground bg-card placeholder:text-muted-foreground/30 focus:outline-none focus:ring-1 focus:ring-ring resize-none"
        />
      </div>
    </>
  );
}

// --- Component ---

interface CalendarPageProps {
  deviceId: string;
  /** 長按盾牌時呼叫 → 開啟 ApproveDrawer (B端核准) */
  onOpenApproveDrawer?: () => void;
}

export function CalendarPage({ deviceId, onOpenApproveDrawer }: CalendarPageProps) {
  const { isAdminMode, session, disableAdminMode } = useAdmin();
  const isMobile = useIsMobile();
  const [loading, setLoading] = useState(true);
  const [currentMonth, setCurrentMonth] = useState(dayjs());
  const [selectedDate, setSelectedDate] = useState(dayjs());
  const [schoolEvents, setSchoolEvents] = useState<SchoolCalendarEvent[]>([]);
  const [privateEvents, setPrivateEvents] = useState<PrivateCalendarEvent[]>([]);
  const [showAddDialog, setShowAddDialog] = useState(false);
  const [showAuthModal, setShowAuthModal] = useState(false);

  // 新增/編輯事件表單
  const [editingEvent, setEditingEvent] = useState<CombinedEvent | null>(null);
  const [newTitle, setNewTitle] = useState("");
  const [newDescription, setNewDescription] = useState("");
  const [newDate, setNewDate] = useState(dayjs().format("YYYY-MM-DD"));
  const [newEndDate, setNewEndDate] = useState("");
  const [newStartTime, setNewStartTime] = useState("");
  const [newEndTime, setNewEndTime] = useState("");
  const [newCategory, setNewCategory] = useState<PrivateEventCategory>("其他");
  const [newTargetAudience, setNewTargetAudience] = useState<string>("全校");
  const [isSaving, setIsSaving] = useState(false);

  // 盾牌選單
  const [showShieldMenu, setShowShieldMenu] = useState(false);
  const [showAdminMenu, setShowAdminMenu] = useState(false);
  const [showWhitelistDrawer, setShowWhitelistDrawer] = useState(false);

  // --- Data Loading ---
  useEffect(() => {
    let cancelled = false;

    const load = async () => {
      try {
        const localPriv = getLocalPrivateEvents();
        if (!cancelled) setPrivateEvents(localPriv);

        const res = await fetchSchoolCalendar();
        if (!cancelled && res?.events) {
          setSchoolEvents(res.events);
          // 同步考試事件到桌面 Widget
          const examEvents = res.events
            .filter((e: SchoolCalendarEvent) => !e.is_deleted && e.category === "考試")
            .map((e: SchoolCalendarEvent) => ({
              date: e.date,
              end_date: e.end_date,
              title: e.title,
              description: e.description ?? undefined,
            }));
          syncExamWidgetData(examEvents);
        }
      } catch (e) {
        console.error("[CalendarPage] load error:", e);
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    load();
    return () => { cancelled = true; };
  }, []);

  // --- 同步行事曆提醒 (schoolEvents 或 privateEvents 變化時自動比對) ---
  useEffect(() => {
    if (loading) return;
    const timer = setTimeout(() => {
      syncCalendarReminders(schoolEvents, privateEvents).catch((err) =>
        console.error("[CalendarPage] syncCalendarReminders error:", err)
      );
      // 同步考試倒數 Widget
      const examEvents = schoolEvents
        .filter((e) => !e.is_deleted && e.category === "考試")
        .map((e) => ({
          date: e.date,
          end_date: e.end_date,
          title: e.title,
          description: e.description ?? undefined,
        }));
      syncExamWidgetData(examEvents);
    }, 2000);
    return () => clearTimeout(timer);
  }, [schoolEvents, privateEvents, loading]);

  // --- Combined Events ---
  const allEvents = useMemo(
    () => mergeEvents(schoolEvents, privateEvents),
    [schoolEvents, privateEvents]
  );

  // --- Calendar Grid ---
  const calendarDays = useMemo(() => {
    const startOfMonth = currentMonth.startOf("month");
    const startDay = startOfMonth.day();
    const offset = startDay === 0 ? 6 : startDay - 1;
    const gridStart = startOfMonth.subtract(offset, "day");

    const days: dayjs.Dayjs[] = [];
    for (let i = 0; i < 42; i++) {
      days.push(gridStart.add(i, "day"));
    }
    return days;
  }, [currentMonth]);

  const selectedDayEvents = useMemo(
    () => getEventsForDay(allEvents, selectedDate),
    [allEvents, selectedDate]
  );

  // --- Handlers ---
  const goToPrevMonth = () => setCurrentMonth((m) => m.subtract(1, "month"));
  const goToNextMonth = () => setCurrentMonth((m) => m.add(1, "month"));
  const goToToday = () => {
    setCurrentMonth(dayjs());
    setSelectedDate(dayjs());
  };

  // 盾牌選單操作
  const handleInitiateAuth = () => {
    setShowShieldMenu(false);
    setShowAuthModal(true);
  };

  const handleOpenApprove = () => {
    setShowShieldMenu(false);
    onOpenApproveDrawer?.();
  };

  const resetForm = () => {
    setNewTitle("");
    setNewDescription("");
    setNewDate(selectedDate.format("YYYY-MM-DD"));
    setNewEndDate("");
    setNewStartTime("");
    setNewEndTime("");
    setNewCategory("其他");
    setNewTargetAudience("全校");
    setEditingEvent(null);
  };

  const openAddDialog = (isSchoolEvent = false) => {
    resetForm();
    setNewDate(selectedDate.format("YYYY-MM-DD"));
    setShowAddDialog(true);
  };

  const openEditDialog = (evt: CombinedEvent) => {
    setEditingEvent(evt);
    setNewTitle(evt.title);
    setNewDescription(evt.description || "");
    setNewDate(evt.date);
    setNewEndDate(evt.end_date || "");
    setNewStartTime(evt.start_time || "");
    setNewEndTime(evt.end_time || "");
    setNewCategory(evt.category);
    setNewTargetAudience(evt.target_audience || "全校");
    setShowAddDialog(true);
  };

  const handleSaveEvent = async () => {
    if (!newTitle.trim()) return;

    // 驗證日期與時間
    const effectiveEndDate = newEndDate || newDate;
    if (effectiveEndDate < newDate) {
      alert("結束日期不可早於開始日期");
      return;
    }
    const effectiveStart = newStartTime || "00:00";
    const effectiveEnd = newEndTime || "23:59";
    if (newDate === effectiveEndDate && effectiveEnd < effectiveStart) {
      alert("結束時間不可早於開始時間");
      return;
    }

    // 管理模式：儲存/新增學校事件
    if (isAdminMode && (!editingEvent || !editingEvent.isPrivate)) {
      setIsSaving(true);
      try {
        const schoolEvt: SchoolCalendarEvent = {
          id: editingEvent ? editingEvent.sourceId : `school_${Date.now()}`,
          date: newDate,
          end_date: newEndDate || newDate,
          start_time: newStartTime || "00:00",
          end_time: newEndTime || "23:59",
          title: newTitle.trim(),
          description: newDescription.trim() || null,
          category: newCategory as EventCategory,
          target_audience: newTargetAudience as SchoolCalendarEvent["target_audience"],
          updated_at: new Date().toISOString(),
          updated_by: session?.deviceId ?? "unknown",
        };

        const res = await saveSchoolEvent(schoolEvt, session);
        const saved = res.data ? { ...schoolEvt, id: res.data.id } : schoolEvt;

        // 更新本地狀態
        if (editingEvent) {
          setSchoolEvents((prev) =>
            prev.map((e) => (e.id === editingEvent.sourceId ? saved : e))
          );
        } else {
          setSchoolEvents((prev) => [...prev, saved]);
        }
      } catch (e) {
        console.error("[CalendarPage] save school event error:", e);
        alert("儲存失敗，請確認管理員授權是否有效");
      } finally {
        setIsSaving(false);
      }
    } else {
      // 一般用戶/私人事件
      const event: PrivateCalendarEvent = {
        id: editingEvent?.isPrivate ? editingEvent.sourceId : generateId(),
        date: newDate,
        end_date: newEndDate || newDate,
        start_time: newStartTime || "00:00",
        end_time: newEndTime || "23:59",
        title: newTitle.trim(),
        description: newDescription.trim() || null,
        category: newCategory,
      };

      let updated: PrivateCalendarEvent[];
      if (editingEvent?.isPrivate) {
        updated = privateEvents.map((e) => (e.id === editingEvent.sourceId ? event : e));
      } else {
        updated = [...privateEvents, event];
      }
      setPrivateEvents(updated);
      saveLocalPrivateEvents(updated);
    }

    setShowAddDialog(false);
    setEditingEvent(null);
  };

  const handleDeleteEvent = async (evt: CombinedEvent) => {
    if (!confirm(`確定要刪除「${evt.title}」嗎？`)) return;

    if (evt.isPrivate) {
      const updated = privateEvents.filter((e) => e.id !== evt.sourceId);
      setPrivateEvents(updated);
      saveLocalPrivateEvents(updated);
    } else if (isAdminMode) {
      // 管理模式：刪除學校事件
      try {
        const res = await deleteSchoolEvent(evt.sourceId!, session);
        if (res.success) {
          setSchoolEvents((prev) => prev.filter((e) => e.id !== evt.sourceId));
        }
      } catch (e) {
        console.error("[CalendarPage] delete error:", e);
      }
    }
  };

  // --- Render ---

  if (loading) {
    return (
      <div className="px-5 pt-12 pb-6 space-y-4">
        <SkeletonBlock className="h-8 w-40" />
        <SkeletonBlock className="h-4 w-28" />
        <SkeletonBlock className="h-64 w-full" />
        <SkeletonBlock className="h-20 w-full" />
        <SkeletonBlock className="h-20 w-full" />
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full animate-in fade-in duration-500">
      {/* Header */}
      <header className="px-5 pt-12 pb-2">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="font-serif text-xl font-semibold text-foreground">行事曆</h1>
            <p className="text-xs text-muted-foreground font-light mt-0.5">校園與個人行程</p>
          </div>
          {/* 盾牌圖示：隱形入口 */}
          {isAdminMode ? (
            <Popover open={showAdminMenu} onOpenChange={setShowAdminMenu}>
              <PopoverTrigger asChild>
                <button
                  className="p-2 text-amber-500 hover:text-amber-600 transition-colors"
                  aria-label="管理選項"
                >
                  <Shield size={18} strokeWidth={1.5} className="fill-amber-100" />
                </button>
              </PopoverTrigger>
              <PopoverContent
                align="end"
                sideOffset={4}
                className="w-44 p-1.5 rounded-sm"
              >
                {!session?.review && (session?.role === 'super_admin' || session?.role === 'admin') && (
                  <button
                    onClick={() => { setShowAdminMenu(false); setShowWhitelistDrawer(true); }}
                    className="w-full flex items-center gap-2.5 px-3 py-2 text-[12px] text-foreground rounded-sm hover:bg-foreground/5 transition-colors"
                  >
                    <Users size={13} strokeWidth={1.5} className="text-muted-foreground" />
                    <span className="font-light">管理白名單</span>
                  </button>
                )}
                <button
                  onClick={() => { setShowAdminMenu(false); disableAdminMode(); }}
                  className="w-full flex items-center gap-2.5 px-3 py-2 text-[12px] text-foreground rounded-sm hover:bg-foreground/5 transition-colors"
                >
                  <LogOut size={13} strokeWidth={1.5} className="text-muted-foreground" />
                  <span className="font-light">{session?.review ? "退出體驗模式" : "退出管理模式"}</span>
                </button>
              </PopoverContent>
            </Popover>
          ) : (
            <Popover open={showShieldMenu} onOpenChange={setShowShieldMenu}>
              <PopoverTrigger asChild>
                <button
                  className="p-2 text-muted-foreground/20 hover:text-muted-foreground/40 transition-colors"
                  aria-label="管理員授權"
                >
                  <Shield size={18} strokeWidth={1.5} />
                </button>
              </PopoverTrigger>
              <PopoverContent
                align="end"
                sideOffset={4}
                className="w-44 p-1.5 rounded-sm"
              >
                <button
                  onClick={handleInitiateAuth}
                  className="w-full flex items-center gap-2.5 px-3 py-2 text-[12px] text-foreground rounded-sm hover:bg-foreground/5 transition-colors"
                >
                  <Send size={13} strokeWidth={1.5} className="text-muted-foreground" />
                  <span className="font-light">發起授權請求</span>
                </button>
                <button
                  onClick={handleOpenApprove}
                  className="w-full flex items-center gap-2.5 px-3 py-2 text-[12px] text-foreground rounded-sm hover:bg-foreground/5 transition-colors"
                >
                  <KeyRound size={13} strokeWidth={1.5} className="text-muted-foreground" />
                  <span className="font-light">輸入挑戰碼</span>
                </button>
              </PopoverContent>
            </Popover>
          )}
        </div>
        {/* Admin mode banner */}
        <AnimatePresence>
          {isAdminMode && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: "auto" }}
              exit={{ opacity: 0, height: 0 }}
              className="overflow-hidden"
            >
              <div className="flex items-center gap-2 mt-2 px-3 py-2 bg-amber-50 border border-amber-200 rounded-sm">
                <Shield size={12} className="text-amber-600" />
                <span className="text-[11px] text-amber-700 font-light">
                  {session?.review ? "體驗模式" : "管理模式已啟用"} · {session?.role}
                </span>
                <button
                  onClick={disableAdminMode}
                  className="ml-auto text-[10px] text-amber-500 hover:text-amber-700 font-light"
                >
                  <ShieldOff size={12} />
                </button>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </header>

      {/* Month Navigator */}
      <div className="flex items-center justify-between px-5 py-3">
        <button
          onClick={goToPrevMonth}
          className="p-2 min-w-[44px] min-h-[44px] flex items-center justify-center text-muted-foreground hover:text-foreground active:text-foreground transition-colors"
        >
          <ChevronLeft size={18} strokeWidth={1.5} />
        </button>
        <button onClick={goToToday} className="flex items-center gap-1.5">
          <h2 className="font-serif text-base font-semibold text-foreground">
            {currentMonth.format("YYYY 年 M 月")}
          </h2>
        </button>
        <button
          onClick={goToNextMonth}
          className="p-2 min-w-[44px] min-h-[44px] flex items-center justify-center text-muted-foreground hover:text-foreground active:text-foreground transition-colors"
        >
          <ChevronRight size={18} strokeWidth={1.5} />
        </button>
      </div>

      {/* Calendar Grid */}
      <div className="px-4 pb-3">
        <div className="bg-card border border-border rounded-sm overflow-hidden">
          <div className="grid grid-cols-7 border-b border-border">
            {WEEKDAYS.map((wd, i) => (
              <div
                key={wd}
                className={`text-center text-[11px] py-2 font-light ${
                  i >= 5 ? "text-muted-foreground/50" : "text-muted-foreground"
                }`}
              >
                {wd}
              </div>
            ))}
          </div>

          <div className="grid grid-cols-7">
            {calendarDays.map((day, idx) => {
              const isToday = day.isSame(dayjs(), "day");
              const isSelected = day.isSame(selectedDate, "day");
              const isCurrentMonth = day.isSame(currentMonth, "month");
              const dayEvts = getEventsForDay(allEvents, day);
              const uniqueCategories = [...new Set(dayEvts.map((e) => e.category))];

              return (
                <button
                  key={idx}
                  onClick={() => setSelectedDate(day)}
                  className={`relative flex flex-col items-center justify-start py-1.5 h-[52px] transition-colors border-t border-border/30
                    ${!isCurrentMonth ? "opacity-30" : ""}
                    ${isSelected ? "bg-foreground/5" : "hover:bg-foreground/[0.02]"}
                  `}
                >
                  <span
                    className={`text-xs tabular-nums leading-none mb-1 w-6 h-6 flex items-center justify-center rounded-full
                      ${isToday ? "bg-foreground text-background font-semibold" : ""}
                      ${isSelected && !isToday ? "ring-1 ring-foreground/40" : ""}
                      ${!isToday ? "font-light" : ""}
                    `}
                  >
                    {day.date()}
                  </span>
                  <div className="flex gap-[3px] flex-wrap justify-center max-w-[36px]">
                    {uniqueCategories.slice(0, 3).map((cat) => (
                      <span
                        key={cat}
                        className={`w-[5px] h-[5px] rounded-full ${CATEGORY_DOT[cat]}`}
                      />
                    ))}
                  </div>
                </button>
              );
            })}
          </div>
        </div>
      </div>

      {/* Selected date event list */}
      <div className="flex-1 overflow-y-auto px-5 pb-[calc(7rem+env(safe-area-inset-bottom,0px))]">
        <div className="flex items-center gap-2 mb-3">
          <CalendarDays size={16} strokeWidth={1.5} className="text-muted-foreground" />
          <h3 className="font-serif text-sm font-semibold text-foreground">
            {selectedDate.isSame(dayjs(), "day") ? "今天" : selectedDate.format("M月D日")}{" "}
            <span className="font-light text-muted-foreground">
              星期{["日", "一", "二", "三", "四", "五", "六"][selectedDate.day()]}
            </span>
          </h3>
        </div>

        {selectedDayEvents.length === 0 ? (
          <div className="bg-card border border-border rounded-sm px-4 py-8 text-center">
            <p className="text-sm text-muted-foreground/40 font-light">這天沒有任何事件</p>
          </div>
        ) : (
          <div className="space-y-2">
            {selectedDayEvents.map((evt) => (
              <div
                key={evt.id}
                className={`bg-card border border-border rounded-sm px-4 py-3 flex items-start gap-3 group active:bg-foreground/[0.02] transition-colors ${
                  isAdminMode && !evt.isPrivate ? "cursor-pointer hover:border-amber-300" : ""
                } ${
                  evt.isPrivate ? "cursor-pointer hover:border-violet-300" : ""
                }`}
                onClick={() => {
                  if (isAdminMode && !evt.isPrivate) openEditDialog(evt);
                  else if (evt.isPrivate) openEditDialog(evt);
                }}
              >
                <span
                  className={`flex-shrink-0 w-1 h-full min-h-[40px] rounded-full ${CATEGORY_DOT[evt.category]}`}
                />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-1.5 mb-1 flex-wrap">
                    <Badge
                      variant="secondary"
                      className={`text-[9px] px-1.5 py-0 h-4 rounded-sm border font-light ${CATEGORY_BADGE[evt.category]}`}
                    >
                      {evt.category}
                    </Badge>
                    {evt.isPrivate && (
                      <Badge
                        variant="secondary"
                        className="text-[9px] px-1.5 py-0 h-4 rounded-sm bg-violet-50 text-violet-600 border-violet-200 font-light"
                      >
                        私人
                      </Badge>
                    )}
                    {!evt.isPrivate && evt.target_audience && (
                      <Badge
                        variant="secondary"
                        className="text-[9px] px-1.5 py-0 h-4 rounded-sm bg-gray-50 text-gray-500 border-gray-200 font-light"
                      >
                        {evt.target_audience}
                      </Badge>
                    )}
                  </div>
                  <p className="text-sm text-foreground font-medium leading-snug">{evt.title}</p>
                  {evt.description && (
                    <p className="text-xs text-muted-foreground/60 font-light mt-0.5 line-clamp-2">
                      {evt.description}
                    </p>
                  )}
                  <div className="flex items-center gap-1 mt-1.5 text-[10px] text-muted-foreground/40 font-light">
                    <Clock size={10} />
                    {evt.start_time ? (
                      <span>
                        {evt.start_time}
                        {evt.end_time ? ` - ${evt.end_time}` : ""}
                      </span>
                    ) : (
                      <span>全天</span>
                    )}
                    {evt.end_date && evt.end_date !== evt.date && (
                      <span className="ml-1">~ {dayjs(evt.end_date).format("M/D")}</span>
                    )}
                  </div>
                </div>
                {/* 操作按鈕 */}
                <div className="flex flex-col gap-1 flex-shrink-0 opacity-100 sm:opacity-0 sm:group-hover:opacity-100 transition-all">
                  {/* 管理模式下：公開事件可編輯/刪除 */}
                  {isAdminMode && !evt.isPrivate && (
                    <>
                      <button
                        onClick={(e) => { e.stopPropagation(); openEditDialog(evt); }}
                        className="p-1.5 min-w-[32px] min-h-[32px] flex items-center justify-center text-muted-foreground/40 hover:text-amber-500 active:text-amber-600"
                        aria-label="編輯事件"
                      >
                        <Pencil size={14} />
                      </button>
                      <button
                        onClick={(e) => { e.stopPropagation(); handleDeleteEvent(evt); }}
                        className="p-1.5 min-w-[32px] min-h-[32px] flex items-center justify-center text-muted-foreground/40 hover:text-red-500 active:text-red-600"
                        aria-label="刪除事件"
                      >
                        <Trash2 size={14} />
                      </button>
                    </>
                  )}
                  {/* 私人事件可編輯/刪除 */}
                  {evt.isPrivate && (
                    <>
                      <button
                        onClick={(e) => { e.stopPropagation(); openEditDialog(evt); }}
                        className="p-1.5 min-w-[32px] min-h-[32px] flex items-center justify-center text-muted-foreground/40 hover:text-violet-500 active:text-violet-600"
                        aria-label="編輯事件"
                      >
                        <Pencil size={14} />
                      </button>
                      <button
                        onClick={(e) => { e.stopPropagation(); handleDeleteEvent(evt); }}
                        className="p-1.5 min-w-[32px] min-h-[32px] flex items-center justify-center text-muted-foreground/40 hover:text-red-500 active:text-red-600"
                        aria-label="刪除事件"
                      >
                        <X size={14} />
                      </button>
                    </>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Upcoming events */}
        {(() => {
          const upcoming = allEvents
            .filter((e) => dayjs(e.date).isAfter(selectedDate, "day"))
            .sort((a, b) => dayjs(a.date).diff(dayjs(b.date)))
            .slice(0, 5);
          if (upcoming.length === 0) return null;

          return (
            <div className="mt-6">
              <h3 className="font-serif text-sm font-semibold text-foreground mb-2">接下來</h3>
              <div className="space-y-1.5">
                {upcoming.map((evt) => (
                  <button
                    key={evt.id}
                    onClick={() => {
                      setSelectedDate(dayjs(evt.date));
                      setCurrentMonth(dayjs(evt.date));
                    }}
                    className="w-full text-left bg-card border border-border rounded-sm px-3 py-2.5 flex items-center gap-3 hover:shadow-sm transition-shadow active:scale-[0.995]"
                  >
                    <span
                      className={`flex-shrink-0 w-[5px] h-[5px] rounded-full ${CATEGORY_DOT[evt.category]}`}
                    />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm text-foreground truncate">{evt.title}</p>
                    </div>
                    <span className="text-[10px] text-muted-foreground/40 font-light flex-shrink-0 tabular-nums">
                      {dayjs(evt.date).format("M/D")}
                    </span>
                  </button>
                ))}
              </div>
            </div>
          );
        })()}
      </div>

      {/* FAB — 新增事件（管理模式下用 amber 色） */}
      <AnimatePresence>
        <motion.button
          key={isAdminMode ? "admin-fab" : "user-fab"}
          initial={{ scale: 0, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          exit={{ scale: 0, opacity: 0 }}
          transition={{ type: "spring", stiffness: 400, damping: 20 }}
          onClick={() => openAddDialog()}
          className={`fixed bottom-[calc(6rem+env(safe-area-inset-bottom,0px))] right-5 z-20 w-12 h-12 flex items-center justify-center rounded-full shadow-lg hover:shadow-xl active:scale-95 transition-shadow ${
            isAdminMode
              ? "bg-amber-500 text-white"
              : "bg-foreground text-background"
          }`}
          aria-label={isAdminMode ? "新增學校事件" : "新增私人事件"}
        >
          <Plus size={22} strokeWidth={2} />
        </motion.button>
      </AnimatePresence>

      {/* 新增/編輯事件 — 手機用 Drawer（底部抽屜），桌面用 Dialog */}
      {isMobile ? (
        <Drawer open={showAddDialog} onOpenChange={setShowAddDialog}>
          <DrawerContent className="rounded-t-xl">
            <DrawerHeader className="px-5 pt-2 pb-3 text-left">
              <DrawerTitle className="font-serif text-lg text-foreground">
                {editingEvent ? "編輯事件" : isAdminMode ? "新增學校事件" : "新增私人事件"}
              </DrawerTitle>
              {isAdminMode && !editingEvent?.isPrivate && (
                <DrawerDescription className="text-[11px] text-amber-600 font-light">
                  此事件將公開給所有使用者
                </DrawerDescription>
              )}
            </DrawerHeader>

            <div className="px-5 py-3 space-y-4 border-t border-dashed border-border max-h-[55vh] overflow-y-auto overscroll-contain">
              <EventFormFields
                isAdminMode={isAdminMode}
                editingEvent={editingEvent}
                newTitle={newTitle}
                setNewTitle={setNewTitle}
                newCategory={newCategory}
                setNewCategory={setNewCategory}
                newTargetAudience={newTargetAudience}
                setNewTargetAudience={setNewTargetAudience}
                newDate={newDate}
                setNewDate={setNewDate}
                newEndDate={newEndDate}
                setNewEndDate={setNewEndDate}
                newStartTime={newStartTime}
                setNewStartTime={setNewStartTime}
                newEndTime={newEndTime}
                setNewEndTime={setNewEndTime}
                newDescription={newDescription}
                setNewDescription={setNewDescription}
              />
            </div>

            <DrawerFooter className="px-5 py-3 pb-[calc(0.75rem+env(safe-area-inset-bottom,0px))] border-t border-border flex-row gap-2">
              <Button
                variant="outline"
                onClick={() => { setShowAddDialog(false); setEditingEvent(null); }}
                className="flex-1 rounded-sm h-11"
              >
                取消
              </Button>
              <Button
                onClick={handleSaveEvent}
                disabled={!newTitle.trim() || !newDate || isSaving}
                className={`flex-1 rounded-sm h-11 ${
                  isAdminMode && !editingEvent?.isPrivate ? "bg-amber-500 hover:bg-amber-600" : ""
                }`}
              >
                {isSaving ? "儲存中..." : editingEvent ? "儲存" : "新增"}
              </Button>
            </DrawerFooter>
          </DrawerContent>
        </Drawer>
      ) : (
        <Dialog open={showAddDialog} onOpenChange={setShowAddDialog}>
          <DialogContent className="w-[95vw] max-w-[420px] rounded-sm p-0 gap-0">
            <DialogHeader className="px-5 pt-5 pb-3">
              <DialogTitle className="font-serif text-lg text-foreground">
                {editingEvent ? "編輯事件" : isAdminMode ? "新增學校事件" : "新增私人事件"}
              </DialogTitle>
              {isAdminMode && !editingEvent?.isPrivate && (
                <DialogDescription className="text-[11px] text-amber-600 font-light">
                  此事件將公開給所有使用者
                </DialogDescription>
              )}
            </DialogHeader>

            <div className="px-5 py-4 space-y-4 border-t border-dashed border-border max-h-[60vh] overflow-y-auto">
              <EventFormFields
                isAdminMode={isAdminMode}
                editingEvent={editingEvent}
                newTitle={newTitle}
                setNewTitle={setNewTitle}
                newCategory={newCategory}
                setNewCategory={setNewCategory}
                newTargetAudience={newTargetAudience}
                setNewTargetAudience={setNewTargetAudience}
                newDate={newDate}
                setNewDate={setNewDate}
                newEndDate={newEndDate}
                setNewEndDate={setNewEndDate}
                newStartTime={newStartTime}
                setNewStartTime={setNewStartTime}
                newEndTime={newEndTime}
                setNewEndTime={setNewEndTime}
                newDescription={newDescription}
                setNewDescription={setNewDescription}
              />
            </div>

            <DialogFooter className="px-5 py-3 border-t border-border flex gap-2">
              <Button
                variant="outline"
                onClick={() => { setShowAddDialog(false); setEditingEvent(null); }}
                className="flex-1 rounded-sm"
              >
                取消
              </Button>
              <Button
                onClick={handleSaveEvent}
                disabled={!newTitle.trim() || !newDate || isSaving}
                className={`flex-1 rounded-sm ${
                  isAdminMode && !editingEvent?.isPrivate ? "bg-amber-500 hover:bg-amber-600" : ""
                }`}
              >
                {isSaving ? "儲存中..." : editingEvent ? "儲存" : "新增"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}

      {/* A端：管理員授權彈窗 */}
      <AdminAuthModal
        open={showAuthModal}
        onOpenChange={setShowAuthModal}
        deviceId={deviceId}
      />

      {/* 白名單管理 Drawer */}
      <AdminWhitelistDrawer
        open={showWhitelistDrawer}
        onOpenChange={setShowWhitelistDrawer}
      />
    </div>
  );
}