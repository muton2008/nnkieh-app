import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { jwtVerify } from "jose";

function getJwtSecret() {
  const secret = process.env.JWT_SECRET;
  if (!secret) throw new Error("JWT_SECRET 未設定");
  return new TextEncoder().encode(secret);
}

export async function POST(request: Request) {
  try {
    // 取得 Header 中的 Authorization Token
    const authHeader = request.headers.get("Authorization");
    const deviceIdHeader = request.headers.get("X-Device-ID");

    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      return NextResponse.json({ success: false, message: "未提供授權憑證" }, { status: 401 });
    }

    const token = authHeader.split(" ")[1];

    // 驗證 JWT
    let payload;
    try {
      const { payload: verifiedPayload } = await jwtVerify(token, getJwtSecret());
      payload = verifiedPayload;
    } catch (err) {
      console.error("JWT verify error:", err);
      return NextResponse.json({ success: false, message: "無效或過期的憑證" }, { status: 401 });
    }

    // 安全檢查：比對 JWT 內的 deviceId 是否與 Header 一致 (防竄改)
    if (payload.deviceId !== deviceIdHeader) {
      return NextResponse.json({ success: false, message: "裝置識別碼不匹配" }, { status: 403 });
    }

    // 解析 Body (符合 SaveSchoolCalendarRequest 定義)
    const { event } = await request.json();
    const supabase = await createClient();

    // 執行 Upsert (有 id 就更新，沒 id 就新增)
    const { data, error } = await supabase
      .from("school_calendar_events")
      .upsert({
        id: event.id || undefined,
        date: event.date,
        end_date: event.end_date,
        title: event.title,
        description: event.description,
        updated_at: new Date().toISOString(),
        updated_by: payload.deviceId,
        is_deleted: false,
      })
      .select()
      .single();

    if (error) throw error;

    return NextResponse.json({ success: true, data });

  } catch (error: any) {
    console.error("Save Event Error:", error);
    return NextResponse.json({ success: false, message: error.message }, { status: 500 });
  }
}