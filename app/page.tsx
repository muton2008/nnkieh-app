"use client";

import { useState, useEffect, useCallback, useRef } from "react";
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

export default function Page() {
  const [activeTab, setActiveTab] = useState<TabId>("home");
  const [deviceId, setDeviceId] = useState<string | null>(null);
  const [authRequestId, setAuthRequestId] = useState<string | null>(null);
  const [forceApproveOpen, setForceApproveOpen] = useState(false);
  const prevTabRef = useRef<TabId>(activeTab);

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
    const reqId = params.get("auth_request_id");
    if (reqId) {
      setAuthRequestId(reqId);
      // 自動切換到行事曆分頁（讓管理員知道上下文）
      setActiveTab("calendar");
    }
  }, []);

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
            if (data.type === 'auth_request' && data.auth_request_id) {
              setAuthRequestId(data.auth_request_id);
              setActiveTab('calendar');
            }
          }
        );
        // 點擊推播通知
        const actionListener = PushNotifications.addListener(
          'pushNotificationActionPerformed',
          (action) => {
            const data = action.notification.data || {};
            if (data.type === 'auth_request' && data.auth_request_id) {
              setAuthRequestId(data.auth_request_id);
              setActiveTab('calendar');
            }
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
      if (data?.type === "auth_request" && data?.auth_request_id) {
        setAuthRequestId(data.auth_request_id);
        setActiveTab("calendar");
      }
    };

    navigator.serviceWorker.addEventListener("message", handleMessage);
    return () => navigator.serviceWorker.removeEventListener("message", handleMessage);
  }, []);

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
        return <CalendarPage deviceId={deviceId} onOpenApproveDrawer={handleOpenApproveDrawer} />;
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