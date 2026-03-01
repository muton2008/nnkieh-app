import type { CapacitorConfig } from '@capacitor/cli';
import { KeyboardResize } from '@capacitor/keyboard';

/**
 * Capacitor 混合模式：
 * - 前端頁面靜態匯出打包進 App（本地離線可用）
 * - API 呼叫指向遠端已部署的 Next.js 伺服器
 *
 * 建置流程：
 *   npm run cap:build    → 靜態匯出到 out/ + cap sync
 *   npm run cap:android  → 開啟 Android Studio
 */

const config: CapacitorConfig = {
  appId: 'com.nnkieh.app',
  appName: '南科實中校園助手',
  webDir: 'out',  // 靜態匯出的前端檔案
  plugins: {
    CapacitorHttp: {
      enabled: true,  // 原生 HTTP：自動攔截 fetch，繞過 CORS
    },
    PushNotifications: {
      presentationOptions: ['badge', 'sound', 'alert'],
    },
    Keyboard: {
      resize: KeyboardResize.Body,
      resizeOnFullScreen: true,
    },
    StatusBar: {
      style: 'LIGHT',
      backgroundColor: '#FAF8F5',
    },
  },
  ios: {
    contentInset: 'automatic',
    scheme: 'NNKIEHApp',
  },
  android: {
    allowMixedContent: true,
  },
};

export default config;
