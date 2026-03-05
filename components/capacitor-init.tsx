"use client";

import { useEffect } from "react";
import { isNative, isPluginAvailable, isIOS } from "@/lib/platform";
import { initReminders, sendTestNotification } from "@/lib/reminders";

/**
 * 初始化 Capacitor 原生插件（StatusBar、Keyboard、LocalNotifications 等）
 * 只在原生 App 環境中生效，Web / PWA 不會觸發。
 */
export function CapacitorInit() {
  useEffect(() => {
    if (!isNative()) return;

    // 標記 body 為原生 App 模式
    document.body.classList.add("native-app");

    // 初始化 StatusBar
    if (isPluginAvailable("StatusBar")) {
      import("@capacitor/status-bar").then(({ StatusBar, Style }) => {
        StatusBar.setStyle({ style: Style.Light });
        if (!isIOS()) {
          StatusBar.setBackgroundColor({ color: "#FAF8F5" });
        }
      }).catch(() => {});
    }

    // 初始化 Keyboard（收起鍵盤時恢復滾動）
    if (isPluginAvailable("Keyboard")) {
      import("@capacitor/keyboard").then(({ Keyboard }) => {
        Keyboard.setAccessoryBarVisible({ isVisible: true });
      }).catch(() => {});
    }

    // 初始化 LocalNotifications（請求提醒權限 + 建立通知頻道）
    initReminders().then(async (granted) => {
      console.log("[CapacitorInit] Reminders init result:", granted);
      
      // 首次授權成功後發送測試通知，讓使用者確認
      if (granted) {
        const hasTestedKey = "reminder_test_sent";
        if (!localStorage.getItem(hasTestedKey)) {
          const sent = await sendTestNotification();
          if (sent) {
            localStorage.setItem(hasTestedKey, "1");
          }
        }
      }
    }).catch((err) => {
      console.error("[CapacitorInit] Reminders init error:", err);
    });
  }, []);

  return null;
}
