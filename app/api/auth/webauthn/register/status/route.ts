export const runtime = "nodejs";

import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const adminDeviceId = searchParams.get("admin_device_id")?.trim();

    if (!adminDeviceId) {
      return NextResponse.json(
        { success: false, message: "缺少管理員裝置 ID" },
        { status: 400 }
      );
    }

    const supabase = await createClient();

    const { data: admin } = await supabase
      .from("admin_users")
      .select("device_id")
      .eq("device_id", adminDeviceId)
      .single();

    if (!admin) {
      return NextResponse.json(
        { success: false, message: "僅白名單管理員可查詢綁定狀態" },
        { status: 403 }
      );
    }

    const { count, error } = await supabase
      .from("admin_webauthn_credentials")
      .select("id", { count: "exact", head: true })
      .eq("admin_device_id", adminDeviceId)
      .is("revoked_at", null);

    if (error) {
      console.error("[WebAuthn Register Status]", error);
      return NextResponse.json(
        { success: false, message: "查詢綁定狀態失敗" },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      bound: (count || 0) > 0,
      credentialCount: count || 0,
    });
  } catch (error) {
    console.error("[WebAuthn Register Status]", error);
    return NextResponse.json(
      { success: false, message: "伺服器錯誤" },
      { status: 500 }
    );
  }
}
