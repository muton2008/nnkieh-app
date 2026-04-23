import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
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

/**
 * POST /api/auth/pending
 * 需先完成 WebAuthn 驗證，才可取得待核准授權請求清單
 */
export async function POST(request: Request) {
  try {
    const body = await request.json().catch(() => null);
    if (!body || typeof body !== "object") {
      return NextResponse.json(
        { success: false, message: "請求格式錯誤，請提供有效 JSON" },
        { status: 400 }
      );
    }

    const { admin_device_id, webauthn_assertion } = body as {
      admin_device_id?: unknown;
      webauthn_assertion?: unknown;
    };
    const deviceId = typeof admin_device_id === "string" ? admin_device_id.trim() : "";

    if (!deviceId || !webauthn_assertion) {
      return NextResponse.json(
        { success: false, message: "缺少必要欄位" },
        { status: 400 }
      );
    }

    const supabase = await createClient();

    // 確認呼叫者是白名單中的管理員
    const { data: admin } = await supabase
      .from("admin_users")
      .select("device_id")
      .eq("device_id", deviceId)
      .single();

    if (!admin) {
      return NextResponse.json({ success: false, message: "無權限" }, { status: 403 });
    }

    const { data: challengeRows, error: challengeError } = await supabase
      .from("webauthn_challenges")
      .select("id, challenge, expires_at")
      .eq("admin_device_id", deviceId)
      .eq("type", "pending_list")
      .eq("used", false)
      .order("created_at", { ascending: false })
      .limit(1);

    if (challengeError || !challengeRows || challengeRows.length === 0) {
      return NextResponse.json(
        { success: false, message: "WebAuthn 挑戰不存在或已失效" },
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
        ? ((webauthn_assertion as { id: string }).id)
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
      .eq("admin_device_id", deviceId)
      .eq("credential_id", credentialId)
      .is("revoked_at", null)
      .single();

    if (!storedCredential) {
      return NextResponse.json(
        { success: false, message: "找不到可用的 WebAuthn 憑證" },
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

    // 撈取待核准的請求（排除自己、排除已過期）
    const { data: pending } = await supabase
      .from("auth_requests")
      .select("id, requester_name, created_at, expires_at")
      .eq("status", "pending")
      .neq("requester_id", deviceId)
      .gt("expires_at", new Date().toISOString())
      .order("created_at", { ascending: false })
      .limit(10);

    return NextResponse.json({ success: true, requests: pending || [] });
  } catch (error) {
    console.error("Fetch pending auth requests error:", error);
    return NextResponse.json({ success: false, message: "伺服器錯誤" }, { status: 500 });
  }
}

export async function GET() {
  return NextResponse.json(
    { success: false, message: "請使用 POST 並完成 WebAuthn 驗證" },
    { status: 405 }
  );
}
