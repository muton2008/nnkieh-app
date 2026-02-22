export const runtime = "nodejs";

import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import jwt from "jsonwebtoken";

// 取得 JWT secret，並檢查是否存在
function getJwtSecret() {
  const secret = process.env.JWT_SECRET?.trim();
  if (!secret) throw new Error("JWT_SECRET 未設定或為空");
  return secret;
}

export async function POST(request: Request) {
  console.log("=== DELETE EVENT API ===");

  try {
    const authHeader = request.headers.get("Authorization");
    const token = authHeader?.split(" ")[1];
    if (!token) {
      console.warn("[Auth] 未提供 JWT");
      return NextResponse.json({ success: false, message: "未授權" }, { status: 401 });
    }

    // 驗證 JWT
    const secret = getJwtSecret();
    let payload: any;
    try {
      payload = jwt.verify(token, secret, { algorithms: ["HS256"] });
      console.log("[Auth] JWT payload:", payload);
    } catch (err) {
      console.error("[Auth] JWT 驗證失敗:", err);
      return NextResponse.json({ success: false, message: "JWT 驗證失敗" }, { status: 401 });
    }

    const adminDeviceId = payload.deviceId as string;
    if (!adminDeviceId) {
      console.warn("[Auth] JWT 中缺少 deviceId");
      return NextResponse.json({ success: false, message: "JWT 格式錯誤" }, { status: 401 });
    }

    const { event_id } = await request.json();
    if (!event_id) {
      return NextResponse.json({ success: false, message: "缺少 event_id" }, { status: 400 });
    }

    const supabase = await createClient();

    // 軟刪除
    const { error } = await supabase
      .from("school_calendar_events")
      .update({
        is_deleted: true,
        updated_at: new Date().toISOString(),
        updated_by: adminDeviceId,
      })
      .eq("id", event_id);

    if (error) {
      console.error("[DB] 更新失敗:", error);
      return NextResponse.json({ success: false, message: "刪除失敗" }, { status: 500 });
    }

    return NextResponse.json({ success: true, message: "刪除成功" });

  } catch (error: any) {
    console.error("[DELETE EVENT] 發生錯誤:", error);
    return NextResponse.json({ success: false, message: error.message || "刪除失敗" }, { status: 500 });
  }
}