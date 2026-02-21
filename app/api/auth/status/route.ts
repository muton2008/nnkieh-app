import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { AdminSession } from "@/lib/types/calendar";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const requestId = searchParams.get("request_id");

  if (!requestId) {
    return NextResponse.json({ success: false, message: "缺少 Request ID" }, { status: 400 });
  }

  const supabase = await createClient();

  const { data, error } = await supabase
    .from("auth_requests")
    .select("status, target_role, requester_id, expires_at, session_token")
    .eq("id", requestId)
    .single();

  if (error || !data) {
    return NextResponse.json({ success: false, message: "查無請求" }, { status: 404 });
  }

  // 檢查是否已過期
  const isExpired = new Date(data.expires_at) < new Date();
  if (isExpired && data.status === "pending") {
    return NextResponse.json({
      success: true,
      status: "expired",
      message: "授權請求已過期，請重新發起",
    });
  }

  // 如果已核准
  if (data.status === "approved" && data.session_token) {
    const session: AdminSession = {
      accessToken: data.session_token,
      role: data.target_role,
      deviceId: data.requester_id,
      expiresAt: new Date(data.expires_at).getTime(),
    };

    // 領取成功後，立即將資料庫狀態標記為已領取，避免 Token 外流
    await supabase
      .from("auth_requests")
      .update({ status: "completed", session_token: null })
      .eq("id", requestId);

    return NextResponse.json({
      success: true,
      status: "approved",
      session,
    });
  }

  // 處理其他狀態 (pending, rejected)
  return NextResponse.json({
    success: true,
    status: data.status,
    message: data.status === "pending" ? "等待管理員核准中..." : "授權已被拒絕",
  });
}