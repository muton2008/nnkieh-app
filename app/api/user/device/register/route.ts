import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import type { RegisterDeviceRequest, RegisterDeviceResponse } from "@/lib/types/api";

export async function POST(req: Request) {
  try {
    const body: RegisterDeviceRequest = await req.json();
    const { device_id } = body;

    if (!device_id || typeof device_id !== "string") {
      return NextResponse.json(
        { success: false, message: "device_id is required" } satisfies RegisterDeviceResponse,
        { status: 400 }
      );
    }

    const supabase = await createClient();

    // 先檢查是否已存在
    const { data: existing, error: selectError } = await supabase
      .from("user_profiles")
      .select("device_id")
      .eq("device_id", device_id)
      .maybeSingle();

    if (selectError) {
      console.error("Supabase Select Error:", selectError);
      return NextResponse.json(
        { success: false, message: "Database error" } satisfies RegisterDeviceResponse,
        { status: 500 }
      );
    }

    // 衝突：此 device_id 已被註冊
    if (existing) {
      return NextResponse.json(
        { success: false, conflict: true, message: "Device ID already registered" } satisfies RegisterDeviceResponse,
        { status: 409 }
      );
    }

    // 註冊：插入最小化記錄
    const { error: insertError } = await supabase
      .from("user_profiles")
      .insert({
        device_id,
        division: "no disturb",
        notify_all: false,
        notify_categories: [],
      });

    if (insertError) {
      // 並發寫入導致的 unique violation 也視為衝突
      if (insertError.code === "23505") {
        return NextResponse.json(
          { success: false, conflict: true, message: "Device ID already registered" } satisfies RegisterDeviceResponse,
          { status: 409 }
        );
      }
      console.error("Supabase Insert Error:", insertError);
      return NextResponse.json(
        { success: false, message: "Database error" } satisfies RegisterDeviceResponse,
        { status: 500 }
      );
    }

    return NextResponse.json({ success: true } satisfies RegisterDeviceResponse);
  } catch (error) {
    console.error("Register Device Error:", error);
    return NextResponse.json(
      { success: false, message: "Internal Server Error" } satisfies RegisterDeviceResponse,
      { status: 500 }
    );
  }
}
