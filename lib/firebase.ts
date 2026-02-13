// lib/firebase.ts
import { initializeApp, getApps } from "firebase/app";
import { getMessaging, getToken } from "firebase/messaging";

const firebaseConfig = {
  apiKey: "AIzaSyAO-I7ZaPbUypyDatyJjxtSfGwZsuyvrHw",
  authDomain: "eminent-clover-390908.firebaseapp.com",
  projectId: "eminent-clover-390908",
  storageBucket: "eminent-clover-390908.firebasestorage.app",
  messagingSenderId: "493147023714",
  appId: "1:493147023714:web:e544bd17163b8c7323643b",
  measurementId: "G-QJSPPTFC51"
};

const app = getApps().length === 0 ? initializeApp(firebaseConfig) : getApps()[0];

export const getFCMToken = async () => {
  try {
    const messaging = getMessaging(app);
    const token = await getToken(messaging, {
      vapidKey: "BJBKkX8w8av_8N-a2wjqOFw5MKL69PZBENhDEfIf_KDocqB5n2ywENrMypfz5lxhDuboH5VGHwko9ESsUuabr-E", 
    });
    return token;
  } catch (error) {
    console.error("FCM Token 取得失敗", error);
    return null;
  }
};