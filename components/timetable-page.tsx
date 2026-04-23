"use client";

import { useState, useEffect, useCallback, useRef, use } from "react";
import {
  UserPlus,
  LogOut,
  X,
  Share2,
  Copy,
  Check,
  ChevronLeft,
  ChevronRight,
  FileText,
  ClipboardList,
  RefreshCw,
  Lock,
  Pencil,
  Save,
  Trash2,
} from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { SkeletonBlock } from "./skeleton-block";

import type { NoteCategory, NoteCategoryMeta, privateNote } from "@/lib/types/timetable";
import type { WeekSchedule, CourseNote } from "@/lib/types/timetable";
import type { JoinClassRequest, JoinClassResponse } from "@/lib/types/api";
import type { FetchTimetableRequest, FetchTimetableResponse, SaveTimetableRequest, SaveTimetableResponse, GenerateCodeRequest, GenerateCodeResponse } from "@/lib/types/api";

import {
  fetchTimetable,
  saveTimetable,
  joinClass,
  leaveClass,
  generateClassCode,
  addTimetableNote,
  getLocalPrivateNotes,
  saveLocalPrivateNotes,
  getLocalUserProfile,
} from "@/lib/api-client";
import { syncTimetableReminders } from "@/lib/reminders";
import { syncWidgetData } from "@/lib/timetable-widget";

// --- UI Constants ---
const WEEKDAYS = ["一", "二", "三", "四", "五"] as const;
const WEEKDAY_FULL = ["週一", "週二", "週三", "週四", "週五"] as const;

const PERIODS = [
  { label: "1", time: "08:05 - 08:55" },
  { label: "2", time: "09:05 - 09:55" },
  { label: "3", time: "10:15 - 11:05" },
  { label: "4", time: "11:15 - 12:05" },
  { label: "午", time: "12:05 - 13:00" },
  { label: "5", time: "13:10 - 14:00" },
  { label: "6", time: "14:10 - 15:00" },
  { label: "7", time: "15:10 - 16:00" },
  { label: "8", time: "16:10 - 17:00" },
] as const;

const NOTE_CATEGORIES: NoteCategoryMeta[] = [
  { id: "exam", label: "考試", color: "text-red-600", bg: "bg-red-50 border-red-200 text-red-700" },
  { id: "swap", label: "調課", color: "text-amber-600", bg: "bg-amber-50 border-amber-200 text-amber-700" },
  { id: "homework", label: "作業截止", color: "text-blue-600", bg: "bg-blue-50 border-blue-200 text-blue-700" },
  {id: "other", label: "其他", color: "text-green-600", bg: "bg-green-50 border-green-200 text-green-700" },
  { id: "private", label: "私人", color: "text-violet-600", bg: "bg-violet-50 border-violet-200 text-violet-700" },
];

const NOTE_ICONS: Record<NoteCategory, typeof FileText> = {
  exam: ClipboardList,
  swap: RefreshCw,
  homework: FileText,
  other: Pencil,
  private: Lock,
};

function getCategoryMeta(cat: NoteCategory): NoteCategoryMeta {
  return NOTE_CATEGORIES.find((c) => c.id === cat)!;
}

// 計算本週某天的具體日期字串 (YYYY-MM-DD)
const getDayDate = (dayIndex: number) => {
  const today = new Date();
  const day = today.getDay(); // 0 是週日
  const diff = today.getDate() - (day === 0 ? 6 : day - 1) + dayIndex;
  const targetDate = new Date(today.setDate(diff));
  return targetDate.toISOString().split('T')[0];
};

/**
 * 根據星期索引與週次偏移量，計算具體的日期 (YYYY-MM-DD)
 * @param dayIndex 星期幾的索引 (0=週一, 1=週二...)
 * @param weekOffset 目前週次的偏移 (0=本週, 1=下週, -1=上週)
 */
const getDayDateWithOffset = (dayIndex: number, weekOffset: number) => {
  const today = new Date();
  const dayOfWeek = today.getDay(); // 0 是週日
  // 計算今天距離「本週一」差幾天 (若今天是週日(0)，則 diff 是 -6)
  const diffToMonday = dayOfWeek === 0 ? -6 : 1 - dayOfWeek;
  
  const targetDate = new Date(today);
  // 設定日期：今天 + 修正到週一的差 + (週偏移 * 7) + 星期索引
  targetDate.setDate(today.getDate() + diffToMonday + (weekOffset * 7) + dayIndex);
  
  // 使用本地時區格式化為 YYYY-MM-DD
  const year = targetDate.getFullYear();
  const month = String(targetDate.getMonth() + 1).padStart(2, '0');
  const date = String(targetDate.getDate()).padStart(2, '0');
  
  return `${year}-${month}-${date}`;
};

// Private notes localStorage type
type PrivateNoteStore = Record<string, Record<number, privateNote[]>>;

interface TimetablePageProps {
  deviceId: string;
}

export function TimetablePage({ deviceId }: TimetablePageProps) {
  const [loading, setLoading] = useState(true);
  const [schedule, setSchedule] = useState<WeekSchedule>({});
  const [className, setClassName] = useState("載入中...");
  const [defaultRoom, setDefaultRoom] = useState("");

  // Dialogs
  const [showJoinDialog, setShowJoinDialog] = useState(false);
  const [showShareDialog, setShowShareDialog] = useState(false);
  const [joinCode, setJoinCode] = useState("");
  const [isGenerating, setIsGenerating] = useState(false);
  const [inviteCode, setInviteCode] = useState<string | null>(null);
  const [codeCopied, setCodeCopied] = useState(false);
  const [joining, setJoining] = useState(false);
  const [showLeaveDialog, setShowLeaveDialog] = useState(false);

  // Detail bottom sheet
  const [detailSheet, setDetailSheet] = useState<{ day: string; periodIdx: number } | null>(null);
  const [newNoteText, setNewNoteText] = useState("");
  const [newNoteCategory, setNewNoteCategory] = useState<NoteCategory>("private");
  const [privateNotes, setPrivateNotes] = useState<PrivateNoteStore>({});

  // Editing mode
  const [isEditing, setIsEditing] = useState(false);
  const [editCell, setEditCell] = useState<{ day: string; periodIdx: number } | null>(null);
  const [editSubject, setEditSubject] = useState("");
  const [editTeacher, setEditTeacher] = useState("");
  const [editRoom, setEditRoom] = useState("");
  const [isSubmittingNote, setIsSubmittingNote] = useState(false);

  // Week navigation
  const [currentWeekOffset, setCurrentWeekOffset] = useState(0);
  const scrollRef = useRef<HTMLDivElement>(null);

  // Auto-save debounce ref
  const saveTimerRef = useRef<NodeJS.Timeout | null>(null);
  const [saveStatus, setSaveStatus] = useState<"idle" | "saving" | "saved">("idle");

  // --- Load data ---
  useEffect(() => {
    const initializeData = async () => {
      setLoading(true);
      
      // 優先處理本地快取 (立即顯示) ---
      const loadedPrivateNotes = getLocalPrivateNotes();
      setPrivateNotes(loadedPrivateNotes);
      
      const storedInviteCode = localStorage.getItem("invite_code");
      const cacheRaw = localStorage.getItem("cache_timetable");
      
      if (cacheRaw) {
        try {
          const cached = JSON.parse(cacheRaw);
          setSchedule(cached.schedule || {});
          setClassName(cached.class_name || "我的課表");
          setDefaultRoom(cached.default_room || "");

          // 如果有邀請碼，強制對齊雲端 DB ---
          const activeCode = inviteCode || storedInviteCode;
          if (activeCode) {
            try {
              // 設定目前的邀請碼狀態
              if (!inviteCode) setInviteCode(activeCode);

              // 強制從 DB 抓取最新資料
              const res = await fetchTimetable({ invite_code: activeCode });
              
              if (res && res.schedule) {
                // 以雲端為準：覆蓋本地狀態 ---
                setSchedule(res.schedule);
                setClassName(res.class_name || "我的課表");
                setDefaultRoom(res.default_room || "");

                // 同步課表到桌面 Widget
                syncWidgetData(res.schedule, res.class_name || "我的課表");
                
                // 更新本地快取，確保下次載入時快取就是這份新的
                const updatedCache = {
                  ...res,
                  invite_code: activeCode,
                  updated_at: new Date().toISOString(),
                };
                localStorage.setItem("cache_timetable", JSON.stringify(updatedCache));
              }
            } catch (error) {
              console.error("同步雲端失敗:", error);
              setClassName((prev) => prev === "載入中..." ? "我的課表 (離線模式)" : prev);
            }
          }
        } catch (e) {
          console.error("快取解析失敗", e);
        }
      }else {
        setClassName("我的課表");
        setDefaultRoom("原班");
        setSchedule({});
      }

      
      
      setLoading(false);
    };

    initializeData();
  // 這裡移除 [inviteCode] 依賴，改由手動觸發或保持空陣列，防止無限迴圈
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // --- 同步課表提醒 (schedule 或 privateNotes 變化時自動比對) ---
  useEffect(() => {
    if (loading) return;
    // 使用 debounce 避免頻繁觸發
    const timer = setTimeout(() => {
      syncTimetableReminders(schedule, privateNotes).catch((err) =>
        console.error("[TimetablePage] syncTimetableReminders error:", err)
      );
    }, 2000);
    return () => clearTimeout(timer);
  }, [schedule, privateNotes, loading]);

  // --- Auto-save schedule changes ---
  const triggerAutoSave = useCallback(
    (newSchedule: WeekSchedule, newClassName: string, newDefaultRoom: string) => {
      if (newClassName === "載入中..." || !newSchedule || Object.keys(newSchedule).length === 0) {
        return;
      }

      if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
      setSaveStatus("saving");

      saveTimerRef.current = setTimeout(async () => {
        try {
          const payload = {
            schedule: newSchedule,
            class_name: newClassName,
            default_room: newDefaultRoom,
            updated_at: new Date().toISOString(),
          };

          localStorage.setItem("cache_timetable", JSON.stringify(payload));

          // 同步課表到桌面 Widget
          syncWidgetData(newSchedule, newClassName);

          console.log("inviteCode in triggerAutoSave:", inviteCode);
          if (inviteCode) {
            console.log("Auto-saving to cloud...", payload);
            await saveTimetable({
              invite_code: inviteCode,
              schedule: newSchedule,
              class_name: newClassName,
            });
          }
          setSaveStatus("saved");
          setTimeout(() => setSaveStatus("idle"), 2000);
        } catch (error) {
          setSaveStatus("idle");
        }
      }, 1500);
    },
    [inviteCode]
  );

  // --- Week dates ---
  function getWeekDates(offset: number) {
    const today = new Date();
    const dayOfWeek = today.getDay();
    const diff = dayOfWeek === 0 ? -6 : 1 - dayOfWeek;
    const monday = new Date(today);
    monday.setDate(today.getDate() + diff + offset * 7);
    return Array.from({ length: 5 }, (_, i) => {
      const d = new Date(monday);
      d.setDate(monday.getDate() + i);
      return d;
    });
  }

  const weekDates = getWeekDates(currentWeekOffset);

  function isToday(date: Date) {
    const t = new Date();
    return date.getDate() === t.getDate() && date.getMonth() === t.getMonth() && date.getFullYear() === t.getFullYear();
  }

  // --- Notes ---
  const getCellNotes = useCallback(
    (day: string, periodIdx: number): CourseNote[] => {
      const course = schedule[day]?.[periodIdx];
      const publicNotes = course?.notes || [];
      const privates = (privateNotes[day]?.[periodIdx] || []).map((n, i) => ({
        id: `priv-${i}`,
        text: n.text,
        category: n.category,
        source: "private" as const,
        date: n.date,
      }));
      return [...publicNotes, ...privates];
    },
    [schedule, privateNotes]
  );

  const openDetail = useCallback((day: string, periodIdx: number) => {
    setNewNoteText("");
    setNewNoteCategory("private");
    setDetailSheet({ day, periodIdx });
  }, []);

  const addNote = useCallback(async () => {
    if (!detailSheet || !newNoteText.trim()) return;
    setIsSubmittingNote(true);
    const { day, periodIdx } = detailSheet;
    const dayIndex = WEEKDAYS.indexOf(day as any);
    const targetDate = getDayDateWithOffset(dayIndex, currentWeekOffset);
    
    // 如果是私人備註，只存到本地
    if (newNoteCategory === "private") {
      const store = { ...privateNotes };
      if (!store[detailSheet.day]) store[detailSheet.day] = {};
      if (!store[detailSheet.day][detailSheet.periodIdx]) store[detailSheet.day][detailSheet.periodIdx] = [];
      store[detailSheet.day][detailSheet.periodIdx] = [
        ...store[detailSheet.day][detailSheet.periodIdx],
        { text: newNoteText.trim(), category: newNoteCategory, date: targetDate },
      ];
      saveLocalPrivateNotes(store);
      setPrivateNotes(store);
      setNewNoteText("");
      setIsSubmittingNote(false);
      // 立即同步提醒
      syncTimetableReminders(schedule, store).catch(console.error);
      return;
    }

    // 如果是公開備註且有邀請碼，同步到雲端
    if (inviteCode) {
      try {
        console.log("Adding note to cloud...")
        const res = await addTimetableNote({
          invite_code: inviteCode,
          day: detailSheet.day,
          period_idx: detailSheet.periodIdx,
          note: {
            text: newNoteText.trim(),
            category: newNoteCategory,
            date: targetDate,
          },
        });

        if (res.success) {
          // 重新抓取課表以更新 UI
          const data = await fetchTimetable({ invite_code: inviteCode });
          setSchedule(data.schedule);
          setNewNoteText("");
          // 立即同步提醒（使用最新的 schedule）
          syncTimetableReminders(data.schedule, privateNotes).catch(console.error);
        }
        setIsSubmittingNote(false);
      } catch (error) {
        console.error("新增備註失敗:", error);
        setIsSubmittingNote(false);
      }
    } else {
      // 沒有邀請碼但想加公開備註，先存到本地 schedule
      const newSchedule = { ...schedule };
      const dayArr = [...(newSchedule[detailSheet.day] || [])];
      
      while (dayArr.length <= detailSheet.periodIdx) {
        dayArr.push({ subject: "", teacher: "", room: "", notes: [] });
      }

      if (!dayArr[detailSheet.periodIdx].notes) {
        dayArr[detailSheet.periodIdx].notes = [];
      }

      dayArr[detailSheet.periodIdx].notes.push({
        id: `note-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
        text: newNoteText.trim(),
        category: newNoteCategory,
        source: "public",
        date: targetDate,
      });

      newSchedule[detailSheet.day] = dayArr;
      setSchedule(newSchedule);
      setNewNoteText("");
      
      // 觸發自動儲存到本地快取
      triggerAutoSave(newSchedule, className, defaultRoom);
      setIsSubmittingNote(false);
      // 立即同步提醒（使用新的 schedule）
      syncTimetableReminders(newSchedule, privateNotes).catch(console.error);
    }
  }, [detailSheet, newNoteText, newNoteCategory, privateNotes, inviteCode, schedule, className, defaultRoom, triggerAutoSave]);

  const removeNote = useCallback(
    async (noteId: string, source: "public" | "private") => {
      if (!detailSheet) return;
      const { day, periodIdx } = detailSheet;

      if (source === "private") {
        // 私人備註：過濾掉該 ID
        const store = { ...privateNotes };
        if (store[day]?.[periodIdx]) {
          store[day][periodIdx] = store[day][periodIdx].filter((_, i) => `priv-${i}` !== noteId);
          localStorage.setItem("private_notes", JSON.stringify(store));
          saveLocalPrivateNotes(store);
          setPrivateNotes(store);
        }
      } else {
        // 公用備註：過濾掉後端 ID
        const newSchedule = { ...schedule };
        if (newSchedule[day]?.[periodIdx]?.notes) {
          // 直接比對 ID
          newSchedule[day][periodIdx].notes = newSchedule[day][periodIdx].notes.filter(n => n.id !== noteId);
          setSchedule(newSchedule);
          
          // 同步到雲端 (覆寫整個 schedule)
          if (inviteCode) {
            await saveTimetable({
              invite_code: inviteCode,
              schedule: newSchedule,
              class_name: className,
            });
          }
          localStorage.setItem("cache_timetable", JSON.stringify({
            schedule: newSchedule,
            updated_at: new Date().toISOString(),
          }));
        }
      }
    },
    [detailSheet, privateNotes, schedule, inviteCode, className]
  );

  // --- Course editing ---
  const openEditCell = useCallback(
    (day: string, periodIdx: number) => {
      const course = schedule[day]?.[periodIdx];
      setEditCell({ day, periodIdx });
      setEditSubject(course?.subject || "");
      setEditTeacher(course?.teacher || "");
      setEditRoom(course?.room || defaultRoom);
    },
    [schedule, defaultRoom]
  );

  const saveEditCell = useCallback(() => {
    if (!editCell) return;
    const newSchedule = { ...schedule };
    const dayArr = [...(newSchedule[editCell.day] || [])];

    while (dayArr.length <= editCell.periodIdx) {
      dayArr.push({ subject: "", teacher: "", room: "", notes: [] });
    }

    dayArr[editCell.periodIdx] = {
      ...dayArr[editCell.periodIdx],
      subject: editSubject.trim(),
      teacher: editTeacher.trim(),
      room: editRoom.trim(),
    };
    newSchedule[editCell.day] = dayArr;

    setSchedule(newSchedule);
    setEditCell(null);
    triggerAutoSave(newSchedule, className, defaultRoom);
  }, [editCell, editSubject, editTeacher, editRoom, schedule, triggerAutoSave, className, defaultRoom]);

  const clearEditCell = useCallback(() => {
    if (!editCell) return;
    const newSchedule = { ...schedule };
    const dayArr = [...(newSchedule[editCell.day] || [])];
    if (dayArr[editCell.periodIdx]) {
      dayArr[editCell.periodIdx] = { subject: "", teacher: "", room: "", notes: [] };
      newSchedule[editCell.day] = dayArr;
      setSchedule(newSchedule);
      setEditCell(null);
      triggerAutoSave(newSchedule, className, defaultRoom);
    }
  }, [editCell, schedule, triggerAutoSave, className, defaultRoom]);

  // --- Class code ---
  const handleGenerateCode = useCallback(async () => {
    if (isGenerating) return;
    setIsGenerating(true);

    const res = await generateClassCode({ device_id: deviceId , schedule: schedule, class_name: className }) as GenerateCodeResponse;
    if (res.success) {
      setInviteCode(res.invite_code);
      localStorage.setItem("invite_code", res.invite_code);
    }
    setIsGenerating(false);
  }, [deviceId, schedule, className, isGenerating]);

  const handleCopyCode = useCallback(() => {
    if (inviteCode) {
      navigator.clipboard.writeText(inviteCode);
      setCodeCopied(true);
      setTimeout(() => setCodeCopied(false), 2000);
    }
  }, [inviteCode]);

  const handleJoin = useCallback(async () => {
    if (!joinCode || joinCode.length < 7) return;
    setJoining(true);
    try {
      let code = joinCode
      if ( joinCode.length === 6){
        code = joinCode.slice(0,3) + "-" + joinCode.slice(3);
      }
      console.log("Attempting to join class with code:", code);
      const res = await joinClass({ invite_code: code });
      if (res.success && res.class_name) {
        setClassName(res.class_name);
        // Refetch timetable after joining
        const data = await fetchTimetable({ invite_code: code });
        setSchedule(data.schedule);
        localStorage.setItem("invite_code", code);
        setInviteCode(code);
        // 同步到桌面 Widget
        syncWidgetData(data.schedule, res.class_name);
      }
    } finally {
      setJoining(false);
      setShowJoinDialog(false);
      setJoinCode("");
    }
  }, [joinCode]);

  const handleLeaveClass = useCallback(async () => {
    // 通知後端刪除課表（僅建立者會成功刪除）
    if (inviteCode) {
      try {
        await leaveClass({ invite_code: inviteCode, device_id: deviceId });
      } catch (e) {
        console.error("[TimetablePage] leaveClass error:", e);
      }
    }
    localStorage.removeItem("invite_code");
    localStorage.removeItem("cache_timetable");
    localStorage.removeItem("private_notes");
    setInviteCode(null);
    setSchedule({});
    setClassName("我的課表");
    setDefaultRoom("");
    setPrivateNotes({});
    setShowLeaveDialog(false);
    syncWidgetData({}, "我的課表");
  }, [inviteCode, deviceId]);

  // Load class code from localStorage
  useEffect(() => {
    const stored = localStorage.getItem("invite_code");
    if (stored) setInviteCode(stored);
  }, []);

  // Current detail
  const detailCourse = detailSheet ? schedule[detailSheet.day]?.[detailSheet.periodIdx] : null;

  // 先取得目前格子的所有備註（公開 + 私人）
  const allCellNotes = detailSheet ? getCellNotes(detailSheet.day, detailSheet.periodIdx) : [];
  // 計算目前點擊的格子對應的具體日期
  const currentCellDate = detailSheet 
    ? getDayDateWithOffset(WEEKDAYS.indexOf(detailSheet.day as any), currentWeekOffset)
    : "";
  // 過濾：只顯示日期相符的備註 (且相容舊的沒日期的備註)
  const displayNotes = allCellNotes.filter(note => {
    if (!note.date) return true; // 為了相容性，沒有日期的視為永久備註
    return note.date === currentCellDate;
  });

  const detailPeriod = detailSheet ? PERIODS[detailSheet.periodIdx] : null;

  const weekLabel = `${weekDates[0].getMonth() + 1}/${weekDates[0].getDate()} - ${weekDates[4].getMonth() + 1}/${weekDates[4].getDate()}`;

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <header className="px-5 pt-12 pb-2 flex items-center justify-between">
        <div>
          <h1 className="font-serif text-xl font-semibold text-foreground">課表</h1>
          <div className="flex items-center gap-2 mt-0.5">
            {isEditing ? (
              <input
                type="text"
                value={className}
                onChange={(e) => {
                  const newName = e.target.value;
                  setClassName(newName);
                  triggerAutoSave(schedule, newName, defaultRoom);
                }}
                className="bg-transparent border-none text-lg font-bold focus:outline-none focus:ring-0 w-full p-0 h-auto"
                placeholder="輸入班級名稱..."
              />
            ) : (
              <p className="text-xs text-muted-foreground font-light">{className}</p>
            )}
            
            {saveStatus === "saving" && (
              <span className="text-[9px] text-muted-foreground/40 font-light animate-pulse">儲存中...</span>
            )}
            {saveStatus === "saved" && (
              <span className="text-[9px] text-emerald-600/60 font-light flex items-center gap-0.5">
                <Check size={9} /> 已儲存
              </span>
            )}
          </div>
        </div>
        <div className="flex items-center gap-1.5">
          {/* Edit toggle */}
          <button
            onClick={() => setIsEditing((e) => !e)}
            className={`flex items-center gap-1 px-2 py-1.5 border rounded-sm text-xs transition-colors ${
              isEditing
                ? "border-foreground bg-foreground text-background"
                : "border-border text-foreground/70 hover:bg-secondary"
            }`}
            aria-label={isEditing ? "結束編輯" : "編輯課表"}
          >
            <Pencil size={12} strokeWidth={1.5} />
            <span className="hidden min-[340px]:inline">{isEditing ? "完成" : "編輯"}</span>
          </button>
          <button
            onClick={() => setShowShareDialog(true)}
            className="flex items-center gap-1 px-2 py-1.5 border border-border rounded-sm text-xs text-foreground/70 hover:bg-secondary transition-colors"
            aria-label="分享班級代碼"
          >
            <Share2 size={12} strokeWidth={1.5} />
          </button>
          {inviteCode ? (
            <button
              onClick={() => setShowLeaveDialog(true)}
              className="flex items-center gap-1 px-2 py-1.5 border border-red-200 rounded-sm text-xs text-red-500 hover:bg-red-50 transition-colors"
              aria-label="退出班級"
            >
              <LogOut size={12} strokeWidth={1.5} />
            </button>
          ) : (
            <button
              onClick={() => setShowJoinDialog(true)}
              className="flex items-center gap-1 px-2 py-1.5 border border-border rounded-sm text-xs text-foreground/70 hover:bg-secondary transition-colors"
              aria-label="加入班級"
            >
              <UserPlus size={12} strokeWidth={1.5} />
            </button>
          )}
        </div>
      </header>

      {/* Edit mode hint */}
      {isEditing && (
        <div className="mx-5 mb-2 px-3 py-2 bg-macaron-yellow border border-amber-200/60 rounded-sm">
          <p className="text-[11px] text-amber-800 font-light">
            編輯模式：點擊任何格子設定該節課程。空白格也可以點擊新增。
          </p>
        </div>
      )}

      {/* Week navigation */}
      <div className="px-5 pb-2 flex items-center justify-between">
        <button
          onClick={() => setCurrentWeekOffset((p) => p - 1)}
          className="p-1.5 text-muted-foreground hover:text-foreground transition-colors"
          aria-label="上一週"
        >
          <ChevronLeft size={16} />
        </button>
        <div className="flex flex-col items-center">
          <span className="text-xs text-foreground font-medium">{weekLabel}</span>
          {currentWeekOffset !== 0 && (
            <button
              onClick={() => setCurrentWeekOffset(0)}
              className="text-[10px] text-muted-foreground hover:text-foreground transition-colors mt-0.5"
            >
              回到本週
            </button>
          )}
        </div>
        <button
          onClick={() => setCurrentWeekOffset((p) => p + 1)}
          className="p-1.5 text-muted-foreground hover:text-foreground transition-colors"
          aria-label="下一週"
        >
          <ChevronRight size={16} />
        </button>
      </div>

      {/* Week grid */}
      <div className="flex-1 overflow-y-auto px-3 pb-24" ref={scrollRef}>
        {loading ? (
          <div className="space-y-2 px-2 pt-2">
            {[...Array(9)].map((_, i) => (
              <div key={i} className="flex gap-1.5">
                <SkeletonBlock className="h-12 w-9 flex-shrink-0" />
                {[...Array(5)].map((_, j) => (
                  <SkeletonBlock key={j} className="h-12 flex-1" />
                ))}
              </div>
            ))}
          </div>
        ) : (
          <div className="overflow-x-auto thin-scrollbar">
            <table className="w-full border-collapse min-w-[360px] table-fixed">
              <thead>
                <tr>
                  <th className="w-9 p-1" />
                  {WEEKDAYS.map((day, idx) => {
                    const date = weekDates[idx];
                    const today = isToday(date);
                    return (
                      <th key={day} className={`p-1 text-center w-[calc((100%-40px)/5)] ${today ? "relative" : ""}`}>
                        <div className={`flex flex-col items-center py-1 rounded-sm ${today ? "bg-foreground text-background" : ""}`}>
                          <span className={`text-[10px] font-light ${today ? "text-background/70" : "text-muted-foreground"}`}>{day}</span>
                          <span className={`text-sm font-medium tabular-nums ${today ? "text-background" : "text-foreground"}`}>{date.getDate()}</span>
                        </div>
                      </th>
                    );
                  })}
                </tr>
              </thead>
              <tbody>
                {PERIODS.map((period, periodIdx) => {
                  const isLunch = period.label === "午";
                  if (isLunch) {
                    return (
                      <tr key={`lunch-${periodIdx}`}>
                        <td className="p-1 text-center">
                          <span className="text-[9px] text-muted-foreground/40 font-light">午休</span>
                        </td>
                        <td colSpan={5} className="p-1">
                          <div className="border-t border-dashed border-border/60" />
                        </td>
                      </tr>
                    );
                  }
                  const is8th = period.label === "8";
                  return (
                    <tr key={`period-${periodIdx}`}>
                      <td className="p-1 text-center align-top pt-2">
                        <span className="text-xs font-medium text-foreground/50">{period.label}</span>
                        <span className="block text-[8px] text-muted-foreground/30 font-light mt-0.5">
                          {period.time.split(" - ")[0]}
                        </span>
                      </td>
                      {WEEKDAYS.map((day, dayIdx) => {
                        const course = schedule[day]?.[periodIdx];
                        const rawNotes = getCellNotes(day, periodIdx);
                        const currentCellDate = getDayDateWithOffset(dayIdx, currentWeekOffset);
                        const filteredNotesForCell = rawNotes.filter(note => 
                          !note.date || note.date === currentCellDate
                        );
                        const isEmpty = !course?.subject;
                        const today = isToday(weekDates[dayIdx]);

                        return (
                          <td key={`${day}-${periodIdx}`} className="p-0.5">
                            <button
                              onClick={() => {
                                if (isEditing) {
                                  openEditCell(day, periodIdx);
                                } else if (!isEmpty) {
                                  openDetail(day, periodIdx);
                                }
                              }}
                              className={`w-full h-[3.2rem] rounded-sm p-1.5 text-left transition-all overflow-hidden flex flex-col
                                ${isEmpty
                                  ? isEditing
                                    ? "bg-muted/20 border border-dashed border-border/40 hover:border-foreground/30 cursor-pointer"
                                    : is8th ? "bg-transparent" : "bg-muted/30"
                                  : today
                                    ? "bg-macaron-yellow border border-border/60 hover:shadow-sm active:scale-[0.97]"
                                    : "bg-card border border-border/40 hover:shadow-sm active:scale-[0.97]"
                                }
                                ${isEditing ? "cursor-pointer ring-1 ring-transparent hover:ring-foreground/10" : !isEmpty ? "cursor-pointer" : "cursor-default"}
                              `}
                            >
                              {!isEmpty && (
                                <>
                                  <span className="text-[11px] font-medium text-foreground leading-tight block truncate flex-shrink-0">
                                    {course!.subject}
                                  </span>
                                  <span className="text-[9px] text-muted-foreground/50 font-light block truncate flex-shrink-0">
                                    {course!.room}
                                  </span>
                                  {filteredNotesForCell.length > 0 && (
                                    <div className="flex gap-0.5 mt-0.5 overflow-hidden flex-shrink-0">
                                      {filteredNotesForCell.slice(0, 2).map((note) => {
                                        const meta = getCategoryMeta(note.category);
                                        return (
                                          <span
                                            key={note.id}
                                            className={`text-[7px] px-1 py-px rounded-sm border font-light leading-tight whitespace-nowrap ${meta.bg}`}
                                          >
                                            {meta.label}
                                          </span>
                                        );
                                      })}
                                      {filteredNotesForCell.length > 2 && (
                                        <span className="text-[7px] text-muted-foreground/40 whitespace-nowrap">+{filteredNotesForCell.length - 2}</span>
                                      )}
                                    </div>
                                  )}
                                </>
                              )}
                              {isEmpty && isEditing && (
                                <span className="text-[10px] text-muted-foreground/30 font-light">+</span>
                              )}
                            </button>
                          </td>
                        );
                      })}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        {/* Legend */}
        {!loading && !isEditing && (
          <div className="mt-3 flex flex-wrap items-center justify-center gap-3 text-[10px] text-muted-foreground/50 font-light px-2">
            {NOTE_CATEGORIES.map((cat) => (
              <span key={cat.id} className="flex items-center gap-1">
                <span className={`text-[8px] px-1 py-px rounded-sm border font-light ${cat.bg}`}>{cat.label}</span>
              </span>
            ))}
          </div>
        )}
      </div>

      {/* Detail bottom sheet (view mode) */}
      {detailSheet && detailCourse && detailPeriod && !isEditing && (
        <div
          className="fixed inset-0 bottom-sheet-overlay flex items-end justify-center"
          style={{ zIndex: 60 }}
          onClick={() => setDetailSheet(null)}
        >
          <div
            className="w-full max-w-[450px] bg-card rounded-t-md border-t border-x border-border px-5 pt-4 pb-[max(1.5rem,env(safe-area-inset-bottom))] max-h-[70vh] overflow-y-auto animate-in slide-in-from-bottom duration-300"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="w-8 h-0.5 bg-border mx-auto mb-4 rounded-full" />

            {/* Header */}
            <div className="flex items-start justify-between mb-4">
              <div>
                <h3 className="font-serif text-lg font-semibold text-foreground">{detailCourse.subject}</h3>
                <p className="text-xs text-muted-foreground font-light mt-1">
                  {WEEKDAY_FULL[WEEKDAYS.indexOf(detailSheet.day as (typeof WEEKDAYS)[number])]} 第{detailPeriod.label}節 &middot; {detailPeriod.time}
                </p>
                <div className="flex items-center gap-3 mt-1.5 text-xs text-muted-foreground/60 font-light">
                  {detailCourse.teacher && <span>{detailCourse.teacher}</span>}
                  {detailCourse.room && <span>{detailCourse.room}</span>}
                </div>
              </div>
              <button
                onClick={() => setDetailSheet(null)}
                className="p-1 text-muted-foreground hover:text-foreground transition-colors flex-shrink-0"
                aria-label="關閉"
              >
                <X size={18} />
              </button>
            </div>

            {/* Existing notes */}
            {displayNotes.length > 0 && (
              <div className="space-y-2 mb-4">
                <span className="text-[10px] text-muted-foreground/60 font-light">備註</span>
                {displayNotes.map((note) => {
                  const meta = getCategoryMeta(note.category);
                  return (
                    <div key={note.id} className={`flex items-start justify-between gap-2 rounded-sm border px-3 py-2 ${meta.bg}`}>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm text-foreground">{note.text}</p>
                        <Badge variant="outline" className="text-[9px] mt-1">
                          {meta.label}
                        </Badge>
                      </div>
                      
                      {/* 傳入 note.id 與 note.source */}
                      <button
                        onClick={() => removeNote(note.id, note.source)}
                        className="text-muted-foreground/40 hover:text-destructive transition-colors"
                      >
                        <Trash2 size={14} />
                      </button>
                    </div>
                  );
                })}
              </div>
            )}

            {/* Add new note */}
            <div className="border-t border-dashed border-border pt-3">
              <span className="text-[10px] text-muted-foreground/60 font-light block mb-2">新增備註</span>
              <div className="flex flex-wrap gap-1.5 mb-2">
                {NOTE_CATEGORIES.map((cat) => {
                  const Icon = NOTE_ICONS[cat.id];
                  const isActive = newNoteCategory === cat.id;
                  return (
                    <button
                      key={cat.id}
                      onClick={() => setNewNoteCategory(cat.id)}
                      className={`flex items-center gap-1 px-2 py-1 rounded-sm border text-[11px] transition-all ${
                        isActive ? cat.bg + " font-medium" : "border-border text-muted-foreground font-light hover:border-foreground/20"
                      }`}
                    >
                      <Icon size={11} />
                      {cat.label}
                    </button>
                  );
                })}
              </div>
              <textarea
                value={newNoteText}
                onChange={(e) => setNewNoteText(e.target.value)}
                placeholder="在這裡寫下備註..."
                className="w-full border border-border rounded-sm px-3 py-2 text-sm text-foreground bg-background placeholder:text-muted-foreground/30 resize-none focus:outline-none focus:ring-1 focus:ring-ring"
                rows={2}
              />
              <Button 
                onClick={addNote} 
                disabled={isSubmittingNote || !newNoteText.trim()}
                className="rounded-sm"
              >
                {isSubmittingNote ? (
                  <>
                    <RefreshCw size={14} className="mr-1.5 animate-spin" />
                    儲存中...
                  </>
                ) : (
                  "新增備註"
                )}
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Edit cell dialog */}
      <Dialog open={!!editCell} onOpenChange={(open) => { if (!open) setEditCell(null); }}>
        <DialogContent className="max-w-[360px] rounded-sm p-5">
          <DialogHeader>
            <DialogTitle className="font-serif text-base">
              {editCell
                ? `${WEEKDAY_FULL[WEEKDAYS.indexOf(editCell.day as (typeof WEEKDAYS)[number])]} 第${PERIODS[editCell.periodIdx].label}節`
                : "編輯課程"}
            </DialogTitle>
            <DialogDescription className="text-xs font-light">
              設定這節課的科目、教師與教室
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3 mt-2">
            <div>
              <label className="text-[11px] text-muted-foreground font-light block mb-1">科目名稱</label>
              <input
                type="text"
                value={editSubject}
                onChange={(e) => setEditSubject(e.target.value)}
                placeholder="例如：國文"
                className="w-full border border-border rounded-sm px-3 py-2 text-sm text-foreground bg-background placeholder:text-muted-foreground/30 focus:outline-none focus:ring-1 focus:ring-ring"
                autoFocus
              />
            </div>
            <div>
              <label className="text-[11px] text-muted-foreground font-light block mb-1">授課教師</label>
              <input
                type="text"
                value={editTeacher}
                onChange={(e) => setEditTeacher(e.target.value)}
                placeholder="例如：王老師"
                className="w-full border border-border rounded-sm px-3 py-2 text-sm text-foreground bg-background placeholder:text-muted-foreground/30 focus:outline-none focus:ring-1 focus:ring-ring"
              />
            </div>
            <div>
              <label className="text-[11px] text-muted-foreground font-light block mb-1">教室</label>
              <input
                type="text"
                value={editRoom}
                onChange={(e) => setEditRoom(e.target.value)}
                placeholder={`預設：${defaultRoom}`}
                className="w-full border border-border rounded-sm px-3 py-2 text-sm text-foreground bg-background placeholder:text-muted-foreground/30 focus:outline-none focus:ring-1 focus:ring-ring"
              />
            </div>
          </div>
          <div className="flex flex-row gap-3 mt-4">
            <Button variant="outline" className="flex-1 rounded-xl h-12 text-sm font-medium bg-background shadow-sm border-border/80 active:scale-[0.97] transition-all" onClick={clearEditCell}>
              <Trash2 size={15} className="mr-1.5" /> 清除
            </Button>
            <Button className="flex-1 rounded-xl h-12 text-sm font-medium shadow-md active:scale-[0.97] transition-all" onClick={saveEditCell}>
              <Save size={15} className="mr-1.5" /> 儲存
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Join class dialog */}
      <Dialog open={showJoinDialog} onOpenChange={setShowJoinDialog}>
        <DialogContent className="max-w-[340px] rounded-sm p-6">
          <DialogHeader>
            <DialogTitle className="font-serif text-base">加入班級</DialogTitle>
            <DialogDescription className="text-xs font-light">
              請輸入老師或同學提供的 7 位邀請代碼
            </DialogDescription>
          </DialogHeader>
          <input
            type="text"
            value={joinCode}
            onChange={(e) => {
              const v = e.target.value.replace(/[^a-zA-Z0-9-]/g, "");
              if (v.length <= 8) setJoinCode(v);
            }}
            placeholder="例如：z2a-Pxq5"
            className="w-full border border-border rounded-sm px-3 py-2.5 text-center text-base font-mono text-foreground bg-background placeholder:text-muted-foreground/30 tracking-[0.3em] focus:outline-none focus:ring-1 focus:ring-ring"
            maxLength={8}
            autoFocus
          />
          <DialogFooter>
            <Button disabled={joinCode.length < 7 || joining} className="w-full rounded-sm" onClick={handleJoin}>
              {joining ? "加入中..." : "確認加入"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Share / Generate code dialog */}
      <Dialog open={showShareDialog} onOpenChange={setShowShareDialog}>
        <DialogContent className="max-w-[340px] rounded-sm p-6">
          <DialogHeader>
            <DialogTitle className="font-serif text-base">班級代碼</DialogTitle>
            <DialogDescription className="text-xs font-light">
              分享此代碼讓其他同學加入你的課表
            </DialogDescription>
          </DialogHeader>
          {inviteCode ? (
            <div className="space-y-3">
              <div className="bg-secondary/60 border border-border rounded-sm px-4 py-3 text-center">
                {/* 如果正在生成中，讓文字變模糊或顯示載入感 */}
                <span className={`text-xl font-mono font-semibold text-foreground tracking-[0.3em] ${isGenerating ? "animate-pulse opacity-50" : ""}`}>
                  {inviteCode}
                </span>
              </div>
              
              <Button variant="outline" className="w-full rounded-sm bg-transparent" onClick={handleCopyCode} disabled={isGenerating}>
                {codeCopied ? <Check size={14} className="mr-1.5" /> : <Copy size={14} className="mr-1.5" />}
                {codeCopied ? "已複製" : "複製代碼"}
              </Button>
            </div>
          ) : (
            <div className="space-y-3">
              <p className="text-sm text-muted-foreground font-light text-center py-4">你還沒有生成班級代碼</p>
              <Button 
                className="w-full rounded-sm" 
                onClick={handleGenerateCode} 
                disabled={isGenerating || !!inviteCode}
              >
                {isGenerating ? (
                  <>
                    <RefreshCw size={14} className="mr-1.5 animate-spin" />
                    生成中...
                  </>
                ) : (
                  "生成班級代碼"
                )}
              </Button>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Leave class confirmation dialog */}
      <Dialog open={showLeaveDialog} onOpenChange={setShowLeaveDialog}>
        <DialogContent className="max-w-[340px] rounded-sm p-6">
          <DialogHeader>
            <DialogTitle className="font-serif text-base">退出班級</DialogTitle>
            <DialogDescription className="text-xs font-light">
              如果你是創建者，退出後將清除課表及所有備註資料，此操作無法復原。
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="flex gap-2 mt-2">
            <Button variant="outline" className="flex-1 rounded-sm" onClick={() => setShowLeaveDialog(false)}>
              取消
            </Button>
            <Button variant="destructive" className="flex-1 rounded-sm" onClick={handleLeaveClass}>
              確認退出
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
