"use client";

import { useEffect } from "react";

export function ServiceWorkerRegister() {
  useEffect(() => {
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