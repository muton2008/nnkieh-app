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

async function validateBootstrapToken(
  supabase: Awaited<ReturnType<typeof createClient>>,
  bootstrapToken: string,
  adminDeviceId: string
) {
  let payload: { type?: string; deviceId?: string; jti?: string };
  try {
    payload = jwt.verify(bootstrapToken, getJwtSecret(), { algorithms: ["HS256"] }) as {
      type?: string;
      deviceId?: string;
      jti?: string;
    };
  } catch {
    return { valid: false as const, reason: "票證無效或過期" };
  }

  if (
    payload.type !== "webauthn_bootstrap_bind" ||
    payload.deviceId !== adminDeviceId ||
    !payload.jti
  ) {
    return { valid: false as const, reason: "票證與裝置不匹配" };
  }

  const { data: ticketRow } = await supabase
    .from("webauthn_challenges")
    .select("id, expires_at, used")
    .eq("admin_device_id", adminDeviceId)
    .eq("type", "bootstrap_bind")
    .eq("challenge", payload.jti)
    .single();

  if (!ticketRow || ticketRow.used) {
    return { valid: false as const, reason: "票證不存在或已使用" };
  }

  if (new Date(ticketRow.expires_at).getTime() < Date.now()) {
    await supabase
      .from("webauthn_challenges")
      .update({ used: true })
      .eq("id", ticketRow.id);

    return { valid: false as const, reason: "票證已過期" };
  }

  return {
    valid: true as const,
    jti: payload.jti,
    ticketId: ticketRow.id,
  };
}

export async function POST(request: Request) {
  try {
    const authHeader = request.headers.get("Authorization");
    const deviceIdHeader = request.headers.get("X-Device-ID")?.trim();
    const token = authHeader?.startsWith("Bearer ") ? authHeader.slice(7) : "";
    let sessionPayload: { deviceId?: string; role?: string } | null = null;

    if (token && deviceIdHeader) {
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
    }

    const { admin_device_id, registration_response, bootstrap_token } = await request.json();
    const bootstrapToken =
      typeof bootstrap_token === "string" ? bootstrap_token.trim() : "";

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

    const hasSession = !!sessionPayload && !!deviceIdHeader;
    const currentSession = sessionPayload;
    let bootstrapTicketIdToConsume: string | null = null;
    if (hasSession && currentSession) {
      if (currentSession.deviceId !== adminDeviceId || deviceIdHeader !== adminDeviceId) {
        return NextResponse.json(
          { success: false, message: "裝置識別碼與登入憑證不匹配" },
          { status: 403 }
        );
      }
    } else {
      if (bootstrapToken) {
        const bootstrapResult = await validateBootstrapToken(
          supabase,
          bootstrapToken,
          adminDeviceId
        );

        if (!bootstrapResult.valid) {
          return NextResponse.json(
            { success: false, message: bootstrapResult.reason },
            { status: 401 }
          );
        }

        bootstrapTicketIdToConsume = bootstrapResult.ticketId;
      } else {
      const { count: totalCredentialCount, error: countError } = await supabase
        .from("admin_webauthn_credentials")
        .select("id", { count: "exact", head: true })
        .is("revoked_at", null);

      if (countError) {
        console.error("[WebAuthn Register Verify] bootstrap count error:", countError);
        return NextResponse.json(
          { success: false, message: "查詢憑證狀態失敗" },
          { status: 500 }
        );
      }

      if ((totalCredentialCount || 0) > 0 || !["admin", "super_admin"].includes(admin.role)) {
        return NextResponse.json(
          { success: false, message: "請先完成雙人授權登入後再綁定 WebAuthn" },
          { status: 401 }
        );
      }
      }
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

    if (bootstrapTicketIdToConsume) {
      await supabase
        .from("webauthn_challenges")
        .update({ used: true })
        .eq("id", bootstrapTicketIdToConsume);
    }

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
