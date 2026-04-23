import { NextResponse } from "next/server";
import { randomInt } from "node:crypto";
import { createClient } from "@/lib/supabase/server";
import { sendToTokens } from "@/lib/firebase-admin";
import jwt from "jsonwebtoken";
import {
  verifyAuthenticationResponse,
  type AuthenticationResponseJSON,
} from "@simplewebauthn/server";
import {
  fromBase64URL,
  getWebAuthnOrigin,
  getWebAuthnRpID,
  normalizeTransports,
} from "@/lib/webauthn";

function getJwtSecret() {
  const secret = process.env.JWT_SECRET?.trim();
  if (!secret) throw new Error("JWT_SECRET 未設定或為空");
  return secret;
}

export async function POST(request: Request) {
  try {
    const body = await request.json().catch(() => null);
    if (!body || typeof body !== "object") {
      return NextResponse.json(
        { success: false, message: "請求格式錯誤，請提供有效 JSON" },
        { status: 400 }
      );
    }

    const { device_id, webauthn_assertion } = body as {
      device_id?: unknown;
      webauthn_assertion?: unknown;
    };
    const requesterId = typeof device_id === "string" ? device_id.trim() : "";

    if (!requesterId) {
      return NextResponse.json(
        { success: false, message: "缺少必要欄位" },
        { status: 400 }
      );
    }

    const jwtSecret = getJwtSecret();
    const supabase = await createClient();

    //  白名單預檢：根據 device_id 自動取得姓名與權限
    const { data: adminUser, error: adminError } = await supabase
      .from("admin_users")
      .select("name, role")
      .eq("device_id", requesterId)
      .single();

    if (adminError || !adminUser) {
      return NextResponse.json(
        { success: false, message: "存取被拒：您的裝置不在白名單中" },
        { status: 403 }
      );
    }

    const { count: credentialCount, error: credentialCountError } = await supabase
      .from("admin_webauthn_credentials")
      .select("id", { count: "exact", head: true })
      .eq("admin_device_id", requesterId)
      .is("revoked_at", null);

    if (credentialCountError) {
      console.error("[Auth Request] count credential error:", credentialCountError);
      return NextResponse.json(
        { success: false, message: "查詢憑證狀態失敗" },
        { status: 500 }
      );
    }

    const hasBoundCredential = (credentialCount || 0) > 0;

    if (hasBoundCredential) {
      if (!webauthn_assertion) {
        return NextResponse.json(
          { success: false, message: "此裝置已綁定 WebAuthn，請先完成裝置驗證" },
          { status: 401 }
        );
      }

      const { data: challengeRows, error: challengeError } = await supabase
        .from("webauthn_challenges")
        .select("id, challenge, expires_at")
        .eq("admin_device_id", requesterId)
        .eq("type", "request_create")
        .eq("used", false)
        .order("created_at", { ascending: false })
        .limit(1);

      if (challengeError || !challengeRows || challengeRows.length === 0) {
        return NextResponse.json(
          { success: false, message: "WebAuthn 挑戰不存在或已失效，請重新驗證" },
          { status: 401 }
        );
      }

      const challengeRow = challengeRows[0];

      if (new Date(challengeRow.expires_at).getTime() < Date.now()) {
        await supabase
          .from("webauthn_challenges")
          .update({ used: true })
          .eq("id", challengeRow.id);

        return NextResponse.json(
          { success: false, message: "WebAuthn 挑戰已過期，請重新驗證" },
          { status: 410 }
        );
      }

      const credentialId =
        typeof (webauthn_assertion as { id?: unknown })?.id === "string"
          ? (webauthn_assertion as { id: string }).id
          : "";

      if (!credentialId) {
        return NextResponse.json(
          { success: false, message: "WebAuthn 憑證資訊不完整" },
          { status: 400 }
        );
      }

      const { data: storedCredential } = await supabase
        .from("admin_webauthn_credentials")
        .select("credential_id, public_key, counter, transports")
        .eq("admin_device_id", requesterId)
        .eq("credential_id", credentialId)
        .is("revoked_at", null)
        .single();

      if (!storedCredential) {
        return NextResponse.json(
          { success: false, message: "此裝置尚未綁定可用的 WebAuthn 憑證" },
          { status: 403 }
        );
      }

      let verification;
      try {
        verification = await verifyAuthenticationResponse({
          response: webauthn_assertion as AuthenticationResponseJSON,
          expectedChallenge: challengeRow.challenge,
          expectedOrigin: getWebAuthnOrigin(),
          expectedRPID: getWebAuthnRpID(),
          credential: {
            id: storedCredential.credential_id,
            publicKey: fromBase64URL(storedCredential.public_key),
            counter: Number(storedCredential.counter || 0),
            transports: normalizeTransports(storedCredential.transports),
          },
          requireUserVerification: true,
        });
      } catch {
        return NextResponse.json(
          { success: false, message: "WebAuthn 驗證失敗" },
          { status: 401 }
        );
      }

      if (!verification.verified) {
        return NextResponse.json(
          { success: false, message: "WebAuthn 驗證失敗" },
          { status: 401 }
        );
      }

      await supabase
        .from("webauthn_challenges")
        .update({ used: true })
        .eq("id", challengeRow.id);

      await supabase
        .from("admin_webauthn_credentials")
        .update({
          counter: verification.authenticationInfo.newCounter,
          updated_at: new Date().toISOString(),
        })
        .eq("credential_id", storedCredential.credential_id);
    }

    // 生成 6 位數挑戰碼與寫入資料庫（使用加密安全隨機數）
    const challengeCode = randomInt(100000, 1000000);

    const { data: authReq, error: insertError } = await supabase
      .from("auth_requests")
      .insert([{
        requester_id: requesterId,
        requester_name: adminUser.name,
        visual_challenge: challengeCode,
        target_role: adminUser.role, // 自動繼承該用戶在白名單的角色
        status: "pending",
        expires_at: new Date(Date.now() + 5 * 60000).toISOString()
      }])
      .select()
      .single();

    if (insertError) throw insertError;

    // 查詢所有 admin / super_admin，排除發起者自己
    const { data: otherAdmins } = await supabase
      .from("admin_users")
      .select("device_id")
      .in("role", ["admin", "super_admin"])
      .neq("device_id", requesterId);

    const adminDeviceIds = (otherAdmins || []).map((a) => a.device_id);

    if (adminDeviceIds.length > 0) {
      // 用 device_id 去 user_profiles 撈 fcm_token
      const { data: profiles } = await supabase
        .from("user_profiles")
        .select("fcm_token")
        .in("device_id", adminDeviceIds)
        .not("fcm_token", "is", null);

      const tokens = (profiles || [])
        .map((p) => p.fcm_token)
        .filter((t): t is string => !!t && t.length > 0);

      if (tokens.length > 0) {
        const appBaseUrl = process.env.NEXT_PUBLIC_APP_URL || "";
        const notificationLink = `${appBaseUrl}/?auth_request_id=${authReq.id}`;

        await sendToTokens(
          tokens,
          "📋 行事曆授權請求",
          `${adminUser.name} 正在請求管理員權限，請前往核准`,
          {
            type: "auth_request",
            auth_request_id: authReq.id,
            requester_name: adminUser.name,
            link: notificationLink,
          }
        );
      }
    }

    const pollToken = jwt.sign(
      {
        type: "auth_poll",
        requestId: authReq.id,
        requesterId,
      },
      jwtSecret,
      { algorithm: "HS256", expiresIn: "15m" }
    );

    return NextResponse.json({ 
      success: true, 
      requestId: authReq.id, 
      challengeCode,
      pollToken,
    });

  } catch (error) {
    console.error("Auth Request Error:", error);
    return NextResponse.json({ success: false, message: "伺服器錯誤" }, { status: 500 });
  }
}