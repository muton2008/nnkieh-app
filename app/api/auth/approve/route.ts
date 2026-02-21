import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { SignJWT } from "jose";

export async function POST(request: Request) {
  try {
    console.log("start processing approve request");
    // 環境變數讀取與安全檢查
    const secretFromEnv = process.env.JWT_SECRET;
    
    // 輸出日誌以便在 Vercel Logs 中排查 (不會印出真實金鑰)
    console.log("[Approve API] Key status:", !!secretFromEnv);
    console.log("[Approve API] Key length:", secretFromEnv?.length || 0);

    if (!secretFromEnv || secretFromEnv.trim().length === 0) {
      console.error("[Config Error] JWT_SECRET is undefined or empty");
      return NextResponse.json(
        { success: false, message: "伺服器環境配置錯誤" },
        { status: 500 }
      );
    }

    // 金鑰解碼處理
    // 針對你提供的 44 字元 Base64 金鑰 (含 / 與 =) 進行處理
    let jwtSecretKey: Uint8Array;
    try {
      if (secretFromEnv.length === 44 && (secretFromEnv.includes("/") || secretFromEnv.endsWith("="))) {
        jwtSecretKey = Buffer.from(secretFromEnv, "base64");
      } else {
        jwtSecretKey = new TextEncoder().encode(secretFromEnv);
      }
    } catch (e) {
      console.error("[Encoding Error] Failed to decode secret key");
      return NextResponse.json(
        { success: false, message: "金鑰解析失敗" },
        { status: 500 }
      );
    }

    // 最終防撞檢查
    if (!jwtSecretKey || jwtSecretKey.length === 0) {
      throw new Error("Encoded secret key has zero length");
    }

    // 解析請求內容
    const { requestId, inputCode, admin_device_id } = await request.json();
    const supabase = await createClient();

    // 驗證管理員 B 是否在白名單
    const { data: admin, error: adminError } = await supabase
      .from("admin_users")
      .select("name, role")
      .eq("device_id", admin_device_id)
      .single();

    if (adminError || !admin) {
      return NextResponse.json(
        { success: false, message: "拒絕存取：您不在白名單中" },
        { status: 403 }
      );
    }

    // 取得並驗證授權請求
    const { data: authReq, error: reqError } = await supabase
      .from("auth_requests")
      .select("*")
      .eq("id", requestId)
      .single();

    if (reqError || !authReq) {
      return NextResponse.json(
        { success: false, message: "查無此授權請求" },
        { status: 404 }
      );
    }

    // 衝突檢查
    if (authReq.status !== "pending") {
      const statusMsg =
        authReq.status === "approved" || authReq.status === "completed"
          ? "這項請求已被其他管理員核准囉！"
          : "這項請求已失效或被拒絕。";
      return NextResponse.json({ success: false, message: statusMsg }, { status: 409 });
    }

    // 過期檢查
    if (new Date(authReq.expires_at) < new Date()) {
      await supabase
        .from("auth_requests")
        .update({ status: "expired" })
        .eq("id", requestId)
        .eq("status", "pending");
      return NextResponse.json(
        { success: false, message: "此授權請求已過期" },
        { status: 410 }
      );
    }

    // 驗證挑戰碼
    if (authReq.visual_challenge.toString() !== inputCode.toString()) {
      return NextResponse.json(
        { success: false, message: "挑戰碼錯誤，請重新確認 A 螢幕上的數字" },
        { status: 400 }
      );
    }

    // 簽發 JWT 給 A (2 小時效期)
    const token = await new SignJWT({
      role: authReq.target_role || "admin",
      deviceId: authReq.requester_id,
    })
      .setProtectedHeader({ alg: "HS256" })
      .setExpirationTime("2h")
      .sign(jwtSecretKey);

    // 原子更新狀態
    const { data: updated, error: updateError } = await supabase
      .from("auth_requests")
      .update({
        status: "approved",
        session_token: token,
        admin_id: admin_device_id,
      })
      .eq("id", requestId)
      .eq("status", "pending")
      .select()
      .single();

    if (updateError || !updated) {
      return NextResponse.json(
        { success: false, message: "此請求已被其他管理員處理" },
        { status: 409 }
      );
    }

    return NextResponse.json({ success: true, message: "核准成功！" });

  } catch (error: any) {
    console.error("Approve Error Detail:", error);
    return NextResponse.json(
      {
        success: false,
        message: "伺服器錯誤",
        detail: error.message,
      },
      { status: 500 }
    );
  }
}