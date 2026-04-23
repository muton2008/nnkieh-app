"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import dayjs from "dayjs";
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
import { UpdateDialog } from "@/components/update-dialog";
import { isNative, isPluginAvailable } from "@/lib/platform";
import { getOrRegisterDeviceId } from "@/lib/device-id";
import { toast } from "@/hooks/use-toast";

type NotificationPayload = Record<string, unknown>;

function parseAnnouncementId(raw: unknown): number | null {
  if (typeof raw !== "string" && typeof raw !== "number") return null;
  const num = Number(raw);
  if (!Number.isInteger(num) || num <= 0) return null;
  return num;
}

function parseCalendarDate(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const date = raw.trim().slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return null;
  const parsed = dayjs(date);
  if (!parsed.isValid() || parsed.format("YYYY-MM-DD") !== date) return null;
  return date;
}

function parsePayloadFromLink(rawLink: unknown): NotificationPayload {
  if (typeof rawLink !== "string") return {};
  try {
    const url = new URL(rawLink, window.location.origin);
    const path = url.pathname.toLowerCase();
    const hash = url.hash.toLowerCase();
    const tabFromPath: TabId | undefined = path.includes("calendar")
      ? "calendar"
      : path.includes("news") || path.includes("announcement")
        ? "news"
        : path.includes("settings")
          ? "settings"
          : path.includes("transport")
            ? "transport"
            : path.includes("timetable")
              ? "timetable"
              : path.includes("home")
                ? "home"
                : undefined;
    const tabFromHash: TabId | undefined = hash.includes("calendar")
      ? "calendar"
      : hash.includes("news") || hash.includes("announcement")
        ? "news"
        : undefined;

    return {
      type: url.searchParams.get("type") ?? undefined,
      auth_request_id: url.searchParams.get("auth_request_id") ?? undefined,
      request_id: url.searchParams.get("request_id") ?? undefined,
      requestId: url.searchParams.get("requestId") ?? undefined,
      authRequestId: url.searchParams.get("authRequestId") ?? undefined,
      announcement_id: url.searchParams.get("announcement_id") ?? url.searchParams.get("post_id") ?? undefined,
      calendar_date: url.searchParams.get("calendar_date") ?? url.searchParams.get("target_date") ?? url.searchParams.get("date") ?? undefined,
      tab: url.searchParams.get("tab") ?? tabFromPath ?? tabFromHash,
    };
  } catch {
    return {};
  }
}

function parseNotificationType(raw: unknown): "auth_request" | "announcement" | "calendar" | "" {
  if (typeof raw !== "string") return "";
  const normalized = raw.trim().toLowerCase();
  if (normalized === "auth_request" || normalized === "announcement" || normalized === "calendar") {
    return normalized;
  }
  return "";
}

function clearNotificationQueryParams() {
  const url = new URL(window.location.href);
  const paramsToRemove = [
    "type",
    "auth_request_id",
    "request_id",
    "requestId",
    "authRequestId",
    "announcement_id",
    "post_id",
    "calendar_date",
    "target_date",
    "date",
  ];
  paramsToRemove.forEach((p) => url.searchParams.delete(p));
  window.history.replaceState({}, "", url.pathname + url.search);
}

function parseTabId(raw: unknown): TabId | null {
  if (typeof raw !== "string") return null;
  const value = raw.trim().toLowerCase();
  if (value === "home" || value === "timetable" || value === "transport" || value === "calendar" || value === "news" || value === "settings") {
    return value;
  }
  return null;
}

function pickFirstString(...values: unknown[]): string | null {
  for (const value of values) {
    if (typeof value === "string" && value.trim()) {
      return value.trim();
    }
  }
  return null;
}

function pickAnnouncementId(...values: unknown[]): number | null {
  for (const value of values) {
    const parsed = parseAnnouncementId(value);
    if (parsed) return parsed;
  }
  return null;
}

function pickCalendarDate(...values: unknown[]): string | null {
  for (const value of values) {
    const parsed = parseCalendarDate(value);
    if (parsed) return parsed;
  }
  return null;
}

function pickTabId(...values: unknown[]): TabId | null {
  for (const value of values) {
    const parsed = parseTabId(value);
    if (parsed) return parsed;
  }
  return null;
}

export default function Page() {
  const [activeTab, setActiveTab] = useState<TabId>("home");
  const [deviceId, setDeviceId] = useState<string | null>(null);
  const [authRequestId, setAuthRequestId] = useState<string | null>(null);
  const [forceApproveOpen, setForceApproveOpen] = useState(false);
  const [calendarFocusDate, setCalendarFocusDate] = useState<string | null>(null);
  const [calendarFocusSignal, setCalendarFocusSignal] = useState(0);
  const [announcementFocusId, setAnnouncementFocusId] = useState<number | null>(null);
  const [announcementFocusSignal, setAnnouncementFocusSignal] = useState(0);
  const prevTabRef = useRef<TabId>(activeTab);
  const invalidNotificationToastAtRef = useRef(0);

  const notifyInvalidNotification = useCallback(() => {
    const now = Date.now();
    if (now - invalidNotificationToastAtRef.current < 2500) return;
    invalidNotificationToastAtRef.current = now;
    toast({
      title: "通知內容無法開啟",
      description: "請稍後再試，或手動前往對應頁面查看。",
    });
  }, []);

  const handleNotificationNavigation = useCallback((payload: NotificationPayload) => {
    const fromLink = parsePayloadFromLink(payload.link);
    const fromUrl = parsePayloadFromLink(payload.url);

    const explicitType = parseNotificationType(
      pickFirstString(payload.type, fromUrl.type, fromLink.type)
    );
    const authReqId = pickFirstString(
      payload.auth_request_id,
      payload.request_id,
      payload.requestId,
      payload.authRequestId,
      fromUrl.auth_request_id,
      fromUrl.request_id,
      fromUrl.requestId,
      fromUrl.authRequestId,
      fromLink.auth_request_id,
      fromLink.request_id,
      fromLink.requestId,
      fromLink.authRequestId
    );
    const announcementId = pickAnnouncementId(
      payload.announcement_id,
      payload.post_id,
      fromUrl.announcement_id,
      fromLink.announcement_id
    );
    const calendarDate = pickCalendarDate(
      payload.calendar_date,
      payload.target_date,
      payload.date,
      fromUrl.calendar_date,
      fromLink.calendar_date
    );
    const tab = pickTabId(payload.tab, fromUrl.tab, fromLink.tab);

    let type = explicitType;
    if (!type) {
      if (authReqId) type = "auth_request";
      else if (announcementId) type = "announcement";
      else if (calendarDate) type = "calendar";
    }

    if (type === "auth_request" && authReqId) {
      setAuthRequestId(authReqId);
      setActiveTab("calendar");
      clearNotificationQueryParams();
      return;
    }

    if ((type === "announcement" && announcementId) || (!type && announcementId)) {
      setAnnouncementFocusId(announcementId);
      setAnnouncementFocusSignal((s) => s + 1);
      setActiveTab("news");
      clearNotificationQueryParams();
      return;
    }

    if ((type === "calendar" && calendarDate) || (!type && calendarDate)) {
      setCalendarFocusDate(calendarDate);
      setCalendarFocusSignal((s) => s + 1);
      setActiveTab("calendar");
      clearNotificationQueryParams();
      return;
    }

    // 僅指定頁籤（無特定內容）時也可精確跳頁
    if (!type && tab) {
      setActiveTab(tab);
      clearNotificationQueryParams();
      return;
    }

    // 向下相容：只帶 auth_request_id 但沒 type
    if (authReqId) {
      setAuthRequestId(authReqId);
      setActiveTab("calendar");
      clearNotificationQueryParams();
      return;
    }

    if (explicitType === "announcement" || explicitType === "calendar" || explicitType === "auth_request") {
      notifyInvalidNotification();
    }
  }, [notifyInvalidNotification]);

  // Device 註冊 / 初始化
  useEffect(() => {
    let cancelled = false;
    getOrRegisterDeviceId().then((id) => {
      if (!cancelled) setDeviceId(id);
    }).catch((err) => {
      console.error("裝置 ID 初始化失敗:", err);
    });
    return () => { cancelled = true; };
  }, []);
  // 切換分頁時自動回到頂部
  useEffect(() => {
    window.scrollTo(0, 0);
  }, [activeTab]);

  useEffect(() => {
    if (!deviceId) return; // 等 deviceId 準備好再追蹤，數據會更精準

    // 原生 App 不送 Vercel Analytics（不適用）
    if (isNative()) return;

    // 當分頁改變時，傳送自定義事件給 Vercel（僅 Web / PWA）
    import("@vercel/analytics").then(({ track }) => {
      track("Tab_Switch", {
        from: prevTabRef.current,
        to: activeTab,
        deviceId: deviceId
      });
    }).catch(() => { /* ignore */ });

    // 更新 useRef
    prevTabRef.current = activeTab;
  }, [activeTab, deviceId]);

  // 監聽 URL 參數 auth_request_id（來自 FCM 通知點擊）
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    handleNotificationNavigation({
      type: params.get("type") ?? undefined,
      auth_request_id: params.get("auth_request_id") ?? undefined,
      request_id: params.get("request_id") ?? undefined,
      requestId: params.get("requestId") ?? undefined,
      authRequestId: params.get("authRequestId") ?? undefined,
      announcement_id: params.get("announcement_id") ?? params.get("post_id") ?? undefined,
      calendar_date: params.get("calendar_date") ?? params.get("target_date") ?? params.get("date") ?? undefined,
      tab: params.get("tab") ?? undefined,
    });
  }, [handleNotificationNavigation]);

  // 監聯 FCM 前景訊息（Service Worker message）
  useEffect(() => {
    // --- 原生 App：使用 Capacitor Push Notifications 監聽 ---
    if (isNative() && isPluginAvailable('PushNotifications')) {
      let cleanup: (() => void) | undefined;
      import('@capacitor/push-notifications').then(({ PushNotifications }) => {
        const listener = PushNotifications.addListener(
          'pushNotificationReceived',
          (notification) => {
            const data = notification.data || {};
            handleNotificationNavigation(data);
          }
        );
        // 點擊推播通知
        const actionListener = PushNotifications.addListener(
          'pushNotificationActionPerformed',
          (action) => {
            const data = action.notification.data || {};
            handleNotificationNavigation(data);
          }
        );
        cleanup = () => {
          listener.then(l => l.remove());
          actionListener.then(l => l.remove());
        };
      }).catch((err) => {
        console.error('原生推播 Listener 載入失敗:', err);
      });
      return () => cleanup?.();
    }

    // --- Web / PWA：走 Service Worker message ---
    if (!("serviceWorker" in navigator)) return;

    const handleMessage = (event: MessageEvent) => {
      const data = event.data;
      if (data && typeof data === "object" && "payload" in data) {
        handleNotificationNavigation((data as { payload?: NotificationPayload }).payload || {});
        return;
      }
      if (data && typeof data === "object") {
        handleNotificationNavigation(data as NotificationPayload);
      }
    };

    navigator.serviceWorker.addEventListener("message", handleMessage);
    return () => navigator.serviceWorker.removeEventListener("message", handleMessage);
  }, [handleNotificationNavigation]);

  // Android 實體返回鍵：回到首頁，若已在首頁則最小化
  useEffect(() => {
    if (!isNative() || !isPluginAvailable('App')) return;
    let cleanup: (() => void) | undefined;
    import('@capacitor/app').then(({ App }) => {
      const listener = App.addListener('backButton', () => {
        if (activeTab !== 'home') {
          setActiveTab('home');
        } else {
          App.minimizeApp();
        }
      });
      cleanup = () => { listener.then(l => l.remove()); };
    });
    return () => cleanup?.();
  }, [activeTab]);

  const handleOpenApproveDrawer = useCallback(() => {
    setForceApproveOpen(true);
  }, []);

  const handleCloseApproveDrawer = useCallback(() => {
    setAuthRequestId(null);
    setForceApproveOpen(false);
    // 清除 URL 參數
    const url = new URL(window.location.href);
    url.searchParams.delete("auth_request_id");
    url.searchParams.delete("request_id");
    url.searchParams.delete("requestId");
    url.searchParams.delete("authRequestId");
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
        return (
          <CalendarPage
            deviceId={deviceId}
            onOpenApproveDrawer={handleOpenApproveDrawer}
            focusDate={calendarFocusDate}
            focusDateSignal={calendarFocusSignal}
          />
        );
      case "news":
        return (
          <NewsPage
            focusAnnouncementId={announcementFocusId}
            focusAnnouncementSignal={announcementFocusSignal}
            onConsumed={() => setAnnouncementFocusId(null)}
          />
        );
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
        <UpdateDialog />

        {/* B端：全域核准抽屜（由 URL 參數或 FCM 訊息觸發） */}
        {deviceId && (
          <ApproveDrawer
            authRequestId={authRequestId}
            deviceId={deviceId}
            forceOpen={forceApproveOpen}
            onClose={handleCloseApproveDrawer}
          />
        )}
      </main>
    </AdminProvider>
  );
}