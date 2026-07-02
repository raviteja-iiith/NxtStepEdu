import { NextResponse } from 'next/server';
import { createServerSupabaseAdmin, createServerSupabaseClient } from '@/lib/supabase/server';

export async function POST(request: Request) {
  try {
    // ── Auth gate: only principals and teachers can call this ─────────────────
    const callerClient = await createServerSupabaseClient();
    const { data: { user: caller } } = await callerClient.auth.getUser();
    if (!caller) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const supabaseAdmin = await createServerSupabaseAdmin();
    const { data: callerProfile } = await supabaseAdmin
      .from('users').select('role, school_id').eq('id', caller.id).single();
    if (!callerProfile || !['principal', 'teacher'].includes(callerProfile.role)) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }
    // ──────────────────────────────────────────────────────────────────────────

    const body = await request.json();
    const { request_id } = body;
    let { user_id } = body;

    if (!request_id) {
      return NextResponse.json({ error: 'request_id is required' }, { status: 400 });
    }

    // Fetch the reset request record to get full details
    const { data: reqRow } = await supabaseAdmin
      .from('password_reset_requests')
      .select('*')
      .eq('id', request_id)
      .single();
    if (!reqRow) return NextResponse.json({ error: 'Reset request not found' }, { status: 404 });

    // Security: must be same school
    if (reqRow.school_id !== callerProfile.school_id) {
      return NextResponse.json({ error: 'Cross-school access denied' }, { status: 403 });
    }

    // ── Resolve user_id — it may be null if the request was submitted anonymously
    user_id = user_id || reqRow.user_id;

    if (!user_id) {
      if (reqRow.role === 'parent') {
        // Look up parent by phone number
        const { data: u } = await supabaseAdmin
          .from('users')
          .select('id')
          .eq('phone', reqRow.user_identifier)
          .eq('school_id', reqRow.school_id)
          .maybeSingle();
        user_id = u?.id || null;
      } else {
        // Teacher: identifier is "name@SCHOOLCODE" → auth email "name.SCHOOLCODE@schoolerp.local"
        const derivedEmail = `${reqRow.user_identifier.replace('@', '.')}@schoolerp.local`;
        const { data: authList } = await supabaseAdmin.auth.admin.listUsers({ page: 1, perPage: 1000 });
        const found = authList?.users?.find((u: any) => u.email === derivedEmail);
        user_id = found?.id || null;
      }
    }

    if (!user_id) {
      return NextResponse.json({ error: `Could not find user account for "${reqRow.user_identifier}". Please check the identifier and try again.` }, { status: 404 });
    }

    // Verify the target user belongs to same school
    const { data: targetUser } = await supabaseAdmin
      .from('users').select('role, school_id').eq('id', user_id).single();
    if (!targetUser) return NextResponse.json({ error: 'User not found' }, { status: 404 });
    if (targetUser.school_id !== callerProfile.school_id) {
      return NextResponse.json({ error: 'Cross-school access denied' }, { status: 403 });
    }

    // Generate new credential
    const isParent = targetUser.role === 'parent';
    const newCredential = isParent
      ? String(Math.floor(100000 + Math.random() * 900000))         // 6-digit PIN
      : Math.random().toString(36).slice(2, 10).toUpperCase();       // 8-char password

    // Update auth password via Admin API
    const { error: authError } = await supabaseAdmin.auth.admin.updateUserById(user_id, {
      password: newCredential,
    });
    if (authError) {
      return NextResponse.json({ error: `Failed to reset credential: ${authError.message}` }, { status: 500 });
    }

    // Mark request as resolved and store the resolved user_id for future reference
    await supabaseAdmin.from('password_reset_requests').update({
      status: 'resolved',
      user_id,
      resolved_at: new Date().toISOString(),
      resolved_by: caller.id,
    }).eq('id', request_id);

    return NextResponse.json({ new_credential: newCredential, role: targetUser.role });
  } catch (err: any) {
    return NextResponse.json({ error: err.message || 'Server error' }, { status: 500 });
  }
}

