import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

/** 取得當前學期的起迄日期 */
function getSemesterBounds() {
  const now = new Date();
  const year = now.getFullYear();
  const month = now.getMonth() + 1; // 1-12

  // 假設：
  // 上學期 (第一學期)：8月 ~ 1月
  // 下學期 (第二學期)：2月 ~ 7月
  if (month >= 8 || month === 1) {
    const startYear = month === 1 ? year - 1 : year;
    return { start: `${startYear}-08-01`, end: `${year}-01-31` };
  } else {
    return { start: `${year}-02-01`, end: `${year}-07-31` };
  }
}

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    let start = searchParams.get("start_date");
    let end = searchParams.get("end_date");

    if (!start || !end) {
      const bounds = getSemesterBounds();
      start = start || bounds.start;
      end = end || bounds.end;
    }

    const supabase = await createClient();

    const query = supabase
      .from("school_calendar_events")
      .select("*")
      .eq("is_deleted", false)
      .order("date", { ascending: true })
      .gte("date", start)
      .lte("date", end);
    

    const { data, error } = await query;

    if (error) return NextResponse.json({ success: false, error: error.message }, { status: 500 });

    return NextResponse.json({
      success: true,
      events: data || [],
      updated_at: new Date().toISOString(),
    });

  } catch (err) {
    return NextResponse.json({ success: false, error: "Internal Server Error" }, { status: 500 });
  }
}