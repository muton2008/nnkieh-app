import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import type { JoinClassRequest, JoinClassResponse } from '@/lib/types/api';

export async function POST(request: Request) {
  try {
    const { invite_code } = await request.json() as JoinClassRequest;
    console.log("Received join request with invite_code:", invite_code);

    if (!invite_code) {
      return NextResponse.json({ success: false, message: "請輸入邀請碼" }, { status: 400 });
    }

    const supabase = await createClient();

    // 1. 在 classes 表中尋找該邀請碼
    const { data, error } = await supabase
      .from('classes')
      .select('class_name, semester_tag')
      .eq('invite_code', invite_code)
      .maybeSingle();

    if (error) throw error;

    if (!data) {
      return NextResponse.json({ 
        success: false,
        message: "找不到此班級，請檢查邀請碼是否正確" 
      }, { status: 404 });
    }

    // 2. 回傳成功資訊
    // 注意：這裡回傳 invite_code 是為了讓前端方便更新 localStorage
    return NextResponse.json({
      success: true,
      class_name: data.class_name,
      invite_code: invite_code,
      message: `已成功加入 ${data.class_name}`
    } as JoinClassResponse);

  } catch (error: any) {
    console.error("Error in /api/class/join:", error);
    return NextResponse.json({ 
      success: false, 
      message: "伺服器錯誤，請稍後再試" 
    }, { status: 500 });
  }
}