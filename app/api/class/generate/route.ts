import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { customAlphabet } from 'nanoid';
import type { GenerateCodeRequest, GenerateCodeResponse } from '@/lib/types/api';

// 定義易讀的字典（排除容易混淆的字元如 0, O, I, 1）
const alphabet = '23456789abcdefghjkmnpqrstuvwxyzABCDEFGHJKMNPQRSTUVWXYZ';
const nanoid = customAlphabet(alphabet, 7);

export async function POST(request: Request) {
  try {
    const { device_id, schedule, class_name } = await request.json() as GenerateCodeRequest;
    if (!device_id) return NextResponse.json({ success: false, message: "缺少裝置識別碼" }, { status: 400 });

    const supabase = await createClient();

    // 1. 判定學期標籤 (遵循 task.md 規劃)
    const now = new Date();
    const year = now.getFullYear() - 1911;
    const month = now.getMonth() + 1;
    const semester_tag = (month >= 8 || month <= 1) 
      ? `${month <= 1 ? year - 1 : year}-1` 
      : `${year - 1}-2`;

    // 2. 檢查是否已存在 (Idempotency 冪等性)
    const { data: existing } = await supabase
      .from('classes')
      .select('invite_code, created_at')
      .eq('creator_device_id', device_id)
      .eq('semester_tag', semester_tag)
      .maybeSingle();

    if (existing) {
      return NextResponse.json({
        success: true,
        invite_code: existing.invite_code,
        created_at: existing.created_at
      });
    }

    // 3. 使用 nanoid 生成代碼並格式化為 xxx-xxxx
    const rawId = nanoid();
    const newCode = `${rawId.slice(0, 3)}-${rawId.slice(3)}`;

    // 4. 寫入資料庫
    const { data, error } = await supabase.from('classes').insert([{
      invite_code: newCode,
      creator_device_id: device_id,
      semester_tag: semester_tag,
      class_name: class_name || "新班級",
      schedule: schedule || {}
    }]).select().single();

    if (error) throw error;

    return NextResponse.json({
      success: true,
      invite_code: newCode,
      created_at: data.created_at
    } as GenerateCodeResponse);

  } catch (error: any) {
    return NextResponse.json({ success: false, message: error.message }, { status: 500 });
  }
}