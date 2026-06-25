import { NextResponse } from 'next/server';
import { createServerSupabaseAdmin, createServerSupabaseClient } from '@/lib/supabase/server';

export async function POST(request: Request) {
  try {
    // ── Security gate: only authenticated principals/teachers may call this ─
    const callerClient = await createServerSupabaseClient();
    const { data: { user: caller } } = await callerClient.auth.getUser();
    if (!caller) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    const { data: callerProfile } = await (await createServerSupabaseAdmin())
      .from('users').select('role').eq('id', caller.id).single();
    if (!callerProfile || !['principal', 'teacher'].includes(callerProfile.role)) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }
    // ────────────────────────────────────────────────────────────────────────

    const body = await request.json();
    const {
      email, password, role, school_id, full_name,
      phone, username,
      // profile_data is sent as an object from teachers/principals pages
      profile_data,
      // Also support direct fields for backward compatibility
      employee_id: direct_employee_id,
      qualification: direct_qualification,
      specialization: direct_specialization,
    } = body;

    // Merge profile_data fields with direct fields (profile_data takes precedence)
    const employee_id = profile_data?.employee_id ?? direct_employee_id ?? null;
    const qualification = profile_data?.qualification ?? direct_qualification ?? null;
    const specialization = profile_data?.specialization ?? direct_specialization ?? null;
    const joining_date = profile_data?.joining_date ?? null;

    const supabaseAdmin = await createServerSupabaseAdmin();

    // 1. Create auth user
    const { data: authData, error: authError } = await supabaseAdmin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
    });

    if (authError || !authData.user) {
      return NextResponse.json(
        { error: authError?.message || 'Failed to create auth user' },
        { status: 400 }
      );
    }

    // 2. Create user record in public.users table
    const { error: userError } = await supabaseAdmin
      .from('users')
      .insert({
        id: authData.user.id,
        school_id,
        role,
        username,
        full_name,
        phone,
        email: email || null,
        is_active: true,
        is_first_login: true,
      });

    if (userError) {
      // Rollback: delete auth user
      await supabaseAdmin.auth.admin.deleteUser(authData.user.id);
      return NextResponse.json(
        { error: userError.message },
        { status: 400 }
      );
    }

    // 3. Create role-specific profile
    if (role === 'principal') {
      await supabaseAdmin.from('principal_profiles').insert({
        user_id: authData.user.id,
        school_id,
        employee_id: employee_id || null,
        qualification: qualification || null,
        joining_date: joining_date || null,
      });
    } else if (role === 'teacher') {
      await supabaseAdmin.from('teacher_profiles').insert({
        user_id: authData.user.id,
        school_id,
        employee_id: employee_id || null,
        qualification: qualification || null,
        specialization: specialization || null,
        joining_date: joining_date || null,
      });
    } else if (role === 'parent') {
      await supabaseAdmin.from('parent_profiles').insert({
        user_id: authData.user.id,
        school_id,
      });
    }

    return NextResponse.json({ success: true, userId: authData.user.id });
  } catch (error) {
    console.error('Create user error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
