export const runtime = "nodejs";

import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
//import jwt from "jsonwebtoken";

export async function POST(request: Request) {
  console.log("=== START APPROVE API ===");
  console.log("Request Body:", await request.text()); // 先讀取原始 body 以供除錯
  console.log(process.env)
  /*
  try {
    const secret = process.env.JWT_SECRET?.trim();

    // 診斷環境變數
    console.log("[Approve API] JWT_SECRET raw:", JSON.stringify(secret));
    console.log("[Approve API] JWT_SECRET length:", secret?.length || 0);

    if (!secret) {
      console.error("[Config Error] JWT_SECRET 未定義或為空");
      return NextResponse.json(
        { success: false, message: "伺服器環境配置錯誤" },
        { status: 500 }
      );
    }

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

    // 取得授權請求
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

    // 檢查狀態
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

    // 簽發 JWT
    const token = jwt.sign(
      {
        role: authReq.target_role || "admin",
        deviceId: authReq.requester_id,
      },
      secret,
      { algorithm: "HS256", expiresIn: "2h" }
    );

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
    */
}