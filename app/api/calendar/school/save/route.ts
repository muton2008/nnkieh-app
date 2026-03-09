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

    // 審核模式：review JWT 不執行寫入，直接回傳假成功
    if (payload.review === true) {
      const { event } = await request.json();
      return NextResponse.json({ success: true, data: { ...event, id: event.id || crypto.randomUUID() } });
    }

    // 解析 Body
    const { event } = await request.json();
    if (!event) {
      return NextResponse.json({ success: false, message: "缺少 event 資料" }, { status: 400 });
    }

    // 驗證必要欄位
    if (!event.date || !event.title?.trim()) {
      return NextResponse.json({ success: false, message: "缺少日期或標題" }, { status: 400 });
    }

    // 驗證日期格式
    const dateRegex = /^\d{4}-\d{2}-\d{2}$/;
    if (!dateRegex.test(event.date) || (event.end_date && !dateRegex.test(event.end_date))) {
      return NextResponse.json({ success: false, message: "日期格式不正確" }, { status: 400 });
    }

    // 驗證結束日期不早於開始日期
    const endDate = event.end_date || event.date;
    if (endDate < event.date) {
      return NextResponse.json({ success: false, message: "結束日期不可早於開始日期" }, { status: 400 });
    }

    // 驗證時間格式與邏輯
    const timeRegex = /^\d{2}:\d{2}$/;
    if (event.start_time && !timeRegex.test(event.start_time)) {
      return NextResponse.json({ success: false, message: "開始時間格式不正確" }, { status: 400 });
    }
    if (event.end_time && !timeRegex.test(event.end_time)) {
      return NextResponse.json({ success: false, message: "結束時間格式不正確" }, { status: 400 });
    }
    // 同一天時，結束時間不可早於開始時間
    if (event.start_time && event.end_time && event.date === endDate && event.end_time < event.start_time) {
      return NextResponse.json({ success: false, message: "結束時間不可早於開始時間" }, { status: 400 });
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
        target_audience: event.target_audience || "全校",
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