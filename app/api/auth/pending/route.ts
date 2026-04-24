import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

/**
 * POST /api/auth/pending
 * 取得待核准授權請求清單（僅驗證是否在管理員白名單）
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

    const { admin_device_id } = body as {
      admin_device_id?: unknown;
    };
    const deviceId = typeof admin_device_id === "string" ? admin_device_id.trim() : "";

    if (!deviceId) {
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

    // 檢查是否為 review 模式 (審核模式可以顯示完整名稱)
    const reviewModeEnabled =
      process.env.REVIEW_MODE === "true" &&
      (process.env.NODE_ENV !== "production" ||
        process.env.REVIEW_MODE_ALLOW_PRODUCTION === "true");

    // 撈取待核准的請求（排除自己、排除已過期）
    const { data: pending } = await supabase
      .from("auth_requests")
      .select("id, requester_name, created_at, expires_at")
      .eq("status", "pending")
      .neq("requester_id", deviceId)
      .gt("expires_at", new Date().toISOString())
      .order("created_at", { ascending: false })
      .limit(10);

    const safePending = (pending || []).map((req) => {
      if (reviewModeEnabled) {
        return req;
      }
      
      // 遮蔽發起者名稱 (例如：陳大明 -> 陳*明)
      let maskedName = req.requester_name;
      if (maskedName.length > 2) {
        maskedName =
          maskedName.charAt(0) +
          "*".repeat(maskedName.length - 2) +
          maskedName.charAt(maskedName.length - 1);
      } else if (maskedName.length === 2) {
        maskedName = maskedName.charAt(0) + "*";
      } else if (!maskedName) {
        maskedName = "未知";
      }

      return {
        ...req,
        requester_name: maskedName,
      };
    });

    return NextResponse.json({ success: true, requests: safePending });
  } catch (error) {
    console.error("Fetch pending auth requests error:", error);
    return NextResponse.json({ success: false, message: "伺服器錯誤" }, { status: 500 });
  }
}

export async function GET() {
  return NextResponse.json(
    { success: false, message: "請使用 POST 查詢待核准清單" },
    { status: 405 }
  );
}
