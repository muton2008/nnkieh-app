"use client";

import { useState, useEffect, useCallback } from "react";
import { Check, RefreshCw, Bell, BellOff, Copy, ClipboardCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { getFCMToken } from "@/lib/firebase";
import { syncTopicSubscriptions, supportsTopicSubscriptions } from "@/lib/fcm-topics";
import { toast } from "sonner";

import {
  DEFAULT_USER_PROFILE,
  UserProfile,
  SchoolDivision,
} from "@/lib/types/user";
import { CATEGORY_LABELS } from "@/lib/types/announcement";
import type { AnnouncementCategory } from "@/lib/types/announcement";
import {
  getLocalUserProfile,
  saveLocalUserProfile,
  syncUserProfile,
  fetchUserProfile,
} from "@/lib/api-client";
import { APP_VERSION } from "@/lib/version";
import { CHANGELOG } from "@/lib/changelog";
import { PrivacyPage } from "@/components/privacy-page";
import { LicensesPage } from "@/components/licenses-page";

const DIVISION_OPTIONS: { value: SchoolDivision; label: string; desc: string }[] = [
  { value: "no disturb", label: "都不", desc: "不接收任何重要通知" },
  { value: "junior", label: "國中部", desc: "僅接收國中部重要通知" },
  { value: "high", label: "高中部", desc: "僅接收高中部重要通知" },
  { value: "all", label: "全部", desc: "接收所有重要通知" },
];

const CATEGORY_OPTIONS: { id: AnnouncementCategory; label: string }[] = Object.entries(
  CATEGORY_LABELS
).map(([id, label]) => ({ id: Number(id) as AnnouncementCategory, label }));

const ALL_CATEGORY_IDS = CATEGORY_OPTIONS.map((item) => item.id);

function normalizeProfile(input: Partial<UserProfile>, deviceId: string): UserProfile {
  return {
    ...DEFAULT_USER_PROFILE,
    ...input,
    device_id: deviceId,
    notify_categories: input.notify_categories ?? DEFAULT_USER_PROFILE.notify_categories,
  };
}

interface SettingsPageProps {
  deviceId: string;
}

export function SettingsPage({ deviceId }: SettingsPageProps) {
  const [subPage, _setSubPage] = useState<null | "privacy" | "licenses">(null);
  const setSubPage = useCallback((page: null | "privacy" | "licenses") => {
    _setSubPage(page);
    window.scrollTo(0, 0);
  }, []);
  const [profile, setProfile] = useState<UserProfile>({
    ...DEFAULT_USER_PROFILE,
    device_id: deviceId,
  });
  const [syncStatus, setSyncStatus] = useState<"idle" | "syncing" | "synced" | "error">("idle");
  const [loading, setLoading] = useState(true);
  const [profileReady, setProfileReady] = useState(false);
  const [copied, setCopied] = useState(false);
  const [changelogVersion, setChangelogVersion] = useState(CHANGELOG[CHANGELOG.length - 1]?.version || "");

  const copyDeviceId = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(deviceId);
      setCopied(true);
      toast.success("已複製 Device ID");
      setTimeout(() => setCopied(false), 2000);
    } catch {
      toast.error("複製失敗");
    }
  }, [deviceId]);

  // 進入頁面：先讀 Local，再從後端 fetch 最新
  useEffect(() => {
    let cancelled = false;

    const init = async () => {
      // 1. 讀取 LocalStorage
      const stored = getLocalUserProfile();
      const local = normalizeProfile(stored || {}, deviceId);
      if (!cancelled) {
        setProfile(local);
        setLoading(false);
        // 若 localStorage 有資料，視為可用
        if (stored) setProfileReady(true);
      }

      // 2. 若有 device_id，從後端取得最新 profile
      if (deviceId) {
        try {
          const res = await fetchUserProfile(deviceId);
          if (!cancelled && res.success && res.profile) {
            const merged = normalizeProfile(res.profile, deviceId);
            setProfile(merged);
            saveLocalUserProfile(merged);
          }
        } catch (e) {
          console.error("[SettingsPage] fetch remote profile error:", e);
        } finally {
          // 無論成功或失敗，遠端請求完成後標記 ready
          if (!cancelled) setProfileReady(true);
        }
      } else {
        if (!cancelled) setProfileReady(true);
      }
    };

    init();
    return () => { cancelled = true; };
  }, [deviceId]);

  const handleSync = useCallback(async () => {
    if (syncStatus === "syncing" || !profileReady) return;
    setSyncStatus("syncing");

    try {
      const selectedCategories = profile.notify_categories ?? [];
      const needsNotification =
        profile.division !== "no disturb" ||
        profile.notify_all ||
        selectedCategories.length > 0;
      const supportsTopics = supportsTopicSubscriptions();

      // --- 需要通知的情境 ---
      if (needsNotification) {
        // 原生 App：透過 Capacitor 原生推播，不走 Web Notification API
        const isNativeApp = typeof window !== 'undefined' && (window as any).Capacitor?.isNativePlatform?.();

        if (!isNativeApp) {
          // 1. 檢查瀏覽器是否支援通知
          if (typeof Notification === "undefined") {
            alert("此瀏覽器不支援推播通知，通知設定將僅儲存在本機");
            // 仍然同步其他設定（不帶 fcm_token）
            await syncUserProfile(profile);
            saveLocalUserProfile(profile);
            setSyncStatus("synced");
            setTimeout(() => setSyncStatus("idle"), 2000);
            return;
          }

          // 2. 請求通知權限
          const permission = await Notification.requestPermission();

          if (permission === "denied") {
            alert("通知權限已被封鎖。\n\n請到瀏覽器設定 → 網站權限 → 通知，將本站改為「允許」後再試。");
            setSyncStatus("error");
            setTimeout(() => setSyncStatus("idle"), 2000);
            return;
          }

          if (permission === "default") {
            // 使用者關閉了權限對話框（未選擇）
            alert("需要允許通知權限才能接收推播，請再試一次並點選「允許」");
            setSyncStatus("error");
            setTimeout(() => setSyncStatus("idle"), 2000);
            return;
          }
        }

        // 3. 取得推播 Token（支援 topic 時不回傳 token，只用於權限/註冊）
        let fcmToken: string | null = null;
        if (!supportsTopics) {
          fcmToken = await getFCMToken();
          if (!fcmToken && !isNativeApp) {
            // Web 上取不到 Token → 阻止同步
            alert("無法取得推播 Token，請確認網路連線或重新整理頁面後再試");
            setSyncStatus("error");
            setTimeout(() => setSyncStatus("idle"), 2000);
            return;
          }
        } else if (isNativeApp) {
          fcmToken = await getFCMToken();
          if (!fcmToken) {
            alert("無法啟用原生推播，請確認網路與 Firebase 設定後再試");
            setSyncStatus("error");
            setTimeout(() => setSyncStatus("idle"), 2000);
            return;
          }
        }

        // 4. 帶 FCM Token 同步（支援 topic 時清空 token）
        const updatedProfile = {
          ...profile,
          notify_categories: selectedCategories,
          fcm_token: supportsTopics ? "" : fcmToken || "",
        };
        if (!fcmToken && isNativeApp && !supportsTopics) {
          console.warn("原生推播 Token 取得失敗，已同步設定但未啟用推播（請確認 google-services.json 已設定）");
        }
        const res = await syncUserProfile(updatedProfile);
        const synced = { ...updatedProfile, updated_at: res.updated_at || new Date().toISOString() };
        setProfile(synced);
        saveLocalUserProfile(synced);
        if (supportsTopics) {
          const topicResult = await syncTopicSubscriptions(synced);
          if (!topicResult.success) {
            alert("訂閱主題失敗，請稍後再試");
            setSyncStatus("error");
            setTimeout(() => setSyncStatus("idle"), 2000);
            return;
          }
        }
        setSyncStatus("synced");
      } else {
        // --- 不需要通知的情境（division = "no disturb" 且 notify_all = false）---
        // 清除 fcm_token，同步設定到後端
        const updatedProfile = { ...profile, notify_categories: [], fcm_token: "" };
        const res = await syncUserProfile(updatedProfile);
        const synced = { ...updatedProfile, updated_at: res.updated_at || new Date().toISOString() };
        setProfile(synced);
        saveLocalUserProfile(synced);
        if (supportsTopics) {
          const topicResult = await syncTopicSubscriptions(synced);
          if (!topicResult.success) {
            alert("訂閱主題失敗，請稍後再試");
            setSyncStatus("error");
            setTimeout(() => setSyncStatus("idle"), 2000);
            return;
          }
        }
        setSyncStatus("synced");
      }
    } catch (error) {
      console.error("[SettingsPage] 同步失敗:", error);
      alert("同步失敗，請檢查網路連線後再試");
      setSyncStatus("error");
    }

    setTimeout(() => setSyncStatus("idle"), 2000);
  }, [profile, syncStatus, profileReady]);

  const updateField = useCallback(
    <K extends keyof UserProfile>(field: K, value: UserProfile[K]) => {
      setProfile((prev) => ({ ...prev, [field]: value }));
    },
    []
  );

  const toggleCategory = useCallback((categoryId: AnnouncementCategory) => {
    setProfile((prev) => {
      const current = prev.notify_categories ?? [];
      const exists = current.includes(categoryId);
      const next = exists
        ? current.filter((id) => id !== categoryId)
        : [...current, categoryId];
      return { ...prev, notify_categories: next };
    });
  }, []);

  const selectAllCategories = useCallback(() => {
    setProfile((prev) => ({ ...prev, notify_categories: ALL_CATEGORY_IDS }));
  }, []);

  const clearAllCategories = useCallback(() => {
    setProfile((prev) => ({ ...prev, notify_categories: [] }));
  }, []);

  const isAllCategoriesSelected = ALL_CATEGORY_IDS.every((id) =>
    (profile.notify_categories ?? []).includes(id)
  );

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full">
        <p className="text-sm text-muted-foreground">載入中...</p>
      </div>
    );
  }

  if (subPage === "privacy") {
    return <PrivacyPage onBack={() => setSubPage(null)} />;
  }
  if (subPage === "licenses") {
    return <LicensesPage onBack={() => setSubPage(null)} />;
  }

  return (
    <div className="flex flex-col h-full">
      <header className="px-5 pt-12 pb-4">
        <h1 className="font-serif text-xl font-semibold text-foreground">設定</h1>
        <p className="text-xs text-muted-foreground font-light mt-0.5">通知偏好與資料同步</p>
      </header>

      <div className="flex-1 overflow-y-auto px-5 pb-24 space-y-5">
        {/* 接收重要公告 */}
        <section className="bg-card border border-border rounded-sm p-4">
          <div className="flex items-center justify-between mb-1">
            <h2 className="text-xs font-medium text-foreground">接收重要公告</h2>
            {profile.notify_all && (
              <span className="text-[10px] text-amber-600 font-light">已鎖定為全部</span>
            )}
          </div>
          <p className="text-[10px] text-muted-foreground/50 font-light mb-3">
            選擇要收取哪個部別的重要公告
          </p>
          <div className="grid grid-cols-2 gap-2">
            {DIVISION_OPTIONS.map((opt) => {
              const isSelected = profile.division === opt.value;
              const isDisabled = profile.notify_all;
              return (
                <button
                  key={opt.value}
                  onClick={() => !isDisabled && updateField("division", opt.value)}
                  disabled={isDisabled}
                  className={`relative flex flex-col items-start gap-0.5 px-3 py-2.5 rounded-sm border transition-all text-left ${
                    isDisabled
                      ? "border-border/50 bg-muted/30 cursor-not-allowed opacity-50"
                      : isSelected
                      ? "border-foreground/40 bg-foreground/5"
                      : "border-border hover:border-foreground/20"
                  }`}
                >
                  <span className={`text-sm ${isSelected ? "text-foreground font-medium" : "text-foreground/70"}`}>
                    {opt.label}
                  </span>
                  <span className="text-[10px] text-muted-foreground/50 font-light leading-tight">
                    {opt.desc}
                  </span>
                  {isSelected && (
                    <span className="absolute top-2 right-2">
                      <Check size={12} strokeWidth={2.5} className="text-foreground/60" />
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        </section>

        {/* 分類公告訂閱 */}
        <section className="bg-card border border-border rounded-sm p-4">
          <div className="flex items-center justify-between mb-1">
            <h2 className="text-xs font-medium text-foreground">接收分類公告</h2>
            {profile.notify_all && (
              <span className="text-[10px] text-amber-600 font-light">已鎖定為全部</span>
            )}
          </div>
          <p className="text-[10px] text-muted-foreground/50 font-light mb-3">
            選擇要接收的公告類別（重要公告另行設定）
          </p>
          <div className="flex gap-2 mb-3">
            <button
              onClick={() => !profile.notify_all && selectAllCategories()}
              disabled={profile.notify_all || isAllCategoriesSelected}
              className={`px-2.5 py-1 rounded-sm text-[11px] border transition-all ${
                profile.notify_all || isAllCategoriesSelected
                  ? "bg-muted text-muted-foreground border-muted cursor-not-allowed"
                  : "bg-card text-foreground border-border hover:border-foreground/20"
              }`}
            >
              勾選全部
            </button>
            <button
              onClick={() => !profile.notify_all && clearAllCategories()}
              disabled={profile.notify_all || (profile.notify_categories ?? []).length === 0}
              className={`px-2.5 py-1 rounded-sm text-[11px] border transition-all ${
                profile.notify_all || (profile.notify_categories ?? []).length === 0
                  ? "bg-muted text-muted-foreground border-muted cursor-not-allowed"
                  : "bg-card text-foreground border-border hover:border-foreground/20"
              }`}
            >
              取消勾選全部
            </button>
          </div>
          <div className="grid grid-cols-2 gap-2">
            {CATEGORY_OPTIONS.map((opt) => {
              const isSelected = (profile.notify_categories ?? []).includes(opt.id);
              const isDisabled = profile.notify_all;
              return (
                <button
                  key={opt.id}
                  onClick={() => !isDisabled && toggleCategory(opt.id)}
                  disabled={isDisabled}
                  className={`relative flex flex-col items-start gap-0.5 px-3 py-2.5 rounded-sm border transition-all text-left ${
                    isDisabled
                      ? "border-border/50 bg-muted/30 cursor-not-allowed opacity-50"
                      : isSelected
                      ? "border-foreground/40 bg-foreground/5"
                      : "border-border hover:border-foreground/20"
                  }`}
                >
                  <span className={`text-sm ${isSelected ? "text-foreground font-medium" : "text-foreground/70"}`}>
                    {opt.label}
                  </span>
                  {isSelected && (
                    <span className="absolute top-2 right-2">
                      <Check size={12} strokeWidth={2.5} className="text-foreground/60" />
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        </section>

        {/* 通知開關 */}
        <section className="bg-card border border-border rounded-sm p-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2.5">
              {profile.notify_all ? (
                <Bell size={16} className="text-foreground/60" />
              ) : (
                <BellOff size={16} className="text-muted-foreground/40" />
              )}
              <div>
                <h2 className="text-xs font-medium text-foreground">接收所有公告</h2>
                <p className="text-[10px] text-muted-foreground/50 font-light mt-0.5">
                  {profile.notify_all
                    ? "將收到所有公告（重要 + 分類），部別與類別已鎖定"
                    : "僅接收已選擇的公告類型"}
                </p>
              </div>
            </div>
            <button
              role="switch"
              aria-checked={profile.notify_all}
              onClick={() => {
                const newNotifyAll = !profile.notify_all;
                setProfile((prev) => ({
                  ...prev,
                  notify_all: newNotifyAll,
                  division: newNotifyAll ? "all" : prev.division,
                  notify_categories: newNotifyAll ? ALL_CATEGORY_IDS : prev.notify_categories,
                }));
              }}
              className={`relative w-10 h-[22px] rounded-full transition-colors duration-200 ${
                profile.notify_all ? "bg-foreground/80" : "bg-muted-foreground/20"
              }`}
            >
              <span
                className={`absolute top-[3px] left-[3px] w-4 h-4 rounded-full bg-background shadow-sm transition-transform duration-200 ${
                  profile.notify_all ? "translate-x-[18px]" : "translate-x-0"
                }`}
              />
            </button>
          </div>
        </section>

        {/* 同步按鈕 */}
        <Button
          onClick={handleSync}
          className="w-full rounded-sm"
          disabled={syncStatus === "syncing" || !profileReady}
        >
          {syncStatus === "syncing" ? (
            <span className="flex items-center gap-1.5">
              <RefreshCw size={14} className="animate-spin" /> 同步中...
            </span>
          ) : syncStatus === "synced" ? (
            <span className="flex items-center gap-1.5">
              <Check size={14} /> 已同步
            </span>
          ) : syncStatus === "error" ? (
            "同步失敗，請再試一次"
          ) : !profileReady ? (
            <span className="flex items-center gap-1.5">
              <RefreshCw size={14} className="animate-spin" /> 載入資料中...
            </span>
          ) : (
            <span className="flex items-center gap-1.5">
              <RefreshCw size={14} /> 同步設定
            </span>
          )}
        </Button>

        {/* 資料管理 */}
        <section className="bg-card border border-border rounded-sm p-4">
          <h2 className="text-xs font-medium text-foreground mb-3">資料管理</h2>
          <Button
            variant="outline"
            size="sm"
            className="w-full rounded-sm text-xs bg-transparent"
            onClick={() => {
              if (confirm("確定要清除所有本機資料嗎？此操作無法復原。")) {
                localStorage.clear();
                window.location.reload();
              }
            }}
          >
            清除所有本機資料
          </Button>
        </section>

        {/* 更新內容 */}
        <section className="bg-card border border-border rounded-sm p-4">
          <div className="flex items-center justify-between mb-2">
            <h2 className="text-xs font-medium text-foreground">更新內容</h2>
            <select
              value={changelogVersion}
              onChange={(e) => setChangelogVersion(e.target.value)}
              className="bg-transparent border border-border/50 text-[10px] rounded outline-none p-1 text-muted-foreground/70"
            >
              {CHANGELOG.map((entry) => (
                <option key={entry.version} value={entry.version}>
                  v{entry.version}
                </option>
              ))}
            </select>
          </div>
          <div className="text-[11px] text-muted-foreground/70 font-light space-y-3">
            {CHANGELOG.filter(e => e.version === changelogVersion).map((entry) => (
              <div key={entry.version}>
                <ul className="list-disc list-inside space-y-0.5 pl-0.5">
                  {entry.changes.map((c, i) => (
                    <li key={i}>{c}</li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </section>

        {/* 診斷資訊 */}
        <section className="bg-card border border-border rounded-sm p-4">
          <h2 className="text-xs font-medium text-foreground mb-2">診斷資訊</h2>
          <div className="space-y-1.5 text-[11px] text-muted-foreground/60 font-light font-mono">
            <div className="flex justify-between">
              <span>App 版本</span>
              <span className="text-muted-foreground/80">v{APP_VERSION}</span>
            </div>
            <button
              onClick={copyDeviceId}
              className="flex justify-between w-full text-left hover:bg-muted/50 -mx-1 px-1 rounded transition-colors"
            >
              <span>Device ID</span>
              <span className="flex items-center gap-1 text-muted-foreground/80 text-[10px] break-all text-right max-w-[60%]">
                {deviceId}
                {copied ? <ClipboardCheck size={10} className="shrink-0 text-green-500" /> : <Copy size={10} className="shrink-0" />}
              </span>
            </button>
            <div className="flex justify-between">
              <span>最後同步</span>
              <span className="text-muted-foreground/80">
                {profile.updated_at
                  ? new Date(profile.updated_at).toLocaleString("zh-TW")
                  : "尚未同步"}
              </span>
            </div>
          </div>
        </section>

        <footer className="pt-2 border-t border-dashed border-border space-y-2">
          <div className="flex justify-center gap-3 text-[10px] text-muted-foreground/50 font-light">
            <button onClick={() => setSubPage("privacy")} className="underline underline-offset-2 hover:text-muted-foreground/70 transition-colors">隱私權政策</button>
            <span>·</span>
            <button onClick={() => setSubPage("licenses")} className="underline underline-offset-2 hover:text-muted-foreground/70 transition-colors">開源授權</button>
          </div>
          <p className="text-[10px] text-muted-foreground/40 text-center font-light tracking-wider">
            南科實中 NNKIEH
          </p>
        </footer>
      </div>
    </div>
  );
}
