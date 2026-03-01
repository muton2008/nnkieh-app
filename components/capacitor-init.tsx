"use client";

import { useEffect } from "react";
import { isNative, isPluginAvailable, isIOS } from "@/lib/platform";

/**
 * 初始化 Capacitor 原生插件（StatusBar、Keyboard 等）
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
  }, []);

  return null;
}
