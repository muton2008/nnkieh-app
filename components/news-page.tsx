"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import { Clock, ExternalLink, FileDown, Paperclip, Search, X } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { SkeletonCard } from "./skeleton-block";

import type { Announcement, AnnouncementCategory } from "@/lib/types";
import {
  fetchAnnouncements,
  getReadAnnouncementIds,
  markAnnouncementAsRead,
} from "@/lib/api";

// --- UI Constants ---
const CATEGORY_LABELS: Record<AnnouncementCategory, string> = {
  important: "重要",
  exam: "考試與考程",
  learning: "學習歷程/自主學習/社團",
  activity: "活動與競賽",
  admin: "行政與校務",
  admission: "升學與招生",
  general: "一般公告",
  teacher: "教師公告/研習",
};

const CATEGORY_SHORT: Record<AnnouncementCategory, string> = {
  important: "重要",
  exam: "考試",
  learning: "學習",
  activity: "活動",
  admin: "行政",
  admission: "升學",
  general: "一般",
  teacher: "教師",
};

const CATEGORY_COLORS: Record<AnnouncementCategory, string> = {
  important: "border-l-red-400",
  exam: "border-l-amber-400",
  learning: "border-l-emerald-400",
  activity: "border-l-sky-400",
  admin: "border-l-violet-400",
  admission: "border-l-pink-400",
  general: "border-l-stone-300",
  teacher: "border-l-teal-400",
};

const CATEGORY_BG_COLORS: Record<AnnouncementCategory, string> = {
  important: "bg-red-50 text-red-700 border-red-200",
  exam: "bg-amber-50 text-amber-700 border-amber-200",
  learning: "bg-emerald-50 text-emerald-700 border-emerald-200",
  activity: "bg-sky-50 text-sky-700 border-sky-200",
  admin: "bg-violet-50 text-violet-700 border-violet-200",
  admission: "bg-pink-50 text-pink-700 border-pink-200",
  general: "bg-stone-50 text-stone-600 border-stone-200",
  teacher: "bg-teal-50 text-teal-700 border-teal-200",
};

const FILTER_TABS: { id: AnnouncementCategory | "all"; label: string }[] = [
  { id: "all", label: "全部" },
  { id: "important", label: "重要" },
  { id: "exam", label: "考試與考程" },
  { id: "learning", label: "學習歷程" },
  { id: "activity", label: "活動與競賽" },
  { id: "admin", label: "行政與校務" },
  { id: "admission", label: "升學與招生" },
  { id: "general", label: "一般公告" },
  { id: "teacher", label: "教師公告" },
];

export function NewsPage() {
  const [loading, setLoading] = useState(true);
  const [announcements, setAnnouncements] = useState<Announcement[]>([]);
  const [readIds, setReadIds] = useState<Set<number>>(new Set());
  const [selectedArticle, setSelectedArticle] = useState<Announcement | null>(null);
  const [activeFilter, setActiveFilter] = useState<AnnouncementCategory | "all">("all");
  const [searchQuery, setSearchQuery] = useState("");
  const [showSearch, setShowSearch] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const data = await fetchAnnouncements();
        if (cancelled) return;
        setAnnouncements(data.announcements);
      } catch (e) {
        console.error("[NewsPage] fetch error:", e);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    setReadIds(getReadAnnouncementIds());
    return () => { cancelled = true; };
  }, []);

  const handleOpen = useCallback((article: Announcement) => {
    markAnnouncementAsRead(article.post_id);
    setReadIds(getReadAnnouncementIds());
    setSelectedArticle(article);
  }, []);

  const filteredAnnouncements = useMemo(() => {
    let list = announcements;
    if (activeFilter !== "all") {
      if (activeFilter === "important") {
        list = list.filter((a) => a.importance === 1);
      } else {
        list = list.filter((a) => a.category === activeFilter);
      }
    }
    if (searchQuery.trim()) {
      const q = searchQuery.trim().toLowerCase();
      list = list.filter(
        (a) => a.title.toLowerCase().includes(q) || a.content?.toLowerCase().includes(q)
      );
    }
    return list;
  }, [announcements, activeFilter, searchQuery]);

  const formattedDate = (dateStr: string) =>
    new Date(dateStr).toLocaleDateString("zh-TW", {
      year: "numeric",
      month: "long",
      day: "numeric",
    });

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <header className="px-5 pt-12 pb-2">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="font-serif text-xl font-semibold text-foreground">公告</h1>
            <p className="text-xs text-muted-foreground font-light mt-0.5">校園最新消息</p>
          </div>
          <button
            onClick={() => setShowSearch((s) => !s)}
            className="p-2 text-muted-foreground hover:text-foreground transition-colors"
            aria-label="搜尋"
          >
            {showSearch ? <X size={18} /> : <Search size={18} strokeWidth={1.5} />}
          </button>
        </div>
        {showSearch && (
          <div className="mt-2">
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="搜尋公告標題或內容..."
              className="w-full border border-border rounded-sm px-3 py-2 text-sm text-foreground bg-card placeholder:text-muted-foreground/30 focus:outline-none focus:ring-1 focus:ring-ring"
              autoFocus
            />
          </div>
        )}
      </header>

      {/* Category filter tabs */}
      <div className="px-5 pb-2">
        <div className="flex gap-1.5 overflow-x-auto thin-scrollbar py-1">
          {FILTER_TABS.map((tab) => {
            const isActive = activeFilter === tab.id;
            return (
              <button
                key={tab.id}
                onClick={() => setActiveFilter(tab.id)}
                className={`flex-shrink-0 px-2.5 py-1 rounded-sm text-[11px] border transition-all ${
                  isActive
                    ? "bg-foreground text-background border-foreground font-medium"
                    : "bg-card text-muted-foreground border-border font-light hover:border-foreground/20"
                }`}
              >
                {tab.label}
              </button>
            );
          })}
        </div>
      </div>

      {/* Announcement list */}
      <div className="flex-1 overflow-y-auto px-5 pb-24 space-y-2.5">
        {loading ? (
          [...Array(4)].map((_, i) => <SkeletonCard key={i} />)
        ) : filteredAnnouncements.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-muted-foreground/40">
            <Search size={32} strokeWidth={1} />
            <p className="text-sm font-light mt-3">沒有找到相關公告</p>
          </div>
        ) : (
          filteredAnnouncements.map((item) => {
            const isRead = readIds.has(item.post_id);
            return (
              <button
                key={item.post_id}
                onClick={() => handleOpen(item)}
                className={`w-full text-left bg-card border-l-4 border border-border/60 rounded-sm px-4 py-3.5 transition-all hover:shadow-sm active:scale-[0.995] group ${CATEGORY_COLORS[item.category]}`}
              >
                <div className="flex items-center justify-between mb-1.5">
                  <div className="flex flex-wrap gap-1.5">
                    <Badge variant="secondary" className={`text-[9px] px-1.5 py-0 h-4 rounded-sm border font-light ${CATEGORY_BG_COLORS[item.category]}`}>
                      {CATEGORY_SHORT[item.category]}
                    </Badge>
                    {item.importance === 1 && (
                      <Badge variant="secondary" className="text-[9px] px-1.5 py-0 h-4 rounded-sm bg-red-50 text-red-600 border-red-200 font-light">
                        重要
                      </Badge>
                    )}
                  </div>
                  <div className="flex items-center gap-1 text-[10px] text-muted-foreground/40 font-light">
                    <Clock size={10} />
                    {formattedDate(item.publish_date)}
                  </div>
                </div>
                <h3 className={`text-sm leading-snug transition-colors ${
                  isRead ? "text-muted-foreground/40 font-light" : "text-foreground font-medium group-hover:text-foreground/80"
                }`}>
                  {item.title}
                </h3>
                <p className="text-xs text-muted-foreground/50 font-light mt-1 line-clamp-2 leading-relaxed">
                  {item.content}
                </p>
                <div className="flex items-center justify-between mt-2">
                  <span className="text-[10px] text-muted-foreground/30 font-light">{item.author}</span>
                  {item.attachments && item.attachments.length > 0 && (
                    <span className="flex items-center gap-1 text-[10px] text-sky-500 font-light">
                      <Paperclip size={10} />
                      {item.attachments.length} 個附件
                    </span>
                  )}
                </div>
              </button>
            );
          })
        )}
      </div>

      {/* Article detail dialog */}
      <Dialog open={!!selectedArticle} onOpenChange={() => setSelectedArticle(null)}>
        <DialogContent
          className={`w-[95vw] max-w-[430px] max-h-[85vh] flex flex-col border-l-4 rounded-sm p-0 gap-0 ${
            selectedArticle ? CATEGORY_COLORS[selectedArticle.category] : ""
          }`}
        >
          <DialogHeader className="shrink-0 px-5 pt-5 pb-3">
            <div className="flex items-center gap-2 mb-2">
              {selectedArticle && (
                <>
                  <Badge variant="secondary" className={`text-[9px] px-1.5 py-0 h-4 rounded-sm border font-light ${CATEGORY_BG_COLORS[selectedArticle.category]}`}>
                    {CATEGORY_LABELS[selectedArticle.category]}
                  </Badge>
                  {selectedArticle.importance === 1 && (
                    <Badge variant="secondary" className="text-[9px] px-1.5 py-0 h-4 rounded-sm bg-red-50 text-red-600 border-red-200 font-light">
                      重要
                    </Badge>
                  )}
                </>
              )}
            </div>
            <DialogTitle className="font-serif text-lg leading-relaxed text-foreground">
              {selectedArticle?.title}
            </DialogTitle>
            <div className="flex items-center gap-2 text-xs text-muted-foreground/50 font-light mt-1">
              <span>{selectedArticle?.author}</span>
              <span>&middot;</span>
              <span>{selectedArticle && formattedDate(selectedArticle.publish_date)}</span>
            </div>
          </DialogHeader>

          <div className="flex-1 overflow-y-auto px-5 py-4 space-y-5 border-t border-dashed border-border">
            <div className="text-sm text-foreground/90 leading-relaxed whitespace-pre-wrap">
              {selectedArticle?.content || "此公告沒有詳細內容"}
            </div>
            {selectedArticle?.attachments && selectedArticle.attachments.length > 0 && (
              <div className="space-y-2.5">
                <h4 className="text-xs font-medium flex items-center gap-1.5 text-foreground/70">
                  <FileDown size={14} /> 附件下載
                </h4>
                <div className="space-y-1.5">
                  {selectedArticle.attachments.map((file, i) => (
                    <Button key={i} variant="outline" size="sm" asChild className="justify-start h-auto py-2.5 px-3 w-full rounded-sm hover:bg-macaron-blue bg-transparent">
                      <a href={file.url} target="_blank" rel="noopener noreferrer">
                        <div className="flex flex-col items-start overflow-hidden">
                          <span className="text-xs truncate w-full text-foreground">{file.name}</span>
                          <span className="text-[10px] text-muted-foreground/40 font-light">點擊下載檔案</span>
                        </div>
                      </a>
                    </Button>
                  ))}
                </div>
              </div>
            )}
          </div>

          <div className="px-5 py-3 border-t border-border flex items-center justify-between shrink-0">
            <span className="text-[10px] text-muted-foreground/30 font-light">ID: #{selectedArticle?.post_id}</span>
            {selectedArticle?.link && (
              <Button size="sm" variant="outline" asChild className="rounded-sm text-xs bg-transparent">
                <a href={selectedArticle.link} target="_blank" rel="noopener noreferrer" className="gap-1.5">
                  <ExternalLink size={12} /> 前往校網原文
                </a>
              </Button>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
