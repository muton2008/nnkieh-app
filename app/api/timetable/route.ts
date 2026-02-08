import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import type { FetchTimetableResponse, SaveTimetableRequest, SaveTimetableResponse } from '@/lib/types/api';

/**
 * GET: 根據邀請碼取得課表
 */
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const invite_code = searchParams.get('invite_code');

  if (!invite_code) {
    return NextResponse.json({ success: false, message: "缺少邀請碼" }, { status: 400 });
  }

  const supabase = await createClient();
  
  // 從 classes 表直接抓取對應邀請碼的資料
  const { data, error } = await supabase
    .from('classes')
    .select('schedule, class_name, updated_at')
    .eq('invite_code', invite_code)
    .maybeSingle();

  if (error) {
    console.error("Error fetching timetable:", error);
    return NextResponse.json({ success: false, message: error.message }, { status: 500 });
  }

  if (!data) {
    return NextResponse.json({ success: false, message: "找不到該班級代碼" }, { status: 404 });
  }

  // 封裝成定義好的 FetchTimetableResponse 型別
  const response: FetchTimetableResponse = {
    success: true,
    schedule: data.schedule as any, // 這裡資料庫存的是 JSONB，斷言為 WeekSchedule
    class_name: data.class_name,
    default_room: "原班",
    updated_at: data.updated_at
  };

  return NextResponse.json(response);
}

/**
 * POST: 儲存/更新課表
 */
export async function POST(request: Request) {
  const body: SaveTimetableRequest = await request.json();
  const { invite_code, schedule, class_name } = body;

  if (!invite_code) {
    return NextResponse.json({ success: false, message: "參數不足" }, { status: 400 });
  }

  const supabase = await createClient();

  // 更新對應邀請碼的 schedule
  const { error } = await supabase
    .from('classes')
    .update({ 
      ...(schedule && { schedule }),
      ...(class_name && { class_name }),
      updated_at: new Date().toISOString() 
    })
    .eq('invite_code', invite_code);

  const response: SaveTimetableResponse = {
    success: !error,
    message: error ? error.message : "課表已同步至雲端"
  };

  return NextResponse.json(response, { status: error ? 500 : 200 });
}