export const runtime = "nodejs";

import { NextResponse } from "next/server";
import { generateRegistrationOptions } from "@simplewebauthn/server";
import { createClient } from "@/lib/supabase/server";
import jwt from "jsonwebtoken";
import {
  challengeExpiresAt,
  getWebAuthnRpID,
  getWebAuthnRpName,
  normalizeTransports,
} from "@/lib/webauthn";

function getJwtSecret() {
  const secret = process.env.JWT_SECRET?.trim();
  if (!secret) throw new Error("JWT_SECRET 未設定或為空");
  return secret;
}

export async function POST(request: Request) {
  try {
    const authHeader = request.headers.get("Authorization");
    const deviceIdHeader = request.headers.get("X-Device-ID")?.trim();
    const token = authHeader?.startsWith("Bearer ") ? authHeader.slice(7) : "";

    if (!token || !deviceIdHeader) {
      return NextResponse.json(
        { success: false, message: "請先完成雙人授權登入後再綁定 WebAuthn" },
        { status: 401 }
      );
    }

    let sessionPayload: { deviceId?: string; role?: string };
    try {
      sessionPayload = jwt.verify(token, getJwtSecret(), { algorithms: ["HS256"] }) as {
        deviceId?: string;
        role?: string;
      };
    } catch {
      return NextResponse.json(
        { success: false, message: "登入憑證無效或過期，請重新授權" },
        { status: 401 }
      );
    }

    const { admin_device_id } = await request.json();
    const adminDeviceId = typeof admin_device_id === "string" ? admin_device_id.trim() : "";

    if (!adminDeviceId) {
      return NextResponse.json(
        { success: false, message: "缺少管理員裝置 ID" },
        { status: 400 }
      );
    }

    if (sessionPayload.deviceId !== adminDeviceId || deviceIdHeader !== adminDeviceId) {
      return NextResponse.json(
        { success: false, message: "裝置識別碼與登入憑證不匹配" },
        { status: 403 }
      );
    }

    const supabase = await createClient();

    const { data: admin } = await supabase
      .from("admin_users")
      .select("device_id, name, role")
      .eq("device_id", adminDeviceId)
      .single();

    if (!admin) {
      return NextResponse.json(
        { success: false, message: "僅白名單管理員可綁定 WebAuthn" },
        { status: 403 }
      );
    }

    if (!["editor", "admin", "super_admin"].includes(admin.role)) {
      return NextResponse.json(
        { success: false, message: "權限不足，無法綁定 WebAuthn" },
        { status: 403 }
      );
    }

    const { data: existingCredentials } = await supabase
      .from("admin_webauthn_credentials")
      .select("credential_id, transports")
      .eq("admin_device_id", adminDeviceId)
      .is("revoked_at", null);

    if ((existingCredentials || []).length > 0) {
      return NextResponse.json(
        { success: true, message: "此帳號已綁定 WebAuthn 裝置", alreadyBound: true }
      );
    }

    const options = await generateRegistrationOptions({
      rpID: getWebAuthnRpID(),
      rpName: getWebAuthnRpName(),
      userID: new TextEncoder().encode(adminDeviceId),
      userName: admin.name || adminDeviceId,
      timeout: 60_000,
      attestationType: "none",
      authenticatorSelection: {
        residentKey: "preferred",
        userVerification: "required",
      },
      excludeCredentials: (existingCredentials || []).map((credential) => ({
        id: credential.credential_id,
        transports: normalizeTransports(credential.transports),
      })),
    });

    await supabase
      .from("webauthn_challenges")
      .update({ used: true })
      .eq("admin_device_id", adminDeviceId)
      .eq("type", "registration")
      .eq("used", false);

    const { error: challengeError } = await supabase
      .from("webauthn_challenges")
      .insert({
        admin_device_id: adminDeviceId,
        request_id: null,
        challenge: options.challenge,
        type: "registration",
        expires_at: challengeExpiresAt(5),
        used: false,
      });

    if (challengeError) {
      console.error("[WebAuthn Register Options] save challenge error:", challengeError);
      return NextResponse.json(
        { success: false, message: "無法建立註冊挑戰，請稍後再試" },
        { status: 500 }
      );
    }

    return NextResponse.json({ success: true, options });
  } catch (error) {
    console.error("[WebAuthn Register Options]", error);
    return NextResponse.json(
      { success: false, message: "伺服器錯誤" },
      { status: 500 }
    );
  }
}
