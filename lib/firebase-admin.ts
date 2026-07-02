import { initializeApp, getApps, getApp, cert, App } from "firebase-admin/app";
import { getMessaging } from "firebase-admin/messaging";

/**
 * 初始化 Firebase Admin SDK
 */
function getFirebaseAdmin(): App {
  const apps = getApps();
  // 如果已經初始化，直接回傳
  if (apps.length > 0) {
    return apps[0]!;
  }

  // 取得環境變數
  const serviceAccountRaw = process.env.FIREBASE_SERVICE_ACCOUNT;

  if (!serviceAccountRaw) {
    throw new Error("❌ 找不到環境變數 FIREBASE_SERVICE_ACCOUNT");
  }

  try {
    // 解析 JSON
    const serviceAccount = JSON.parse(serviceAccountRaw);

    // 處理 Private Key 換行問題 (必要)
    if (serviceAccount.private_key) {
      serviceAccount.private_key = serviceAccount.private_key.replace(/\\n/g, '\n');
    }

    // 初始化
    return initializeApp({
      credential: cert(serviceAccount),
      projectId: serviceAccount.project_id,
    });
  } catch (error) {
    console.error("🔥 Firebase Admin 初始化嚴重錯誤:", error);
    throw error;
  }
}

/**
 * 對 FCM Topic 發送通知
 */
export async function sendTopicNotification(
  topic: string,
  title: string,
  body: string,
  data?: Record<string, string>
): Promise<string | null> {
  try {
    const app = getFirebaseAdmin();
    const messaging = getMessaging(app); // ✨ 改用新版方法

    const response = await messaging.send({
      topic: topic.replace("/topics/", ""),
      notification: { title, body },
      data: data || {},
      webpush: {
        fcmOptions: {
          link: data?.link || "/",
        },
      },
    });

    console.log(" [FCM] 通知已發送:", response);
    return response;
  } catch (error) {
    console.error(" [FCM] 發送通知失敗:", error);
    return null;
  }
}

/**
 * 對多個 FCM Token 發送通知（精準推送，非 Topic）
 */
export async function sendToTokens(
  tokens: string[],
  title: string,
  body: string,
  data?: Record<string, string>
): Promise<{ successCount: number; failureCount: number }> {
  if (tokens.length === 0) return { successCount: 0, failureCount: 0 };

  try {
    const app = getFirebaseAdmin();
    const messaging = getMessaging(app); // ✨ 改用新版方法

    const response = await messaging.sendEachForMulticast({
      tokens,
      notification: { title, body },
      data: data || {},
      webpush: {
        fcmOptions: {
          link: data?.link || "/",
        },
      },
    });

    console.log(
      ` [FCM] 精準推送完成: ${response.successCount} 成功, ${response.failureCount} 失敗`
    );

    // 列出失敗的 token 供除錯
    response.responses.forEach((resp, idx) => {
      if (!resp.success) {
        console.warn(` [FCM] token[${idx}] 失敗:`, resp.error?.message);
      }
    });

    return {
      successCount: response.successCount,
      failureCount: response.failureCount,
    };
  } catch (error) {
    console.error(" [FCM] 精準推送錯誤:", error);
    return { successCount: 0, failureCount: 0 };
  }
}