export const runtime = "nodejs";

import { NextResponse } from "next/server";
import {
  verifyRegistrationResponse,
  type RegistrationResponseJSON,
} from "@simplewebauthn/server";
import { createClient } from "@/lib/supabase/server";
import { getWebAuthnOrigin, getWebAuthnRpID, toBase64URL } from "@/lib/webauthn";
import jwt from "jsonwebtoken";

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

    const { admin_device_id, registration_response } = await request.json();

    if (!admin_device_id || typeof admin_device_id !== "string") {
      return NextResponse.json(
        { success: false, message: "缺少管理員裝置 ID" },
        { status: 400 }
      );
    }
    const adminDeviceId = admin_device_id.trim();

    if (!adminDeviceId) {
      return NextResponse.json(
        { success: false, message: "缺少管理員裝置 ID" },
        { status: 400 }
      );
    }

    if (!registration_response) {
      return NextResponse.json(
        { success: false, message: "缺少 WebAuthn 註冊回應" },
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
      .select("device_id, role")
      .eq("device_id", adminDeviceId)
      .single();

    if (!admin || !["editor", "admin", "super_admin"].includes(admin.role)) {
      return NextResponse.json(
        { success: false, message: "權限不足，無法綁定 WebAuthn" },
        { status: 403 }
      );
    }

    const { data: challengeRows, error: challengeError } = await supabase
      .from("webauthn_challenges")
      .select("id, challenge, expires_at")
      .eq("admin_device_id", adminDeviceId)
      .eq("type", "registration")
      .eq("used", false)
      .order("created_at", { ascending: false })
      .limit(1);

    if (challengeError || !challengeRows || challengeRows.length === 0) {
      return NextResponse.json(
        { success: false, message: "找不到有效註冊挑戰，請重新綁定" },
        { status: 400 }
      );
    }

    const challengeRow = challengeRows[0];

    if (new Date(challengeRow.expires_at).getTime() < Date.now()) {
      await supabase
        .from("webauthn_challenges")
        .update({ used: true })
        .eq("id", challengeRow.id);

      return NextResponse.json(
        { success: false, message: "註冊挑戰已過期，請重新綁定" },
        { status: 410 }
      );
    }

    const verification = await verifyRegistrationResponse({
      response: registration_response as RegistrationResponseJSON,
      expectedChallenge: challengeRow.challenge,
      expectedOrigin: getWebAuthnOrigin(),
      expectedRPID: getWebAuthnRpID(),
      requireUserVerification: true,
    });

    if (!verification.verified || !verification.registrationInfo) {
      return NextResponse.json(
        { success: false, message: "WebAuthn 註冊驗證失敗" },
        { status: 401 }
      );
    }

    const credential = verification.registrationInfo.credential;

    const { error: upsertError } = await supabase
      .from("admin_webauthn_credentials")
      .upsert(
        {
          admin_device_id: adminDeviceId,
          credential_id: credential.id,
          public_key: toBase64URL(credential.publicKey),
          counter: credential.counter,
          transports: credential.transports || null,
          updated_at: new Date().toISOString(),
          revoked_at: null,
        },
        { onConflict: "credential_id" }
      );

    if (upsertError) {
      console.error("[WebAuthn Register Verify] save credential error:", upsertError);
      return NextResponse.json(
        { success: false, message: "儲存裝置憑證失敗" },
        { status: 500 }
      );
    }

    await supabase
      .from("webauthn_challenges")
      .update({ used: true })
      .eq("id", challengeRow.id);

    return NextResponse.json({
      success: true,
      credentialId: credential.id,
      message: "此裝置已成功綁定 WebAuthn",
    });
  } catch (error) {
    console.error("[WebAuthn Register Verify]", error);
    return NextResponse.json(
      { success: false, message: "伺服器錯誤" },
      { status: 500 }
    );
  }
}
