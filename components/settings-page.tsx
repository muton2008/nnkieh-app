"use client";

import { useState, useEffect, useCallback } from "react";
import { Check, Copy, Info } from "lucide-react";
import { Button } from "@/components/ui/button";

import type { UserProfile } from "@/lib/types";
import { DEFAULT_USER_PROFILE } from "@/lib/types";
import {
  getLocalUserProfile,
  saveLocalUserProfile,
  syncUserProfile,
} from "@/lib/api-client";

interface SettingsPageProps {
  deviceId: string;
}

export function SettingsPage({ deviceId }: SettingsPageProps) {
  const [profile, setProfile] = useState<UserProfile>({ ...DEFAULT_USER_PROFILE, device_id: deviceId });
  const [saveStatus, setSaveStatus] = useState<"idle" | "saving" | "saved">("idle");
  const [copiedId, setCopiedId] = useState(false);

  useEffect(() => {
    const stored = getLocalUserProfile();
    if (stored) {
      setProfile({ ...stored, device_id: deviceId });
    } else {
      setProfile({ ...DEFAULT_USER_PROFILE, device_id: deviceId });
    }
  }, [deviceId]);

  const handleSave = useCallback(async () => {
    setSaveStatus("saving");
    saveLocalUserProfile(profile);
    try {
      await syncUserProfile(profile);
      setSaveStatus("saved");
      setTimeout(() => setSaveStatus("idle"), 2000);
    } catch {
      setSaveStatus("idle");
    }
  }, [profile]);

  const handleCopyDeviceId = useCallback(() => {
    navigator.clipboard.writeText(deviceId);
    setCopiedId(true);
    setTimeout(() => setCopiedId(false), 2000);
  }, [deviceId]);

  const updateField = useCallback(
    <K extends keyof UserProfile>(field: K, value: UserProfile[K]) => {
      setProfile((prev) => ({ ...prev, [field]: value }));
    },
    []
  );

  return (
    <div className="flex flex-col h-full">
      <header className="px-5 pt-12 pb-4">
        <h1 className="font-serif text-xl font-semibold text-foreground">設定</h1>
        <p className="text-xs text-muted-foreground font-light mt-0.5">個人資料與偏好</p>
      </header>

      <div className="flex-1 overflow-y-auto px-5 pb-24 space-y-5">
        {/* Device ID section */}
        <section className="bg-card border border-border rounded-sm p-4">
          <div className="flex items-center gap-2 mb-3">
            <Info size={14} className="text-muted-foreground/60" />
            <h2 className="text-xs font-medium text-foreground">裝置識別碼</h2>
          </div>
          <div className="flex items-center gap-2">
            <code className="flex-1 text-[11px] text-muted-foreground/70 font-mono bg-muted/50 px-2.5 py-1.5 rounded-sm break-all">
              {deviceId}
            </code>
            <button
              onClick={handleCopyDeviceId}
              className="p-1.5 border border-border rounded-sm text-muted-foreground hover:text-foreground transition-colors flex-shrink-0"
              aria-label="複製裝置 ID"
            >
              {copiedId ? <Check size={13} /> : <Copy size={13} />}
            </button>
          </div>
          <p className="text-[10px] text-muted-foreground/40 font-light mt-2">
            此 ID 用於識別你的裝置，與課表和設定資料綁定。
          </p>
        </section>

        {/* Profile form */}
        <section className="bg-card border border-border rounded-sm p-4 space-y-4">
          <h2 className="text-xs font-medium text-foreground">個人設定</h2>

          <div>
            <label className="text-[11px] text-muted-foreground font-light block mb-1">班級名稱</label>
            <input
              type="text"
              value={profile.class_name}
              onChange={(e) => updateField("class_name", e.target.value)}
              placeholder="例如：高二甲班"
              className="w-full border border-border rounded-sm px-3 py-2 text-sm text-foreground bg-background placeholder:text-muted-foreground/30 focus:outline-none focus:ring-1 focus:ring-ring"
            />
            <p className="text-[10px] text-muted-foreground/40 font-light mt-1">
              將顯示在課表頁面標題下方。
            </p>
          </div>

          <div>
            <label className="text-[11px] text-muted-foreground font-light block mb-1">預設教室</label>
            <input
              type="text"
              value={profile.default_room}
              onChange={(e) => updateField("default_room", e.target.value)}
              placeholder="例如：301"
              className="w-full border border-border rounded-sm px-3 py-2 text-sm text-foreground bg-background placeholder:text-muted-foreground/30 focus:outline-none focus:ring-1 focus:ring-ring"
            />
            <p className="text-[10px] text-muted-foreground/40 font-light mt-1">
              編輯課表時，新增課程會預設此教室編號。
            </p>
          </div>

          <div>
            <label className="text-[11px] text-muted-foreground font-light block mb-1">學校名稱</label>
            <input
              type="text"
              value={profile.school_name}
              onChange={(e) => updateField("school_name", e.target.value)}
              placeholder="例如：南科實中"
              className="w-full border border-border rounded-sm px-3 py-2 text-sm text-foreground bg-background placeholder:text-muted-foreground/30 focus:outline-none focus:ring-1 focus:ring-ring"
            />
          </div>

          <div>
            <label className="text-[11px] text-muted-foreground font-light block mb-1">學年學期</label>
            <input
              type="text"
              value={profile.semester_label}
              onChange={(e) => updateField("semester_label", e.target.value)}
              placeholder="例如：113學年度第二學期"
              className="w-full border border-border rounded-sm px-3 py-2 text-sm text-foreground bg-background placeholder:text-muted-foreground/30 focus:outline-none focus:ring-1 focus:ring-ring"
            />
          </div>
        </section>

        {/* Save button */}
        <Button
          onClick={handleSave}
          className="w-full rounded-sm"
          disabled={saveStatus === "saving"}
        >
          {saveStatus === "saving" ? (
            "儲存中..."
          ) : saveStatus === "saved" ? (
            <span className="flex items-center gap-1.5">
              <Check size={14} /> 已儲存
            </span>
          ) : (
            "儲存設定"
          )}
        </Button>

        {/* About section */}
        <section className="bg-card border border-border rounded-sm p-4">
          <h2 className="text-xs font-medium text-foreground mb-2">關於</h2>
          <div className="space-y-1.5 text-[11px] text-muted-foreground/60 font-light">
            <p>校園生活助手 v1.0</p>
            <p>南科實中 NNKIEH</p>
            <div className="border-t border-dashed border-border mt-3 pt-3">
              <p className="text-[10px] text-muted-foreground/40">
                全校行事曆由管理員統一維護，如需修改請聯繫教務處。
                <br />
                私人行事曆與課表備註僅儲存於你的裝置，同時會同步至雲端備份。
              </p>
            </div>
          </div>
        </section>

        {/* Data management */}
        <section className="bg-card border border-border rounded-sm p-4">
          <h2 className="text-xs font-medium text-foreground mb-3">資料管理</h2>
          <div className="space-y-2">
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
          </div>
        </section>
      </div>
    </div>
  );
}
