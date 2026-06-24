import { NextResponse } from 'next/server';
import { createServerSupabaseAdmin, createServerSupabaseClient } from '@/lib/supabase/server';

// GET /api/teacher/parent-links?studentIds=id1,id2,id3
// Returns parent links for the given student IDs using admin (service role) client.
// This bypasses RLS on student_parent_links so teachers can see parent info
// for students in their assigned sections.
export async function GET(request: Request) {
  try {
    // Verify the caller is authenticated
    const supabase = await createServerSupabaseClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Verify the caller is a teacher or principal
    const { data: userRow } = await supabase
      .from('users')
      .select('role, school_id')
      .eq('id', user.id)
      .single();

    if (!userRow || !['teacher', 'principal', 'admin'].includes(userRow.role)) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const { searchParams } = new URL(request.url);
    const studentIdsParam = searchParams.get('studentIds');
    if (!studentIdsParam) {
      return NextResponse.json({ links: [] });
    }

    const studentIds = studentIdsParam.split(',').filter(Boolean);
    if (studentIds.length === 0) {
      return NextResponse.json({ links: [] });
    }

    // Use admin client to bypass RLS on student_parent_links
    const admin = await createServerSupabaseAdmin();
    const { data: links, error } = await admin
      .from('student_parent_links')
      .select('parent_id, student_id, users!parent_id(id, full_name, phone, is_active)')
      .in('student_id', studentIds);

    if (error) {
      console.error('parent-links API error:', error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ links: links || [] });
  } catch (err: any) {
    console.error('parent-links API error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
