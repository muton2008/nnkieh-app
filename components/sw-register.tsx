"use client";

import { useEffect } from "react";
import { isNative } from "@/lib/platform";

export function ServiceWorkerRegister() {
  useEffect(() => {
    // 原生 App 不支援 Service Worker，跳過註冊
    if (isNative()) return;

    if ("serviceWorker" in navigator) {
      navigator.serviceWorker
        .register("/firebase-messaging-sw.js")
        .then((registration) => {
          console.log("Service Worker 註冊成功，範圍：", registration.scope);
        })
        .catch((err) => {
          console.error("Service Worker 註冊失敗：", err);
        });
    }
  }, []);

  return null; // 這個組件不需要渲染任何東西
}