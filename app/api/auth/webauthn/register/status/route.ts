export const runtime = "nodejs";

import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import jwt from "jsonwebtoken";

function getJwtSecret() {
  const secret = process.env.JWT_SECRET?.trim();
  if (!secret) throw new Error("JWT_SECRET 未設定或為空");
  return secret;
}

export async function GET(request: Request) {
  try {
    const authHeader = request.headers.get("Authorization");
    const deviceIdHeader = request.headers.get("X-Device-ID")?.trim();
    const token = authHeader?.startsWith("Bearer ") ? authHeader.slice(7) : "";
    let sessionPayload: { deviceId?: string; role?: string } | null = null;

    if (token || deviceIdHeader) {
      if (!token || !deviceIdHeader) {
        return NextResponse.json(
          { success: false, message: "登入憑證格式不完整" },
          { status: 401 }
        );
      }

      try {
        sessionPayload = jwt.verify(token, getJwtSecret(), { algorithms: ["HS256"] }) as {
          deviceId?: string;
          role?: string;
        };
      } catch {
        return NextResponse.json(
          { success: false, message: "登入憑證無效或過期" },
          { status: 401 }
        );
      }
    }

    const { searchParams } = new URL(request.url);
    const adminDeviceId = searchParams.get("admin_device_id")?.trim();

    if (!adminDeviceId) {
      return NextResponse.json(
        { success: false, message: "缺少管理員裝置 ID" },
        { status: 400 }
      );
    }

    if (sessionPayload && deviceIdHeader) {
      if (sessionPayload.deviceId !== adminDeviceId || deviceIdHeader !== adminDeviceId) {
        return NextResponse.json(
          { success: false, message: "裝置識別碼與登入憑證不匹配" },
          { status: 403 }
        );
      }
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
    });
  } catch (error) {
    console.error("[WebAuthn Register Status]", error);
    return NextResponse.json(
      { success: false, message: "伺服器錯誤" },
      { status: 500 }
    );
  }
}
