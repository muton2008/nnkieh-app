"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { Plus, X, Check, Pencil, Trash2 } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { SkeletonBlock } from "./skeleton-block";

import type {
  SchoolCalendarEvent,
  PrivateCalendarEvent,
} from "@/lib/types";
import {
  fetchSchoolCalendar,
  getLocalPrivateEvents,
  saveLocalPrivateEvents,
  syncPrivateEvents,
} from "@/lib/api";

// --- Color options for private events ---
const COLOR_OPTIONS = [
  { id: "pink" as const, label: "粉", class: "bg-macaron-pink", ring: "ring-pink-300" },
  { id: "green" as const, label: "綠", class: "bg-macaron-green", ring: "ring-emerald-300" },
  { id: "yellow" as const, label: "黃", class: "bg-macaron-yellow", ring: "ring-amber-300" },
  { id: "blue" as const, label: "藍", class: "bg-macaron-blue", ring: "ring-sky-300" },
];

function getColorClass(color: PrivateCalendarEvent["color"]): string {
  return COLOR_OPTIONS.find((c) => c.id === color)?.class ?? "bg-macaron-pink";
}

interface CalendarPageProps {
  deviceId: string;
}

export function CalendarPage({ deviceId }: CalendarPageProps) {
  const [loading, setLoading] = useState(true);
  const [schoolEvents, setSchoolEvents] = useState<SchoolCalendarEvent[]>([]);
  const [privateEvents, setPrivateEvents] = useState<PrivateCalendarEvent[]>([]);
  const [semester, setSemester] = useState("");
  const [activeTab, setActiveTab] = useState<"school" | "private">("school");

  // Add/Edit dialog
  const [showDialog, setShowDialog] = useState(false);
  const [editingEvent, setEditingEvent] = useState<PrivateCalendarEvent | null>(null);
  const [formDate, setFormDate] = useState("");
  const [formTitle, setFormTitle] = useState("");
  const [formDesc, setFormDesc] = useState("");
  const [formColor, setFormColor] = useState<PrivateCalendarEvent["color"]>("pink");

  // Auto-save
  const [saveStatus, setSaveStatus] = useState<"idle" | "saving" | "saved">("idle");
  const saveTimerRef = useRef<NodeJS.Timeout | null>(null);

  // --- Load data ---
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const data = await fetchSchoolCalendar();
        if (cancelled) return;
        setSchoolEvents(data.events);
        setSemester(data.semester);
      } catch (e) {
        console.error("[CalendarPage] fetch error:", e);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    setPrivateEvents(getLocalPrivateEvents());
    return () => { cancelled = true; };
  }, []);

  // --- Auto-save private events ---
  const triggerAutoSave = useCallback(
    (events: PrivateCalendarEvent[]) => {
      if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
      setSaveStatus("saving");
      saveTimerRef.current = setTimeout(async () => {
        try {
          await syncPrivateEvents({ device_id: deviceId, events });
          setSaveStatus("saved");
          setTimeout(() => setSaveStatus("idle"), 2000);
        } catch {
          setSaveStatus("idle");
        }
      }, 1500);
    },
    [deviceId]
  );

  // --- Event CRUD ---
  const openAddDialog = useCallback(() => {
    setEditingEvent(null);
    setFormDate("");
    setFormTitle("");
    setFormDesc("");
    setFormColor("pink");
    setShowDialog(true);
  }, []);

  const openEditDialog = useCallback((event: PrivateCalendarEvent) => {
    setEditingEvent(event);
    setFormDate(event.date);
    setFormTitle(event.title);
    setFormDesc(event.description);
    setFormColor(event.color);
    setShowDialog(true);
  }, []);

  const handleSaveEvent = useCallback(() => {
    if (!formDate.trim() || !formTitle.trim()) return;

    let updated: PrivateCalendarEvent[];
    if (editingEvent) {
      // Update
      updated = privateEvents.map((e) =>
        e.id === editingEvent.id
          ? { ...e, date: formDate.trim(), title: formTitle.trim(), description: formDesc.trim(), color: formColor }
          : e
      );
    } else {
      // Create
      const newEvent: PrivateCalendarEvent = {
        id: `private-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
        date: formDate.trim(),
        title: formTitle.trim(),
        description: formDesc.trim(),
        color: formColor,
      };
      updated = [...privateEvents, newEvent];
    }

    // Sort by date
    updated.sort((a, b) => a.date.localeCompare(b.date));
    setPrivateEvents(updated);
    saveLocalPrivateEvents(updated);
    triggerAutoSave(updated);
    setShowDialog(false);
  }, [editingEvent, formDate, formTitle, formDesc, formColor, privateEvents, triggerAutoSave]);

  const handleDeleteEvent = useCallback(
    (id: string) => {
      const updated = privateEvents.filter((e) => e.id !== id);
      setPrivateEvents(updated);
      saveLocalPrivateEvents(updated);
      triggerAutoSave(updated);
    },
    [privateEvents, triggerAutoSave]
  );

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <header className="px-5 pt-12 pb-2">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="font-serif text-xl font-semibold text-foreground">行事曆</h1>
            <div className="flex items-center gap-2 mt-0.5">
              <p className="text-xs text-muted-foreground font-light">{semester || "載入中..."}</p>
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
          {activeTab === "private" && (
            <button
              onClick={openAddDialog}
              className="flex items-center gap-1 px-2.5 py-1.5 border border-border rounded-sm text-xs text-foreground/70 hover:bg-secondary transition-colors"
              aria-label="新增私人事件"
            >
              <Plus size={13} strokeWidth={1.5} />
              新增
            </button>
          )}
        </div>
      </header>

      {/* Tab switcher: School / Private */}
      <div className="px-5 pb-2 flex gap-1.5">
        <button
          onClick={() => setActiveTab("school")}
          className={`flex-1 py-2 rounded-sm text-xs border transition-all ${
            activeTab === "school"
              ? "bg-foreground text-background border-foreground font-medium"
              : "bg-card text-muted-foreground border-border font-light hover:border-foreground/20"
          }`}
        >
          全校行事曆
        </button>
        <button
          onClick={() => setActiveTab("private")}
          className={`flex-1 py-2 rounded-sm text-xs border transition-all ${
            activeTab === "private"
              ? "bg-foreground text-background border-foreground font-medium"
              : "bg-card text-muted-foreground border-border font-light hover:border-foreground/20"
          }`}
        >
          我的行事曆
        </button>
      </div>

      {/* Timeline content */}
      <div className="flex-1 overflow-y-auto px-5 pb-24">
        {loading ? (
          <div className="space-y-4">
            {[...Array(5)].map((_, i) => (
              <div key={i} className="flex gap-4">
                <SkeletonBlock className="h-16 w-14 flex-shrink-0" />
                <SkeletonBlock className="h-16 flex-1" />
              </div>
            ))}
          </div>
        ) : activeTab === "school" ? (
          /* School calendar - read only timeline */
          <SchoolTimeline events={schoolEvents} />
        ) : (
          /* Private calendar - editable */
          <PrivateTimeline
            events={privateEvents}
            onEdit={openEditDialog}
            onDelete={handleDeleteEvent}
            onAdd={openAddDialog}
          />
        )}
      </div>

      {/* Add/Edit private event dialog */}
      <Dialog open={showDialog} onOpenChange={setShowDialog}>
        <DialogContent className="max-w-[360px] rounded-sm p-5">
          <DialogHeader>
            <DialogTitle className="font-serif text-base">
              {editingEvent ? "編輯事件" : "新增私人事件"}
            </DialogTitle>
            <DialogDescription className="text-xs font-light">
              {editingEvent ? "修改此事件的內容" : "記錄你的個人行程安排"}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3 mt-2">
            <div>
              <label className="text-[11px] text-muted-foreground font-light block mb-1">日期</label>
              <input
                type="date"
                value={formDate}
                onChange={(e) => setFormDate(e.target.value)}
                className="w-full border border-border rounded-sm px-3 py-2 text-sm text-foreground bg-background focus:outline-none focus:ring-1 focus:ring-ring"
                autoFocus
              />
            </div>
            <div>
              <label className="text-[11px] text-muted-foreground font-light block mb-1">事件標題</label>
              <input
                type="text"
                value={formTitle}
                onChange={(e) => setFormTitle(e.target.value)}
                placeholder="例如：生日聚會"
                className="w-full border border-border rounded-sm px-3 py-2 text-sm text-foreground bg-background placeholder:text-muted-foreground/30 focus:outline-none focus:ring-1 focus:ring-ring"
              />
            </div>
            <div>
              <label className="text-[11px] text-muted-foreground font-light block mb-1">備註說明</label>
              <textarea
                value={formDesc}
                onChange={(e) => setFormDesc(e.target.value)}
                placeholder="選填..."
                className="w-full border border-border rounded-sm px-3 py-2 text-sm text-foreground bg-background placeholder:text-muted-foreground/30 resize-none focus:outline-none focus:ring-1 focus:ring-ring"
                rows={2}
              />
            </div>
            <div>
              <label className="text-[11px] text-muted-foreground font-light block mb-1">顏色標記</label>
              <div className="flex gap-2">
                {COLOR_OPTIONS.map((opt) => (
                  <button
                    key={opt.id}
                    onClick={() => setFormColor(opt.id)}
                    className={`w-8 h-8 rounded-sm border transition-all ${opt.class} ${
                      formColor === opt.id ? `ring-2 ${opt.ring} border-foreground/30` : "border-border/50"
                    }`}
                    aria-label={opt.label}
                  />
                ))}
              </div>
            </div>
          </div>
          <DialogFooter className="mt-3">
            <Button
              onClick={handleSaveEvent}
              disabled={!formDate.trim() || !formTitle.trim()}
              className="w-full rounded-sm"
              size="sm"
            >
              {editingEvent ? "更新事件" : "新增事件"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// --- School Timeline (read-only) ---
function SchoolTimeline({ events }: { events: SchoolCalendarEvent[] }) {
  if (events.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-muted-foreground/40">
        <p className="text-sm font-light">目前沒有行事曆資料</p>
      </div>
    );
  }

  return (
    <div className="relative">
      <div className="absolute left-[1.9rem] top-2 bottom-2 w-px border-l border-dashed border-border/60" />
      <div className="space-y-0">
        {events.map((event) => (
          <div key={event.id} className="flex gap-4 relative group">
            <div className="w-14 flex-shrink-0 flex flex-col items-center pt-3 relative z-10">
              <span className="text-lg font-serif font-semibold text-foreground leading-tight">
                {event.date.split("/")[1]}
              </span>
              <span className="text-[10px] text-muted-foreground/50 font-light">
                {event.date.split("/")[0]}月
              </span>
              <span className="text-[10px] text-muted-foreground/40 font-light">
                ({event.weekday})
              </span>
              {/*<div className="absolute left-[1.15rem] top-5 w-1.5 h-1.5 rounded-full bg-border ring-2 ring-background" />*/}
            </div>
            <div className={`flex-1 ${event.color} border border-border/40 rounded-sm px-4 py-3 my-1.5 transition-shadow hover:shadow-sm`}>
              <div className="flex items-start justify-between gap-2">
                <div>
                  <h3 className="text-sm font-medium text-foreground">{event.title}</h3>
                  <p className="text-xs text-muted-foreground font-light mt-1 leading-relaxed">{event.description}</p>
                </div>
                <span className="text-[9px] text-muted-foreground/50 border border-border/40 px-1.5 py-0.5 rounded-sm font-light flex-shrink-0 mt-0.5">
                  {event.tag}
                </span>
              </div>
            </div>
          </div>
        ))}
      </div>
      <div className="flex items-center gap-4 mt-4">
        <div className="w-14 flex-shrink-0 flex justify-center">
          <div className="w-2 h-0.5 bg-border/40 rounded-full" />
        </div>
        <p className="text-[10px] text-muted-foreground/30 font-light">
          -- 由管理員維護，持續更新中 --
        </p>
      </div>
    </div>
  );
}

// --- Private Timeline (editable) ---
function PrivateTimeline({
  events,
  onEdit,
  onDelete,
  onAdd,
}: {
  events: PrivateCalendarEvent[];
  onEdit: (e: PrivateCalendarEvent) => void;
  onDelete: (id: string) => void;
  onAdd: () => void;
}) {
  if (events.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-muted-foreground/40">
        <p className="text-sm font-light mb-3">還沒有任何私人事件</p>
        <Button variant="outline" size="sm" className="rounded-sm bg-transparent" onClick={onAdd}>
          <Plus size={14} className="mr-1" /> 新增第一個事件
        </Button>
      </div>
    );
  }

  function formatPrivateDate(dateStr: string) {
    try {
      const d = new Date(dateStr);
      const weekdays = ["日", "一", "二", "三", "四", "五", "六"];
      return {
        month: `${d.getMonth() + 1}月`,
        day: `${d.getDate()}`,
        weekday: weekdays[d.getDay()],
      };
    } catch {
      return { month: "", day: dateStr, weekday: "" };
    }
  }

  return (
    <div className="relative">
      <div className="absolute left-[1.9rem] top-2 bottom-2 w-px border-l border-dashed border-border/60" />
      <div className="space-y-0">
        {events.map((event) => {
          const dateInfo = formatPrivateDate(event.date);
          return (
            <div key={event.id} className="flex gap-4 relative group">
              <div className="w-14 flex-shrink-0 flex flex-col items-center pt-3 relative z-10">
                <span className="text-lg font-serif font-semibold text-foreground leading-tight">{dateInfo.day}</span>
                <span className="text-[10px] text-muted-foreground/50 font-light">{dateInfo.month}</span>
                <span className="text-[10px] text-muted-foreground/40 font-light">({dateInfo.weekday})</span>
                {/*<div className="absolute left-[1.15rem] top-5 w-1.5 h-1.5 rounded-full bg-border ring-2 ring-background" />*/}
              </div>
              <div className={`flex-1 ${getColorClass(event.color)} border border-border/40 rounded-sm px-4 py-3 my-1.5 transition-shadow hover:shadow-sm`}>
                <div className="flex items-start justify-between gap-2">
                  <div className="flex-1 min-w-0">
                    <h3 className="text-sm font-medium text-foreground">{event.title}</h3>
                    {event.description && (
                      <p className="text-xs text-muted-foreground font-light mt-1 leading-relaxed">{event.description}</p>
                    )}
                  </div>
                  {/* Edit / Delete */}
                  <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0">
                    <button
                      onClick={() => onEdit(event)}
                      className="p-1 text-muted-foreground/50 hover:text-foreground transition-colors"
                      aria-label="編輯事件"
                    >
                      <Pencil size={13} />
                    </button>
                    <button
                      onClick={() => onDelete(event.id)}
                      className="p-1 text-muted-foreground/50 hover:text-destructive transition-colors"
                      aria-label="刪除事件"
                    >
                      <Trash2 size={13} />
                    </button>
                  </div>
                </div>
              </div>
            </div>
          );
        })}
      </div>
      <div className="flex items-center gap-4 mt-4">
        <div className="w-14 flex-shrink-0 flex justify-center">
          <div className="w-2 h-0.5 bg-border/40 rounded-full" />
        </div>
        <p className="text-[10px] text-muted-foreground/30 font-light">
          -- 私人行事曆，僅自己可見 --
        </p>
      </div>
    </div>
  );
}
