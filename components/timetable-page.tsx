"use client";

import { useState, useEffect, useCallback, useRef, use } from "react";
import {
  UserPlus,
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

import type { NoteCategory, NoteCategoryMeta } from "@/lib/types/timetable";
import type { WeekSchedule, CourseNote } from "@/lib/types/timetable";
import type { JoinClassRequest, JoinClassResponse } from "@/lib/types/api";
import type { FetchTimetableRequest, FetchTimetableResponse, SaveTimetableRequest, SaveTimetableResponse, GenerateCodeRequest, GenerateCodeResponse } from "@/lib/types/api";

import {
  fetchTimetable,
  saveTimetable,
  joinClass,
  generateClassCode,
  getLocalPrivateNotes,
  saveLocalPrivateNotes,
  getLocalUserProfile,
} from "@/lib/api-client";

// --- UI Constants ---
const WEEKDAYS = ["一", "二", "三", "四", "五"] as const;
const WEEKDAY_FULL = ["週一", "週二", "週三", "週四", "週五"] as const;

const PERIODS = [
  { label: "1", time: "08:10 - 09:00" },
  { label: "2", time: "09:10 - 10:00" },
  { label: "3", time: "10:10 - 11:00" },
  { label: "4", time: "11:10 - 12:00" },
  { label: "午", time: "12:00 - 13:00" },
  { label: "5", time: "13:10 - 14:00" },
  { label: "6", time: "14:10 - 15:00" },
  { label: "7", time: "15:10 - 16:00" },
  { label: "8", time: "16:20 - 17:00" },
] as const;

const NOTE_CATEGORIES: NoteCategoryMeta[] = [
  { id: "exam", label: "考試", color: "text-red-600", bg: "bg-red-50 border-red-200 text-red-700" },
  { id: "swap", label: "調課", color: "text-amber-600", bg: "bg-amber-50 border-amber-200 text-amber-700" },
  { id: "homework", label: "作業截止", color: "text-blue-600", bg: "bg-blue-50 border-blue-200 text-blue-700" },
  { id: "private", label: "私人", color: "text-violet-600", bg: "bg-violet-50 border-violet-200 text-violet-700" },
];

const NOTE_ICONS: Record<NoteCategory, typeof FileText> = {
  exam: ClipboardList,
  swap: RefreshCw,
  homework: FileText,
  private: Lock,
};

function getCategoryMeta(cat: NoteCategory): NoteCategoryMeta {
  return NOTE_CATEGORIES.find((c) => c.id === cat)!;
}

// Private notes localStorage type
type PrivateNoteStore = Record<string, Record<number, { text: string; category: NoteCategory }[]>>;

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
      
      const storedInviteCode = localStorage.getItem("invite_code");
      if (storedInviteCode) setInviteCode(storedInviteCode);

      const cacheRaw = localStorage.getItem("cache_timetable");
      if (cacheRaw) {
        try {
          const cached = JSON.parse(cacheRaw);
          const parsed = cached; 
          setSchedule(parsed.schedule || {});
          setClassName(parsed.class_name || "我的課表");
          setDefaultRoom(parsed.default_room || "");
        } catch (e) {
          console.error("Cache parse error", e);
        }
      }

      const codeToUse = inviteCode || storedInviteCode;
      if (codeToUse) {
        try {
          const data = await fetchTimetable({ invite_code: codeToUse });
          if (data && data.schedule) {
            setSchedule(data.schedule);
            setClassName(data.class_name || "我的課表");
            setDefaultRoom(data.default_room || "");
            // 儲存時建議統一格式
            localStorage.setItem("cache_timetable", JSON.stringify(data));
          }
        } catch (error) {
          setClassName((prev) => prev === "載入中..." ? "我的課表 (離線模式)" : prev);
        }
      } else {
        // 若無代碼也無快取，設定預設值
        if (!cacheRaw) {
          setClassName("我的課表");
          setSchedule({});
        }
      }
      setLoading(false);
    };

    initializeData();
  }, [inviteCode]); // 當 inviteCode 變動（如加入班級成功）時重新觸發

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

          if (inviteCode) {
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

  const addNote = useCallback(() => {
    if (!detailSheet || !newNoteText.trim()) return;
    const store = { ...privateNotes };
    if (!store[detailSheet.day]) store[detailSheet.day] = {};
    if (!store[detailSheet.day][detailSheet.periodIdx]) store[detailSheet.day][detailSheet.periodIdx] = [];
    store[detailSheet.day][detailSheet.periodIdx] = [
      ...store[detailSheet.day][detailSheet.periodIdx],
      { text: newNoteText.trim(), category: newNoteCategory },
    ];
    saveLocalPrivateNotes(store);
    setPrivateNotes(store);
    setNewNoteText("");
  }, [detailSheet, newNoteText, newNoteCategory, privateNotes, className]);

  const removeNote = useCallback(
    (noteIndex: number) => {
      if (!detailSheet) return;
      const store = { ...privateNotes };
      const arr = [...(store[detailSheet.day]?.[detailSheet.periodIdx] || [])];
      arr.splice(noteIndex, 1);
      if (!store[detailSheet.day]) store[detailSheet.day] = {};
      store[detailSheet.day] = { ...store[detailSheet.day], [detailSheet.periodIdx]: arr };
      saveLocalPrivateNotes(store);
      setPrivateNotes(store);
    },
    [detailSheet, privateNotes]
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
      }
    } finally {
      setJoining(false);
      setShowJoinDialog(false);
      setJoinCode("");
    }
  }, [joinCode]);

  // Load class code from localStorage
  useEffect(() => {
    const stored = localStorage.getItem("invite_code");
    if (stored) setInviteCode(stored);
  }, []);

  // Current detail
  const detailCourse = detailSheet ? schedule[detailSheet.day]?.[detailSheet.periodIdx] : null;
  const detailNotes = detailSheet ? getCellNotes(detailSheet.day, detailSheet.periodIdx) : [];
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
          <button
            onClick={() => setShowJoinDialog(true)}
            className="flex items-center gap-1 px-2 py-1.5 border border-border rounded-sm text-xs text-foreground/70 hover:bg-secondary transition-colors"
            aria-label="加入班級"
          >
            <UserPlus size={12} strokeWidth={1.5} />
          </button>
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
            <table className="w-full border-collapse min-w-[360px]">
              <thead>
                <tr>
                  <th className="w-9 p-1" />
                  {WEEKDAYS.map((day, idx) => {
                    const date = weekDates[idx];
                    const today = isToday(date);
                    return (
                      <th key={day} className={`p-1 text-center ${today ? "relative" : ""}`}>
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
                        const notes = getCellNotes(day, periodIdx);
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
                              className={`w-full min-h-[3.2rem] rounded-sm p-1.5 text-left transition-all
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
                                  <span className="text-[11px] font-medium text-foreground leading-tight block truncate">
                                    {course!.subject}
                                  </span>
                                  <span className="text-[9px] text-muted-foreground/50 font-light block truncate">
                                    {course!.room}
                                  </span>
                                  {notes.length > 0 && (
                                    <div className="flex flex-wrap gap-0.5 mt-0.5">
                                      {notes.slice(0, 2).map((note) => {
                                        const meta = getCategoryMeta(note.category);
                                        return (
                                          <span
                                            key={note.id}
                                            className={`text-[7px] px-1 py-px rounded-sm border font-light leading-tight ${meta.bg}`}
                                          >
                                            {meta.label}
                                          </span>
                                        );
                                      })}
                                      {notes.length > 2 && (
                                        <span className="text-[7px] text-muted-foreground/40">+{notes.length - 2}</span>
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
            {detailNotes.length > 0 && (
              <div className="space-y-2 mb-4">
                <span className="text-[10px] text-muted-foreground/60 font-light">備註</span>
                {detailNotes.map((note, idx) => {
                  const meta = getCategoryMeta(note.category);
                  return (
                    <div key={note.id} className={`flex items-start justify-between gap-2 rounded-sm border px-3 py-2 ${meta.bg}`}>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-1.5 mb-0.5">
                          <Badge variant="outline" className={`text-[9px] px-1.5 py-0 h-4 rounded-sm border ${meta.bg} font-light`}>
                            {note.source === "public" ? "公用" : "私人"} &middot; {meta.label}
                          </Badge>
                        </div>
                        <p className="text-sm text-foreground">{note.text}</p>
                      </div>
                      {note.source === "private" && (
                        <button
                          onClick={() => removeNote(idx - (detailCourse?.notes?.length || 0))}
                          className="text-muted-foreground/40 hover:text-destructive transition-colors flex-shrink-0 mt-0.5"
                          aria-label="刪除備註"
                        >
                          <X size={14} />
                        </button>
                      )}
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
              <Button onClick={addNote} disabled={!newNoteText.trim()} className="w-full mt-2 rounded-sm" size="sm">
                新增備註
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
          <DialogFooter className="flex gap-2 mt-3">
            <Button variant="outline" size="sm" className="flex-1 rounded-sm bg-transparent" onClick={clearEditCell}>
              <Trash2 size={13} className="mr-1" /> 清除
            </Button>
            <Button size="sm" className="flex-1 rounded-sm" onClick={saveEditCell}>
              <Save size={13} className="mr-1" /> 儲存
            </Button>
          </DialogFooter>
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
    </div>
  );
}
