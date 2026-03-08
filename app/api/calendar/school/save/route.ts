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
  try {
    // 取得 Header 中的 Authorization Token 與裝置 ID
    const authHeader = request.headers.get("Authorization");
    const deviceIdHeader = request.headers.get("X-Device-ID");

    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      console.warn("[Auth] 未提供授權憑證");
      return NextResponse.json({ success: false, message: "未提供授權憑證" }, { status: 401 });
    }

    const token = authHeader.split(" ")[1];

    // 驗證 JWT
    let payload: any;
    try {
      payload = jwt.verify(token, getJwtSecret(), { algorithms: ["HS256"] });
    } catch (err) {
      console.error("[Auth] JWT 驗證失敗");
      return NextResponse.json({ success: false, message: "無效或過期的憑證" }, { status: 401 });
    }

    // 比對 JWT deviceId 與 Header
    if (payload.deviceId !== deviceIdHeader) {
      console.warn("[Auth] 裝置識別碼不匹配");
      return NextResponse.json({ success: false, message: "裝置識別碼不匹配" }, { status: 403 });
    }

    // 解析 Body
    const { event } = await request.json();
    if (!event) {
      return NextResponse.json({ success: false, message: "缺少 event 資料" }, { status: 400 });
    }

    // 判斷 ID 是否為前端生成的臨時 ID (如 school_123)
    const eventId = String(event.id || "");
    const isTempId = eventId.startsWith("school_") || eventId.startsWith("priv_") || !event.id;

    const supabase = await createClient();

    // Upsert：若為臨時 ID 則不傳入 id 欄位，由 DB 自動生成 UUID；否則編輯舊有 ID
    const { data, error } = await supabase
      .from("school_calendar_events")
      .upsert({
        ...(isTempId ? {} : { id: event.id }),
        date: event.date,
        end_date: event.end_date || null,
        start_time: event.start_time || null,
        end_time: event.end_time || null,
        title: event.title,
        description: event.description || null,
        category: event.category || "其他",
        updated_at: new Date().toISOString(),
        updated_by: payload.deviceId,
        is_deleted: false,
      })
      .select()
      .single();

    if (error) {
      console.error("[DB] Upsert 失敗:", error);
      return NextResponse.json({ success: false, message: "儲存失敗" }, { status: 500 });
    }

    return NextResponse.json({ success: true, data });

  } catch (error: any) {
    console.error("[SAVE EVENT] 發生錯誤:", error);
    return NextResponse.json({ success: false, message: "儲存失敗" }, { status: 500 });
  }
}