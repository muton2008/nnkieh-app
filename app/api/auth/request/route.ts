import { NextResponse } from "next/server";
import { randomInt } from "node:crypto";
import { createClient } from "@/lib/supabase/server";
import { sendToTokens } from "@/lib/firebase-admin";

export async function POST(request: Request) {
  try {
    const { device_id } = await request.json();
    const supabase = await createClient();

    //  白名單預檢：根據 device_id 自動取得姓名與權限
    const { data: adminUser, error: adminError } = await supabase
      .from("admin_users")
      .select("name, role")
      .eq("device_id", device_id)
      .single();

    if (adminError || !adminUser) {
      return NextResponse.json(
        { success: false, message: "存取被拒：您的裝置不在白名單中" },
        { status: 403 }
      );
    }

    // 生成 6 位數挑戰碼與寫入資料庫（使用加密安全隨機數）
    const challengeCode = randomInt(100000, 1000000);

    const { data: authReq, error: insertError } = await supabase
      .from("auth_requests")
      .insert([{
        requester_id: device_id,
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
      .neq("device_id", device_id);

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

    return NextResponse.json({ 
      success: true, 
      requestId: authReq.id, 
      challengeCode 
    });

  } catch (error) {
    console.error("Auth Request Error:", error);
    return NextResponse.json({ success: false, message: "伺服器錯誤" }, { status: 500 });
  }
}