export const runtime = "nodejs";

import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import jwt from "jsonwebtoken";

export async function POST(request: Request) {
  try {
    const secret = process.env.JWT_SECRET?.trim();

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

    // 檢查失敗次數是否已達上限
    const MAX_ATTEMPTS = 5;
    if ((authReq.failed_attempts || 0) >= MAX_ATTEMPTS) {
      // 已鎖定但狀態尚未更新時，補更新為 rejected
      await supabase
        .from("auth_requests")
        .update({ status: "rejected" })
        .eq("id", requestId)
        .eq("status", "pending");
      return NextResponse.json(
        { success: false, message: "驗證失敗次數過多，此請求已鎖定，請重新發起" },
        { status: 423 }
      );
    }

    // 驗證挑戰碼
    if (authReq.visual_challenge.toString() !== inputCode.toString()) {
      const newAttempts = (authReq.failed_attempts || 0) + 1;
      const updatePayload: Record<string, any> = {
        failed_attempts: newAttempts,
      };

      // 達到上限時直接鎖定請求
      if (newAttempts >= MAX_ATTEMPTS) {
        updatePayload.status = "rejected";
      }

      await supabase
        .from("auth_requests")
        .update(updatePayload)
        .eq("id", requestId)
        .eq("status", "pending");

      const remaining = MAX_ATTEMPTS - newAttempts;
      const message = remaining > 0
        ? `挑戰碼錯誤，剩餘 ${remaining} 次嘗試機會`
        : "驗證失敗次數過多，此請求已鎖定，請重新發起";

      return NextResponse.json(
        { success: false, message },
        { status: remaining > 0 ? 400 : 423 }
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
      },
      { status: 500 }
    );
  }
}