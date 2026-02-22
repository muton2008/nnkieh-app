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
 * GET /api/admin/whitelist
 * 取得管理員白名單列表（需 admin 或 super_admin 權限）
 */
export async function GET(request: Request) {
  try {
    const session = verifySession(request.headers.get("Authorization"));
    if (!session) {
      return NextResponse.json({ success: false, message: "未授權" }, { status: 401 });
    }

    const supabase = await createClient();

    // 驗證操作者是否在白名單且為 admin/super_admin
    const { data: operator } = await supabase
      .from("admin_users")
      .select("role")
      .eq("device_id", session.deviceId)
      .single();

    if (!operator || !["admin", "super_admin"].includes(operator.role)) {
      return NextResponse.json({ success: false, message: "權限不足" }, { status: 403 });
    }

    // 取得全部白名單
    const { data: admins, error } = await supabase
      .from("admin_users")
      .select("device_id, name, role, created_at")
      .order("created_at", { ascending: true });

    if (error) throw error;

    return NextResponse.json({
      success: true,
      admins: admins || [],
      currentRole: operator.role,
    });
  } catch (error: any) {
    console.error("[Whitelist GET]", error);
    return NextResponse.json(
      { success: false, message: "伺服器錯誤", detail: error.message },
      { status: 500 }
    );
  }
}

/**
 * POST /api/admin/whitelist
 * 新增 / 移除 / 更新管理員白名單
 * body: { action: 'add' | 'remove' | 'update', target_device_id, target_name?, target_role? }
 */
export async function POST(request: Request) {
  try {
    const session = verifySession(request.headers.get("Authorization"));
    if (!session) {
      return NextResponse.json({ success: false, message: "未授權" }, { status: 401 });
    }

    const { action, target_device_id, target_name, target_role } = await request.json();
    const supabase = await createClient();

    // 驗證操作者是否為 super_admin
    const { data: operator } = await supabase
      .from("admin_users")
      .select("role, name")
      .eq("device_id", session.deviceId)
      .single();

    if (!operator || operator.role !== "super_admin") {
      return NextResponse.json(
        { success: false, message: "僅會長可管理白名單" },
        { status: 403 }
      );
    }

    // --- 新增 ---
    if (action === "add") {
      if (!target_device_id || !target_name || !target_role) {
        return NextResponse.json(
          { success: false, message: "缺少必要欄位" },
          { status: 400 }
        );
      }

      // 不允許新增 super_admin
      if (target_role === "super_admin") {
        return NextResponse.json(
          { success: false, message: "不可直接建立會長帳號，請使用職位移交功能" },
          { status: 400 }
        );
      }

      const { error } = await supabase.from("admin_users").upsert(
        {
          device_id: target_device_id,
          name: target_name,
          role: target_role,
          created_at: new Date().toISOString(),
        },
        { onConflict: "device_id" }
      );

      if (error) throw error;

      return NextResponse.json({ success: true, message: `已新增 ${target_name}` });
    }

    // --- 移除（即時撤銷機制）---
    if (action === "remove") {
      if (!target_device_id) {
        return NextResponse.json({ success: false, message: "缺少目標 ID" }, { status: 400 });
      }

      // 不可移除自己
      if (target_device_id === session.deviceId) {
        return NextResponse.json(
          { success: false, message: "不可刪除自己" },
          { status: 400 }
        );
      }

      // 查詢目標角色
      const { data: target } = await supabase
        .from("admin_users")
        .select("role")
        .eq("device_id", target_device_id)
        .single();

      // 不可移除另一個 super_admin
      if (target?.role === "super_admin") {
        return NextResponse.json(
          { success: false, message: "不可刪除其他會長" },
          { status: 400 }
        );
      }

      // Step 1: 從白名單移除
      const { error: deleteError } = await supabase
        .from("admin_users")
        .delete()
        .eq("device_id", target_device_id);

      if (deleteError) throw deleteError;

      // Step 2: 撤銷該使用者所有未過期的 auth_requests
      await supabase
        .from("auth_requests")
        .update({ status: "expired" })
        .eq("requester_id", target_device_id)
        .in("status", ["pending", "approved"]);

      return NextResponse.json({ success: true, message: "已移除並撤銷權限" });
    }

    // --- 更新角色 ---
    if (action === "update") {
      if (!target_device_id || !target_role) {
        return NextResponse.json({ success: false, message: "缺少必要欄位" }, { status: 400 });
      }

      if (target_role === "super_admin") {
        return NextResponse.json(
          { success: false, message: "不可直接升級為會長，請使用職位移交功能" },
          { status: 400 }
        );
      }

      const { error } = await supabase
        .from("admin_users")
        .update({ role: target_role, name: target_name })
        .eq("device_id", target_device_id);

      if (error) throw error;

      return NextResponse.json({ success: true, message: "角色已更新" });
    }

    return NextResponse.json({ success: false, message: "未知操作" }, { status: 400 });
  } catch (error: any) {
    console.error("[Whitelist POST]", error);
    return NextResponse.json(
      { success: false, message: "伺服器錯誤", detail: error.message },
      { status: 500 }
    );
  }
}
