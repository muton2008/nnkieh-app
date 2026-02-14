"use client";

import { useState, useEffect, useCallback } from "react";
import { Check, RefreshCw, Bell, BellOff } from "lucide-react";
import { Button } from "@/components/ui/button";
import { getFCMToken } from "@/lib/firebase";

import {
  DEFAULT_USER_PROFILE,
  UserProfile,
  SchoolDivision,
} from "@/lib/types/user";
import {
  getLocalUserProfile,
  saveLocalUserProfile,
  syncUserProfile,
  fetchUserProfile,
} from "@/lib/api-client";
import { APP_VERSION } from "@/lib/version";

const DIVISION_OPTIONS: { value: SchoolDivision; label: string; desc: string }[] = [
  { value: "no disturb", label: "都不", desc: "不接收任何重要通知" },
  { value: "junior", label: "國中部", desc: "僅接收國中部重要通知" },
  { value: "high", label: "高中部", desc: "僅接收高中部重要通知" },
  { value: "all", label: "全部", desc: "接收所有重要通知" },
];

interface SettingsPageProps {
  deviceId: string;
}

export function SettingsPage({ deviceId }: SettingsPageProps) {
  const [profile, setProfile] = useState<UserProfile>({
    ...DEFAULT_USER_PROFILE,
    device_id: deviceId,
  });
  const [syncStatus, setSyncStatus] = useState<"idle" | "syncing" | "synced" | "error">("idle");
  const [loading, setLoading] = useState(true);

  // 進入頁面：先讀 Local，再從後端 fetch 最新
  useEffect(() => {
    let cancelled = false;

    const init = async () => {
      // 1. 讀取 LocalStorage
      const stored = getLocalUserProfile();
      const local = stored
        ? { ...stored, device_id: deviceId }
        : { ...DEFAULT_USER_PROFILE, device_id: deviceId };
      if (!cancelled) {
        setProfile(local);
        setLoading(false);
      }

      // 2. 若有 device_id，從後端取得最新 profile
      if (deviceId) {
        try {
          const res = await fetchUserProfile(deviceId);
          if (!cancelled && res.success && res.profile) {
            const merged = { ...res.profile, device_id: deviceId };
            setProfile(merged);
            saveLocalUserProfile(merged);
          }
        } catch (e) {
          console.error("[SettingsPage] fetch remote profile error:", e);
        }
      }
    };

    init();
    return () => { cancelled = true; };
  }, [deviceId]);

  const handleSync = useCallback(async () => {
    if (syncStatus === "syncing") return;
    setSyncStatus("syncing");
    const permission = await Notification.requestPermission();
    try {
      if (permission === "granted") {
        const registration = await navigator.serviceWorker.ready;
        const fcmToken = await getFCMToken();
        if (!fcmToken) {
          alert("無法取得 FCM Token，請確認瀏覽器設定");
          setSyncStatus("error");
          setTimeout(() => setSyncStatus("idle"), 2000);
          return;
        }
        const updatedProfile = { ...profile, fcm_token: fcmToken };
        await syncUserProfile(updatedProfile);
        setProfile(updatedProfile);
        saveLocalUserProfile(updatedProfile);
        setSyncStatus("synced");
      } else if (profile.division !== "no disturb" || profile.notify_all) {
        alert("需要通知權限才能同步設定");
        setSyncStatus("error");
      }
    } catch {
      setSyncStatus("error");
    }
    setTimeout(() => setSyncStatus("idle"), 2000);
  }, [profile]);

  const updateField = useCallback(
    <K extends keyof UserProfile>(field: K, value: UserProfile[K]) => {
      setProfile((prev) => ({ ...prev, [field]: value }));
    },
    []
  );

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full">
        <p className="text-sm text-muted-foreground">載入中...</p>
      </div>
    );
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
                  {profile.notify_all ? "將收到所有公告通知，部別選擇已鎖定" : "僅接收重要公告通知"}
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
          disabled={syncStatus === "syncing"}
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

        {/* 診斷資訊 */}
        <section className="bg-card border border-border rounded-sm p-4">
          <h2 className="text-xs font-medium text-foreground mb-2">診斷資訊</h2>
          <div className="space-y-1.5 text-[11px] text-muted-foreground/60 font-light font-mono">
            <div className="flex justify-between">
              <span>App 版本</span>
              <span className="text-muted-foreground/80">v{APP_VERSION}</span>
            </div>
            <div className="flex justify-between">
              <span>Device ID</span>
              <span className="text-muted-foreground/80 text-[10px] break-all text-right max-w-[60%]">
                {deviceId}
              </span>
            </div>
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

        <footer className="pt-2 border-t border-dashed border-border">
          <p className="text-[10px] text-muted-foreground/40 text-center font-light tracking-wider">
            南科實中 NNKIEH
          </p>
        </footer>
      </div>
    </div>
  );
}
