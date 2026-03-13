import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import type { FetchAnnouncementByIdResponse } from "@/lib/types/api";

interface RouteContext {
  params: Promise<{ postId: string }>;
}

export async function GET(_: Request, context: RouteContext) {
  const { postId } = await context.params;
  const numericPostId = Number(postId);

  if (!Number.isInteger(numericPostId) || numericPostId <= 0) {
    return NextResponse.json({ message: "公告 ID 格式錯誤" }, { status: 400 });
  }

  try {
    const supabase = await createClient();
    const { data, error } = await supabase
      .from("announcements")
      .select("*")
      .eq("post_id", numericPostId)
      .single();

    if (error) {
      if (error.code === "PGRST116") {
        return NextResponse.json({ message: "找不到公告" }, { status: 404 });
      }
      throw error;
    }

    const response: FetchAnnouncementByIdResponse = {
      announcement: data,
    };

    return NextResponse.json(response);
  } catch (error) {
    console.error("Announcement By ID API Error:", error);
    return NextResponse.json({ message: "伺服器錯誤" }, { status: 500 });
  }
}
