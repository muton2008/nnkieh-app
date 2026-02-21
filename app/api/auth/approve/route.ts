import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { SignJWT } from "jose";

export async function POST(request: Request) {
  try {
    // 環境變數讀取與處理
    const secretFromEnv = process.env.JWT_SECRET;
    
    if (!secretFromEnv) {
      console.error("[Config Error] 找不到 JWT_SECRET 環境變數");
      return NextResponse.json({ message: "伺服器環境配置錯誤" }, { status: 500 });
    }

    // 如果字串長度是 44 且包含 Base64 特徵，則使用 Buffer 解析
    const JWT_SECRET_ENCODED =  Buffer.from(secretFromEnv, 'base64');
    console.log("✅ JWT Secret 解析成功，位元組長度:", JWT_SECRET_ENCODED.length);

    if (JWT_SECRET_ENCODED.length === 0) {
      throw new Error("解析後的金鑰長度為 0，請檢查環境變數內容");
    }

    // 解析請求內容
    const { requestId, inputCode, admin_device_id } = await request.json();
    const supabase = await createClient();

    // 驗證核准者 (B) 是否在白名單
    const { data: admin, error: adminError } = await supabase
      .from("admin_users")
      .select("name, role")
      .eq("device_id", admin_device_id)
      .single();

    if (adminError || !admin) {
      return NextResponse.json({ message: "拒絕存取：您不在白名單中" }, { status: 403 });
    }

    // 取得授權請求並驗證狀態
    const { data: authReq, error: reqError } = await supabase
      .from("auth_requests")
      .select("*")
      .eq("id", requestId)
      .single();

    if (reqError || !authReq) {
      return NextResponse.json({ message: "查無此授權請求" }, { status: 404 });
    }

    if (authReq.status !== "pending") {
      const statusMsg = (authReq.status === "approved" || authReq.status === "completed")
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
      return NextResponse.json({ success: false, message: "此授權請求已過期" }, { status: 410 });
    }

    // 驗證挑戰碼
    if (authReq.visual_challenge.toString() !== inputCode.toString()) {
      return NextResponse.json({ message: "挑戰碼錯誤，請重新確認 A 螢幕上的數字" }, { status: 400 });
    }

    // 簽發 JWT 給 A
    const token = await new SignJWT({ 
        role: authReq.target_role || "admin", 
        deviceId: authReq.requester_id 
      })
      .setProtectedHeader({ alg: "HS256" })
      .setExpirationTime("2h") 
      .sign(JWT_SECRET_ENCODED); // 使用轉換後的金鑰

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
      return NextResponse.json({ success: false, message: "此請求已被其他管理員處理" }, { status: 409 });
    }

    return NextResponse.json({ success: true, message: "核准成功！" });

  } catch (error: any) {
    console.error("Approve Error:", error);
    return NextResponse.json({ 
      success: false, 
      message: "伺服器錯誤",
      detail: error.message 
    }, { status: 500 });
  }
}