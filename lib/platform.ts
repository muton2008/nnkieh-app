/**
 * 平台偵測工具
 * 統一判斷目前運行環境：Web / PWA / Capacitor (iOS / Android)
 */
import { Capacitor } from '@capacitor/core';

export type Platform = 'web' | 'ios' | 'android';

/** 是否跑在 Capacitor 原生殼中 */
export function isNative(): boolean {
  return Capacitor.isNativePlatform();
}

/** 是否為 iOS（含 Capacitor iOS） */
export function isIOS(): boolean {
  return Capacitor.getPlatform() === 'ios';
}

/** 是否為 Android（含 Capacitor Android） */
export function isAndroid(): boolean {
  return Capacitor.getPlatform() === 'android';
}

/** 取得目前平台名稱 */
export function getPlatform(): Platform {
  return Capacitor.getPlatform() as Platform;
}

/** 是否為 PWA（以 standalone 模式開啟的網頁） */
export function isPWA(): boolean {
  if (typeof window === 'undefined') return false;
  return (
    window.matchMedia('(display-mode: standalone)').matches ||
    (window.navigator as any).standalone === true
  );
}

/** 是否為純網頁（非 PWA、非原生） */
export function isWeb(): boolean {
  return !isNative() && !isPWA();
}

/** 檢查某個 Capacitor 插件是否可用 */
export function isPluginAvailable(pluginName: string): boolean {
  return Capacitor.isPluginAvailable(pluginName);
}

/**
 * 取得 API 的 base URL。
 * - Web / PWA：使用相對路徑（同 origin）
 * - Capacitor Native：API 打遠端已部署的伺服器
 */
export function getApiBaseUrl(): string {
  if (isNative()) {
    const url = process.env.NEXT_PUBLIC_API_BASE_URL || 'https://nnkieh-app.vercel.app';
    // 移除尾端斜線，避免 /api 路徑產生雙斜線
    return url.replace(/\/+$/, '');
  }
  return '';
}
