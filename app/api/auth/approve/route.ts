import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { SignJWT } from "jose";

const JWT_SECRET = new TextEncoder().encode(process.env.JWT_SECRET!);

export async function POST(request: Request) {
  try {
    const { requestId, inputCode, admin_device_id } = await request.json();
    const supabase = await createClient();

    // 驗證 B 是否在白名單
    const { data: admin, error: adminError } = await supabase
      .from("admin_users")
      .select("name, role")
      .eq("device_id", admin_device_id)
      .single();

    if (adminError || !admin) {
      return NextResponse.json({ message: "拒絕存取：您不在白名單中" }, { status: 403 });
    }

    // 原子操作：使用條件 UPDATE 防止多人重複核准
    // 只有 status = 'pending' 時才能更新，避免 race condition
    const { data: authReq, error: reqError } = await supabase
      .from("auth_requests")
      .select("*")
      .eq("id", requestId)
      .single();

    if (reqError || !authReq) {
      return NextResponse.json({ message: "查無此授權請求" }, { status: 404 });
    }

    // 衝突檢查：狀態已非 pending
    if (authReq.status !== "pending") {
      const statusMsg = authReq.status === "approved" || authReq.status === "completed" 
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
        .eq("status", "pending"); // 原子條件
      return NextResponse.json({ success: false, message: "此授權請求已過期" }, { status: 410 });
    }

    // 驗證 4 位數挑戰碼
    if (authReq.visual_challenge.toString() !== inputCode.toString()) {
      return NextResponse.json({ message: "挑戰碼錯誤，請重新確認 A 螢幕上的數字" }, { status: 400 });
    }

    // 簽發 JWT 給 A（2 小時效期）
    const expiresAt = new Date(Date.now() + 2 * 60 * 60 * 1000);
    const token = await new SignJWT({ 
        role: authReq.target_role || "admin", 
        deviceId: authReq.requester_id 
      })
      .setProtectedHeader({ alg: "HS256" })
      .setExpirationTime("2h") 
      .sign(JWT_SECRET);

    // 原子更新：僅當 status 仍為 pending 時才更新
    const { data: updated, error: updateError } = await supabase
      .from("auth_requests")
      .update({ 
        status: "approved", 
        session_token: token,
        admin_id: admin_device_id,
      })
      .eq("id", requestId)
      .eq("status", "pending") // 原子條件，防止並發衝突
      .select()
      .single();

    if (updateError || !updated) {
      // 更新失敗代表已被其他人搶先核准
      return NextResponse.json(
        { success: false, message: "此請求已被其他管理員處理" },
        { status: 409 }
      );
    }

    return NextResponse.json({ success: true, message: "核准成功！" });
  } catch (error) {
    console.error("Approve Error:", error);
    return NextResponse.json({ success: false, message: "伺服器錯誤" }, { status: 500 });
  }
}