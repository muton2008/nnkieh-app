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

    const adminDeviceId =
      typeof body.admin_device_id === "string" ? body.admin_device_id.trim() : "";
    let requestId =
      typeof body.requestId === "string"
        ? body.requestId.trim()
        : typeof body.request_id === "string"
          ? body.request_id.trim()
          : "";

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
        { success: false, message: "無權限使用核准功能" },
        { status: 403 }
      );
    }

    if (!requestId) {
      return NextResponse.json(
        { success: false, message: "缺少 requestId" },
        { status: 400 }
      );
    }

    const { data: authReq } = await supabase
      .from("auth_requests")
      .select("id, status, expires_at, requester_id")
      .eq("id", requestId)
      .single();

    if (!authReq) {
      return NextResponse.json(
        { success: false, message: "查無授權請求" },
        { status: 404 }
      );
    }

    if (authReq.status !== "pending") {
      return NextResponse.json(
        { success: false, message: "此授權請求已非待核准狀態" },
        { status: 409 }
      );
    }

    if (new Date(authReq.expires_at).getTime() < Date.now()) {
      return NextResponse.json(
        { success: false, message: "此授權請求已過期" },
        { status: 410 }
      );
    }

    if (authReq.requester_id === adminDeviceId) {
      return NextResponse.json(
        { success: false, message: "不可核准自己發起的請求" },
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
      "authentication"
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
        request_id: requestId,
        challenge: options.challenge,
        type: "authentication",
        expires_at: challengeExpiresAt(2),
        used: false,
      });

    if (challengeError) {
      console.error("[WebAuthn Auth Options] save challenge error:", challengeError);
      return NextResponse.json(
        { success: false, message: "無法建立驗證挑戰，請稍後再試" },
        { status: 500 }
      );
    }

    return NextResponse.json({ success: true, options, requestId });
  } catch (error) {
    console.error("[WebAuthn Auth Options]", error);
    return NextResponse.json(
      { success: false, message: "伺服器錯誤" },
      { status: 500 }
    );
  }
}
