import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import type { FetchAnnouncementsResponse } from "@/lib/types/api";

export async function GET(request: Request) {
  const { searchParams} = new URL(request.url);
  
  const queryText = searchParams.get('q')?.trim()
    .replace(/[^\u4e00-\u9fffA-Za-z0-9\s\-]/g, "")  // 僅保留中文、英數、空白、連字號，防止 PostgREST filter injection
    .slice(0, 100) || "";        // 限制長度
  const page = parseInt(searchParams.get('page') || '1');
  const tab = searchParams.get('tab') || 'all';
  
  const offset = (page - 1) * 20;
  const size = 20;
  
  const from = offset;
  const to = from + size - 1;

  const supabase = await createClient();

  try {
    let query = supabase
      .from('announcements')
      .select('*', { count: 'exact' })
      .order('publish_date', { ascending: false });

    if (queryText) {
      query = query.or(`title.ilike.%${queryText}%,content.ilike.%${queryText}%`);
    }

    if (tab === 'important') {
      query = query.eq('importance', 1);
    } else if (tab !== 'all') {
      const categoryId = parseInt(tab);
      if (!isNaN(categoryId)) {
        query = query.eq('category', categoryId);
      }
    }

    const { data, error, count } = await query.range(from, to);

    if (error) throw error;

    const totalCount = count || 0;
    const totalPages = Math.ceil(totalCount / size);
    const currentPage = page;
    const hasMore = currentPage < totalPages;

    const response: FetchAnnouncementsResponse = {
      announcements: data || [],
      total: totalCount,
      page: currentPage,
      totalPages: totalPages,
      hasMore: hasMore,
      updated_at: new Date().toISOString(),
    };

    return NextResponse.json(response);
  } catch (error: any) {
    console.error('Announcements API Error:', error);
    return NextResponse.json({ error: '伺服器錯誤' }, { status: 500 });
  }
}