import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

/**
 * POST: 建立者退出班級 → 從資料庫刪除該課表
 * 只有 creator_device_id 匹配的用戶可以觸發刪除。
 */
export async function POST(request: Request) {
  try {
    const { invite_code, device_id } = await request.json();

    if (!invite_code || !device_id) {
      return NextResponse.json(
        { success: false, message: "參數不足" },
        { status: 400 }
      );
    }

    const supabase = await createClient();

    // 刪除條件: invite_code + creator_device_id 皆匹配才刪除
    const { error } = await supabase
      .from('classes')
      .delete()
      .eq('invite_code', invite_code)
      .eq('creator_device_id', device_id);

    if (error) {
      console.error("Error in /api/class/leave:", error);
      return NextResponse.json(
        { success: false, message: error.message },
        { status: 500 }
      );
    }

    return NextResponse.json({ success: true, message: "班級已刪除" });
  } catch (error: any) {
    console.error("Error in /api/class/leave:", error);
    return NextResponse.json(
      { success: false, message: "伺服器錯誤" },
      { status: 500 }
    );
  }
}
