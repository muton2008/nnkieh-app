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
    const authHeader = request.headers.get("Authorization");
    const token = authHeader?.split(" ")[1];
    if (!token) return NextResponse.json({ success: false, message: "未授權" }, { status: 401 });

    // 驗證 JWT 並提取 admin 的 deviceId
    const { payload } = await jwtVerify(token, getJwtSecret());
    const adminDeviceId = payload.deviceId as string;

    const { event_id } = await request.json();
    const supabase = await createClient();

    // 執行軟刪除：更新標記與最後異動者
    const { error } = await supabase
      .from("school_calendar_events")
      .update({ 
        is_deleted: true,
        updated_at: new Date().toISOString(),
        updated_by: adminDeviceId
      })
      .eq("id", event_id);

    if (error) throw error;
    return NextResponse.json({ success: true });
  } catch (error) {
    return NextResponse.json({ success: false, message: "刪除失敗" }, { status: 403 });
  }
}