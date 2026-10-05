import { NextResponse } from 'next/server';
import { createServerSupabaseAdmin, createServerSupabaseClient } from '@/lib/supabase/server';

// GET /api/auth/parent-credentials — returns all parent credentials for the principal's school
export async function GET() {
  try {
    // ── Auth gate: only principals ────────────────────────────────────────────
    const callerClient = await createServerSupabaseClient();
    const { data: { user: caller } } = await callerClient.auth.getUser();
    if (!caller) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const supabaseAdmin = await createServerSupabaseAdmin();
    const { data: callerProfile } = await supabaseAdmin
      .from('users').select('role, school_id').eq('id', caller.id).single();
    if (!callerProfile || callerProfile.role !== 'principal') {
      return NextResponse.json({ error: 'Forbidden – principals only' }, { status: 403 });
    }
    // ─────────────────────────────────────────────────────────────────────────

    // Fetch all parent users with their stored PIN and linked student names
    const { data: parents, error } = await supabaseAdmin
      .from('users')
      .select('id, full_name, phone, login_pin, is_active, created_at')
      .eq('school_id', callerProfile.school_id)
      .eq('role', 'parent')
      .order('full_name');

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    // Fetch student links for each parent
    const parentIds = (parents ?? []).map((p: any) => p.id);
    const { data: links } = await supabaseAdmin
      .from('student_parent_links')
      .select('parent_id, students(full_name)')
      .in('parent_id', parentIds);

    // Build a map: parentId → comma-separated student names
    const studentMap: Record<string, string[]> = {};
    (links ?? []).forEach((l: any) => {
      const pid = l.parent_id;
      const name = (l.students as any)?.full_name;
      if (name) {
        if (!studentMap[pid]) studentMap[pid] = [];
        studentMap[pid].push(name);
      }
    });

    const result = (parents ?? []).map((p: any) => ({
      id: p.id,
      full_name: p.full_name,
      phone: p.phone,
      login_pin: p.login_pin ?? '—',
      is_active: p.is_active,
      student_names: (studentMap[p.id] ?? []).join(', ') || '—',
      created_at: p.created_at,
    }));

    return NextResponse.json({ parents: result });
  } catch (err: any) {
    return NextResponse.json({ error: err.message || 'Server error' }, { status: 500 });
  }
}
