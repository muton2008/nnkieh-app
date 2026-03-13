importScripts('https://www.gstatic.com/firebasejs/9.0.0/firebase-app-compat.js');
importScripts('https://www.gstatic.com/firebasejs/9.0.0/firebase-messaging-compat.js');

// 初始化 Firebase
firebase.initializeApp({
  apiKey: "AIzaSyAO-I7ZaPbUypyDatyJjxtSfGwZsuyvrHw",
  authDomain: "eminent-clover-390908.firebaseapp.com",
  projectId: "eminent-clover-390908",
  storageBucket: "eminent-clover-390908.firebasestorage.app",
  messagingSenderId: "493147023714",
  appId: "1:493147023714:web:e544bd17163b8c7323643b",
  measurementId: "G-QJSPPTFC51"
});

const messaging = firebase.messaging();

// 背景接收通知的處理 (當網頁關閉或在背景時)
messaging.onBackgroundMessage((payload) => {
  console.log('[firebase-messaging-sw.js] 收到背景訊息 ', payload);
  
  const data = payload.data || {};
  const notificationTitle = payload.notification?.title || '校園生活助手';
  const notificationOptions = {
    body: payload.notification?.body || '',
    icon: '/icon-192.png',
    data: data, // 保留 data payload 供 notificationclick 使用
  };

  // 自動補齊深連結 URL（若後端沒帶 link）
  if (data.type === 'auth_request' && data.auth_request_id) {
    notificationOptions.data = {
      ...data,
      url: `/?auth_request_id=${data.auth_request_id}`,
    };
  } else if (data.type === 'calendar' && (data.calendar_date || data.date)) {
    const date = data.calendar_date || data.date;
    notificationOptions.data = {
      ...data,
      url: `/?type=calendar&calendar_date=${encodeURIComponent(date)}`,
    };
  } else if (data.type === 'announcement' && (data.announcement_id || data.post_id)) {
    const announcementId = data.announcement_id || data.post_id;
    notificationOptions.data = {
      ...data,
      url: `/?type=announcement&announcement_id=${encodeURIComponent(announcementId)}`,
    };
  }

  self.registration.showNotification(notificationTitle, notificationOptions);
});

// 點擊通知時，開啟對應頁面
self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  
  const data = event.notification.data || {};
  const targetUrl = data.url || data.link || '/';

  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) => {
      // 嘗試聚焦已開啟的視窗
      for (const client of clientList) {
        if (client.url.includes(self.location.origin) && 'focus' in client) {
          client.focus();
          // 發送訊息給前端，統一由 app/page.tsx 決定跳轉邏輯
          client.postMessage({
            payload: data,
          });
          return;
        }
      }
      // 無已開啟視窗，開新視窗
      if (clients.openWindow) {
        return clients.openWindow(targetUrl);
      }
    })
  );
});