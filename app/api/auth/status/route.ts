import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { AdminSession } from "@/lib/types/calendar";
import jwt from "jsonwebtoken";

function getJwtSecret() {
  const secret = process.env.JWT_SECRET?.trim();
  if (!secret) throw new Error("JWT_SECRET 未設定或為空");
  return secret;
}

async function handleStatusCheck(requestId?: string, deviceId?: string, pollToken?: string) {
  try {
    const normalizedRequestId = requestId?.trim();
    const normalizedDeviceId = deviceId?.trim();
    const normalizedPollToken = pollToken?.trim();

    if (!normalizedRequestId || !normalizedDeviceId || !normalizedPollToken) {
      return NextResponse.json({ success: false, message: "缺少必要參數" }, { status: 400 });
    }

    let pollPayload: { type?: string; requestId?: string; requesterId?: string };
    try {
      pollPayload = jwt.verify(normalizedPollToken, getJwtSecret(), { algorithms: ["HS256"] }) as {
        type?: string;
        requestId?: string;
        requesterId?: string;
      };
    } catch {
      return NextResponse.json({ success: false, message: "輪詢憑證無效或過期" }, { status: 401 });
    }

    if (
      pollPayload.type !== "auth_poll" ||
      pollPayload.requestId !== normalizedRequestId ||
      pollPayload.requesterId !== normalizedDeviceId
    ) {
      return NextResponse.json({ success: false, message: "輪詢憑證不匹配" }, { status: 403 });
    }

    const supabase = await createClient();

    const { data, error } = await supabase
      .from("auth_requests")
      .select("status, target_role, requester_id, expires_at, session_token")
      .eq("id", normalizedRequestId)
      .single();

    if (error || !data) {
      return NextResponse.json({ success: false, message: "查無請求" }, { status: 404 });
    }

    if (data.requester_id !== normalizedDeviceId) {
      return NextResponse.json({ success: false, message: "請求與裝置不匹配" }, { status: 403 });
    }

    // 檢查是否已過期
    const isExpired = new Date(data.expires_at) < new Date();
    if (isExpired && data.status === "pending") {
      return NextResponse.json({
        success: true,
        status: "expired",
        message: "授權請求已過期，請重新發起",
      });
    }

    // 核准狀態時，使用條件更新確保 Session 只能被領取一次
    if (data.status === "approved" && data.session_token) {
      const issuedToken = data.session_token;
      const { data: claimRows, error: claimError } = await supabase
        .from("auth_requests")
        .update({ status: "completed", session_token: null })
        .eq("id", normalizedRequestId)
        .eq("status", "approved")
        .eq("session_token", issuedToken)
        .select("id");

      if (claimError) {
        return NextResponse.json({ success: false, message: "授權狀態更新失敗" }, { status: 500 });
      }

      if (!claimRows || claimRows.length === 0) {
        return NextResponse.json({
          success: true,
          status: "completed",
          message: "此授權已被領取，請重新發起授權",
        });
      }

      const session: AdminSession = {
        accessToken: issuedToken,
        role: data.target_role,
        deviceId: data.requester_id,
        expiresAt: Date.now() + 2 * 60 * 60 * 1000,
      };

      return NextResponse.json({
        success: true,
        status: "approved",
        session,
      });
    }

    // 處理其他狀態 (pending, rejected, expired, completed)
    return NextResponse.json({
      success: true,
      status: data.status,
      message:
        data.status === "pending"
          ? "等待管理員核准中..."
          : data.status === "completed"
            ? "此授權已被領取，請重新發起授權"
            : "授權已被拒絕",
    });
  } catch (error) {
    console.error("[Auth Status]", error);
    return NextResponse.json({ success: false, message: "伺服器錯誤" }, { status: 500 });
  }
}

export async function POST(request: Request) {
  const body = await request.json().catch(() => ({}));
  const requestId = typeof body.request_id === "string" ? body.request_id : undefined;
  const deviceId = typeof body.device_id === "string" ? body.device_id : undefined;
  const pollToken = typeof body.poll_token === "string" ? body.poll_token : undefined;
  return handleStatusCheck(requestId, deviceId, pollToken);
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  return handleStatusCheck(
    searchParams.get("request_id") ?? undefined,
    searchParams.get("device_id") ?? undefined,
    searchParams.get("poll_token") ?? undefined
  );
}