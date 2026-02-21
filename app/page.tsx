"use client";

import { useState, useEffect, useCallback } from "react";
import { BottomNav } from "@/components/bottom-nav";
import { TabId } from "@/lib/types/common";
import { HomePage } from "@/components/home-page";
import { TimetablePage } from "@/components/timetable-page";
import { TransportPage } from "@/components/transport-page";
import { CalendarPage } from "@/components/calendar-page";
import { NewsPage } from "@/components/news-page";
import { SettingsPage } from "@/components/settings-page";
import { AdminProvider } from "@/components/admin-context";
import { ApproveDrawer } from "@/components/approve-drawer";

// UUID generation function
function generateUUID(): string {
  return typeof crypto !== 'undefined' && crypto.randomUUID 
    ? crypto.randomUUID() 
    : "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
        const r = (Math.random() * 16) | 0;
        const v = c === "x" ? r : (r & 0x3) | 0x8;
        return v.toString(16);
      });
}

export default function Page() {
  const [activeTab, setActiveTab] = useState<TabId>("home");
  const [deviceId, setDeviceId] = useState<string | null>(null);
  const [authRequestId, setAuthRequestId] = useState<string | null>(null);

  // Device UUID identification
  useEffect(() => {
    let id = localStorage.getItem("device_id");
    if (!id) {
      id = generateUUID();
      localStorage.setItem("device_id", id);
    }
    setDeviceId(id);
  }, []);

  // 監聽 URL 參數 auth_request_id（來自 FCM 通知點擊）
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const reqId = params.get("auth_request_id");
    if (reqId) {
      setAuthRequestId(reqId);
      // 自動切換到行事曆分頁（讓管理員知道上下文）
      setActiveTab("calendar");
    }
  }, []);

  // 監聽 FCM 前景訊息（Service Worker message）
  useEffect(() => {
    if (!("serviceWorker" in navigator)) return;

    const handleMessage = (event: MessageEvent) => {
      const data = event.data;
      if (data?.type === "auth_request" && data?.auth_request_id) {
        setAuthRequestId(data.auth_request_id);
        setActiveTab("calendar");
      }
    };

    navigator.serviceWorker.addEventListener("message", handleMessage);
    return () => navigator.serviceWorker.removeEventListener("message", handleMessage);
  }, []);

  const handleCloseApproveDrawer = useCallback(() => {
    setAuthRequestId(null);
    // 清除 URL 參數
    const url = new URL(window.location.href);
    url.searchParams.delete("auth_request_id");
    window.history.replaceState({}, "", url.toString());
  }, []);

  const renderPage = () => {
    if (!deviceId) {
      return <div className="flex items-center justify-center h-full">載入中...</div>;
    }
    switch (activeTab) {
      case "home":
        return <HomePage onNavigate={setActiveTab} deviceId={deviceId} />;
      case "timetable":
        return <TimetablePage deviceId={deviceId} />;
      case "transport":
        return <TransportPage />;
      case "calendar":
        return <CalendarPage deviceId={deviceId} />;
      case "news":
        return <NewsPage />;
      case "settings":
        return <SettingsPage deviceId={deviceId} />;
      default:
        return <HomePage onNavigate={setActiveTab} deviceId={deviceId} />;
    }
  };

  return (
    <AdminProvider>
      <main className="min-h-screen flex flex-col relative">
        <div className="flex-1">{renderPage()}</div>
        <BottomNav activeTab={activeTab} onTabChange={setActiveTab} />

        {/* B端：全域核准抽屜（由 URL 參數或 FCM 訊息觸發） */}
        {deviceId && (
          <ApproveDrawer
            authRequestId={authRequestId}
            deviceId={deviceId}
            onClose={handleCloseApproveDrawer}
          />
        )}
      </main>
    </AdminProvider>
  );
}
