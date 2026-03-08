// lib/firebase.ts
import { isNative, isPluginAvailable } from "./platform";

const firebaseConfig = {
  apiKey: "AIzaSyAO-I7ZaPbUypyDatyJjxtSfGwZsuyvrHw",
  authDomain: "eminent-clover-390908.firebaseapp.com",
  projectId: "eminent-clover-390908",
  storageBucket: "eminent-clover-390908.firebasestorage.app",
  messagingSenderId: "493147023714",
  appId: "1:493147023714:web:e544bd17163b8c7323643b",
  measurementId: "G-QJSPPTFC51"
};

// 延遲初始化 firebase app，避免在原生環境 module load 就出問題
let _app: any = null;
const getFirebaseApp = async () => {
  if (_app) return _app;
  const { initializeApp, getApps } = await import("firebase/app");
  _app = getApps().length === 0 ? initializeApp(firebaseConfig) : getApps()[0];
  return _app;
};

/**
 * 取得推播 Token
 * - Web / PWA：使用 Firebase Cloud Messaging (FCM Web)
 * - Capacitor Native：使用 @capacitor/push-notifications 原生插件
 */
export const getFCMToken = async (): Promise<string | null> => {
  try {
    // --- 原生 App：走 Capacitor Push Notifications ---
    if (isNative() && isPluginAvailable('PushNotifications')) {
      try {
        const { PushNotifications } = await import('@capacitor/push-notifications');

        // 先清除舊的 listeners 避免重複
        await PushNotifications.removeAllListeners();

        // 請求推播權限
        const permResult = await PushNotifications.requestPermissions();
        if (permResult.receive !== 'granted') {
          console.warn('推播權限未授予');
          return null;
        }

        // 用 Promise 包裝：先綁 listener 再 register，確保不漏事件
        return await new Promise<string | null>((resolve) => {
          let resolved = false;
          const done = (value: string | null) => {
            if (resolved) return;
            resolved = true;
            resolve(value);
          };

          PushNotifications.addListener('registration', (token) => {
            done(token.value);
          });

          PushNotifications.addListener('registrationError', (err) => {
            console.error('Native Push Registration Error:', err);
            done(null);
          });

          // 10 秒超時
          setTimeout(() => done(null), 10000);

          // 觸發註冊（可能因缺少 google-services.json 而失敗）
          PushNotifications.register().catch((err) => {
            console.error('PushNotifications.register() failed:', err);
            done(null);
          });
        });
      } catch (nativeErr) {
        // 原生推播完全失敗（缺少設定檔等）→ 不崩潰，回傳 null
        console.error('原生推播初始化失敗（可能缺少 google-services.json）:', nativeErr);
        return null;
      }
    }

    // --- Web / PWA：走 FCM Web SDK ---
    // 延遲載入 firebase/messaging 避免在原生環境中 import 時就崩潰
    const firebaseApp = await getFirebaseApp();
    const { getMessaging, getToken } = await import("firebase/messaging");

    // 確保 Service Worker 已註冊並取得 registration
    let swRegistration: ServiceWorkerRegistration | undefined;
    if ("serviceWorker" in navigator) {
      swRegistration = await navigator.serviceWorker.ready;
    }

    const messaging = getMessaging(firebaseApp);
    const token = await getToken(messaging, {
      vapidKey: "BJBKkX8w8av_8N-a2wjqOFw5MKL69PZBENhDEfIf_KDocqB5n2ywENrMypfz5lxhDuboH5VGHwko9ESsUuabr-E",
      serviceWorkerRegistration: swRegistration,
    });
    return token;
  } catch (error) {
    console.error("FCM Token 取得失敗", error);
    return null;
  }
};