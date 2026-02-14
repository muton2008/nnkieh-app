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
  
  const notificationTitle = payload.notification.title;
  const notificationOptions = {
    body: payload.notification.body,
    icon: '/icon-192.png',
  };

  self.registration.showNotification(notificationTitle, notificationOptions);
});