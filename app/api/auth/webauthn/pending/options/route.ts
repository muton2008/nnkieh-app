export const runtime = "nodejs";

import { NextResponse } from "next/server";
import { generateAuthenticationOptions } from "@simplewebauthn/server";
import { createClient } from "@/lib/supabase/server";
import {
  challengeExpiresAt,
  getWebAuthnRpID,
  isChallengeIssueRateLimited,
  normalizeTransports,
} from "@/lib/webauthn";

export async function POST(request: Request) {
  try {
    const body = await request.json().catch(() => null);
    if (!body || typeof body !== "object") {
      return NextResponse.json(
        { success: false, message: "請求格式錯誤，請提供有效 JSON" },
        { status: 400 }
      );
    }

    const { admin_device_id } = body as { admin_device_id?: unknown };
    const adminDeviceId = typeof admin_device_id === "string" ? admin_device_id.trim() : "";

    if (!adminDeviceId) {
      return NextResponse.json(
        { success: false, message: "缺少 admin_device_id" },
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
        { success: false, message: "無權限使用待核准清單" },
        { status: 403 }
      );
    }

    const { data: credentials } = await supabase
      .from("admin_webauthn_credentials")
      .select("credential_id, transports")
      .eq("admin_device_id", adminDeviceId)
      .is("revoked_at", null);

    if (!credentials || credentials.length === 0) {
      return NextResponse.json(
        { success: false, message: "此裝置尚未綁定 WebAuthn，請先完成綁定" },
        { status: 400 }
      );
    }

    const rateLimited = await isChallengeIssueRateLimited(
      supabase,
      adminDeviceId,
      "pending_list"
    );
    if (rateLimited) {
      return NextResponse.json(
        { success: false, message: "請勿過於頻繁重試，請稍候再驗證" },
        { status: 429 }
      );
    }

    const options = await generateAuthenticationOptions({
      rpID: getWebAuthnRpID(),
      timeout: 60_000,
      userVerification: "required",
      allowCredentials: credentials.map((credential) => ({
        id: credential.credential_id,
        transports: normalizeTransports(credential.transports),
      })),
    });

    const { error: challengeError } = await supabase
      .from("webauthn_challenges")
      .insert({
        admin_device_id: adminDeviceId,
        request_id: null,
        challenge: options.challenge,
        type: "pending_list",
        expires_at: challengeExpiresAt(2),
        used: false,
      });

    if (challengeError) {
      console.error("[WebAuthn Pending Options] save challenge error:", challengeError);
      return NextResponse.json(
        { success: false, message: "無法建立驗證挑戰，請稍後再試" },
        { status: 500 }
      );
    }

    return NextResponse.json({ success: true, options });
  } catch (error) {
    console.error("[WebAuthn Pending Options]", error);
    return NextResponse.json(
      { success: false, message: "伺服器錯誤" },
      { status: 500 }
    );
  }
}
