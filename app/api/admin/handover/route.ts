export const runtime = "nodejs";

import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import jwt from "jsonwebtoken";
import type { AdminRole } from "@/lib/types/calendar";

// --- 驗證 JWT 並取得角色 ---
function verifySession(authHeader: string | null): { deviceId: string; role: AdminRole } | null {
  const secret = process.env.JWT_SECRET?.trim();
  if (!secret || !authHeader) return null;

  const token = authHeader.replace("Bearer ", "");
  try {
    const payload = jwt.verify(token, secret) as { deviceId: string; role: AdminRole };
    return { deviceId: payload.deviceId, role: payload.role };
  } catch {
    return null;
  }
}

/**
 * POST /api/admin/handover
 * 職位移交：當前會長將 super_admin 轉移給新的管理員
 * body: { new_super_admin_id: string }
 * 
 * 流程：
 * 1. 驗證操作者確實是 super_admin
 * 2. 驗證目標已在白名單中
 * 3. 原子化操作：舊會長降級為 admin，新指定者升級為 super_admin
 * 4. 撤銷舊會長的 session（強制過期所有 auth_requests）
 */
export async function POST(request: Request) {
  try {
    const session = verifySession(request.headers.get("Authorization"));
    if (!session) {
      return NextResponse.json({ success: false, message: "未授權" }, { status: 401 });
    }

    const { new_super_admin_id } = await request.json();

    if (!new_super_admin_id) {
      return NextResponse.json(
        { success: false, message: "請指定新會長的裝置 ID" },
        { status: 400 }
      );
    }

    if (new_super_admin_id === session.deviceId) {
      return NextResponse.json(
        { success: false, message: "你已經是會長了" },
        { status: 400 }
      );
    }

    const supabase = await createClient();

    // Step 1: 確認操作者是 super_admin
    const { data: currentSuper } = await supabase
      .from("admin_users")
      .select("role, name")
      .eq("device_id", session.deviceId)
      .single();

    if (!currentSuper || currentSuper.role !== "super_admin") {
      return NextResponse.json(
        { success: false, message: "只有會長可以進行職位移交" },
        { status: 403 }
      );
    }

    // Step 2: 確認新會長在白名單中
    const { data: newSuper } = await supabase
      .from("admin_users")
      .select("device_id, name, role")
      .eq("device_id", new_super_admin_id)
      .single();

    if (!newSuper) {
      return NextResponse.json(
        { success: false, message: "目標成員不在白名單中，請先新增" },
        { status: 404 }
      );
    }

    // Step 3: 原子化角色變更 — 舊會長 → admin, 新會長 → super_admin
    // 先升級新會長
    const { error: upgradeError } = await supabase
      .from("admin_users")
      .update({ role: "super_admin" })
      .eq("device_id", new_super_admin_id);

    if (upgradeError) throw upgradeError;

    // 再降級舊會長
    const { error: downgradeError } = await supabase
      .from("admin_users")
      .update({ role: "admin" })
      .eq("device_id", session.deviceId);

    if (downgradeError) {
      // 回滾：把新會長角色改回原本的
      await supabase
        .from("admin_users")
        .update({ role: newSuper.role })
        .eq("device_id", new_super_admin_id);
      throw downgradeError;
    }

    // Step 4: 撤銷舊會長所有進行中的 auth_requests
    await supabase
      .from("auth_requests")
      .update({ status: "expired" })
      .eq("requester_id", session.deviceId)
      .in("status", ["pending", "approved"]);

    return NextResponse.json({
      success: true,
      message: `職位已移交給 ${newSuper.name}`,
      oldRole: "admin",
      newSuperAdmin: newSuper.name,
    });
  } catch (error: any) {
    console.error("[Handover]", error);
    return NextResponse.json(
      { success: false, message: "伺服器錯誤", detail: error.message },
      { status: 500 }
    );
  }
}
