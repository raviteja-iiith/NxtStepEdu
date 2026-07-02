import { NextResponse } from 'next/server';
import { createServerSupabaseAdmin, createServerSupabaseClient } from '@/lib/supabase/server';

export async function POST(request: Request) {
  try {
    // ── Auth gate: only the super admin (role = 'admin') can call this ─────────
    const callerClient = await createServerSupabaseClient();
    const { data: { user: caller } } = await callerClient.auth.getUser();
    if (!caller) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const supabaseAdmin = await createServerSupabaseAdmin();
    const { data: callerProfile } = await supabaseAdmin
      .from('users').select('role').eq('id', caller.id).single();

    if (!callerProfile || callerProfile.role !== 'admin') {
      return NextResponse.json({ error: 'Forbidden — Super Admin only' }, { status: 403 });
    }
    // ──────────────────────────────────────────────────────────────────────────

    const { auth_email, new_password } = await request.json();
    if (!auth_email || !new_password) {
      return NextResponse.json({ error: 'auth_email and new_password are required' }, { status: 400 });
    }

    // Find the auth user by their internal email
    const { data: authList } = await supabaseAdmin.auth.admin.listUsers({ page: 1, perPage: 1000 });
    const targetAuthUser = authList?.users?.find((u: any) => u.email === auth_email);

    if (!targetAuthUser) {
      return NextResponse.json(
        { error: `No auth account found for email: ${auth_email}. The principal may not have been created via the system.` },
        { status: 404 }
      );
    }

    // Verify the target is actually a principal
    const { data: targetProfile } = await supabaseAdmin
      .from('users').select('role').eq('id', targetAuthUser.id).single();

    if (!targetProfile || targetProfile.role !== 'principal') {
      return NextResponse.json({ error: 'Target account is not a principal' }, { status: 400 });
    }

    // Update the password using Admin API
    const { error: updateError } = await supabaseAdmin.auth.admin.updateUserById(
      targetAuthUser.id,
      { password: new_password }
    );

    if (updateError) {
      return NextResponse.json(
        { error: `Failed to reset password: ${updateError.message}` },
        { status: 500 }
      );
    }

    return NextResponse.json({ success: true });
  } catch (err: any) {
    return NextResponse.json({ error: err.message || 'Server error' }, { status: 500 });
  }
}
