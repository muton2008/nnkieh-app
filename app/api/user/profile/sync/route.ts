import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import type { SyncUserProfileRequest, SyncUserProfileResponse } from "@/lib/types/api";

export async function POST(req: Request) {
    try {
        const body: SyncUserProfileRequest = await req.json();
        const { device_id, app_version, ...profileData } = body;
        if (!device_id) {
            return NextResponse.json({ success: false, message: "device_id is required" }, { status: 400 });
        }
        const supabase = await createClient();

        // 使用 UPSERT 來插入或更新資料
        const { data, error } = await supabase
            .from("user_profiles")
            .upsert({ device_id, ...profileData }, { onConflict: "device_id" })
            .select("updated_at")
            .single();
            
        if (error) {
            console.error("Supabase Error:", error);
            return NextResponse.json({ success: false, message: "Database error" }, { status: 500 });
        }

        return NextResponse.json({ success: true, updated_at: data?.updated_at } as SyncUserProfileResponse);

    } catch (error) {
        console.error("API Route Error:", error);
        return NextResponse.json({ success: false, message: "Internal Server Error" }, { status: 500 });
    }
}