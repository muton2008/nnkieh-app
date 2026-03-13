"use client";

import { useState, useEffect, useCallback, useRef } from "react";
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

import type { Announcement } from "@/lib/types/announcement";
import {
  CATEGORY_LABELS,
  CATEGORY_SHORT,
  CATEGORY_COLORS,
  CATEGORY_BG_COLORS,
} from "@/lib/types/announcement";
import {
  ApiError,
  fetchAnnouncements,
  fetchAnnouncementByPostId,
  getReadAnnouncementIds,
  markAnnouncementAsRead,
} from "@/lib/api-client";
import { toast } from "@/hooks/use-toast";

// --- UI Constants ---
const FILTER_TABS: { id: number | "all" | "important"; label: string }[] = [
  { id: "all", label: "全部" },
  { id: "important", label: "重要" },
  { id: 0, label: "考試與考程" },
  { id: 1, label: "學習歷程" },
  { id: 2, label: "活動與競賽" },
  { id: 3, label: "行政與校務" },
  { id: 4, label: "升學與招生" },
  { id: 5, label: "一般公告" },
  { id: 6, label: "教師公告" },
];

const parseAnnouncementContent = (fullContent: string | null) => {
  if (!fullContent) return { mainText: '', parsedAttachments: [] };

  // 分割標記
  const sections = fullContent.split('【附件檔案】：');
  let mainText = sections[0].trim();

  // 解析附件字串
  const parsedAttachments = sections.slice(1).map((item) => {
    const [name, rest] = item.split(' (下載位址: ');
    const url = rest?.replace(')', '').trim();
    return { name: name.trim(), url: url || '#' };
  });

  // 清洗主內文，避免重複出現檔名
  if (parsedAttachments.length > 0) {
    const firstFileName = parsedAttachments[0].name;
    const nameIndex = mainText.indexOf(firstFileName);
    if (nameIndex !== -1) {
      mainText = mainText.substring(0, nameIndex).trim();
    }
  }

  return { mainText, parsedAttachments };
};

interface NewsPageProps {
  /** 由通知導入時指定公告 post_id */
  focusAnnouncementId?: number | null;
  /** 每次通知觸發遞增，確保可重複打開同一則公告 */
  focusAnnouncementSignal?: number;
}

export function NewsPage({
  focusAnnouncementId,
  focusAnnouncementSignal = 0,
}: NewsPageProps) {
  const [loading, setLoading] = useState(true);
  const [announcements, setAnnouncements] = useState<Announcement[]>([]);
  const [readIds, setReadIds] = useState<Set<number>>(new Set());
  const [selectedArticle, setSelectedArticle] = useState<Announcement | null>(null);
  const [activeFilter, setActiveFilter] = useState<number | "all" | "important">("all");
  const [searchQuery, setSearchQuery] = useState("");
  const [showSearch, setShowSearch] = useState(false);
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [totalPages, setTotalPages] = useState(0);
  const [hasMore, setHasMore] = useState(false);
  const announcementsRef = useRef<Announcement[]>([]);

  useEffect(() => {
    let cancelled = false;
    
    const fetchData = async () => {
      setLoading(true);
      try {
        const data = await fetchAnnouncements(page, {
          tab: activeFilter === "all" ? undefined : activeFilter.toString(),
          query: searchQuery.trim() || undefined,
        });
        if (cancelled) return;
        setAnnouncements(data.announcements);
        setTotal(data.total);
        setTotalPages(data.totalPages);
        setHasMore(data.hasMore);
      } catch (e) {
        console.error("[NewsPage] fetch error:", e);
        toast({
          title: "公告載入失敗",
          description: "請檢查網路連線後再試。",
        });
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    fetchData();
    return () => { cancelled = true; };
  }, [page, activeFilter, searchQuery]);

  useEffect(() => {
    setReadIds(getReadAnnouncementIds());
  }, []);

  useEffect(() => {
    announcementsRef.current = announcements;
  }, [announcements]);

  // 當篩選條件改變時，重置到第一頁
  useEffect(() => {
    if (page !== 1) {
      setPage(1);
    }
  }, [activeFilter, searchQuery]);

  const handleOpen = useCallback((article: Announcement) => {
    markAnnouncementAsRead(article.post_id);
    setReadIds(getReadAnnouncementIds());
    setSelectedArticle(article);
  }, []);

  useEffect(() => {
    if (!focusAnnouncementId || focusAnnouncementSignal === 0) return;

    let cancelled = false;

    const openFromNotification = async () => {
      const inCurrentList = announcementsRef.current.find((item) => item.post_id === focusAnnouncementId);
      if (inCurrentList) {
        handleOpen(inCurrentList);
        return;
      }

      try {
        const article = await fetchAnnouncementByPostId(focusAnnouncementId);
        if (!cancelled) {
          handleOpen(article);
        }
      } catch (error) {
        if (!(error instanceof ApiError) || (error.status !== 400 && error.status !== 404)) {
          console.error("[NewsPage] fetch announcement by id failed:", error);
        }
        toast({
          title: "無法開啟指定公告",
          description: "公告可能已下架，請改由列表查看最新內容。",
        });
      }
    };

    openFromNotification();
    return () => { cancelled = true; };
  }, [focusAnnouncementId, focusAnnouncementSignal, handleOpen]);

  const formattedDate = (dateStr: string) =>
    new Date(dateStr).toLocaleDateString("zh-TW", {
      year: "numeric",
      month: "long",
      day: "numeric",
    });

  const hasPrevPage = page > 1;
  const hasNextPage = hasMore;

  const handlePrevPage = () => {
    if (hasPrevPage) {
      setPage(page - 1);
    }
  };

  const handleNextPage = () => {
    if (hasNextPage) {
      setPage(page + 1);
    }
  };

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
        ) : announcements.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-muted-foreground/40">
            <Search size={32} strokeWidth={1} />
            <p className="text-sm font-light mt-3">沒有找到相關公告</p>
          </div>
        ) : (
          announcements.map((item) => {
            const isRead = readIds.has(item.post_id);
            const { mainText, parsedAttachments } = parseAnnouncementContent(item.content);
            const totalAttachments = (item.attachments?.length || 0) + parsedAttachments.length;
            
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
                  {mainText}
                </p>
                <div className="flex items-center justify-between mt-2">
                  <span className="text-[10px] text-muted-foreground/30 font-light">{item.author || "校方"}</span>
                  {totalAttachments > 0 && (
                    <span className="flex items-center gap-1 text-[10px] text-sky-500 font-light">
                      <Paperclip size={10} />
                      {totalAttachments} 個附件
                    </span>
                  )}
                </div>
              </button>
            );
          })
        )}
      </div>

      {/* Pagination */}
      {!loading && totalPages > 0 && (
        <div className="px-5 py-4 border-t border-border bg-background mb-20">
          <div className="flex items-center justify-between">
            <button
              onClick={handlePrevPage}
              disabled={!hasPrevPage}
              className={`px-4 py-2 rounded-sm text-sm border transition-all ${
                hasPrevPage
                  ? "bg-card text-foreground border-border hover:bg-foreground hover:text-background"
                  : "bg-muted text-muted-foreground border-muted cursor-not-allowed"
              }`}
            >
              上一頁
            </button>
            <div className="text-sm text-muted-foreground">
              第 <span className="font-medium text-foreground">{page}</span> / {totalPages} 頁
              <span className="text-xs ml-2">（共 {total} 則）</span>
            </div>
            <button
              onClick={handleNextPage}
              disabled={!hasNextPage}
              className={`px-4 py-2 rounded-sm text-sm border transition-all ${
                hasNextPage
                  ? "bg-card text-foreground border-border hover:bg-foreground hover:text-background"
                  : "bg-muted text-muted-foreground border-muted cursor-not-allowed"
              }`}
            >
              下一頁
            </button>
          </div>
        </div>
      )}

      {/* Article detail dialog */}
      <Dialog
        open={!!selectedArticle}
        onOpenChange={(open) => {
          if (!open) setSelectedArticle(null);
        }}
      >
        {(() => {
          if (!selectedArticle) return null;
          
          // 解析內容，分離主文本和內嵌附件
          const { mainText, parsedAttachments } = parseAnnouncementContent(selectedArticle.content);
          
          // 合併 API 返回的附件和從內容解析的附件
          const allAttachments = [
            ...(selectedArticle.attachments || []),
            ...parsedAttachments
          ];

          return (
            <DialogContent
              className={`w-[95vw] max-w-[430px] max-h-[85vh] flex flex-col border-l-4 rounded-sm p-0 gap-0 ${
                CATEGORY_COLORS[selectedArticle.category] || ""
              }`}
            >
              <DialogHeader className="shrink-0 px-5 pt-5 pb-3">
                <div className="flex items-center gap-2 mb-2">
                  <Badge variant="secondary" className={`text-[9px] px-1.5 py-0 h-4 rounded-sm border font-light ${CATEGORY_BG_COLORS[selectedArticle.category]}`}>
                    {CATEGORY_LABELS[selectedArticle.category]}
                  </Badge>
                  {selectedArticle.importance === 1 && (
                    <Badge variant="secondary" className="text-[9px] px-1.5 py-0 h-4 rounded-sm bg-red-50 text-red-600 border-red-200 font-light">
                      重要
                    </Badge>
                  )}
                </div>
                <DialogTitle className="font-serif text-lg leading-relaxed text-foreground">
                  {selectedArticle.title}
                </DialogTitle>
                <div className="flex items-center gap-2 text-xs text-muted-foreground/50 font-light mt-1">
                  <span>{selectedArticle.author || "校方"}</span>
                  <span>&middot;</span>
                  <span>{formattedDate(selectedArticle.publish_date)}</span>
                </div>
              </DialogHeader>

              <div className="flex-1 overflow-y-auto px-5 py-4 space-y-5 border-t border-dashed border-border">
                {/* 顯示清理後的主文本 */}
                <div className="text-sm text-foreground/90 leading-relaxed whitespace-pre-wrap">
                  {mainText || "此公告沒有詳細內容"}
                </div>
                
                {/* 顯示所有附件 */}
                {allAttachments.length > 0 && (
                  <div className="space-y-3">
                    <h4 className="text-sm font-medium flex items-center gap-2 text-foreground/80">
                      <FileDown size={16} /> 附件下載
                    </h4>
                    <div className="grid gap-2">
                      {allAttachments.map((file, i) => (
                        <Button 
                          key={i} 
                          variant="outline" 
                          size="sm" 
                          asChild 
                          className="justify-start h-auto py-3 px-4 w-full rounded-sm hover:bg-sky-50 hover:text-sky-600 hover:border-sky-300 transition-colors"
                        >
                          <a href={file.url} target="_blank" rel="noopener noreferrer">
                            <div className="flex flex-col items-start overflow-hidden w-full">
                              <span className="text-sm truncate w-full font-medium">{file.name}</span>
                              <span className="text-[10px] text-muted-foreground/60">點擊下載檔案</span>
                            </div>
                          </a>
                        </Button>
                      ))}
                    </div>
                  </div>
                )}
              </div>

              <div className="px-5 py-3 border-t border-border flex items-center justify-between shrink-0">
                <span className="text-[10px] text-muted-foreground/30 font-light">公告編號: #{selectedArticle.post_id}</span>
                {selectedArticle.link && (
                  <Button size="sm" variant="outline" asChild className="rounded-sm text-xs bg-transparent">
                    <a href={selectedArticle.link} target="_blank" rel="noopener noreferrer" className="gap-1.5">
                      <ExternalLink size={12} /> 前往校網原文
                    </a>
                  </Button>
                )}
              </div>
            </DialogContent>
          );
        })()}
      </Dialog>
    </div>
  );
}
