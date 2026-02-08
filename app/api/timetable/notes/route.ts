import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import type { AddNoteRequest, AddNoteResponse } from '@/lib/types/api';
import { WeekSchedule, CourseNote } from '@/lib/types/timetable';

/**
 * POST: 新增課表備註到雲端
 */
export async function POST(request: Request) {
  const body: AddNoteRequest = await request.json();
  const { invite_code, day, period_idx, note } = body;

  if (!invite_code || !day || period_idx === undefined || !note?.text) {
    return NextResponse.json(
      { success: false, message: "參數不足" } as AddNoteResponse,
      { status: 400 }
    );
  }

  const supabase = await createClient();

  // 1. 取得當前課表
  const { data: classData, error: fetchError } = await supabase
    .from('classes')
    .select('schedule, class_name')
    .eq('invite_code', invite_code)
    .maybeSingle();

  if (fetchError || !classData) {
    return NextResponse.json(
      { success: false, message: "找不到該班級代碼" } as AddNoteResponse,
      { status: 404 }
    );
  }

  const schedule = classData.schedule as WeekSchedule;

  // 2. 確保該天和該節次的課程存在
  if (!schedule[day]) {
    schedule[day] = [];
  }

  while (schedule[day].length <= period_idx) {
    schedule[day].push({ subject: "", teacher: "", room: "", notes: [] });
  }

  if (!schedule[day][period_idx].notes) {
    schedule[day][period_idx].notes = [];
  }

  // 3. 新增 note
  const newNote: CourseNote = {
    id: `note-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
    text: note.text,
    category: note.category as any,
    source: "public",
    date: note.date
  };

  schedule[day][period_idx].notes.push(newNote);

  // 4. 更新資料庫
  const { error: updateError } = await supabase
    .from('classes')
    .update({
      schedule,
      updated_at: new Date().toISOString()
    })
    .eq('invite_code', invite_code);

  if (updateError) {
    return NextResponse.json(
      { success: false, message: updateError.message } as AddNoteResponse,
      { status: 500 }
    );
  }

  const response: AddNoteResponse = {
    success: true,
    note_id: newNote.id,
    message: "備註已同步至雲端"
  };

  return NextResponse.json(response);
}
