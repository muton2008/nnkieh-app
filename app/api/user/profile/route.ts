import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import type { GetUserProfileResponse } from "@/lib/types/api";

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const device_id = searchParams.get("device_id");

    if (!device_id) {
      return NextResponse.json({ success: false, message: "device_id is required" }, { status: 400 });
    }

    const supabase = await createClient();
    const { data: profile, error } = await supabase
      .from("user_profiles")
      .select("*")
      .eq("device_id", device_id)
      .maybeSingle();

    if (error) {
      console.error("Supabase Error:", error);
      return NextResponse.json({ success: false, message: "Database error" }, { status: 500 });
    }

    return NextResponse.json({ 
      success: true, 
      profile: profile || null 
    } as GetUserProfileResponse);

  } catch (error) {
    console.error("API Route Error:", error);
    return NextResponse.json({ success: false, message: "Internal Server Error" }, { status: 500 });
  }
}