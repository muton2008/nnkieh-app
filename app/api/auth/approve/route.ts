export const runtime = "nodejs";

import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
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

export async function POST(request: Request) {
  try {
    const secret = process.env.JWT_SECRET?.trim();

    if (!secret) {
      console.error("[Config Error] JWT_SECRET 未定義或為空");
      return NextResponse.json(
        { success: false, message: "伺服器環境配置錯誤" },
        { status: 500 }
      );
    }

    const body = await request.json().catch(() => null);
    if (!body || typeof body !== "object") {
      return NextResponse.json(
        { success: false, message: "請求格式錯誤，請提供有效 JSON" },
        { status: 400 }
      );
    }
    const requestId =
      typeof body.requestId === "string"
        ? body.requestId.trim()
        : typeof body.request_id === "string"
          ? body.request_id.trim()
          : "";
    const inputCode =
      typeof body.inputCode === "string" || typeof body.inputCode === "number"
        ? body.inputCode
        : typeof body.input_code === "string" || typeof body.input_code === "number"
          ? body.input_code
          : "";
    const admin_device_id =
      typeof body.admin_device_id === "string" ? body.admin_device_id.trim() : "";
    const webauthn_assertion = body.webauthn_assertion;
    const review_secret =
      typeof body.review_secret === "string" ? body.review_secret.trim() : "";

    if (!requestId || !inputCode || !admin_device_id) {
      return NextResponse.json(
        { success: false, message: "缺少必要欄位" },
        { status: 400 }
      );
    }

    // ── Play Store 審核模式：輸入 000000 直接簽發體驗 JWT ──
    const reviewModeEnabled = process.env.REVIEW_MODE === "true";
    const reviewSecret = process.env.REVIEW_MODE_SECRET?.trim();
    const reviewSecretValid =
      process.env.NODE_ENV !== "production" ||
      (!!reviewSecret && review_secret === reviewSecret);

    if (reviewModeEnabled && inputCode?.toString() === "000000" && requestId === "__review__") {
      if (!reviewSecretValid) {
        return NextResponse.json(
          { success: false, message: "體驗模式憑證無效" },
          { status: 403 }
        );
      }

      const reviewToken = jwt.sign(
        { role: "editor", deviceId: admin_device_id, review: true },
        secret,
        { algorithm: "HS256", expiresIn: "2h" }
      );
      return NextResponse.json({
        success: true,
        message: "體驗模式已啟用",
        reviewSession: {
          accessToken: reviewToken,
          role: "editor",
          deviceId: admin_device_id,
          expiresAt: Date.now() + 2 * 60 * 60 * 1000,
          review: true,
        },
      });
    }

    if (!webauthn_assertion) {
      return NextResponse.json(
        { success: false, message: "缺少 WebAuthn 驗證資料" },
        { status: 400 }
      );
    }

    const supabase = await createClient();

    // 驗證管理員 B 是否在白名單
    const { data: admin, error: adminError } = await supabase
      .from("admin_users")
      .select("name, role")
      .eq("device_id", admin_device_id)
      .single();

    if (adminError || !admin) {
      return NextResponse.json(
        { success: false, message: "拒絕存取：您不在白名單中" },
        { status: 403 }
      );
    }

    // 取得授權請求
    const { data: authReq, error: reqError } = await supabase
      .from("auth_requests")
      .select("*")
      .eq("id", requestId)
      .single();

    if (reqError || !authReq) {
      return NextResponse.json(
        { success: false, message: "查無此授權請求" },
        { status: 404 }
      );
    }

    // 檢查狀態
    if (authReq.status !== "pending") {
      const statusMsg =
        authReq.status === "approved" || authReq.status === "completed"
          ? "這項請求已被其他管理員核准囉！"
          : "這項請求已失效或被拒絕。";
      return NextResponse.json({ success: false, message: statusMsg }, { status: 409 });
    }

    // 過期檢查
    if (new Date(authReq.expires_at) < new Date()) {
      await supabase
        .from("auth_requests")
        .update({ status: "expired" })
        .eq("id", requestId)
        .eq("status", "pending");
      return NextResponse.json(
        { success: false, message: "此授權請求已過期" },
        { status: 410 }
      );
    }

    const { data: challengeRows, error: challengeError } = await supabase
      .from("webauthn_challenges")
      .select("id, challenge, expires_at")
      .eq("admin_device_id", admin_device_id)
      .eq("type", "authentication")
      .eq("request_id", requestId)
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
      .eq("admin_device_id", admin_device_id)
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

    // 檢查失敗次數是否已達上限
    const MAX_ATTEMPTS = 5;
    if ((authReq.failed_attempts || 0) >= MAX_ATTEMPTS) {
      // 已鎖定但狀態尚未更新時，補更新為 rejected
      await supabase
        .from("auth_requests")
        .update({ status: "rejected" })
        .eq("id", requestId)
        .eq("status", "pending");
      return NextResponse.json(
        { success: false, message: "驗證失敗次數過多，此請求已鎖定，請重新發起" },
        { status: 423 }
      );
    }

    // 驗證挑戰碼
    if (authReq.visual_challenge.toString() !== inputCode.toString()) {
      const newAttempts = (authReq.failed_attempts || 0) + 1;
      const updatePayload: Record<string, any> = {
        failed_attempts: newAttempts,
      };

      // 達到上限時直接鎖定請求
      if (newAttempts >= MAX_ATTEMPTS) {
        updatePayload.status = "rejected";
      }

      await supabase
        .from("auth_requests")
        .update(updatePayload)
        .eq("id", requestId)
        .eq("status", "pending");

      const remaining = MAX_ATTEMPTS - newAttempts;
      const message = remaining > 0
        ? `挑戰碼錯誤，剩餘 ${remaining} 次嘗試機會`
        : "驗證失敗次數過多，此請求已鎖定，請重新發起";

      return NextResponse.json(
        { success: false, message },
        { status: remaining > 0 ? 400 : 423 }
      );
    }

    // 簽發 JWT
    const token = jwt.sign(
      {
        role: authReq.target_role || "admin",
        deviceId: authReq.requester_id,
      },
      secret,
      { algorithm: "HS256", expiresIn: "2h" }
    );

    // 原子更新狀態
    const { data: updated, error: updateError } = await supabase
      .from("auth_requests")
      .update({
        status: "approved",
        session_token: token,
        admin_id: admin_device_id,
      })
      .eq("id", requestId)
      .eq("status", "pending")
      .select()
      .single();

    if (updateError || !updated) {
      return NextResponse.json(
        { success: false, message: "此請求已被其他管理員處理" },
        { status: 409 }
      );
    }

    return NextResponse.json({ success: true, message: "核准成功！" });

  } catch (error: any) {
    console.error("Approve Error Detail:", error);
    return NextResponse.json(
      {
        success: false,
        message: "伺服器錯誤",
      },
      { status: 500 }
    );
  }
}