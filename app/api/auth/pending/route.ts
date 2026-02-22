import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

/**
 * GET /api/auth/pending?device_id=xxx
 * 回傳目前 pending 的授權請求（排除自己發起的、排除已過期的）
 */
export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const deviceId = searchParams.get("device_id");

    if (!deviceId) {
      return NextResponse.json({ message: "缺少 device_id" }, { status: 400 });
    }

    const supabase = await createClient();

    // 確認呼叫者是白名單中的管理員
    const { data: admin } = await supabase
      .from("admin_users")
      .select("device_id")
      .eq("device_id", deviceId)
      .single();

    if (!admin) {
      return NextResponse.json({ message: "無權限" }, { status: 403 });
    }

    // 撈取待核准的請求（排除自己、排除已過期）
    const { data: pending } = await supabase
      .from("auth_requests")
      .select("id, requester_name, created_at, expires_at")
      .eq("status", "pending")
      .neq("requester_id", deviceId)
      .gt("expires_at", new Date().toISOString())
      .order("created_at", { ascending: false })
      .limit(10);

    return NextResponse.json({ success: true, requests: pending || [] });
  } catch (error) {
    console.error("Fetch pending auth requests error:", error);
    return NextResponse.json({ message: "伺服器錯誤" }, { status: 500 });
  }
}
